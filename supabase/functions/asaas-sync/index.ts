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

// Contas pagas pelo Asaas (boletos/tributos). Vira despesa no sistema.
// FAILED/CANCELLED não geram lançamento: dinheiro nenhum saiu.
function mapBillStatus(s: string): string | null {
  if (s === 'PAID') return 'Pago';
  if (['FAILED', 'CANCELLED', 'REFUNDED'].includes(s)) return null;
  return 'Pendente';
}

// Apaga em lotes: .in() com centenas de ids estoura o tamanho da URL.
async function deleteIn(admin: any, table: string, ids: string[]) {
  for (let i = 0; i < ids.length; i += 100) {
    const { error } = await admin.from(table).delete().in('id', ids.slice(i, i + 100));
    if (error) throw new Error(`Erro ao remover de ${table}: ` + error.message);
  }
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

    const counts = {
      customers_new: 0, customers_linked: 0, payments: 0, subscriptions: 0, bills: 0,
      payments_removed: 0, subscriptions_removed: 0,
      asaas_balance: null as number | null,
    };

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

    // Conta bancária "Asaas" do tenant: tudo que entra e sai pelo Asaas fica
    // nela, senão o saldo da conta não tem como bater com o do Asaas.
    const { data: bancos } = await admin.from('banks').select('id, name').eq('tenant_id', tenantId);
    let asaasBankId: string | null = (bancos || []).find((b: any) => normalize(b.name) === 'asaas')?.id || null;
    if (!asaasBankId) {
      asaasBankId = `b_asaas_${Date.now()}`;
      const { error } = await admin.from('banks').insert({
        id: asaasBankId, tenant_id: tenantId, name: 'Asaas', agency: '', account: '', initialBalance: 0,
      });
      if (error) { console.warn('banco asaas:', error.message); asaasBankId = null; }
    }

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

    /**
     * Cobranças que passam por esta conta Asaas mas não são desta empresa —
     * outro negócio dividindo a mesma conta. Sem esta lista elas voltariam a
     * cada sync, porque o import é um upsert de tudo que a conta tem.
     *
     * Consequência assumida: o caixa do sistema deixa de bater com o extrato
     * do Asaas na medida do que entra por aqui.
     */
    const DESCRICOES_IGNORADAS = ['farias advogados'];

    // Alguns clientes não têm marca na descrição: a cobrança sai como "Pix
    // recebido", texto que também aparece em cobrança legítima. Aí o corte tem
    // de ser pelo cliente, nunca pelo texto.
    const CLIENTES_IGNORADOS = ['nexlex'];
    const customersIgnorados = new Set(
      asaasCustomers
        .filter((c: any) => {
          const nome = String(c.name || '').toLowerCase();
          return CLIENTES_IGNORADOS.some((termo) => nome.includes(termo));
        })
        .map((c: any) => c.id),
    );

    // Cobranças e assinaturas tiradas do sistema uma a uma (cliente que saiu,
    // mês que não vale). Ficam no Asaas, então sem esta lista o upsert as
    // traria de volta na rodada seguinte.
    const { data: ignoradosRows } = await admin.from('asaas_ignored')
      .select('asaas_id').eq('tenant_id', tenantId);
    const idsIgnorados = new Set((ignoradosRows || []).map((r: any) => r.asaas_id));

    const ehIgnorada = (descricao: unknown, customer?: unknown, asaasId?: unknown) => {
      if (asaasId && idsIgnorados.has(asaasId as string)) return true;
      if (customer && customersIgnorados.has(customer as string)) return true;
      const d = String(descricao || '').toLowerCase();
      return DESCRICOES_IGNORADAS.some((termo) => d.includes(termo));
    };

    // Mensageria e ads são repasse: o cliente devolve parte do que a Mirai paga
    // ao Facebook. A entrada vai para a rubrica de despesa e abate a saída; a
    // diferença é o gasto da Mirai. Não é receita do produto.
    const { data: rubricaRepasse } = await admin.from('chart_of_accounts')
      .select('id, rubricName').eq('tenant_id', tenantId).eq('id', 'coa_mensageria_entrada').maybeSingle();
    const ehRepasse = (descricao?: string) => /mensageria|\bads\b/i.test(descricao || '');

    // A listagem completa, antes do filtro, é a referência do que ainda existe
    // no Asaas. Cobrança apagada lá não vem nela.
    const allPayments = (await asaasList('/payments')).filter((p: any) => !p.deleted);
    const payments = allPayments.filter((p: any) => !ehIgnorada(p.description, p.customer, p.id));
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
      } else if (p.subscription && manualSub.get(p.subscription)) {
        // Produto escolhido na assinatura vale para as cobranças que ela emite.
        productId = manualSub.get(p.subscription)!;
        split = null;
      } else {
        productId = matchProduct(p.description);
        split = null;
      }

      const rubric = manual
        ? { id: manual.rubricId, name: manual.category }
        : rubricaRepasse && ehRepasse(p.description)
          ? { id: rubricaRepasse.id, name: rubricaRepasse.rubricName }
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
        bankId: p.status === 'RECEIVED_IN_CASH' ? null : asaasBankId,
        asaas_payment_id: p.id,
        asaas_invoice_url: p.invoiceUrl || null,
        asaas_subscription_id: p.subscription || null,
        asaas_installment_id: p.installment || null,
      };
    });
    if (paymentRows.length) {
      const { error } = await admin.from('financial_records').upsert(paymentRows, { onConflict: 'asaas_payment_id' });
      if (error) throw new Error('Erro ao gravar cobranças: ' + error.message);
      counts.payments = paymentRows.length;
    }

    // Cobrança apagada no Asaas não aparece mais na listagem e o upsert não
    // tem como tirá-la daqui: ficava "Pendente" para sempre, inflando
    // faturamento e inadimplência. Remove o que não existe mais lá.
    // Pago nunca é tocado (o Asaas não deixa apagar cobrança recebida), e
    // listagem vazia não apaga nada — pode ser falha, não conta zerada.
    if (allPayments.length) {
      const vivos = new Set(allPayments.map((p: any) => p.id));
      const { data: locais } = await admin.from('financial_records')
        .select('id, asaas_payment_id')
        .eq('tenant_id', tenantId).eq('type', 'Receita').neq('status', 'Pago')
        .not('asaas_payment_id', 'is', null);
      const orfas = (locais || []).filter((r: any) => !vivos.has(r.asaas_payment_id)).map((r: any) => r.id);
      await deleteIn(admin, 'financial_records', orfas);
      counts.payments_removed = orfas.length;
    }

    // ---- 3) Subscriptions (assinaturas) ----
    // Mesma regra nas assinaturas: senão a ignorada continua na lista e segue
    // gerando cobrança visível.
    const allSubs = (await asaasList('/subscriptions')).filter((s: any) => !s.deleted);
    const subs = allSubs.filter((s: any) => !ehIgnorada(s.description, s.customer, s.id));
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
      end_date: s.endDate || null,
      status: s.status || 'ACTIVE',
      };
    });
    if (subRows.length) {
      const { error } = await admin.from('subscriptions').upsert(subRows, { onConflict: 'asaas_id' });
      if (error) throw new Error('Erro ao gravar assinaturas: ' + error.message);
      counts.subscriptions = subRows.length;
    }

    // Assinatura excluída no Asaas ficava ACTIVE aqui e seguia projetando
    // receita. Mesma regra das cobranças: some o que não existe mais lá.
    if (allSubs.length) {
      const vivas = new Set(allSubs.map((s: any) => s.id));
      const { data: locais } = await admin.from('subscriptions')
        .select('id, asaas_id').eq('tenant_id', tenantId).not('asaas_id', 'is', null);
      const orfas = (locais || []).filter((s: any) => !vivas.has(s.asaas_id)).map((s: any) => s.id);
      await deleteIn(admin, 'subscriptions', orfas);
      counts.subscriptions_removed = orfas.length;
    }

    // ---- 4) Bills (contas pagas pelo Asaas) ----
    // Saídas de dinheiro: boletos e tributos pagos pela conta Asaas. Sem isso,
    // o extrato do Asaas e o caixa do sistema não fecham.
    // A rubrica não dá para adivinhar pelo beneficiário, então entra como
    // pendente de validação para o usuário classificar.
    let bills: any[] = [];
    try {
      bills = await asaasList('/bill');
    } catch (e) {
      // Conta sem permissão de "contas a pagar" não deve derrubar o sync inteiro.
      console.warn('bills:', String((e as Error)?.message || e));
    }
    const billRows = bills.map((b: any) => {
      const status = mapBillStatus(b.status);
      if (!status) return null;
      const who = b.beneficiaryName || b.companyName || 'Conta paga pelo Asaas';
      return {
        id: `fb${b.id}`,
        tenant_id: tenantId,
        description: b.description ? `${who} — ${b.description}` : who,
        amount: -Math.abs(Number(b.value) || 0),
        type: 'Despesa',
        status,
        dueDate: b.dueDate || b.scheduleDate || null,
        competenceDate: b.dueDate || b.scheduleDate || null,
        paymentDate: b.paymentDate || null,
        category: 'A CLASSIFICAR',
        needsValidation: true,
        bankId: asaasBankId,
        asaas_bill_id: b.id,
      };
    }).filter(Boolean);

    if (billRows.length) {
      // Só insere o que ainda não existe: reescrever apagaria a rubrica que o
      // usuário já tiver classificado na tela de Validação.
      const { data: known } = await admin.from('financial_records')
        .select('asaas_bill_id, status, paymentDate')
        .eq('tenant_id', tenantId).not('asaas_bill_id', 'is', null);
      const byId = new Map((known || []).map((r: any) => [r.asaas_bill_id, r]));

      const toInsert = billRows.filter((r: any) => !byId.has(r.asaas_bill_id));
      if (toInsert.length) {
        const { error } = await admin.from('financial_records').insert(toInsert);
        if (error) throw new Error('Erro ao gravar contas pagas: ' + error.message);
      }
      // Nas que já existem, só o status/baixa acompanha o Asaas.
      for (const r of billRows as any[]) {
        const prev = byId.get(r.asaas_bill_id);
        if (!prev) continue;
        if (prev.status !== r.status || prev.paymentDate !== r.paymentDate) {
          await admin.from('financial_records')
            .update({ status: r.status, paymentDate: r.paymentDate })
            .eq('asaas_bill_id', r.asaas_bill_id);
        }
      }
      counts.bills = billRows.length;
    }

    // ---- 5) Saldo da conta Asaas ----
    // Pagamento feito pelo Asaas (PIX, TED, boleto) nasce de um lançamento que
    // pode estar em outra conta: ele saiu do Asaas, então fica na conta Asaas.
    if (asaasBankId) {
      // Duas rodadas: `neq` não pega a conta vazia (null <> x não é verdadeiro).
      for (const semConta of [true, false]) {
        let q = admin.from('financial_records').update({ bankId: asaasBankId })
          .eq('tenant_id', tenantId)
          .or('asaas_bill_id.not.is.null,asaas_transfer_id.not.is.null');
        q = semConta ? q.is('bankId', null) : q.neq('bankId', asaasBankId);
        const { error } = await q;
        if (error) console.warn('conta asaas:', error.message);
      }

      // O saldo da conta no sistema é saldo inicial + lançamentos pagos dela.
      // Taxa do Asaas, antecipação e estorno não viram lançamento, então ele
      // nunca fechava. O saldo inicial passa a ser o que faz o saldo de hoje
      // bater com o do Asaas — a diferença acumulada fica nele.
      try {
        const bal = await asaas('/finance/balance');
        const saldoAsaas = Number(bal?.balance);
        if (Number.isFinite(saldoAsaas)) {
          let soma = 0;
          for (let from = 0; ; from += 1000) {
            const { data, error } = await admin.from('financial_records').select('amount')
              .eq('tenant_id', tenantId).eq('bankId', asaasBankId).eq('status', 'Pago')
              .order('id').range(from, from + 999);
            if (error) throw new Error(error.message);
            soma += (data || []).reduce((a: number, r: any) => a + (Number(r.amount) || 0), 0);
            if (!data || data.length < 1000) break;
          }
          const inicial = Math.round((saldoAsaas - soma) * 100) / 100;
          const { error } = await admin.from('banks')
            .update({ initialBalance: inicial, asaas_balance: saldoAsaas, asaas_balance_at: new Date().toISOString() })
            .eq('id', asaasBankId);
          if (error) throw new Error(error.message);
          counts.asaas_balance = saldoAsaas;
        }
      } catch (e) {
        // Sem saldo, o resto do sync continua valendo.
        console.warn('saldo asaas:', String((e as Error)?.message || e));
      }
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
