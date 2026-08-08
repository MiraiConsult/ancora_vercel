import { supabase } from '../lib/supabaseClient';

/**
 * Cliente do frontend para a Edge Function 'asaas-proxy'.
 * A ASAAS_API_KEY nunca é exposta aqui — fica na função (secret do Supabase).
 */

async function invoke(action: string, params: Record<string, any> = {}) {
  const { data, error } = await supabase.functions.invoke('asaas-proxy', {
    body: { action, ...params },
  });

  if (error) {
    // supabase-js embrulha respostas não-2xx em FunctionsHttpError; tentamos ler a msg real
    let message = error.message || 'Erro ao chamar a função Asaas.';
    try {
      const ctx = (error as any).context;
      if (ctx && typeof ctx.json === 'function') {
        const j = await ctx.json();
        if (j?.error) message = j.error;
      }
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }

  if (data && data.success === false) {
    throw new Error(data.error || 'Erro Asaas.');
  }

  return data;
}

/**
 * Multa, juros e desconto aplicados pelo próprio Asaas. Percentual é o padrão;
 * FIXED vira valor em R$. Só vale o que vier preenchido.
 */
export interface ChargeTerms {
  fineValue?: number;          // multa por atraso
  fineType?: 'PERCENTAGE' | 'FIXED';
  interestValue?: number;      // juros ao mês, em %
  discountValue?: number;      // desconto por antecipação
  discountType?: 'PERCENTAGE' | 'FIXED';
  discountDeadline?: number;   // até N dias antes do vencimento (0 = até o vencimento)
}

export interface CreateChargeParams extends ChargeTerms {
  clientId: string;
  value: number;
  dueDate: string;         // YYYY-MM-DD
  description?: string;
  billingType?: string;    // UNDEFINED | BOLETO | PIX | CREDIT_CARD
  revenueTypeId?: string;
  productId?: string;
  /** Acima de 1, o Asaas divide o valor total em N cobranças. */
  installmentCount?: number;
}

export interface CreateSubscriptionParams extends ChargeTerms {
  clientId: string;
  value: number;
  nextDueDate: string;     // YYYY-MM-DD
  cycle?: string;          // MONTHLY | WEEKLY | YEARLY...
  description?: string;
  billingType?: string;
  productId?: string;
  /** Rateio em % quando a assinatura vende mais de um produto. */
  splitProducts?: { product_id: string; pct: number }[];
  endDate?: string;
  maxPayments?: number;
}

export const asaasSyncCustomer = (clientId: string) =>
  invoke('sync_customer', { clientId });

export interface CreateClientParams {
  name: string;
  cnpj: string;          // CPF (11) ou CNPJ (14) — com ou sem máscara
  email?: string;
  phone?: string;
  segment?: string;
}

/**
 * Cadastra o cliente aqui e no Asaas de uma vez. Documento que já existe como
 * customer no Asaas é vinculado (linked = true), não duplicado.
 */
export const asaasCreateClient = (params: CreateClientParams) =>
  invoke('create_client', params) as Promise<{ client: any; linked: boolean }>;

/**
 * Importa/sincroniza clientes, cobranças e assinaturas existentes da conta Asaas.
 * Chama a Edge Function 'asaas-sync' (idempotente).
 */
export async function asaasSyncAll() {
  const { data, error } = await supabase.functions.invoke('asaas-sync', { body: {} });
  if (error) {
    let message = error.message || 'Erro ao sincronizar com o Asaas.';
    try {
      const ctx = (error as any).context;
      if (ctx && typeof ctx.json === 'function') {
        const j = await ctx.json();
        if (j?.error) message = j.error;
      }
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  if (data && data.success === false) throw new Error(data.error || 'Erro Asaas.');
  return data as { customers_new: number; customers_linked: number; payments: number; subscriptions: number };
}

export const asaasCreateCharge = (params: CreateChargeParams) =>
  invoke('create_charge', params);

export const asaasCreateSubscription = (params: CreateSubscriptionParams) =>
  invoke('create_subscription', params);

export const asaasUpdateCharge = (params: {
  recordId: string; paymentId?: string; value?: number; dueDate?: string;
  description?: string; billingType?: string; productId?: string | null;
  splitRevenue?: { product_id: string; amount: number }[] | null;
  productManual?: boolean;
}) => invoke('update_charge', params);

export const asaasDeleteCharge = (params: { recordId: string; paymentId?: string }) =>
  invoke('delete_charge', params);

export const asaasUpdateSubscription = (params: {
  rowId: string; subscriptionId?: string; value?: number; nextDueDate?: string;
  cycle?: string; description?: string; billingType?: string; productId?: string | null;
  splitProducts?: { product_id: string; pct: number }[] | null;
  productManual?: boolean;
}) => invoke('update_subscription', params);

/**
 * Envia um PIX a partir de um lançamento de despesa, usando a chave já
 * cadastrada nele. A transferência ainda passa pela validação de saque do
 * Asaas antes do dinheiro sair — ver a função asaas-transfer-approval.
 */
export interface TransferParams {
  recordId: string;
  /** PIX_KEY (padrão) | PIX_QR | TED */
  method?: 'PIX_KEY' | 'PIX_QR' | 'TED';
  scheduleDate?: string;
  description?: string;
  /** PIX_KEY: chave do favorecido (cai na do lançamento quando omitida). */
  pixKey?: string;
  pixKeyType?: string;
  /** PIX_QR: o copia-e-cola. */
  payload?: string;
  /** TED: conta do favorecido. */
  bankAccount?: {
    bankCode: string; agency: string; account: string; accountDigit?: string;
    ownerName: string; cpfCnpj: string; bankAccountType?: string;
  };
}

/** Com aprovação ligada, o pagamento para aqui e não vai ao Asaas ainda. */
export interface PaymentResult {
  transfer?: { id: string; status: string; value: number };
  bill?: { id: string; status: string; value: number };
  intentId?: string;
  pendingApproval?: boolean;
}

export const asaasCreateTransfer = (params: TransferParams) =>
  invoke('create_transfer', params) as Promise<PaymentResult>;

/** Aprova um pedido parado — é aqui que o dinheiro começa a sair. */
export const asaasApprovePayment = (intentId: string) =>
  invoke('approve_payment', { intentId }) as Promise<{ approved: boolean; method: string; payment: any }>;

export const asaasRejectPayment = (intentId: string, reason?: string) =>
  invoke('reject_payment', { intentId, reason }) as Promise<{ rejected: boolean }>;

export const asaasDeleteSubscription = (params: { rowId: string; subscriptionId?: string }) =>
  invoke('delete_subscription', params);

/**
 * Paga um boleto/tributo pela conta Asaas a partir da linha digitável.
 * O saldo sai do Asaas; a baixa do lançamento vem pelo sync/webhook.
 */
export const asaasPayBill = (params: {
  recordId: string;
  identificationField: string;
  scheduleDate?: string;
  description?: string;
  value?: number;
  dueDate?: string;
}) => invoke('pay_bill', params) as Promise<PaymentResult & {
  bill?: { id: string; status: string; value: number; dueDate?: string; scheduleDate?: string; companyName?: string };
}>;

/** Impostos da nota — o Asaas exige o objeto inteiro, mesmo zerado. */
export interface InvoiceTaxes {
  retainIss: boolean;
  iss: number;
  cofins: number;
  csll: number;
  inss: number;
  ir: number;
  pis: number;
}

export interface MunicipalService { id: string; description: string; issTax: number | null }

export interface FiscalStatus {
  configured: boolean;
  info: {
    email: string | null;
    municipalInscription: string | null;
    simplesNacional: boolean;
    specialTaxRegime: string | null;
    serviceListItem: string | null;
    certificateSent: boolean;
    accessTokenSent: boolean;
  } | null;
  services: MunicipalService[];
}

export const asaasFiscalStatus = () => invoke('fiscal_status') as Promise<FiscalStatus>;

export const asaasScheduleInvoice = (params: {
  paymentId?: string;
  clientId?: string;
  serviceDescription: string;
  observations?: string;
  value: number;
  deductions?: number;
  effectiveDate: string;
  municipalServiceId?: string;
  municipalServiceCode?: string;
  taxes: InvoiceTaxes;
  updatePayment?: boolean;
}) => invoke('schedule_invoice', params);

/** Quando a nota sai, dentro do ciclo da assinatura. */
export type InvoicePeriod =
  | 'ON_PAYMENT_CONFIRMATION' | 'ON_PAYMENT_DUE_DATE' | 'BEFORE_PAYMENT_DUE_DATE'
  | 'ON_DUE_DATE_MONTH' | 'ON_NEXT_MONTH';

export interface SubscriptionInvoiceSettings {
  municipalServiceId?: string;
  municipalServiceCode?: string;
  municipalServiceName?: string;
  updatePayment?: boolean;
  deductions?: number;
  effectiveDatePeriod: InvoicePeriod;
  receivedOnly?: boolean;
  daysBeforeDueDate?: number;
  observations?: string;
  taxes: InvoiceTaxes;
}

export const asaasSubscriptionInvoiceSettings = (params: {
  subscriptionId: string;
  settings?: SubscriptionInvoiceSettings;
  remove?: boolean;
}) => invoke('subscription_invoice_settings', params) as Promise<{ settings: any }>;

/**
 * Notificação no Asaas é por cliente e por evento, nunca por cobrança.
 * scheduleOffset só vale para o aviso de vencimento (dias de antecedência).
 */
export interface CustomerNotification {
  id: string;
  event: string;
  enabled: boolean;
  emailEnabledForProvider: boolean;
  smsEnabledForProvider: boolean;
  emailEnabledForCustomer: boolean;
  smsEnabledForCustomer: boolean;
  phoneCallEnabledForCustomer: boolean;
  whatsappEnabledForCustomer: boolean;
  scheduleOffset: number;
}

export interface CustomerNotificationSettings {
  linked: boolean;
  notificationDisabled: boolean;
  notifications: CustomerNotification[];
}

export const asaasCustomerNotifications = (clientId: string) =>
  invoke('customer_notifications', { clientId }) as Promise<CustomerNotificationSettings>;

export const asaasUpdateCustomerNotifications = (params: {
  clientId: string;
  notificationDisabled?: boolean;
  notifications?: CustomerNotification[];
}) => invoke('update_customer_notifications', params);

/** Formas de mandar a cobrança na mão — o que o Asaas devolve por cobrança. */
export interface ChargeShareInfo {
  status: string | null;
  value: number | null;
  dueDate: string | null;
  billingType: string | null;
  invoiceUrl: string | null;
  bankSlipUrl: string | null;
  identificationField: string | null;
  barCode: string | null;
  pixPayload: string | null;
  /** PNG do QR Code em base64 (sem o prefixo data:). */
  pixQrCode: string | null;
}

export const asaasPaymentShareInfo = async (paymentId: string): Promise<ChargeShareInfo> => {
  const data = await invoke('payment_share_info', { paymentId });
  return data.info as ChargeShareInfo;
};

export interface AsaasContact { id: string; name: string; phone: string | null; email: string | null }

/** Telefone/e-mail dos clientes, direto do Asaas (para cobrança via WhatsApp) */
export const asaasCustomerContacts = async (): Promise<AsaasContact[]> => {
  const data = await invoke('customer_contacts');
  return (data?.contacts || []) as AsaasContact[];
};
