// Supabase Edge Function: asaas-transfer-approval
//
// Segunda chave da trava de saque. Com o "mecanismo de validação de saque"
// ligado no painel do Asaas, TODA transferência criada via API fica retida: o
// Asaas chama esta função ~5s depois e só executa se respondermos APPROVED.
// Sem resposta em 3 tentativas, o Asaas cancela a transferência sozinho.
//
// A regra é uma só: aprova apenas transferência que corresponde a uma intenção
// que o próprio sistema registrou (mesmo id, mesmo valor, mesma chave, ainda
// não usada). Assim, uma chave de API vazada não consegue sacar nada — a
// transferência até é criada no Asaas, mas morre aqui.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const APPROVAL_TOKEN = Deno.env.get('ASAAS_TRANSFER_TOKEN') || '';

const digits = (s: unknown) => String(s ?? '').replace(/\D/g, '');

const reply = (status: 'APPROVED' | 'REFUSED', refuseReason?: string) =>
  new Response(
    JSON.stringify(refuseReason ? { status, refuseReason } : { status }),
    { headers: { 'Content-Type': 'application/json' } },
  );

Deno.serve(async (req: Request) => {
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    if (APPROVAL_TOKEN) {
      const token = req.headers.get('asaas-access-token');
      if (token !== APPROVAL_TOKEN) return new Response('unauthorized', { status: 401 });
    }

    const body = await req.json();
    // O payload é o próprio objeto da transferência (mesmo shape da criação).
    const transfer = body?.transfer ?? body;
    const ref: string | undefined = transfer?.externalReference;

    // Auditoria antes de decidir: uma recusa precisa deixar rastro.
    await admin.from('asaas_webhook_events').insert({
      event: 'TRANSFER_APPROVAL_REQUEST',
      payment_id: transfer?.id ?? null,
      payload: body,
    });

    // PIX copia-e-cola não passa por /transfers e o endpoint não aceita
    // externalReference — a transação chega aqui sem referência nenhuma. Nesse
    // caso a intenção é achada por valor + payload, entre as que ainda estão
    // esperando e foram pedidas há poucos minutos. Continua valendo a regra:
    // sem pedido registrado pelo sistema, nada é aprovado.
    let intent: any = null;

    if (ref) {
      const { data } = await admin.from('payment_intents').select('*').eq('id', ref).maybeSingle();
      intent = data;
    } else {
      const qrPayload = String(transfer?.qrCode?.payload ?? transfer?.payload ?? '').trim();
      const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const { data } = await admin.from('payment_intents')
        .select('*')
        .eq('method', 'PIX_QR')
        .eq('status', 'AWAITING_APPROVAL')
        .gte('created_at', since)
        .order('created_at', { ascending: false });
      intent = (data || []).find((i: any) => {
        const sameValue = Math.round(Number(i.value) * 100) === Math.round(Number(transfer?.value) * 100);
        const wanted = String(i.destination?.payload || '').trim();
        return sameValue && (!qrPayload || !wanted || qrPayload === wanted);
      }) || null;
    }

    if (!intent) {
      return reply('REFUSED', 'Nenhuma solicitação de pagamento corresponde a esta transferência.');
    }
    if (intent.status !== 'AWAITING_APPROVAL') {
      return reply('REFUSED', `Solicitação já processada (${intent.status}).`);
    }

    // Valor e destino têm que bater exatamente com o que foi pedido no sistema.
    const sameValue = Math.round(Number(intent.value) * 100) === Math.round(Number(transfer?.value) * 100);
    const method = String(intent.method || 'PIX_KEY').toUpperCase();
    const dest = intent.destination || {};

    let sameDest = false;
    let destWhy = 'Destino divergente do pedido.';
    if (method === 'TED') {
      // Conta bancária: banco, agência, conta e documento do titular.
      const ba = transfer?.bankAccount ?? {};
      sameDest = digits(ba?.bank?.code ?? ba?.bankCode) === digits(dest.bankCode)
        && digits(ba?.agency) === digits(dest.agency)
        && digits(ba?.account) === digits(dest.account)
        && digits(ba?.cpfCnpj) === digits(dest.cpfCnpj);
      destWhy = 'Conta bancária de destino divergente do pedido.';
    } else if (method === 'PIX_QR') {
      const got = String(transfer?.qrCode?.payload ?? transfer?.payload ?? '').trim();
      const wanted = String(dest.payload || '').trim();
      // Asaas nem sempre devolve o payload na validação; o casamento por valor
      // + janela de tempo já foi feito acima.
      sameDest = !got || !wanted || got === wanted;
      destWhy = 'Código PIX de destino divergente do pedido.';
    } else {
      const key = transfer?.pixAddressKey ?? transfer?.bankAccount?.pixAddressKey ?? '';
      const wanted = dest.pixKey ?? intent.pix_key;
      sameDest = String(key).trim() === String(wanted || '').trim()
        // CPF/CNPJ e telefone podem voltar formatados de outro jeito.
        || (digits(key) !== '' && digits(key) === digits(wanted));
      destWhy = 'Chave PIX de destino divergente do pedido.';
    }

    if (!sameValue || !sameDest) {
      const why = !sameValue
        ? `Valor divergente (pedido ${intent.value}, recebido ${transfer?.value}).`
        : destWhy;
      await admin.from('payment_intents')
        .update({ status: 'REFUSED', refuse_reason: why, decided_at: new Date().toISOString() })
        .eq('id', intent.id);
      return reply('REFUSED', why);
    }

    // Marca como aprovada na mesma condição que foi lida: se duas chamadas
    // chegarem juntas, só uma consegue mudar de AWAITING_APPROVAL.
    const { data: claimed } = await admin.from('payment_intents')
      .update({
        status: 'APPROVED',
        decided_at: new Date().toISOString(),
        asaas_transfer_id: transfer?.id ?? intent.asaas_transfer_id,
      })
      .eq('id', intent.id).eq('status', 'AWAITING_APPROVAL')
      .select('id');

    if (!claimed?.length) return reply('REFUSED', 'Solicitação já processada.');

    return reply('APPROVED');
  } catch (e) {
    // Erro nosso não pode virar aprovação por acidente.
    console.error('transfer-approval:', String((e as Error)?.message || e));
    return reply('REFUSED', 'Falha ao validar a solicitação no sistema.');
  }
});
