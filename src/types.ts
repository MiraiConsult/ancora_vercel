export interface Tenant {
  id: string;
  name: string;
  plan: string;
  description?: string;
  website?: string;
  email?: string;
  whatsapp?: string;
  /** Logo da empresa como data URI — usada no timbre dos contratos. */
  logo_url?: string;
  cnpj?: string;
  address?: string;
  phone?: string;
}

export type NoteColor = 'yellow' | 'blue' | 'green' | 'red' | 'purple' | 'gray';

export interface CompanyNote {
  id: string;
  title?: string;
  content: string;
  date: string;
  author: string;
  category?: string;
  color?: NoteColor;
}

// Updated interface for general workspace notes with company and multi-collaborator support
export interface GeneralNote extends CompanyNote {
  tenant_id: string;
  companyId?: string;
  companyName?: string;
}

/** Empresa que o usuário pode acessar — a ativa vem do JWT. */
export interface TenantOption {
  id: string;
  name: string;
  role: string;
}

/**
 * Fornecedor: cadastro próprio, separado de clientes, porque carrega o destino
 * de pagamento (PIX ou conta) usado na hora de pagar uma despesa.
 */
export interface Supplier {
  id: string;
  tenant_id?: string;
  name: string;
  doc_type?: 'CPF' | 'CNPJ';
  document?: string;
  email?: string;
  phone?: string;
  pix_key?: string;
  pix_key_type?: 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'EVP';
  bank_code?: string;
  bank_agency?: string;
  bank_account?: string;
  bank_account_digit?: string;
  bank_account_type?: string;
  bank_owner_name?: string;
  bank_owner_document?: string;
  zip?: string;
  address?: string;
  address_number?: string;
  complement?: string;
  district?: string;
  city?: string;
  state?: string;
  notes?: string;
  status?: string;
  created_at?: string;
}

export interface Company {
  id: string;
  tenant_id: string;
  name: string;
  cnpj: string;
  segment: string;
  status: 'Active' | 'Churned' | 'Prospect';
  location: string;
  notes?: CompanyNote[];
  responsible_users?: string[];  // IDs dos usuários responsáveis
  asaas_customer_id?: string;    // vínculo com o customer no Asaas
}

/** Dados de destino do pagamento, guardados no próprio lançamento. */
export interface PaymentAccount {
  type?: 'PIX' | 'BANK';
  pixKey?: string;
  pixKeyType?: 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'RANDOM';
  bank?: string;
  agency?: string;
  account?: string;
  holder?: string;
  document?: string;
}

export enum TransactionType {
  INCOME = 'Receita',
  EXPENSE = 'Despesa'
}

export enum TransactionStatus {
  PENDING = 'Pendente',
  PAID = 'Pago',
  OVERDUE = 'Atrasado'
}

export interface FinancialRecord {
  id: string;
  tenant_id: string;
  description: string;
  amount: number;
  type: TransactionType;
  status: TransactionStatus;
  dueDate: string;     // Data de Vencimento (Caixa)
  competenceDate?: string; // Data de Competência (Venda/Fato Gerador)
  paymentDate?: string; // Data da Baixa
  category: string;
  companyId?: string;
  product_id?: string;
  rubricId?: string;
  revenueTypeId?: string;
  bankId?: string;
  needsValidation?: boolean;
  /**
   * Entrada/saída que não é operacional: aporte de sócio, empréstimo,
   * transferência. Conta no caixa e no saldo, fica fora de receita, DRE e
   * indicadores de faturamento.
   */
  non_operating?: boolean;
  dealId?: string; // Legado — mantido para compatibilidade com registros existentes
  seriesId?: string;
  split_revenue?: { revenue_type_id?: string; product_id?: string; amount: number; }[];
  /** Produto/rateio definido na mão — o sync do Asaas não sobrescreve. */
  product_manual?: boolean;
  /** Onde o dinheiro vai ser pago (chave PIX ou banco/agência/conta). */
  payment_account?: PaymentAccount;
  /** Transferência do Asaas gerada por este lançamento (pagamento por PIX). */
  asaas_transfer_id?: string;
  /** Boleto/tributo pago pela conta Asaas (Pague Contas). */
  asaas_bill_id?: string;
  /** Fornecedor da despesa — de onde vem a chave PIX/conta na hora de pagar. */
  supplier_id?: string;
  // Integração Asaas
  asaas_payment_id?: string;
  asaas_invoice_url?: string;
  asaas_subscription_id?: string;
}

/** Rateio de um valor entre produtos, em percentual (pct soma 100). */
export interface ProductSplit {
  product_id: string;
  pct: number;
}

export interface Subscription {
  id: string;
  tenant_id: string;
  client_id?: string;
  product_id?: string;
  /**
   * Assinatura que vende mais de um produto no mesmo valor.
   * Guardado em % (e não em R$) para continuar certo quando houver
   * desconto, reajuste ou cobrança pro-rata.
   */
  split_products?: ProductSplit[];
  asaas_id?: string;
  description?: string;
  value: number;
  cycle?: string;          // MONTHLY, WEEKLY, YEARLY... (Asaas)
  billing_type?: string;   // UNDEFINED, BOLETO, PIX, CREDIT_CARD
  next_due_date?: string;
  end_date?: string;
  max_payments?: number;
  status?: string;         // ACTIVE, INACTIVE, EXPIRED
  created_at?: string;
}

export interface FinancialRecordSplit {
  id: string;
  financial_record_id: string;
  revenue_type_id: string;
  amount: number;
}

export interface ChartOfAccount {
  id: string;
  tenant_id: string;
  classificationCode: string;
  classificationName: string;
  centerCode: string;
  centerName: string;
  rubricCode: string;
  rubricName: string;
}

export interface RevenueType {
  id: string;
  tenant_id: string;
  name: string;
}

export interface Bank {
  id: string;
  tenant_id: string;
  name: string;
  agency: string;
  account: string;
  initialBalance: number;
}

export interface Product {
  id: string;
  tenant_id: string;
  name: string;
  description?: string;
  price: number;
  active: boolean;
  asaas_id?: string; // ID do produto/serviço no Asaas (integração futura)
  created_at?: string;
}

export interface ContractTemplate {
  id: string;
  tenant_id: string;
  product_id?: string | null;   // null = modelo padrão (sem produto)
  name: string;
  content: string;
  created_at?: string;
  updated_at?: string;
}

export interface Contract {
  id: string;
  tenant_id: string;
  number?: string;
  client_id?: string;
  product_id?: string;
  template_id?: string;
  title?: string;
  content: string;
  variables?: Record<string, string>;
  value?: number;
  start_date?: string;
  end_date?: string;
  status?: 'DRAFT' | 'ACTIVE' | 'ENDED' | 'CANCELED';
  created_at?: string;
}

export interface AIInsight {
  score: number;
  summary: string;
  recommendation: string;
}

export interface SystemNotification {
  id: string;
  tenant_id: string;
  title: string;
  message: string;
  type: 'Info' | 'Success' | 'Warning' | 'Error';
  // 'Deal' | 'Task' mantidos apenas para compatibilidade com registros legados
  entityType?: 'Finance' | 'Company' | 'System' | 'Deal' | 'Task';
  entityId?: string;
  createdAt: string;
  read: boolean;
}

export interface User {
  id: string;
  tenant_id: string;
  name: string;
  role: string; // Fonte da verdade para permissão: 'admin' ou 'collaborator'
  email: string;
  password?: string;
  avatar?: string;
  error?: string;
  permissions?: Record<string, boolean>;
  is_super_admin?: boolean;
}
