





export interface DealStageConfig {
  id: string;
  tenant_id: string;
  name: string;
  order: number;  // Mapeado de order_position do banco
  order_position?: number;  // Campo real do banco
  is_fixed: boolean;
  is_visible: boolean;
  color?: string;  // Cor da etapa no Kanban
}

export interface TaskStageConfig {
  id: string;
  tenant_id: string;
  name: string;
  order: number;  // Mapeado de order_position do banco
  order_position?: number;  // Campo real do banco
  is_fixed: boolean;
  color?: string;  // Cor da etapa no Kanban
}

export enum DealStage {
  PROSPECTING = 'Prospecção',
  QUALIFICATION = 'Qualificação',
  PROPOSAL = 'Proposta',
  NEGOTIATION = 'Negociação',
  CLOSED_WON = 'Fechado (Ganho)',
  CLOSED_LOST = 'Perdido'
}

export interface Tenant {
  id: string;
  name: string;
  plan: string;
  description?: string;
  website?: string;
  email?: string;
  whatsapp?: string;
  logo_url?: string;
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
}

export interface Contact {
  id: string;
  tenant_id: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  companyId: string;
}

export interface Interaction {
  id: string;
  type: 'Call' | 'Meeting' | 'Email' | 'Note' | 'System';
  description: string;
  date: string;
  author: string;
}

export interface Deal {
  id: string;
  tenant_id: string;
  title: string;
  value: number;
  stage: string;
  companyId: string;
  probability: number;
  lastActivity: string;
  temperature?: 'Hot' | 'Warm' | 'Cold'; 
  description?: string;
  products?: string[];
  contactId?: string;
  history?: Interaction[];
  revenueTypeId?: string;
  // FIX: Add optional createdAt property to Deal interface.
  createdAt?: string;
  responsible_users?: string[];  // IDs dos usuários responsáveis
}

export enum TaskType {
  CALL = 'Ligação',
  MEETING = 'Reunião',
  EMAIL = 'E-mail',
  FOLLOW_UP = 'Follow-up'
}

export interface Task {
  id: string;
  tenant_id: string;
  title: string;
  description?: string;
  type: string;
  dueDate: string;
  startTime?: string;  // Horário de início (para reuniões)
  endTime?: string;    // Horário de fim (para reuniões)
  createdAt?: string;
  completedAt?: string | null;
  priority: 'High' | 'Medium' | 'Low';
  status: string;  // Nome da etapa customizável (ex: 'Pendente', 'Em Progresso', 'Concluído')
  archived?: boolean;
  companyId?: string;
  relatedTo?: string;
  meetLink?: string;
  assigned_to?: string[];  // IDs dos usuários atribuídos/participantes
  tag_id?: string;  // ID da tag associada
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
  rubricId?: string; 
  revenueTypeId?: string; 
  bankId?: string; 
  needsValidation?: boolean; 
  dealId?: string; 
  seriesId?: string;
  split_revenue?: { revenue_type_id: string; amount: number; }[];
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

export interface ListItem {
  id: string;
  tenant_id: string;
  name: string;
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
  entityType: 'Deal' | 'Task' | 'Finance' | 'Company' | 'System';
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

export interface Tag {
  id: string;
  tenant_id: string;
  name: string;
  color: string;
}