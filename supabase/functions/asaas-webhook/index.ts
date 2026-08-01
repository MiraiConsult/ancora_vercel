// Supabase Edge Function: asaas-webhook
// Recebe notificações de pagamento do Asaas e atualiza o status do lançamento financeiro.
// Público (sem JWT) — o Asaas chama diretamente. Validado por um token compartilhado.
// Configure a URL desta função no painel Asaas (Configurações > Webhooks) e o mesmo
// token em "Token de autenticação" e na secret ASAAS_WEBHOOK_TOKEN.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const WEBHOOK_TOKEN = Deno.env.get('ASAAS_WEBHOOK_TOKEN') || '';
// Conta Asaas única — as contas pagas não trazem tenant, então vêm daqui.
const ASAAS_TENANT_ID = Deno.env.get('ASAAS_TENANT_ID') || '';

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
