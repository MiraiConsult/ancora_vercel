import { FinancialRecordSplit } from '../types';

export const MOCK_FINANCE_SPLITS: FinancialRecordSplit[] = [
  // Splitting record 'f4' (Valor total: 12000, Construtora Horizonte) em duas naturezas de receita.
  // Originalmente, estava em 'Setup / Implantação' (rt2).
  { id: 'split1', financial_record_id: 'f4', revenue_type_id: 'rt2', amount: 8000 }, // R$ 8.000 como Setup / Implantação
  { id: 'split2', financial_record_id: 'f4', revenue_type_id: 'rt3', amount: 4000 }, // R$ 4.000 como Consultoria Avulsa
];
