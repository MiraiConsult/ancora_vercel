import { FinancialRecord, TransactionType, TransactionStatus, RevenueType, Bank } from '../types';

export const MOCK_REVENUE_TYPES: RevenueType[] = [
  { id: 'rt1', tenant_id: 'default', name: 'Mensalidade Recorrente' },
  { id: 'rt2', tenant_id: 'default', name: 'Setup / Implantação' },
  { id: 'rt3', tenant_id: 'default', name: 'Consultoria Avulsa' },
  { id: 'rt4', tenant_id: 'default', name: 'Auditoria' },
  { id: 'rt5', tenant_id: 'default', name: 'Recuperação Tributária' }
];

export const MOCK_BANKS: Bank[] = [
  { id: 'b1', tenant_id: 'default', name: 'Banco Itaú', agency: '0341', account: '12345-6', initialBalance: 15000 },
  { id: 'b2', tenant_id: 'default', name: 'Nubank', agency: '0001', account: '98765-4', initialBalance: 5000 },
  { id: 'b3', tenant_id: 'default', name: 'Caixinha Pequeno', agency: '-', account: '-', initialBalance: 500 },
];

export const MOCK_FINANCE: FinancialRecord[] = [
  { 
    id: 'f1', 
    tenant_id: 'default',
    description: 'Recebimento TechSolutions', 
    amount: 5000, 
    type: TransactionType.INCOME, 
    status: TransactionStatus.PAID, 
    dueDate: '2023-10-05', 
    paymentDate: '2023-10-05',
    category: 'Mensalidade Recorrente',
    rubricId: 'coa_std_1.1.3', // BOLETOS
    revenueTypeId: 'rt1',
    bankId: 'b1'
  },
  { 
    id: 'f2', 
    tenant_id: 'default',
    description: 'Aluguel Escritório', 
    amount: 2500, 
    type: TransactionType.EXPENSE, 
    status: TransactionStatus.PAID, 
    dueDate: '2023-10-10', 
    paymentDate: '2023-10-10',
    category: 'Infraestrutura',
    rubricId: 'coa_std_3.4.1', // ALUGUEL
    bankId: 'b1'
  },
  { 
    id: 'f3', 
    tenant_id: 'default',
    description: 'Serviços Cloud AWS', 
    amount: 850, 
    type: TransactionType.EXPENSE, 
    status: TransactionStatus.PENDING, 
    dueDate: '2023-11-15', 
    category: 'Tecnologia',
    rubricId: 'coa_std_3.3.4', // SOFTWARE
    bankId: 'b2'
  },
  { 
    id: 'f4', 
    tenant_id: 'default',
    description: 'Recebimento Construtora Horizonte', 
    amount: 12000, 
    type: TransactionType.INCOME, 
    status: TransactionStatus.PENDING, 
    dueDate: '2023-11-20', 
    category: 'Setup / Implantação',
    rubricId: 'coa_std_1.1.3', // BOLETOS
    revenueTypeId: 'rt2',
    bankId: 'b1'
  },
  { 
    id: 'f5', 
    tenant_id: 'default',
    description: 'Salários Outubro', 
    amount: 28000, 
    type: TransactionType.EXPENSE, 
    status: TransactionStatus.PAID, 
    dueDate: '2023-11-05', 
    paymentDate: '2023-11-05',
    category: 'Pessoal',
    rubricId: 'coa_std_3.1.1', // REMUNERAÇÃO CLT
    bankId: 'b1'
  },
  { 
    id: 'f6', 
    tenant_id: 'default',
    description: 'Internet Fibra', 
    amount: 300, 
    type: TransactionType.EXPENSE, 
    status: TransactionStatus.OVERDUE, 
    dueDate: '2023-11-01', 
    category: 'Infraestrutura',
    rubricId: 'coa_std_3.3.6', // INTERNET
    bankId: 'b2'
  },
  {
    id: 'f7',
    tenant_id: 'default',
    description: 'Honorários Contábeis',
    amount: 1200,
    type: TransactionType.EXPENSE,
    status: TransactionStatus.PAID,
    dueDate: '2023-10-20',
    paymentDate: '2023-10-20',
    category: 'Serviços',
    rubricId: 'coa_std_3.5.2', // SERVIÇOS CONTÁBEIS
    bankId: 'b1'
  },
  {
    id: 'f8',
    tenant_id: 'default',
    description: 'Venda AgroFarm',
    amount: 15000,
    type: TransactionType.INCOME,
    status: TransactionStatus.PAID,
    dueDate: '2023-10-25',
    paymentDate: '2023-10-25',
    category: 'Consultoria',
    rubricId: 'coa_std_1.1.2', // PIX/DÉBITO
    revenueTypeId: 'rt3',
    bankId: 'b1'
  },
  {
      id: 'f9',
      tenant_id: 'default',
      description: 'Imposto Simples Nacional',
      amount: 4500,
      type: TransactionType.EXPENSE,
      status: TransactionStatus.PENDING,
      dueDate: '2023-11-20',
      category: 'Impostos',
      rubricId: 'coa_std_2.1.1', // SIMPLES NACIONAL
      bankId: 'b1'
  }
];
