/**
 * Entrada e saída de clientes por mês.
 *
 * Cliente ativo no mês é quem tem receita com competência naquele mês — paga
 * ou não, porque cobrança emitida é cliente na base. No mês corrente entra
 * também quem tem assinatura ativa: senão a cobrança que o Asaas ainda não
 * emitiu viraria uma saída que não aconteceu.
 *
 * Acordo não é cliente: é o devedor de um cliente do MDT. Fica fora sempre.
 *
 * Por cima disso valem os ajustes feitos à mão na lista de clientes
 * (client_system_overrides): a cobrança nem sempre conta a história real —
 * cliente da MC Castro só aparece na data em que passou a ser cobrado por lá, e
 * quem parou de pagar segue com assinatura ativa no Asaas.
 */

import { FinancialRecord, Product, Subscription } from '../types';

export interface MovementMonth {
  /** 'YYYY-MM' */
  mes: string;
  ativos: string[];
  /** Primeiro mês com receita. */
  novos: string[];
  /** Estava no mês anterior e continua. */
  renovaram: string[];
  /** Já foi cliente, ficou ao menos um mês fora e voltou. */
  voltaram: string[];
  /** Estava no mês anterior e não está neste. */
  sairam: string[];
}

export interface MovementScope {
  key: string;
  nome: string;
  /** null = todos os produtos (menos acordo). */
  produtos: string[] | null;
}

/** Sistemas acompanhados, pelo nome normalizado do produto. */
export const MOVEMENT_SCOPES: MovementScope[] = [
  { key: 'GERAL', nome: 'Geral', produtos: null },
  { key: 'HG', nome: 'Hello Growth', produtos: ['hellogrowth', 'hellorating'] },
  { key: 'KAIVAA', nome: 'Kaivaa', produtos: ['kaivaa'] },
  { key: 'MDT', nome: 'MDT Cobranças', produtos: ['mdtcobrancas'] },
];

/** Onde o cliente está. OUTROS é todo produto fora dos sistemas (consultoria etc.). */
export type SistemaKey = 'HG' | 'KAIVAA' | 'MDT' | 'OUTROS';
export const SISTEMA_NOME: Record<SistemaKey, string> = {
  HG: 'Hello Growth', KAIVAA: 'Kaivaa', MDT: 'MDT Cobranças', OUTROS: 'Outros produtos',
};
const SISTEMAS: SistemaKey[] = ['HG', 'KAIVAA', 'MDT', 'OUTROS'];

/** Ajuste manual de um cliente num sistema. Campo vazio = segue a cobrança. */
export interface SystemOverride {
  client_id: string;
  system: SistemaKey;
  entry_date?: string | null;
  exit_date?: string | null;
  monthly_value?: number | null;
  status?: 'ATIVO' | 'SAIU' | null;
}

/** Linha da lista de conferência: um cliente em um sistema. */
export interface ClientSystemRow {
  clientId: string;
  system: SistemaKey;
  /** Data de entrada em vigor (ajustada ou a da primeira cobrança). */
  entrada: string;
  entradaAuto: string;
  /** Valor mensal em vigor (ajustado, ou assinatura, ou o último mês cobrado). */
  valor: number;
  valorAuto: number;
  ativo: boolean;
  /** Data de saída; '' se está ativo. */
  saida: string;
  ajuste?: SystemOverride;
}

export const normName = (s?: string) => (s || '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');

/** Soma n meses a uma chave 'YYYY-MM'. */
export const shiftMes = (key: string, n: number) => {
  const [y, m] = key.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
};

const mesAtual = () => new Date().toISOString().slice(0, 7);

type PorMes = Map<string, Set<string>>;

const add = (porMes: PorMes, mes: string, cid: string) => {
  if (!porMes.has(mes)) porMes.set(mes, new Set());
  porMes.get(mes)!.add(cid);
};

/** A que sistema cada produto pertence. Acordo não entra em nenhum. */
function classificador(products: Product[]) {
  const porProduto = new Map<string, SistemaKey | null>();
  products.forEach(p => {
    const n = normName(p.name);
    if (n === 'acordo') porProduto.set(p.id, null);
    else if (n === 'hellogrowth' || n === 'hellorating') porProduto.set(p.id, 'HG');
    else if (n === 'kaivaa') porProduto.set(p.id, 'KAIVAA');
    else if (n === 'mdtcobrancas') porProduto.set(p.id, 'MDT');
    else porProduto.set(p.id, 'OUTROS');
  });
  // Lançamento sem produto (ou de produto apagado) é receita de outra coisa.
  return (pid?: string | null): SistemaKey | null =>
    (pid && porProduto.has(pid) ? porProduto.get(pid)! : 'OUTROS');
}

