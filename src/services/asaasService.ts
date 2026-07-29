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

export const asaasDeleteSubscription = (params: { rowId: string; subscriptionId?: string }) =>
  invoke('delete_subscription', params);

export interface AsaasContact { id: string; name: string; phone: string | null; email: string | null }

/** Telefone/e-mail dos clientes, direto do Asaas (para cobrança via WhatsApp) */
export const asaasCustomerContacts = async (): Promise<AsaasContact[]> => {
  const data = await invoke('customer_contacts');
  return (data?.contacts || []) as AsaasContact[];
};
