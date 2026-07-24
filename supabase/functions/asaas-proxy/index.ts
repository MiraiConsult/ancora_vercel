// Supabase Edge Function: asaas-proxy
// Proxy seguro para a API do Asaas. Mantém a ASAAS_API_KEY fora do frontend.
// O frontend chama via supabase.functions.invoke('asaas-proxy', { body: { action, ... } })
// com o JWT do usuário — o tenant é respeitado via RLS.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ASAAS_BASE_URL = Deno.env.get('ASAAS_BASE_URL') || 'https://api.asaas.com/v3';
const ASAAS_API_KEY = Deno.env.get('ASAAS_API_KEY') || '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function asaas(path: string, method: string, body?: unknown) {
  const res = await fetch(`${ASAAS_BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'access_token': ASAAS_API_KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.errors?.[0]?.description || `Erro Asaas (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!ASAAS_API_KEY) throw new Error('ASAAS_API_KEY não configurada nas secrets da função.');

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Não autorizado.');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) throw new Error('Sessão inválida.');

    const { action, ...params } = await req.json();

    // Garante que o cliente exista como customer no Asaas (cria se necessário).
    async function ensureCustomer(clientId: string) {
      const { data: client, error } = await supabase.from('clients').select('*').eq('id', clientId).single();
      if (error || !client) throw new Error('Cliente não encontrado.');
      if (client.asaas_customer_id) return { client, customerId: client.asaas_customer_id as string };

      const cpfCnpj = (client.cnpj || '').replace(/\D/g, '');
      if (!cpfCnpj) throw new Error('Cliente sem CNPJ/CPF — obrigatório para o Asaas.');

      const created = await asaas('/customers', 'POST', {
        name: client.name,
        cpfCnpj,
      });
      await supabase.from('clients').update({ asaas_customer_id: created.id }).eq('id', clientId);
      return { client, customerId: created.id as string };
    }

    let result: Record<string, unknown>;

    switch (action) {
      case 'sync_customer': {
        const { customerId } = await ensureCustomer(params.clientId);
        result = { customerId };
        break;
      }

      case 'create_charge': {
        const { client, customerId } = await ensureCustomer(params.clientId);
        const payment = await asaas('/payments', 'POST', {
          customer: customerId,
          billingType: params.billingType || 'UNDEFINED',
          value: Number(params.value),
          dueDate: params.dueDate,
          description: params.description || '',
          externalReference: params.clientId,
        });

        const record = {
          id: `f${Date.now()}`,
          tenant_id: client.tenant_id,
          description: params.description || `Cobrança — ${client.name}`,
          amount: Number(params.value),
          type: 'Receita',
          status: 'Pendente',
          dueDate: params.dueDate,
          competenceDate: params.dueDate,
          category: 'Cobrança Asaas',
          companyId: params.clientId,
          revenueTypeId: params.revenueTypeId || null,
          asaas_payment_id: payment.id,
          asaas_invoice_url: payment.invoiceUrl,
        };
        const { error: insErr } = await supabase.from('financial_records').insert(record);
        if (insErr) throw new Error('Cobrança criada no Asaas, mas falhou ao gravar o lançamento: ' + insErr.message);

        result = { payment, record };
        break;
      }

      case 'create_subscription': {
        const { client, customerId } = await ensureCustomer(params.clientId);
        const sub = await asaas('/subscriptions', 'POST', {
          customer: customerId,
          billingType: params.billingType || 'UNDEFINED',
          value: Number(params.value),
          nextDueDate: params.nextDueDate,
          cycle: params.cycle || 'MONTHLY',
          description: params.description || '',
        });

        const row = {
          id: `s${Date.now()}`,
          tenant_id: client.tenant_id,
          client_id: params.clientId,
          product_id: params.productId || null,
          asaas_id: sub.id,
          description: params.description || '',
          value: Number(params.value),
          cycle: params.cycle || 'MONTHLY',
          billing_type: params.billingType || 'UNDEFINED',
          next_due_date: params.nextDueDate,
          status: 'ACTIVE',
        };
        const { error: insErr } = await supabase.from('subscriptions').insert(row);
        if (insErr) throw new Error('Assinatura criada no Asaas, mas falhou ao gravar: ' + insErr.message);

        result = { subscription: sub, row };
        break;
      }

      default:
        throw new Error('Ação inválida: ' + action);
    }

    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: String((e as Error)?.message || e) }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
