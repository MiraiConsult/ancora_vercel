// Supabase Edge Function: asaas-webhook
// Recebe notificações de pagamento do Asaas e atualiza o status do lançamento financeiro.
// Público (sem JWT) — o Asaas chama diretamente. Validado por um token compartilhado.
// Configure a URL desta função no painel Asaas (Configurações > Webhooks) e o mesmo
// token em "Token de autenticação" e na secret ASAAS_WEBHOOK_TOKEN.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  carregarClassificacao, clienteIgnorado, descricaoIgnorada, normalize,
} from '../_shared/cobrancaAsaas.ts';

const WEBHOOK_TOKEN = Deno.env.get('ASAAS_WEBHOOK_TOKEN') || '';
// Conta Asaas única — as contas pagas não trazem tenant, então vêm daqui.
const ASAAS_TENANT_ID = Deno.env.get('ASAAS_TENANT_ID') || '';
const ASAAS_BASE_URL = Deno.env.get('ASAAS_BASE_URL') || 'https://api.asaas.com/v3';
const ASAAS_API_KEY = Deno.env.get('ASAAS_API_KEY') || '';

// Eventos de cobrança que não devem fazer nascer um lançamento.
const SEM_IMPORTAR = ['PAYMENT_DELETED', 'PAYMENT_REFUNDED', 'PAYMENT_PARTIALLY_REFUNDED'];

/**
 * Cobrança que ainda não existe no sistema entra aqui, na hora em que o Asaas
 * avisa. Antes ela só aparecia quando alguém rodava o sync (botão Sincronizar),
 * porque o webhook apenas atualizava status de lançamento já existente.
 * Mesmas regras do sync: ignorados, produto, rateio, rubrica (mensageria e ads
 * vão para a rubrica de repasse).
 */
async function importarCobranca(admin: any, p: any) {
  if (!p?.id || p.deleted || !ASAAS_TENANT_ID) return;
  const tenantId = ASAAS_TENANT_ID;

  const { data: existe } = await admin.from('financial_records')
    .select('id').eq('asaas_payment_id', p.id).maybeSingle();
  if (existe) return;

  if (descricaoIgnorada(p.description)) return;
  const ctx = await carregarClassificacao(admin, tenantId);
  if (ctx.idsIgnorados.has(p.id)) return;

  // Cliente: o que já está vinculado; senão lê o cadastro no Asaas e vincula
  // pelo CNPJ ou cria, como o sync faria. Uma requisição só, e só para
  // cliente novo: a chave do Asaas é a mesma da cobrança do Kaivaa e é
  // bloqueada por excesso de chamadas.
  let companyId: string | null = null;
  if (p.customer) {
    const { data: cliente } = await admin.from('clients')
      .select('id, name').eq('tenant_id', tenantId).eq('asaas_customer_id', p.customer).maybeSingle();
    if (cliente) {
      if (clienteIgnorado(cliente.name)) return;
      companyId = cliente.id;
    } else if (ASAAS_API_KEY) {
      const res = await fetch(`${ASAAS_BASE_URL}/customers/${p.customer}`, {
        headers: { 'Content-Type': 'application/json', 'access_token': ASAAS_API_KEY },
      });
      const ac = res.ok ? await res.json().catch(() => null) : null;
      if (ac?.id) {
        if (clienteIgnorado(ac.name)) return;
        const doc = String(ac.cpfCnpj || '').replace(/\D/g, '');
        const { data: clientes } = doc
          ? await admin.from('clients').select('id, cnpj, asaas_customer_id').eq('tenant_id', tenantId)
          : { data: [] };
        const peloDoc = (clientes || []).find((c: any) => String(c.cnpj || '').replace(/\D/g, '') === doc);
        if (peloDoc) {
          if (!peloDoc.asaas_customer_id) {
            await admin.from('clients').update({ asaas_customer_id: ac.id }).eq('id', peloDoc.id);
          }
          companyId = peloDoc.id;
        } else {
          const row = {
            id: `ca${ac.id}`,
            tenant_id: tenantId,
            name: ac.name || ac.company || 'Cliente Asaas',
            cnpj: ac.cpfCnpj || '',
            segment: '',
            status: 'Active',
            location: ac.city || '',
            asaas_customer_id: ac.id,
          };
          const { error } = await admin.from('clients').upsert(row, { onConflict: 'asaas_customer_id' });
          if (!error) companyId = row.id;
          else console.warn('cliente asaas:', error.message);
        }
      }
    }
  }

  const { data: bancos } = await admin.from('banks').select('id, name').eq('tenant_id', tenantId);
  const asaasBankId = (bancos || []).find((b: any) => normalize(b.name) === 'asaas')?.id || null;

  // ignoreDuplicates: o Asaas manda CREATED e, às vezes, RECEIVED quase juntos.
  // Quem chegar depois não sobrescreve o que o primeiro gravou.
  const { error } = await admin.from('financial_records')
    .upsert(ctx.linha(p, companyId, asaasBankId), { onConflict: 'asaas_payment_id', ignoreDuplicates: true });
  if (error) throw new Error(error.message);
}

