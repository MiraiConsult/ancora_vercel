// Supabase Edge Function: asaas-sync
// Importa/sincroniza customers, payments (cobranças) e subscriptions (assinaturas)
// da conta Asaas para o sistema. Idempotente (upsert por asaas id).
// Autorização: JWT de usuário (botão no app) OU header x-sync-secret (cron).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ASAAS_BASE_URL = Deno.env.get('ASAAS_BASE_URL') || 'https://api.asaas.com/v3';
const ASAAS_API_KEY = Deno.env.get('ASAAS_API_KEY') || '';
const SYNC_SECRET = Deno.env.get('ASAAS_SYNC_SECRET') || '';
// Asaas é exclusivo de um único tenant (conta única). Alvo do cron e guard do app.
const ASAAS_TENANT_ID = Deno.env.get('ASAAS_TENANT_ID') || '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const digits = (s: string) => (s || '').replace(/\D/g, '');

async function asaas(path: string) {
  const res = await fetch(`${ASAAS_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', 'access_token': ASAAS_API_KEY },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.errors?.[0]?.description || `Erro Asaas (${res.status})`);
  return data;
}

async function asaasList(path: string): Promise<any[]> {
  const all: any[] = [];
  let offset = 0;
  while (true) {
    const sep = path.includes('?') ? '&' : '?';
    const page = await asaas(`${path}${sep}limit=100&offset=${offset}`);
    all.push(...(page.data || []));
    if (!page.hasMore) break;
    offset += 100;
    if (offset > 100000) break; // trava de segurança
  }
  return all;
}

// Aplica um rateio percentual sobre o valor da cobrança.
// O resto do arredondamento vai para a maior fatia, para o rateio fechar
// exatamente com o valor cobrado (senão o DRE não bate por centavos).
function applySplit(
  splits: { product_id: string; pct: number }[],
  amount: number,
): { product_id: string; amount: number }[] {
  const valid = (splits || []).filter((s) => s?.product_id && Number(s.pct) > 0);
  if (!valid.length) return [];
  const parts = valid.map((s) => ({
    product_id: s.product_id,
    amount: Math.round(amount * Number(s.pct)) / 100,
  }));
  const diff = Math.round((amount - parts.reduce((t, p) => t + p.amount, 0)) * 100) / 100;
  if (diff !== 0) {
    let big = 0;
    parts.forEach((p, i) => { if (p.amount > parts[big].amount) big = i; });
    parts[big].amount = Math.round((parts[big].amount + diff) * 100) / 100;
  }
  return parts;
}

// Mapeia status do Asaas para o status do lançamento
function mapStatus(s: string): string {
  if (['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'DUNNING_RECEIVED'].includes(s)) return 'Pago';
  if (s === 'OVERDUE') return 'Atrasado';
  return 'Pendente';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!ASAAS_API_KEY) throw new Error('ASAAS_API_KEY não configurada.');

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ---- Autorização + resolução do tenant ----
    let tenantId = '';
    const syncSecret = req.headers.get('x-sync-secret');
    const authHeader = req.headers.get('Authorization');

    if (SYNC_SECRET && syncSecret && syncSecret === SYNC_SECRET) {
      // Chamada pelo cron
      tenantId = ASAAS_TENANT_ID;
      if (!tenantId) throw new Error('ASAAS_TENANT_ID não configurado.');
    } else if (authHeader) {
      // Chamada pelo app (JWT do usuário)
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) throw new Error('Sessão inválida.');
      const { data: profile } = await admin.from('profiles').select('tenant_id').eq('id', user.id).single();
      if (!profile?.tenant_id) throw new Error('Tenant do usuário não encontrado.');
      // Guard: Asaas habilitado só para o tenant configurado.
      if (ASAAS_TENANT_ID && profile.tenant_id !== ASAAS_TENANT_ID) {
        throw new Error('Asaas não está habilitado para esta empresa.');
      }
      tenantId = profile.tenant_id;
    } else {
      throw new Error('Não autorizado.');
    }

    const counts = { customers_new: 0, customers_linked: 0, payments: 0, subscriptions: 0 };

    // ---- 1) Customers ----
    const asaasCustomers = await asaasList('/customers');

    const { data: clients } = await admin
      .from('clients').select('id, cnpj, asaas_customer_id').eq('tenant_id', tenantId);
    const byAsaas = new Map<string, any>();
    const byCnpj = new Map<string, any>();
    for (const c of clients || []) {
      if (c.asaas_customer_id) byAsaas.set(c.asaas_customer_id, c);
      if (c.cnpj) byCnpj.set(digits(c.cnpj), c);
    }

    // Produtos para casar com a descrição das cobranças (o nome do produto costuma
    // aparecer na descrição, ex: "Mensalidade - HelloGrowth"). Normaliza removendo
    // espaços/pontuação/acentos para casar "HelloGrowth" == "Hello Growth".
    // Casa pelo nome (normalizado) mais longo primeiro (mais específico).
    const normalize = (s?: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const { data: products } = await admin.from('products').select('id, name').eq('tenant_id', tenantId);

    // Rubricas de receita: casa produto -> rubrica pelo nome normalizado.
    // Sem correspondência cai em OUTRAS RECEITAS, para o lançamento nunca ficar
    // fora do DRE.
    const { data: coa } = await admin.from('chart_of_accounts')
      .select('id, rubricName, classificationCode').eq('tenant_id', tenantId).eq('classificationCode', '1');
    const rubricByName = new Map<string, { id: string; name: string }>();
    let fallbackRubric: { id: string; name: string } | null = null;
    (coa || []).forEach((c: any) => {
      rubricByName.set(normalize(c.rubricName), { id: c.id, name: c.rubricName });
      if (normalize(c.rubricName) === normalize('OUTRAS RECEITAS')) fallbackRubric = { id: c.id, name: c.rubricName };
    });
    const rubricForProduct = (productId: string | null) => {
      const pname = (products || []).find((p: any) => p.id === productId)?.name;
      return (pname ? rubricByName.get(normalize(pname)) : null) || fallbackRubric;
    };
    const productList = (products || [])
      .map((p: any) => ({ id: p.id, key: normalize(p.name) }))
      .filter((p: any) => p.key.length >= 3)
      .sort((a: any, b: any) => b.key.length - a.key.length);
    const matchProduct = (desc?: string): string | null => {
      if (!desc) return null;
      const d = normalize(desc);
      for (const p of productList) { if (d.includes(p.key)) return p.id; }
      return null;
    };

    const custToClient = new Map<string, string>();
    const newClients: any[] = [];
    const linkUpdates: { id: string; asaas_customer_id: string }[] = [];

    for (const ac of asaasCustomers) {
      const norm = digits(ac.cpfCnpj);
      const existing = byAsaas.get(ac.id) || (norm ? byCnpj.get(norm) : undefined);
      if (existing) {
        custToClient.set(ac.id, existing.id);
        if (!existing.asaas_customer_id) {
          linkUpdates.push({ id: existing.id, asaas_customer_id: ac.id });
          existing.asaas_customer_id = ac.id;
          byAsaas.set(ac.id, existing);
          counts.customers_linked++;
        }
      } else {
        const newId = `ca${ac.id}`;
        const row = {
          id: newId,
          tenant_id: tenantId,
          name: ac.name || ac.company || 'Cliente Asaas',
          cnpj: ac.cpfCnpj || '',
          segment: '',
          status: 'Active',
          location: ac.city || '',
          asaas_customer_id: ac.id,
        };
        newClients.push(row);
        custToClient.set(ac.id, newId);
        byAsaas.set(ac.id, row);
        if (norm) byCnpj.set(norm, row);
        counts.customers_new++;
      }
    }

    if (newClients.length) {
      const { error } = await admin.from('clients').upsert(newClients, { onConflict: 'asaas_customer_id' });
      if (error) throw new Error('Erro ao inserir clientes: ' + error.message);
    }
    for (const u of linkUpdates) {
      await admin.from('clients').update({ asaas_customer_id: u.asaas_customer_id }).eq('id', u.id);
    }

    // ---- 2) Payments (cobranças) ----

    // Assinaturas que vendem mais de um produto: a cobrança herda o rateio (%).
    // Lido do banco (e não do Asaas), porque o rateio é uma definição nossa.
    const { data: subSplits } = await admin.from('subscriptions')
      .select('asaas_id, product_id, split_products, product_manual').eq('tenant_id', tenantId);
    const splitBySub = new Map<string, { product_id: string; pct: number }[]>();
    const manualSub = new Map<string, string | null>();
    (subSplits || []).forEach((s: any) => {
      if (!s.asaas_id) return;
      if (Array.isArray(s.split_products) && s.split_products.length) {
        splitBySub.set(s.asaas_id, s.split_products);
      }
      if (s.product_manual) manualSub.set(s.asaas_id, s.product_id || null);
    });

    // Cobranças cujo produto/rateio foi definido na mão. O sync repete o valor
    // que já está gravado, para não desfazer a classificação do usuário a cada
    // rodada (o upsert reescreve toda coluna presente no payload).
    const { data: manualRows } = await admin.from('financial_records')
      .select('asaas_payment_id, product_id, split_revenue, rubricId, category')
      .eq('tenant_id', tenantId).eq('product_manual', true).not('asaas_payment_id', 'is', null);
    const manualByPayment = new Map<string, any>();
    (manualRows || []).forEach((r: any) => manualByPayment.set(r.asaas_payment_id, r));

    const payments = await asaasList('/payments');
    const paymentRows = payments.map((p: any) => {
      const amount = Number(p.value) || 0;

      // Classificação: manual > rateio da assinatura > casamento pela descrição
      let productId: string | null;
      let split: { product_id: string; amount: number }[] | null;
      const manual = manualByPayment.get(p.id);
      const subSplit = p.subscription ? splitBySub.get(p.subscription) : null;

      if (manual) {
        productId = manual.product_id || null;
        split = manual.split_revenue || null;
      } else if (subSplit) {
        split = applySplit(subSplit, amount);
        // product_id fica com a maior fatia: os relatórios usam o rateio, mas
        // as listagens caem no product_id quando não olham o split.
        productId = split.reduce((a, b) => (b.amount > a.amount ? b : a), split[0])?.product_id || null;
      } else {
        productId = matchProduct(p.description);
        split = null;
      }

      const rubric = manual
        ? { id: manual.rubricId, name: manual.category }
        : rubricForProduct(productId);

      return {
        id: `fa${p.id}`,
        tenant_id: tenantId,
        description: p.description || 'Cobrança Asaas',
        amount,
        type: 'Receita',
        status: mapStatus(p.status),
        dueDate: p.dueDate,
        competenceDate: p.dueDate,
        paymentDate: p.paymentDate || null,
        category: rubric?.name || 'Cobrança Asaas',
        rubricId: rubric?.id || null,
        companyId: custToClient.get(p.customer) || byAsaas.get(p.customer)?.id || null,
        product_id: productId,
        split_revenue: split && split.length ? split : null,
        asaas_payment_id: p.id,
        asaas_invoice_url: p.invoiceUrl || null,
        asaas_subscription_id: p.subscription || null,
      };
    });
    if (paymentRows.length) {
      const { error } = await admin.from('financial_records').upsert(paymentRows, { onConflict: 'asaas_payment_id' });
      if (error) throw new Error('Erro ao gravar cobranças: ' + error.message);
      counts.payments = paymentRows.length;
    }

    // ---- 3) Subscriptions (assinaturas) ----
    const subs = await asaasList('/subscriptions');
    const subRows = subs.map((s: any) => {
      // Mesma regra das cobranças: manual manda, depois o rateio, depois a descrição.
      const split = splitBySub.get(s.id);
      const productId = manualSub.has(s.id)
        ? manualSub.get(s.id)!
        : split
          ? applySplit(split, Number(s.value) || 0)
              .reduce((a, b) => (b.amount > a.amount ? b : a), { product_id: null as any, amount: -1 }).product_id
          : matchProduct(s.description);
      return {
      id: `sa${s.id}`,
      tenant_id: tenantId,
      client_id: custToClient.get(s.customer) || byAsaas.get(s.customer)?.id || null,
      product_id: productId,
      asaas_id: s.id,
      description: s.description || '',
      value: Number(s.value) || 0,
      cycle: s.cycle || 'MONTHLY',
      billing_type: s.billingType || 'UNDEFINED',
      next_due_date: s.nextDueDate || null,
      status: s.status || 'ACTIVE',
      };
    });
    if (subRows.length) {
      const { error } = await admin.from('subscriptions').upsert(subRows, { onConflict: 'asaas_id' });
      if (error) throw new Error('Erro ao gravar assinaturas: ' + error.message);
      counts.subscriptions = subRows.length;
    }

    return new Response(JSON.stringify({ success: true, ...counts }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: String((e as Error)?.message || e) }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
