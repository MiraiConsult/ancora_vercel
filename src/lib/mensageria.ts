import { FinancialRecord, TransactionStatus } from '../types';
import { dataDoLancamento } from './dataLancamento';
import { isProjected, shiftMonthKey } from './subscriptionProjection';

export const RUBRICA_ENTRADA = 'coa_mensageria_entrada';
export const RUBRICA_SAIDA = 'coa_mensageria_saida';

const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** "Setembro/2026", "set/2026" ou "set/26" escrito na descrição. */
const mesEscrito = (texto?: string): string | null => {
  const m = semAcento(texto || '').match(/\b(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\s*\/\s*(\d{4}|\d{2})\b/);
  if (!m) return null;
  const mes = MESES.findIndex(n => n.startsWith(m[1])) + 1;
  const ano = m[2].length === 2 ? `20${m[2]}` : m[2];
  return `${ano}-${String(mes).padStart(2, '0')}`;
};

/**
 * "uso de out" nas fatias do reembolso do cartão: o mês da fatura. O ano é o
 * do lançamento, ou o anterior quando o mês citado ainda está à frente dele.
 */
const mesDoUso = (r: FinancialRecord): string | null => {
  const textos = [r.description, ...(r.split_rubrics || []).map(f => f.description)];
  for (const t of textos) {
    const m = semAcento(t || '').match(/\buso de (jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)/);
    if (!m) continue;
    const mes = MESES.findIndex(n => n.startsWith(m[1])) + 1;
    const base = dataDoLancamento(r);
    const ano = Number(base.slice(0, 4)) - (mes > Number(base.slice(5, 7)) ? 1 : 0);
    return `${ano}-${String(mes).padStart(2, '0')}`;
  }
  return null;
};

/**
 * Mês de consumo da mensageria. O cliente paga e o Facebook é reembolsado no
 * mês seguinte ao do uso, então vale o mês anterior ao do lançamento, a menos
 * que a descrição diga o mês ("Mensageria Kaivaa - Setembro/2026") ou o
 * reembolso diga de que uso é a fatura ("uso de out").
 */
export const mesDeConsumo = (r: FinancialRecord, descricaoFatia?: string): string =>
  mesEscrito(descricaoFatia) || mesEscrito(r.description) || mesDoUso(r) || shiftMonthKey(dataDoLancamento(r).slice(0, 7), -1);

export type Cobranca = { record: FinancialRecord; mes: string; valor: number };
export type Custo = { record: FinancialRecord; mes: string; valor: number; descricao: string };

/** Cobranças de mensageria e ads feitas aos clientes. */
export const cobrancasMensageria = (records: FinancialRecord[]): Cobranca[] =>
  records
    .filter(r => !isProjected(r) && r.rubricId === RUBRICA_ENTRADA && r.amount > 0)
    .map(r => ({ record: r, mes: mesDeConsumo(r), valor: r.amount }));

/**
 * O que a Mirai pagou ao Facebook. Quase sempre é uma fatia do reembolso do
 * cartão, então conta só a fatia da rubrica de saída, não o reembolso inteiro.
 */
export const custosMensageria = (records: FinancialRecord[]): Custo[] => {
  const out: Custo[] = [];
  for (const r of records) {
    if (isProjected(r)) continue;
    if (r.split_rubrics && r.split_rubrics.length > 0) {
      for (const f of r.split_rubrics) {
        if (f.rubric_id !== RUBRICA_SAIDA) continue;
        out.push({ record: r, mes: mesDeConsumo(r, f.description), valor: -f.amount, descricao: f.description || r.description });
      }
    } else if (r.rubricId === RUBRICA_SAIDA && r.amount < 0) {
      out.push({ record: r, mes: mesDeConsumo(r), valor: -r.amount, descricao: r.description });
    }
  }
  return out;
};

export const emAberto = (r: FinancialRecord) => r.status !== TransactionStatus.PAID;
