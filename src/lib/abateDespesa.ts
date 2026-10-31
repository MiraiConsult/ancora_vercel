import { ChartOfAccount, FinancialRecord } from '../types';

/** Rubricas de custo e despesa: tudo que não é da classificação de receita. */
export const rubricasDeDespesa = (contas: ChartOfAccount[]) =>
  new Set(contas.filter(c => c.classificationCode !== '1').map(c => c.id));

/**
 * Entrada em rubrica de despesa não é receita: ela abate aquela despesa. É o que
 * o cliente paga de mensageria e ads, que devolve parte da saída para o Facebook,
 * e o reembolso de imposto. O gasto real é a diferença.
 */
export const abateDespesa = (r: FinancialRecord, despesas: Set<string>) =>
  r.amount > 0 && !!r.rubricId && despesas.has(r.rubricId);