/** Histórico de um sistema, antes de qualquer ajuste manual. */
interface HistoricoSistema {
  porMes: PorMes;
  /** Data da primeira cobrança de cada cliente. */
  primeira: Map<string, string>;
  /** Valor de cada cliente por mês: é o "último valor" de quem não tem assinatura. */
  valorPorMes: Map<string, Map<string, number>>;
  /** Assinaturas ativas somadas por cliente. */
  assinatura: Map<string, number>;
}

function historicos(records: FinancialRecord[], subscriptions: Subscription[], products: Product[]) {
  const sistemaDe = classificador(products);
  const atual = mesAtual();
  // O mês seguinte entra só para olhar à frente (regra do mês pulado, abaixo).
  const limite = shiftMes(atual, 1);
  const hist = Object.fromEntries(SISTEMAS.map(s => [s, {
    porMes: new Map(), primeira: new Map(), valorPorMes: new Map(), assinatura: new Map(),
  } as HistoricoSistema])) as Record<SistemaKey, HistoricoSistema>;

  for (const r of records) {
    if (r.amount <= 0 || !r.companyId || r.needsValidation || r.non_operating) continue;
    const data = (r.competenceDate || r.dueDate || '').slice(0, 10);
    const mes = data.slice(0, 7);
    if (!mes) continue;
    const partes: { sistema: SistemaKey | null; valor: number }[] = r.split_revenue?.length
      ? r.split_revenue.filter(sp => (sp.amount || 0) > 0).map(sp => ({ sistema: sistemaDe(sp.product_id), valor: sp.amount || 0 }))
      : [{ sistema: sistemaDe(r.product_id), valor: r.amount }];
    for (const { sistema, valor } of partes) {
      if (!sistema) continue;
      const h = hist[sistema];
      if (mes <= limite) add(h.porMes, mes, r.companyId);
      const antes = h.primeira.get(r.companyId);
      if (!antes || data < antes) h.primeira.set(r.companyId, data);
      if (mes <= atual) {
        if (!h.valorPorMes.has(r.companyId)) h.valorPorMes.set(r.companyId, new Map());
        const v = h.valorPorMes.get(r.companyId)!;
        v.set(mes, (v.get(mes) || 0) + valor);
      }
    }
  }

  for (const s of subscriptions) {
    if ((s.status || 'ACTIVE').toUpperCase() !== 'ACTIVE' || !s.client_id) continue;
    const partes: { sistema: SistemaKey | null; valor: number }[] = s.split_products?.length
      ? s.split_products.map(sp => ({ sistema: sistemaDe(sp.product_id), valor: (s.value || 0) * sp.pct / 100 }))
      : [{ sistema: sistemaDe(s.product_id), valor: s.value || 0 }];
    for (const { sistema, valor } of partes) {
      if (!sistema) continue;
      const h = hist[sistema];
      add(h.porMes, atual, s.client_id);
      h.assinatura.set(s.client_id, (h.assinatura.get(s.client_id) || 0) + valor);
      if (!h.primeira.has(s.client_id) && s.next_due_date) h.primeira.set(s.client_id, s.next_due_date.slice(0, 10));
    }
  }

  // Mês pulado não é saída: cliente que estava no mês anterior e está no
  // seguinte conta como ativo no do meio. Cobre isenção de um mês (Boteco do
  // Tala, set/26) e cobrança que atrasou para o mês seguinte — sem isso ele
  // aparecia como "saiu" e, no mês seguinte, como "voltou".
  for (const s of SISTEMAS) {
    const { porMes } = hist[s];
    const chaves = [...porMes.keys()].sort();
    if (!chaves.length) continue;
    for (let mes = shiftMes(chaves[0], 1); mes <= atual; mes = shiftMes(mes, 1)) {
      const antes = porMes.get(shiftMes(mes, -1));
      const depois = porMes.get(shiftMes(mes, 1));
      if (!antes || !depois) continue;
      antes.forEach(cid => { if (depois.has(cid)) add(porMes, mes, cid); });
    }
  }
  return hist;
}

/** Meses em que o cliente aparece, em ordem. */
const mesesDoCliente = (porMes: PorMes, cid: string) =>
  [...porMes.keys()].filter(m => porMes.get(m)!.has(cid)).sort();

/**
 * Aplica um ajuste manual ao histórico do cliente. O que foi digitado vale mais
 * que a cobrança, então os meses entre a entrada e a saída contam mesmo sem
 * lançamento: cliente da MC Castro desde março só começou a ter cobrança aqui
 * em outubro.
 */
