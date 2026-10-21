/**
 * Entrada e saída de clientes por mês.
 *
 * Cliente ativo no mês é quem tem receita com competência naquele mês — paga
 * ou não, porque cobrança emitida é cliente na base. No mês corrente entra
 * também quem tem assinatura ativa: senão a cobrança que o Asaas ainda não
 * emitiu viraria uma saída que não aconteceu.
 *
 * Acordo não é cliente: é o devedor de um cliente do MDT. Fica fora sempre.
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

export const normName = (s?: string) => (s || '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');

/** Soma n meses a uma chave 'YYYY-MM'. */
export const shiftMes = (key: string, n: number) => {
  const [y, m] = key.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
};

export function computeMovement(
  records: FinancialRecord[],
  subscriptions: Subscription[],
  products: Product[],
  scope: MovementScope,
  /** Quantos meses até o atual, inclusive. */
  meses = 12,
): MovementMonth[] {
  const acordo = new Set(products.filter(p => normName(p.name) === 'acordo').map(p => p.id));
  const alvo = scope.produtos
    ? new Set(products.filter(p => scope.produtos!.includes(normName(p.name))).map(p => p.id))
    : null;
  /** O produto conta neste recorte? */
  const conta = (pid?: string | null) =>
    alvo ? !!pid && alvo.has(pid) : !(pid && acordo.has(pid));

  const atual = new Date().toISOString().slice(0, 7);
  // O mês seguinte entra só para olhar à frente (regra do mês pulado, abaixo).
  const limite = shiftMes(atual, 1);
  const porMes = new Map<string, Set<string>>();
  const add = (mes: string, cid: string) => {
    if (!porMes.has(mes)) porMes.set(mes, new Set());
    porMes.get(mes)!.add(cid);
  };

  for (const r of records) {
    if (r.amount <= 0 || !r.companyId || r.needsValidation || r.non_operating) continue;
    const mes = (r.competenceDate || r.dueDate || '').slice(0, 7);
    if (!mes || mes > limite) continue;
    const ok = r.split_revenue?.length
      ? r.split_revenue.some(sp => (sp.amount || 0) > 0 && conta(sp.product_id))
      : conta(r.product_id);
    if (ok) add(mes, r.companyId);
  }

  for (const s of subscriptions) {
    if ((s.status || 'ACTIVE').toUpperCase() !== 'ACTIVE' || !s.client_id) continue;
    const ok = s.split_products?.length
      ? s.split_products.some(sp => conta(sp.product_id))
      : conta(s.product_id);
    if (ok) add(atual, s.client_id);
  }

  // Mês pulado não é saída: cliente que estava no mês anterior e está no
  // seguinte conta como ativo no do meio. Cobre isenção de um mês (Boteco do
  // Tala, set/26) e cobrança que atrasou para o mês seguinte — sem isso ele
  // aparecia como "saiu" e, no mês seguinte, como "voltou".
  const meses0 = [...porMes.keys()].sort();
  if (meses0.length) {
    for (let mes = shiftMes(meses0[0], 1); mes <= atual; mes = shiftMes(mes, 1)) {
      const antes = porMes.get(shiftMes(mes, -1));
      const depois = porMes.get(shiftMes(mes, 1));
      if (!antes || !depois) continue;
      antes.forEach(cid => { if (depois.has(cid)) add(mes, cid); });
    }
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
