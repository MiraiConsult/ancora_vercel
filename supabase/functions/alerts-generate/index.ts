// Supabase Edge Function: alerts-generate
// Gera alertas automáticos (digest diário) a partir dos lançamentos financeiros.
// Roda por cron (header x-sync-secret) ou sob demanda pelo app (JWT do usuário).
// Idempotente: o id do alerta é determinístico (tipo + tenant + dia), então
// rodar várias vezes no mesmo dia não duplica.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SYNC_SECRET = Deno.env.get('ASAAS_SYNC_SECRET') || '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const brl = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Math.abs(v) || 0);

const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ---- Autorização: cron (secret) ou usuário logado (JWT) ----
    const secret = req.headers.get('x-sync-secret');
    const authHeader = req.headers.get('Authorization');
    let onlyTenant: string | null = null;

    if (SYNC_SECRET && secret && secret === SYNC_SECRET) {
      // cron: gera para todos os tenants
    } else if (authHeader) {
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) throw new Error('Sessão inválida.');
      const { data: profile } = await admin.from('profiles').select('tenant_id').eq('id', user.id).single();
      if (!profile?.tenant_id) throw new Error('Tenant não encontrado.');
      onlyTenant = profile.tenant_id;
    } else {
      throw new Error('Não autorizado.');
    }

    const today = new Date().toISOString().slice(0, 10);
    const in3 = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);

    // Busca apenas lançamentos em aberto (o volume relevante)
    let q = admin.from('financial_records')
      .select('id, tenant_id, description, amount, status, dueDate, companyId, needsValidation')
      .neq('status', 'Pago');
    if (onlyTenant) q = q.eq('tenant_id', onlyTenant);

    const { data: records, error } = await q;
    if (error) throw new Error('Erro ao ler lançamentos: ' + error.message);

    // Agrupa por tenant
    const byTenant = new Map<string, any[]>();
    (records || []).forEach(r => {
      if (!r.tenant_id || r.needsValidation) return;
      if (!byTenant.has(r.tenant_id)) byTenant.set(r.tenant_id, []);
      byTenant.get(r.tenant_id)!.push(r);
    });

    const alerts: any[] = [];
    const push = (tenant: string, key: string, title: string, message: string, type: string) => {
      alerts.push({
        id: `auto-${tenant}-${key}-${today}`,
        tenant_id: tenant,
        title,
        message,
        type,
        entityType: 'Finance',
        createdAt: new Date().toISOString(),
        read: false,
      });
    };

    for (const [tenant, list] of byTenant) {
      const payables = list.filter(r => Number(r.amount) < 0 && r.dueDate);
      const receivables = list.filter(r => Number(r.amount) >= 0 && r.dueDate);

      const sum = (l: any[]) => l.reduce((s, r) => s + Math.abs(Number(r.amount) || 0), 0);

      // 1) Contas a pagar vencidas
      const payOverdue = payables.filter(r => r.dueDate < today);
      if (payOverdue.length) {
        push(tenant, 'pay-overdue',
          `${plural(payOverdue.length, 'conta vencida', 'contas vencidas')} a pagar`,
          `Você tem ${plural(payOverdue.length, 'conta em atraso', 'contas em atraso')} somando ${brl(sum(payOverdue))}. Confira em Contas a Pagar.`,
          'Error');
      }

      // 2) Contas a pagar vencendo hoje
      const payToday = payables.filter(r => r.dueDate === today);
      if (payToday.length) {
        push(tenant, 'pay-today',
          `${plural(payToday.length, 'conta vence', 'contas vencem')} hoje`,
          `Total de ${brl(sum(payToday))} a pagar hoje.`,
          'Warning');
      }

      // 3) Contas a pagar nos próximos 3 dias
      const paySoon = payables.filter(r => r.dueDate > today && r.dueDate <= in3);
      if (paySoon.length) {
        push(tenant, 'pay-soon',
          `${plural(paySoon.length, 'conta vence', 'contas vencem')} em até 3 dias`,
          `Programe-se: ${brl(sum(paySoon))} a pagar até ${in3.split('-').reverse().join('/')}.`,
          'Info');
      }

      // 4) Recebimentos em atraso
      const recOverdue = receivables.filter(r => r.dueDate < today);
      if (recOverdue.length) {
        push(tenant, 'rec-overdue',
          `${plural(recOverdue.length, 'cobrança em atraso', 'cobranças em atraso')}`,
          `${brl(sum(recOverdue))} a receber está vencido. Cobre pela Agenda de recebimentos.`,
          'Warning');
      }

      // 5) Recebimentos previstos para hoje
      const recToday = receivables.filter(r => r.dueDate === today);
      if (recToday.length) {
        push(tenant, 'rec-today',
          `${plural(recToday.length, 'recebimento previsto', 'recebimentos previstos')} para hoje`,
          `Previsão de entrada de ${brl(sum(recToday))} hoje.`,
          'Info');
      }
    }

    let inserted = 0;
    if (alerts.length) {
      // ignoreDuplicates garante 1 alerta por tipo/tenant/dia
      const { error: insErr, data } = await admin
        .from('notifications')
        .upsert(alerts, { onConflict: 'id', ignoreDuplicates: true })
        .select('id');
      if (insErr) throw new Error('Erro ao gravar alertas: ' + insErr.message);
      inserted = data?.length || 0;
    }

    return new Response(JSON.stringify({ success: true, tenants: byTenant.size, generated: alerts.length, inserted }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: String((e as Error)?.message || e) }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