function aplicarAjuste(porMes: PorMes, ov: SystemOverride) {
  const cid = ov.client_id;
  const atual = mesAtual();
  const meses = mesesDoCliente(porMes, cid);
  const inicioAuto = meses[0];
  const inicio = ov.entry_date ? ov.entry_date.slice(0, 7) : inicioAuto;
  if (!inicio) return;

  // Primeiro mês em que NÃO é mais cliente.
  let fim: string | null = null;
  if (ov.status === 'SAIU') {
    fim = ov.exit_date ? ov.exit_date.slice(0, 7) : shiftMes(meses[meses.length - 1] || inicio, 1);
  } else if (ov.status === 'ATIVO') {
    fim = shiftMes(atual, 2);
  }

  meses.forEach(m => {
    if (m < inicio || (fim && m >= fim)) porMes.get(m)!.delete(cid);
  });

  // Preenche o intervalo confirmado: até o fim, se a situação foi definida;
  // só até a primeira cobrança, se foi ajustada apenas a data de entrada.
  let ate: string | null = fim;
  if (!ate && inicio !== inicioAuto) {
    ate = inicioAuto && inicio < inicioAuto ? inicioAuto : shiftMes(inicio, 1);
  }
  if (ate) for (let m = inicio; m < ate; m = shiftMes(m, 1)) add(porMes, m, cid);
}

function mesesFinais(hist: Record<SistemaKey, HistoricoSistema>, overrides: SystemOverride[]) {
  const finais = {} as Record<SistemaKey, PorMes>;
  SISTEMAS.forEach(s => {
    const copia: PorMes = new Map([...hist[s].porMes].map(([m, set]) => [m, new Set(set)]));
    overrides.filter(o => o.system === s).forEach(o => aplicarAjuste(copia, o));
    finais[s] = copia;
  });
  return finais;
}

export function computeMovement(
  records: FinancialRecord[],
  subscriptions: Subscription[],
  products: Product[],
  scope: MovementScope,
  overrides: SystemOverride[] = [],
  /** Quantos meses até o atual, inclusive. */
  meses = 12,
): MovementMonth[] {
  const finais = mesesFinais(historicos(records, subscriptions, products), overrides);
  const atual = mesAtual();

  // Geral é a união dos sistemas: quem troca de sistema não saiu da empresa.
  let porMes: PorMes;
  if (scope.key === 'GERAL') {
    porMes = new Map();
    SISTEMAS.forEach(s => finais[s].forEach((set, m) => set.forEach(cid => add(porMes, m, cid))));
  } else {
    porMes = finais[scope.key as SistemaKey];
  }

  // Primeira aparição de cada cliente, olhando o histórico inteiro — é o que
  // separa "novo" de "voltou".
  const primeiro = new Map<string, string>();
  [...porMes.keys()].sort().forEach(mes =>
    porMes.get(mes)!.forEach(cid => { if (!primeiro.has(cid)) primeiro.set(cid, mes); }));

  const out: MovementMonth[] = [];
  for (let i = meses - 1; i >= 0; i--) {
    const mes = shiftMes(atual, -i);
    const curr = porMes.get(mes) || new Set<string>();
    const prev = porMes.get(shiftMes(mes, -1)) || new Set<string>();
    const ativos = [...curr];
    out.push({
      mes,
      ativos,
      novos: ativos.filter(c => primeiro.get(c) === mes),
      renovaram: ativos.filter(c => prev.has(c)),
      voltaram: ativos.filter(c => !prev.has(c) && primeiro.get(c)! < mes),
      sairam: [...prev].filter(c => !curr.has(c)),
    });
  }
  return out;
}

/** Base de clientes por sistema, para conferir e corrigir à mão. */
export function computeClientList(
  records: FinancialRecord[],
  subscriptions: Subscription[],
  products: Product[],
  overrides: SystemOverride[] = [],
): ClientSystemRow[] {
  const hist = historicos(records, subscriptions, products);
  const finais = mesesFinais(hist, overrides);
  const atual = mesAtual();
  const rows: ClientSystemRow[] = [];

  SISTEMAS.forEach(s => {
    const h = hist[s];
    const clientes = new Set<string>([...h.primeira.keys()]);
    overrides.filter(o => o.system === s).forEach(o => clientes.add(o.client_id));
    clientes.forEach(clientId => {
      const ajuste = overrides.find(o => o.system === s && o.client_id === clientId);
      const entradaAuto = h.primeira.get(clientId) || '';
      const porMesValor = h.valorPorMes.get(clientId);
      const ultimoMes = porMesValor ? [...porMesValor.keys()].sort().pop() : undefined;
      const valorAuto = h.assinatura.get(clientId) ?? (ultimoMes ? porMesValor!.get(ultimoMes)! : 0);
      const meses = mesesDoCliente(finais[s], clientId).filter(m => m <= atual);
      const ativo = finais[s].get(atual)?.has(clientId) || false;
      const saidaAuto = meses.length ? `${shiftMes(meses[meses.length - 1], 1)}-01` : '';
      rows.push({
        clientId,
        system: s,
        entrada: ajuste?.entry_date?.slice(0, 10) || entradaAuto,
        entradaAuto,
        valor: ajuste?.monthly_value ?? valorAuto,
        valorAuto,
        ativo,
        saida: ativo ? '' : (ajuste?.exit_date?.slice(0, 10) || saidaAuto),
        ajuste,
      });
    });
  });
  return rows;
}