Deno.serve(async (req: Request) => {
  try {
    // Validação opcional por token (recomendado)
    if (WEBHOOK_TOKEN) {
      const token = req.headers.get('asaas-access-token');
      if (token !== WEBHOOK_TOKEN) {
        return new Response('unauthorized', { status: 401 });
      }
    }

    const body = await req.json();
    const event: string | undefined = body?.event;
    const payment = body?.payment;

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Auditoria / idempotência
    await admin.from('asaas_webhook_events').insert({
      event,
      payment_id: payment?.id ?? null,
      subscription_id: payment?.subscription ?? null,
      payload: body,
    });

    if (payment?.id) {
      if (!SEM_IMPORTAR.includes(event || '')) {
        // Falha aqui não pode virar erro do webhook: o Asaas pausa a fila
        // depois de erros seguidos, e aí nem o status das outras cobranças
        // chega. O sync segue como rede de segurança.
        try {
          await importarCobranca(admin, payment);
        } catch (e) {
          console.warn('importar cobrança:', String((e as Error)?.message || e));
        }
      }

      let update: Record<string, unknown> | null = null;

      switch (event) {
        case 'PAYMENT_CONFIRMED':
        case 'PAYMENT_RECEIVED':
          update = {
            status: 'Pago',
            paymentDate: payment.paymentDate || payment.confirmedDate || new Date().toISOString().slice(0, 10),
          };
          break;
        case 'PAYMENT_OVERDUE':
          update = { status: 'Atrasado' };
          break;
        case 'PAYMENT_DELETED':
        case 'PAYMENT_REFUNDED':
          update = { status: 'Pendente' };
          break;
        default:
          update = null;
      }

      if (update) {
        await admin.from('financial_records').update(update).eq('asaas_payment_id', payment.id);
      }
    }

    // ---- Transferências enviadas pelo sistema (eventos TRANSFER_*) ----
    const transfer = body?.transfer;
    if (transfer?.id) {
      // Casa pelo externalReference (id da intenção) e cai no id do Asaas
      // quando o evento não trouxer a referência.
      const ref = transfer.externalReference;
      const { data: intent } = ref
        ? await admin.from('payment_intents').select('*').eq('id', ref).maybeSingle()
        : await admin.from('payment_intents').select('*').eq('asaas_transfer_id', transfer.id).maybeSingle();

      if (intent) {
        const done = event === 'TRANSFER_DONE';
        const dead = ['TRANSFER_FAILED', 'TRANSFER_CANCELLED', 'TRANSFER_BLOCKED'].includes(event || '');

        if (done || dead) {
          await admin.from('payment_intents').update({
            status: done ? 'DONE' : 'FAILED',
            refuse_reason: dead ? (transfer.failReason || event) : null,
            decided_at: new Date().toISOString(),
          }).eq('id', intent.id);
        }

        if (intent.record_id) {
          if (done) {
            await admin.from('financial_records').update({
              status: 'Pago',
              paymentDate: transfer.effectiveDate || new Date().toISOString().slice(0, 10),
            }).eq('id', intent.record_id);
          } else if (dead) {
            // Dinheiro não saiu: volta a conta para a fila de pagamento.
            await admin.from('financial_records').update({
              status: 'Pendente', asaas_transfer_id: null,
            }).eq('id', intent.record_id);
          }
        }
      }
    }

    // ---- Contas pagas pelo Asaas (eventos BILL_*) ----
    // Chegam com body.bill (e não body.payment), por isso passavam batido.
    const bill = body?.bill;
    if (bill?.id && ASAAS_TENANT_ID) {
      const status = bill.status === 'PAID' ? 'Pago'
        : ['FAILED', 'CANCELLED', 'REFUNDED'].includes(bill.status) ? null
        : 'Pendente';

      if (status === null) {
        // Pagamento não aconteceu — some com o lançamento se ele existir.
        await admin.from('financial_records').delete().eq('asaas_bill_id', bill.id);
      } else {
        const { data: existing } = await admin.from('financial_records')
          .select('id').eq('asaas_bill_id', bill.id).maybeSingle();

        if (existing) {
          // Já classificado pelo usuário: só acompanha status e baixa.
          await admin.from('financial_records')
            .update({ status, paymentDate: bill.paymentDate || null })
            .eq('asaas_bill_id', bill.id);
        } else {
          const who = bill.beneficiaryName || bill.companyName || 'Conta paga pelo Asaas';
          await admin.from('financial_records').insert({
            id: `fb${bill.id}`,
            tenant_id: ASAAS_TENANT_ID,
            description: bill.description ? `${who} — ${bill.description}` : who,
            amount: -Math.abs(Number(bill.value) || 0),
            type: 'Despesa',
            status,
            dueDate: bill.dueDate || bill.scheduleDate || null,
            competenceDate: bill.dueDate || bill.scheduleDate || null,
            paymentDate: bill.paymentDate || null,
            category: 'A CLASSIFICAR',
            needsValidation: true,
            asaas_bill_id: bill.id,
          });
        }
      }
      await admin.from('asaas_webhook_events').update({ processed: true }).eq('payload->>id', body?.id);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error)?.message || e) }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
