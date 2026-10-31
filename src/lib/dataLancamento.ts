import { FinancialRecord } from '../types';

/**
 * A data do lançamento. O sistema mostra uma data só, e ela cai sempre no mês em
 * que o lançamento aparece no DRE. O dia é o do vencimento quando ele está nesse
 * mês; nos lançamentos antigos com o vencimento em outro mês, vale a data que
 * define o mês do DRE.
 */
export function dataDoLancamento(r: Pick<FinancialRecord, 'competenceDate' | 'dueDate' | 'paymentDate'>): string {
  const base = r.competenceDate || r.dueDate || r.paymentDate || '';
  return r.dueDate?.startsWith(base.slice(0, 7)) ? r.dueDate : base;
}
