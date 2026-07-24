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
}

export const asaasSyncCustomer = (clientId: string) =>
  invoke('sync_customer', { clientId });

export const asaasCreateCharge = (params: CreateChargeParams) =>
  invoke('create_charge', params);

export const asaasCreateSubscription = (params: CreateSubscriptionParams) =>
  invoke('create_subscription', params);
