/**
 * Ciclos de assinatura do Asaas — rótulo, opções do formulário, normalização
 * para MRR e o passo usado para projetar os próximos vencimentos.
 */

export const CYCLE_LABEL: Record<string, string> = {
  WEEKLY: 'Semanal', BIWEEKLY: 'Quinzenal', MONTHLY: 'Mensal', BIMONTHLY: 'Bimestral',
  QUARTERLY: 'Trimestral', SEMIANNUALLY: 'Semestral', YEARLY: 'Anual',
};

/** Ciclos oferecidos ao criar/editar uma assinatura. */
export const CYCLE_OPTIONS = ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMIANNUALLY', 'YEARLY']
  .map(value => ({ value, label: CYCLE_LABEL[value] }));

/** Quantas vezes o ciclo cabe em um mês (para normalizar o MRR). */
export const CYCLE_TO_MONTHLY: Record<string, number> = {
  WEEKLY: 52 / 12,
  BIWEEKLY: 26 / 12,
  MONTHLY: 1,
  BIMONTHLY: 1 / 2,
  QUARTERLY: 1 / 3,
  SEMIANNUALLY: 1 / 6,
  YEARLY: 1 / 12,
};

export const cycleLabel = (cycle?: string) =>
  CYCLE_LABEL[(cycle || '').toUpperCase()] || cycle || '—';

export const monthlyFactor = (cycle?: string) =>
  CYCLE_TO_MONTHLY[(cycle || 'MONTHLY').toUpperCase()] ?? 1;

/**
 * Intervalo entre duas cobranças do ciclo. Semanal/quinzenal andam em dias
 * (não caem sempre no mesmo dia do mês); os demais andam em meses.
 */
export const cycleStep = (cycle?: string): { days: number; months?: never } | { months: number; days?: never } => {
  switch ((cycle || 'MONTHLY').toUpperCase()) {
    case 'WEEKLY': return { days: 7 };
    case 'BIWEEKLY': return { days: 14 };
    case 'BIMONTHLY': return { months: 2 };
    case 'QUARTERLY': return { months: 3 };
    case 'SEMIANNUALLY': return { months: 6 };
    case 'YEARLY': return { months: 12 };
    default: return { months: 1 };
  }
};
