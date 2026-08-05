// Supabase Edge Function: asaas-proxy
// Proxy seguro para a API do Asaas. Mantém a ASAAS_API_KEY fora do frontend.
// O frontend chama via supabase.functions.invoke('asaas-proxy', { body: { action, ... } })
// com o JWT do usuário — o tenant é respeitado via RLS.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ASAAS_BASE_URL = Deno.env.get('ASAAS_BASE_URL') || 'https://api.asaas.com/v3';
const ASAAS_API_KEY = Deno.env.get('ASAAS_API_KEY') || '';
// Asaas é exclusivo de um único tenant (conta única). Bloqueia qualquer outro.
const ASAAS_TENANT_ID = Deno.env.get('ASAAS_TENANT_ID') || '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function asaas(path: string, method: string, body?: unknown) {
  const res = await fetch(`${ASAAS_BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'access_token': ASAAS_API_KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.errors?.[0]?.description || `Erro Asaas (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

const digits = (v: unknown) => String(v || '').replace(/\D/g, '');

/** CPF/CNPJ com a máscara — o documento só é guardado formatado aqui. */
function formatDoc(d: string) {
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return d;
}

// Aplica um rateio percentual sobre o valor da cobrança. O resto do
// arredondamento vai para a maior fatia, para o rateio fechar exatamente com o
// valor cobrado. Mesma regra do asaas-sync.
function applySplit(
  splits: { product_id: string; pct: number }[],
  amount: number,
): { product_id: string; amount: number }[] {
  const valid = (splits || []).filter((s) => s?.product_id && Number(s.pct) > 0);
  if (!valid.length) return [];
  const parts = valid.map((s) => ({
    product_id: s.product_id,
    amount: Math.round(amount * Number(s.pct)) / 100,
  }));
  const diff = Math.round((amount - parts.reduce((t, p) => t + p.amount, 0)) * 100) / 100;
  if (diff !== 0) {
    let big = 0;
    parts.forEach((p, i) => { if (p.amount > parts[big].amount) big = i; });
    parts[big].amount = Math.round((parts[big].amount + diff) * 100) / 100;
  }
  return parts;
}

/**
 * Multa, juros e desconto — as condições que o Asaas aplica sozinho na cobrança.
 * Só entram no payload quando têm valor: mandar zero configura "sem multa"
 * explicitamente e sobrescreve o padrão da conta.
 */
function chargeTerms(p: Record<string, any>) {
  const terms: Record<string, unknown> = {};
  if (Number(p.fineValue) > 0) {
    terms.fine = { value: Number(p.fineValue), type: p.fineType || 'PERCENTAGE' };
  }
  if (Number(p.interestValue) > 0) {
    terms.interest = { value: Number(p.interestValue) };
  }
  if (Number(p.discountValue) > 0) {
    terms.discount = {
      value: Number(p.discountValue),
      dueDateLimitDays: Math.max(0, Math.floor(Number(p.discountDeadline) || 0)),
      type: p.discountType || 'PERCENTAGE',
    };
  }
  return terms;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!ASAAS_API_KEY) throw new Error('ASAAS_API_KEY não configurada nas secrets da função.');

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Não autorizado.');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) throw new Error('Sessão inválida.');

    // Guard: Asaas habilitado só para o tenant configurado.
    const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single();
    if (ASAAS_TENANT_ID && profile?.tenant_id !== ASAAS_TENANT_ID) {
      throw new Error('Asaas não está habilitado para esta empresa.');
    }

    const { action, ...params } = await req.json();

    // Garante que o cliente exista como customer no Asaas (cria se necessário).
    async function ensureCustomer(clientId: string) {
      const { data: client, error } = await supabase.from('clients').select('*').eq('id', clientId).single();
      if (error || !client) throw new Error('Cliente não encontrado.');
      if (client.asaas_customer_id) return { client, customerId: client.asaas_customer_id as string };

      const cpfCnpj = (client.cnpj || '').replace(/\D/g, '');
      if (!cpfCnpj) throw new Error('Cliente sem CNPJ/CPF — obrigatório para o Asaas.');

      const created = await asaas('/customers', 'POST', {
        name: client.name,
        cpfCnpj,
      });
      await supabase.from('clients').update({ asaas_customer_id: created.id }).eq('id', clientId);
      return { client, customerId: created.id as string };
    }

    let result: Record<string, unknown>;

    switch (action) {
      case 'create_client': {
        // Cadastro de cliente feito de dentro da cobrança: grava aqui e no Asaas
        // na mesma ação, para não ter que passar pela tela de Clientes antes.
        const name = String(params.name || '').trim();
        const cpfCnpj = digits(params.cnpj);
        const email = String(params.email || '').trim();
        const phone = digits(params.phone);

        if (!name) throw new Error('Informe o nome do cliente.');
        if (cpfCnpj.length !== 11 && cpfCnpj.length !== 14) {
          throw new Error('CNPJ/CPF inválido — informe 11 dígitos (CPF) ou 14 (CNPJ).');
        }

        // Mesmo documento já cadastrado por aqui: não abre um segundo cliente.
        const { data: existing } = await supabase.from('clients').select('id, name, cnpj');
        const dup = (existing || []).find((c) => digits(c.cnpj) === cpfCnpj);
        if (dup) throw new Error(`Já existe um cliente com este CNPJ/CPF: ${dup.name}.`);

        // Se o documento já é customer no Asaas, vincula em vez de duplicar lá.
        const found = await asaas(`/customers?cpfCnpj=${cpfCnpj}`, 'GET');
        const remote = found?.data?.[0];
        const customer = remote || await asaas('/customers', 'POST', {
          name,
          cpfCnpj,
          email: email || undefined,
          mobilePhone: phone || undefined,
        });

        // tenant_id vem do trigger set_record_tenant_id, igual ao cadastro em Clientes.
        const row = {
          id: `c${Date.now()}`,
          name,
          cnpj: formatDoc(cpfCnpj),
          segment: String(params.segment || ''),
          status: 'Active',
          location: '',
          notes: [],
          asaas_customer_id: customer.id,
        };
        const { data: client, error: insErr } = await supabase
          .from('clients').insert(row).select().single();
        if (insErr) throw new Error('Cliente criado no Asaas, mas falhou ao gravar aqui: ' + insErr.message);

        result = { client, linked: !!remote };
        break;
      }

      case 'sync_customer': {
        const { customerId } = await ensureCustomer(params.clientId);
        result = { customerId };
        break;
      }

      case 'create_charge': {
        const { client, customerId } = await ensureCustomer(params.clientId);
        const installments = Math.max(1, Math.floor(Number(params.installmentCount) || 1));
        const value = Number(params.value);

        const payload: Record<string, unknown> = {
          customer: customerId,
          billingType: params.billingType || 'UNDEFINED',
          dueDate: params.dueDate,
          description: params.description || '',
          externalReference: params.clientId,
          ...chargeTerms(params),
        };
        // Parcelado: o Asaas recebe o total e o número de parcelas, e divide.
        if (installments > 1) {
          payload.installmentCount = installments;
          payload.totalValue = value;
        } else {
          payload.value = value;
        }

        const payment = await asaas('/payments', 'POST', payload);

        // Parcelamento gera N cobranças lá; o financeiro precisa das N, senão o
        // previsto fica só com a primeira parcela.
        let charges: any[] = [payment];
        if (installments > 1 && payment.installment) {
          const list = await asaas(`/payments?installment=${payment.installment}&limit=100`, 'GET');
          if (list?.data?.length) {
            charges = list.data.sort((a: any, b: any) => String(a.dueDate).localeCompare(String(b.dueDate)));
          }
        }

        const baseDescription = params.description || `Cobrança — ${client.name}`;
        const stamp = Date.now();
        const seriesId = installments > 1 ? `i${stamp}` : null;
        const records = charges.map((p: any, i: number) => ({
          id: `f${stamp}-${i}`,
          tenant_id: client.tenant_id,
          description: installments > 1 ? `${baseDescription} (${i + 1}/${charges.length})` : baseDescription,
          amount: Number(p.value),
          type: 'Receita',
          status: 'Pendente',
          dueDate: p.dueDate,
          competenceDate: p.dueDate,
          category: 'Cobrança Asaas',
          companyId: params.clientId,
          revenueTypeId: params.revenueTypeId || null,
          product_id: params.productId || null,
          seriesId,
          asaas_payment_id: p.id,
          asaas_invoice_url: p.invoiceUrl,
        }));
        const { error: insErr } = await supabase.from('financial_records').insert(records);
        if (insErr) throw new Error('Cobrança criada no Asaas, mas falhou ao gravar o lançamento: ' + insErr.message);

        result = { payment, record: records[0], records };
        break;
      }

      case 'create_subscription': {
        const { client, customerId } = await ensureCustomer(params.clientId);
        const asaasBody: Record<string, unknown> = {
          customer: customerId,
          billingType: params.billingType || 'UNDEFINED',
          value: Number(params.value),
          nextDueDate: params.nextDueDate,
          cycle: params.cycle || 'MONTHLY',
          description: params.description || '',
          ...chargeTerms(params),
        };
        if (params.endDate) asaasBody.endDate = params.endDate;
        const sub = await asaas('/subscriptions', 'POST', asaasBody);

        const row: Record<string, unknown> = {
          id: `s${Date.now()}`,
          tenant_id: client.tenant_id,
          client_id: params.clientId,
          product_id: params.productId || null,
          split_products: (params.splitProducts as any[])?.length ? params.splitProducts : null,
          product_manual: !!params.productId || !!(params.splitProducts as any[])?.length,
          asaas_id: sub.id,
          description: params.description || '',
          value: Number(params.value),
          cycle: params.cycle || 'MONTHLY',
          billing_type: params.billingType || 'UNDEFINED',
          next_due_date: params.nextDueDate,
          status: 'ACTIVE',
        };
        if (params.endDate) row.end_date = params.endDate;
        if (params.maxPayments) row.max_payments = Number(params.maxPayments);
        const { error: insErr } = await supabase.from('subscriptions').insert(row);
        if (insErr) throw new Error('Assinatura criada no Asaas, mas falhou ao gravar: ' + insErr.message);

        result = { subscription: sub, row };
        break;
      }

      case 'customer_contacts': {
        // Lista telefone/e-mail dos clientes direto do Asaas (não guardamos no banco)
        const all: any[] = [];
        let offset = 0;
        while (true) {
          const page = await asaas(`/customers?limit=100&offset=${offset}`, 'GET');
          all.push(...(page.data || []));
          if (!page.hasMore) break;
          offset += 100;
          if (offset > 10000) break;
        }
        result = {
          contacts: all.map((c: any) => ({
            id: c.id,
            name: c.name,
            phone: c.mobilePhone || c.phone || null,
            email: c.email || null,
          })),
        };
        break;
      }

      case 'fiscal_status': {
        // A emissão depende da configuração fiscal municipal feita na conta
        // Asaas (certificado/credenciais da prefeitura). Sem ela, nada emite —
        // então a tela pergunta antes de oferecer.
        const optional = async (path: string) => {
          try { return await asaas(path, 'GET'); } catch { return null; }
        };
        const [info, services] = await Promise.all([
          optional('/fiscalInfo'),
          optional('/fiscalInfo/services?limit=100'),
        ]);
        result = {
          configured: !!(info && (info.municipalInscription || info.serviceListItem || info.certificateSent || info.accessTokenSent)),
          info: info
            ? {
                email: info.email || null,
                municipalInscription: info.municipalInscription || null,
                simplesNacional: !!info.simplesNacional,
                specialTaxRegime: info.specialTaxRegime || null,
                serviceListItem: info.serviceListItem || null,
                certificateSent: !!info.certificateSent,
                accessTokenSent: !!info.accessTokenSent,
              }
            : null,
          services: (services?.data || []).map((s: any) => ({
            id: s.id, description: s.description, issTax: s.issTax ?? null,
          })),
        };
        break;
      }

      case 'schedule_invoice': {
        // Nota avulsa: amarrada a uma cobrança quando existe, senão ao cliente.
        const payload: Record<string, unknown> = {
          serviceDescription: params.serviceDescription || '',
          observations: params.observations || '',
          value: Number(params.value),
          deductions: Number(params.deductions) || 0,
          effectiveDate: params.effectiveDate,
          taxes: params.taxes,
        };
        if (params.paymentId) payload.payment = params.paymentId;
        else if (params.clientId) {
          const { customerId } = await ensureCustomer(params.clientId);
          payload.customer = customerId;
        } else {
          throw new Error('Informe a cobrança ou o cliente da nota.');
        }
        if (params.municipalServiceId) payload.municipalServiceId = params.municipalServiceId;
        else if (params.municipalServiceCode) payload.municipalServiceCode = params.municipalServiceCode;
        else throw new Error('Informe o serviço municipal da nota.');
        if (params.updatePayment !== undefined) payload.updatePayment = !!params.updatePayment;

        result = { invoice: await asaas('/invoices', 'POST', payload) };
        break;
      }

      case 'subscription_invoice_settings': {
        // Configuração de NF automática: vale para toda cobrança que a
        // assinatura gerar daqui pra frente.
        const subId = String(params.subscriptionId || '');
        if (!subId) throw new Error('Assinatura sem vínculo no Asaas.');

        if (params.remove) {
          await asaas(`/subscriptions/${subId}/invoiceSettings`, 'DELETE');
          result = { settings: null };
        } else if (params.settings) {
          result = { settings: await asaas(`/subscriptions/${subId}/invoiceSettings`, 'POST', params.settings) };
        } else {
          // Sem configuração, o Asaas responde erro — aqui isso é só "não tem".
          let current: any = null;
          try { current = await asaas(`/subscriptions/${subId}/invoiceSettings`, 'GET'); } catch { current = null; }
          result = { settings: current };
        }
        break;
      }

      case 'customer_notifications': {
        // Notificação no Asaas é por cliente, não por cobrança — é aqui que se
        // escolhe e-mail, SMS, WhatsApp ou ligação, evento a evento.
        const { data: client } = await supabase.from('clients')
          .select('id, asaas_customer_id').eq('id', params.clientId).single();
        if (!client) throw new Error('Cliente não encontrado.');
        if (!client.asaas_customer_id) {
          // Não força a criação no Asaas só para ler configuração.
          result = { linked: false, notificationDisabled: false, notifications: [] };
          break;
        }
        const [customer, list] = await Promise.all([
          asaas(`/customers/${client.asaas_customer_id}`, 'GET'),
          asaas(`/customers/${client.asaas_customer_id}/notifications`, 'GET'),
        ]);
        result = {
          linked: true,
          notificationDisabled: !!customer.notificationDisabled,
          notifications: (list.data || []).map((n: any) => ({
            id: n.id,
            event: n.event,
            enabled: !!n.enabled,
            emailEnabledForProvider: !!n.emailEnabledForProvider,
            smsEnabledForProvider: !!n.smsEnabledForProvider,
            emailEnabledForCustomer: !!n.emailEnabledForCustomer,
            smsEnabledForCustomer: !!n.smsEnabledForCustomer,
            phoneCallEnabledForCustomer: !!n.phoneCallEnabledForCustomer,
            whatsappEnabledForCustomer: !!n.whatsappEnabledForCustomer,
            scheduleOffset: n.scheduleOffset ?? 0,
          })),
        };
        break;
      }

      case 'update_customer_notifications': {
        const { data: client } = await supabase.from('clients')
          .select('id, asaas_customer_id').eq('id', params.clientId).single();
        if (!client?.asaas_customer_id) throw new Error('Cliente ainda não está no Asaas.');

        if (params.notificationDisabled !== undefined) {
          await asaas(`/customers/${client.asaas_customer_id}`, 'PUT', {
            notificationDisabled: !!params.notificationDisabled,
          });
        }
        const list = (params.notifications as any[]) || [];
        if (list.length) {
          await asaas('/notifications/batch', 'PUT', {
            customer: client.asaas_customer_id,
            notifications: list,
          });
        }
        result = { updated: true };
        break;
      }

      case 'payment_share_info': {
        // Tudo que dá para mandar na mão para o cliente: link da fatura, PDF do
        // boleto, linha digitável e PIX copia-e-cola.
        // Cada parte é opcional de propósito — cobrança só de cartão não tem
        // boleto, cobrança já paga não tem mais QR de PIX — e a falta de uma não
        // pode derrubar as outras.
        const paymentId = String(params.paymentId || '');
        if (!paymentId) throw new Error('Cobrança sem vínculo no Asaas.');

        const payment = await asaas(`/payments/${paymentId}`, 'GET');
        const optional = async (path: string) => {
          try { return await asaas(path, 'GET'); } catch { return null; }
        };
        const [slip, pix] = await Promise.all([
          optional(`/payments/${paymentId}/identificationField`),
          optional(`/payments/${paymentId}/pixQrCode`),
        ]);

        result = {
          info: {
            status: payment.status || null,
            value: payment.value ?? null,
            dueDate: payment.dueDate || null,
            billingType: payment.billingType || null,
            invoiceUrl: payment.invoiceUrl || null,
            bankSlipUrl: payment.bankSlipUrl || null,
            identificationField: slip?.identificationField || null,
            barCode: slip?.barCode || null,
            pixPayload: pix?.payload || null,
            pixQrCode: pix?.encodedImage || null,
          },
        };
        break;
      }

      case 'update_charge': {
        // params: paymentId, recordId, value?, dueDate?, description?, billingType?, productId?
        const asaasPayload: Record<string, unknown> = {};
        if (params.value != null) asaasPayload.value = Number(params.value);
        if (params.dueDate) asaasPayload.dueDate = params.dueDate;
        if (params.description != null) asaasPayload.description = params.description;
        if (params.billingType) asaasPayload.billingType = params.billingType;

        let payment: any = null;
        if (Object.keys(asaasPayload).length && params.paymentId) {
          payment = await asaas(`/payments/${params.paymentId}`, 'PUT', asaasPayload);
        }

        const localUpdate: Record<string, unknown> = {};
        if (params.value != null) localUpdate.amount = Number(params.value);
        if (params.dueDate) { localUpdate.dueDate = params.dueDate; localUpdate.competenceDate = params.dueDate; }
        if (params.description != null) localUpdate.description = params.description;
        if (params.productId !== undefined) localUpdate.product_id = params.productId || null;
        // Rateio entre produtos + trava para o sync não desfazer a classificação.
        if (params.splitRevenue !== undefined) {
          localUpdate.split_revenue = (params.splitRevenue as any[])?.length ? params.splitRevenue : null;
        }
        if (params.productManual !== undefined) localUpdate.product_manual = !!params.productManual;

        if (Object.keys(localUpdate).length) {
          const { error } = await supabase.from('financial_records').update(localUpdate).eq('id', params.recordId);
          if (error) throw new Error('Falha ao atualizar o lançamento: ' + error.message);
        }
        result = { payment };
        break;
      }

      case 'delete_charge': {
        if (params.paymentId) await asaas(`/payments/${params.paymentId}`, 'DELETE');
        const { error } = await supabase.from('financial_records').delete().eq('id', params.recordId);
        if (error) throw new Error('Cobrança removida no Asaas, mas falhou ao remover o lançamento: ' + error.message);
        result = { deleted: true };
        break;
      }

      case 'update_subscription': {
        // params: subscriptionId, rowId, value?, nextDueDate?, cycle?, description?, billingType?, productId?, endDate?, maxPayments?
        const asaasPayload: Record<string, unknown> = {};
        if (params.value != null) asaasPayload.value = Number(params.value);
        if (params.nextDueDate) asaasPayload.nextDueDate = params.nextDueDate;
        if (params.cycle) asaasPayload.cycle = params.cycle;
        if (params.description != null) asaasPayload.description = params.description;
        if (params.billingType) asaasPayload.billingType = params.billingType;
        if (params.endDate !== undefined) asaasPayload.endDate = params.endDate || null;

        let subscription: any = null;
        if (Object.keys(asaasPayload).length && params.subscriptionId) {
          subscription = await asaas(`/subscriptions/${params.subscriptionId}`, 'PUT', asaasPayload);
        }

        const localUpdate: Record<string, unknown> = {};
        if (params.value != null) localUpdate.value = Number(params.value);
        if (params.nextDueDate) localUpdate.next_due_date = params.nextDueDate;
        if (params.cycle) localUpdate.cycle = params.cycle;
        if (params.description != null) localUpdate.description = params.description;
        if (params.billingType) localUpdate.billing_type = params.billingType;
        if (params.endDate !== undefined) localUpdate.end_date = params.endDate || null;
        if (params.maxPayments !== undefined) localUpdate.max_payments = params.maxPayments || null;
        if (params.productId !== undefined) localUpdate.product_id = params.productId || null;
        const splitProducts = (params.splitProducts as { product_id: string; pct: number }[] | null | undefined);
        if (splitProducts !== undefined) {
          localUpdate.split_products = splitProducts?.length ? splitProducts : null;
        }
        if (params.productManual !== undefined) localUpdate.product_manual = !!params.productManual;

        if (Object.keys(localUpdate).length) {
          const { error } = await supabase.from('subscriptions').update(localUpdate).eq('id', params.rowId);
          if (error) throw new Error('Falha ao atualizar a assinatura: ' + error.message);
        }

        // Propaga o rateio para as cobranças desta assinatura já na hora, em vez
        // de esperar o sync da próxima hora. Cobranças com produto definido na
        // mão ficam de fora — lá o usuário já decidiu.
        let chargesUpdated = 0;
        if (splitProducts !== undefined && params.subscriptionId) {
          const { data: charges } = await supabase.from('financial_records')
            .select('id, amount')
            .eq('asaas_subscription_id', params.subscriptionId)
            .eq('product_manual', false);
          for (const c of charges || []) {
            const parts = applySplit(splitProducts || [], Number(c.amount) || 0);
            const dominant = parts.length
              ? parts.reduce((a, b) => (b.amount > a.amount ? b : a), parts[0]).product_id
              : (params.productId || null);
            const { error } = await supabase.from('financial_records')
              .update({ split_revenue: parts.length ? parts : null, product_id: dominant })
              .eq('id', c.id);
            if (!error) chargesUpdated++;
          }
        }
        result = { subscription, chargesUpdated };
        break;
      }

      case 'create_transfer': {
        // Pagamento por PIX a partir de um lançamento de despesa.
        // A intenção é gravada ANTES de chamar o Asaas: a validação de saque
        // chega ~5s depois da criação e precisa ter contra o que conferir.
        const { data: rec, error: recErr } = await supabase
          .from('financial_records').select('*').eq('id', params.recordId).single();
        if (recErr || !rec) throw new Error('Lançamento não encontrado.');
        if (rec.type !== 'Despesa') throw new Error('Só é possível pagar lançamentos de despesa.');
        if (rec.status === 'Pago') throw new Error('Este lançamento já está pago.');
        if (rec.asaas_transfer_id) throw new Error('Já existe uma transferência para este lançamento.');

        const acc = rec.payment_account || {};
        if (acc.type !== 'PIX' || !acc.pixKey) {
          throw new Error('Cadastre uma chave PIX no lançamento antes de pagar.');
        }
        const value = Math.abs(Number(rec.amount) || 0);
        if (!value) throw new Error('Valor do lançamento inválido.');

        const intentId = `pi_${crypto.randomUUID()}`;
        const { error: intErr } = await supabase.from('payment_intents').insert({
          id: intentId,
          tenant_id: rec.tenant_id,
          record_id: rec.id,
          value,
          pix_key: acc.pixKey,
          pix_key_type: acc.pixKeyType || null,
          holder: acc.holder || null,
          description: rec.description || null,
          status: 'AWAITING_APPROVAL',
        });
        if (intErr) throw new Error('Falha ao registrar a intenção de pagamento: ' + intErr.message);

        let transfer: any;
        try {
          transfer = await asaas('/transfers', 'POST', {
            value,
            pixAddressKey: acc.pixKey,
            pixAddressKeyType: acc.pixKeyType || undefined,
            description: (rec.description || 'Pagamento').slice(0, 120),
            externalReference: intentId,
          });
        } catch (e) {
          // Sem transferência criada a intenção não pode ficar viva: ela é o que
          // autoriza um saque na validação.
          await supabase.from('payment_intents')
            .update({ status: 'FAILED', refuse_reason: String((e as Error)?.message || e), decided_at: new Date().toISOString() })
            .eq('id', intentId);
          throw e;
        }

        await supabase.from('payment_intents')
          .update({ asaas_transfer_id: transfer.id }).eq('id', intentId);
        await supabase.from('financial_records')
          .update({ asaas_transfer_id: transfer.id }).eq('id', rec.id);

        result = { transfer, intentId };
        break;
      }

      case 'delete_subscription': {
        if (params.subscriptionId) await asaas(`/subscriptions/${params.subscriptionId}`, 'DELETE');
        const { error } = await supabase.from('subscriptions').delete().eq('id', params.rowId);
        if (error) throw new Error('Assinatura removida no Asaas, mas falhou ao remover: ' + error.message);
        result = { deleted: true };
        break;
      }

      default:
        throw new Error('Ação inválida: ' + action);
    }

    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: String((e as Error)?.message || e) }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
