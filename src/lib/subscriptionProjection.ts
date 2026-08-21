/**
 * Renovações futuras das assinaturas, como lançamentos virtuais.
 *
 * O Asaas só emite a cobrança de uma assinatura ~30/40 dias antes do
 * vencimento. Como o caixa lê `financial_records`, e só existe registro do que
 * o Asaas já emitiu, o fluxo futuro morria dois meses à frente mesmo com a
 * assinatura ativa e sem prazo para acabar. Estas linhas preenchem esse buraco
 * — elas não existem no banco, não são editáveis e só entram onde o usuário
 * pediu para incluir o que ainda não foi pago.
 */

import { FinancialRecord, Subscription, TransactionStatus, TransactionType } from '../types';
import { cycleStep } from './cycles';

/** Prefixo do id das linhas projetadas — é o que as distingue das reais. */
export const PROJECTED_PREFIX = 'prev:';

export const isProjected = (r: Pick<FinancialRecord, 'id'>) =>
  typeof r.id === 'string' && r.id.startsWith(PROJECTED_PREFIX);

const addDays = (iso: string, days: number) => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Anda meses preservando o dia — 31/jan + 1 mês vira 28/fev, como no Asaas. */
const addMonths = (iso: string, months: number) => {
  const d = new Date(iso + 'T00:00:00Z');
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d.toISOString().slice(0, 10);
};

/** Soma n meses a uma chave 'YYYY-MM'. */
export const shiftMonthKey = (key: string, n: number) => {
  const [y, m] = key.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
};

/** O rateio da assinatura é guardado em %, o do lançamento em R$. */
const splitOf = (sub: Subscription): FinancialRecord['split_revenue'] =>
  sub.split_products?.length
    ? sub.split_products.map(sp => ({ product_id: sp.product_id || undefined, amount: (sub.value || 0) * sp.pct / 100 }))
    : undefined;

interface ProjectionOptions {
  /** Primeiro mês projetado, 'YYYY-MM'. O passado nunca é projetado. */
  fromMonth: string;
  /** Último mês projetado, 'YYYY-MM'. */
  toMonth: string;
}

/**
 * Gera as renovações que ainda não viraram cobrança.
 *
 * `existingRecords` são os lançamentos reais: o mês que já tem cobrança emitida
 * para aquela assinatura é pulado, senão o valor apareceria dobrado no mês em
 * que o Asaas já emitiu e o Ancora já registrou.
 */
export function projectSubscriptions(
  subscriptions: Subscription[],
  existingRecords: FinancialRecord[],
  { fromMonth, toMonth }: ProjectionOptions,
): FinancialRecord[] {
  if (!subscriptions.length || toMonth < fromMonth) return [];

  // Quantas cobranças cada assinatura já tem, por mês e no total. O total é o
  // que permite parar uma assinatura de "12x" na décima segunda.
  const porMes = new Map<string, Map<string, number>>();
  const emitidas = new Map<string, number>();
  for (const r of existingRecords) {
    const subId = r.asaas_subscription_id;
    if (!subId || !r.dueDate) continue;
    const mk = r.dueDate.slice(0, 7);
    if (!porMes.has(subId)) porMes.set(subId, new Map());
    const m = porMes.get(subId)!;
    m.set(mk, (m.get(mk) || 0) + 1);
    emitidas.set(subId, (emitidas.get(subId) || 0) + 1);
  }

  const hoje = new Date().toISOString().slice(0, 10);
  const out: FinancialRecord[] = [];

  for (const sub of subscriptions) {
    if ((sub.status || 'ACTIVE').toUpperCase() !== 'ACTIVE') continue;
    if (!sub.value) continue;

    const step = cycleStep(sub.cycle);
    const pendentes = new Map(porMes.get(sub.asaas_id || '') || []);
    const split = splitOf(sub);
    // Assinatura com prazo para de render na última cobrança; sem isso ela
    // apareceria rendendo até o fim da janela.
    const stop = sub.end_date?.slice(0, 10) || null;
    let restantes = sub.max_payments
      ? Math.max(0, sub.max_payments - (emitidas.get(sub.asaas_id || '') || 0))
      : Infinity;

    let d = sub.next_due_date?.slice(0, 10) || hoje;
    for (let i = 0; i < 400 && restantes > 0; i++) {
      if (stop && d > stop) break;
      const mk = d.slice(0, 7);
      if (mk > toMonth) break;
      if (mk >= fromMonth) {
        const jaTem = pendentes.get(mk) || 0;
        if (jaTem > 0) {
          pendentes.set(mk, jaTem - 1);
        } else {
          out.push({
            id: `${PROJECTED_PREFIX}${sub.id}:${d}`,
            tenant_id: sub.tenant_id,
            description: `${sub.description || 'Assinatura'} (renovação prevista)`,
            amount: sub.value,
            type: TransactionType.INCOME,
            status: TransactionStatus.PENDING,
            dueDate: d,
            competenceDate: d,
            category: 'Renovação prevista',
            companyId: sub.client_id,
            product_id: sub.product_id,
            split_revenue: split,
            asaas_subscription_id: sub.asaas_id,
          });
          restantes -= 1;
        }
      }
      d = step.days ? addDays(d, step.days) : addMonths(d, step.months!);
    }
  }

  return out;
}
