// Como uma cobrança do Asaas vira lançamento no sistema.
// Duas portas de entrada usam estas regras: o asaas-sync (importa a conta
// inteira) e o asaas-webhook (importa a cobrança no momento em que ela é
// criada). Ficam num lugar só para as duas nunca classificarem diferente.

export const normalize = (s?: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Aplica um rateio percentual sobre o valor da cobrança.
// O resto do arredondamento vai para a maior fatia, para o rateio fechar
// exatamente com o valor cobrado (senão o DRE não bate por centavos).
export function applySplit(
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
export function mapStatus(s: string): string {
  if (['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'DUNNING_RECEIVED'].includes(s)) return 'Pago';
  if (s === 'OVERDUE') return 'Atrasado';
  return 'Pendente';
}

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

export const clienteIgnorado = (nome?: unknown) => {
  const n = String(nome || '').toLowerCase();
  return CLIENTES_IGNORADOS.some((termo) => n.includes(termo));
};

export const descricaoIgnorada = (descricao?: unknown) => {
  const d = String(descricao || '').toLowerCase();
  return DESCRICOES_IGNORADAS.some((termo) => d.includes(termo));
};

// Mensageria e ads são repasse: o cliente devolve parte do que a Mirai paga
// ao Facebook. A entrada vai para a rubrica de despesa e abate a saída; a
// diferença é o gasto da Mirai. Não é receita do produto.
const ehRepasse = (descricao?: string) => /mensageria|\bads\b/i.test(descricao || '');

type Fatia = { product_id: string; amount: number };

export interface Classificacao {
  /** Cobranças e assinaturas tiradas do sistema uma a uma (tabela asaas_ignored). */
  idsIgnorados: Set<string>;
  /** Rateio (%) das assinaturas que vendem mais de um produto, por id do Asaas. */
  splitBySub: Map<string, { product_id: string; pct: number }[]>;
  /** Produto escolhido na mão na assinatura, por id do Asaas. */
  manualSub: Map<string, string | null>;
  matchProduct: (desc?: string) => string | null;
  /** Lançamento (financial_records) correspondente a uma cobrança do Asaas. */
  linha: (p: any, companyId: string | null, asaasBankId: string | null) => Record<string, unknown>;
}

export async function carregarClassificacao(admin: any, tenantId: string): Promise<Classificacao> {
  // Produtos para casar com a descrição das cobranças (o nome do produto costuma
  // aparecer na descrição, ex: "Mensalidade - HelloGrowth"). Normaliza removendo
  // espaços/pontuação/acentos para casar "HelloGrowth" == "Hello Growth".
  // Casa pelo nome (normalizado) mais longo primeiro (mais específico).
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

  const { data: ignoradosRows } = await admin.from('asaas_ignored')
    .select('asaas_id').eq('tenant_id', tenantId);
  const idsIgnorados = new Set<string>((ignoradosRows || []).map((r: any) => r.asaas_id));

  const { data: rubricaRepasse } = await admin.from('chart_of_accounts')
    .select('id, rubricName').eq('tenant_id', tenantId).eq('id', 'coa_mensageria_entrada').maybeSingle();

  const linha = (p: any, companyId: string | null, asaasBankId: string | null) => {
    const amount = Number(p.value) || 0;

    // Classificação: manual > rateio da assinatura > casamento pela descrição
    let productId: string | null;
    let split: Fatia[] | null;
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
      companyId,
      product_id: productId,
      split_revenue: split && split.length ? split : null,
      bankId: p.status === 'RECEIVED_IN_CASH' ? null : asaasBankId,
      asaas_payment_id: p.id,
      asaas_invoice_url: p.invoiceUrl || null,
      asaas_subscription_id: p.subscription || null,
      asaas_installment_id: p.installment || null,
    };
  };

  return { idsIgnorados, splitBySub, manualSub, matchProduct, linha };
}
