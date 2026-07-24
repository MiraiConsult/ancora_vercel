// Supabase Edge Function: asaas-webhook
// Recebe notificações de pagamento do Asaas e atualiza o status do lançamento financeiro.
// Público (sem JWT) — o Asaas chama diretamente. Validado por um token compartilhado.
// Configure a URL desta função no painel Asaas (Configurações > Webhooks) e o mesmo
// token em "Token de autenticação" e na secret ASAAS_WEBHOOK_TOKEN.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const WEBHOOK_TOKEN = Deno.env.get('ASAAS_WEBHOOK_TOKEN') || '';

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
