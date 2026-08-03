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

export interface CreateChargeParams {
  clientId: string;
  value: number;
  dueDate: string;         // YYYY-MM-DD
  description?: string;
  billingType?: string;    // UNDEFINED | BOLETO | PIX | CREDIT_CARD
  revenueTypeId?: string;
  productId?: string;
}

export interface CreateSubscriptionParams {
  clientId: string;
  value: number;
  nextDueDate: string;     // YYYY-MM-DD
  cycle?: string;          // MONTHLY | WEEKLY | YEARLY...
  description?: string;
  billingType?: string;
  productId?: string;
  /** Rateio em % quando a assinatura vende mais de um produto. */
  splitProducts?: { product_id: string; pct: number }[];
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
export const asaasCreateTransfer = (params: { recordId: string }) =>
  invoke('create_transfer', params) as Promise<{ transfer: { id: string; status: string; value: number }; intentId: string }>;

export const asaasDeleteSubscription = (params: { rowId: string; subscriptionId?: string }) =>
  invoke('delete_subscription', params);

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
