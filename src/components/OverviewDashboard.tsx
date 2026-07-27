import React, { useMemo, useState } from 'react';
import { FinancialRecord, Product, Company, Subscription, User } from '../types';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, BarChart, LineChart,
} from 'recharts';
import {
  TrendingUp, TrendingDown, Wallet, AlertCircle, Repeat,
  Users, Percent, Target, Activity,
} from 'lucide-react';

interface OverviewDashboardProps {
  records: FinancialRecord[];
  products: Product[];
  companies: Company[];
  subscriptions: Subscription[];
  currentUser: User;
}

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const PALETTE = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#06b6d4', '#ec4899', '#ef4444', '#14b8a6', '#a855f7', '#f97316'];

const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const brlShort = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}k`;
  return `R$ ${v.toFixed(0)}`;
};
const pct = (v: number) => `${v.toFixed(1)}%`;

const monthlyFactor = (cycle?: string) => {
  switch (cycle) {
    case 'WEEKLY': return 4.333;
    case 'BIWEEKLY': return 2.166;
    case 'QUARTERLY': return 1 / 3;
    case 'SEMIANNUALLY': return 1 / 6;
    case 'YEARLY': return 1 / 12;
    default: return 1;
  }
};

export const OverviewDashboard: React.FC<OverviewDashboardProps> = ({ records, products, companies, subscriptions }) => {
  const productName = (id?: string | null) => products.find(p => p.id === id)?.name || null;
  const companyName = (id?: string) => companies.find(c => c.id === id)?.name || 'Sem cliente';

  const validRecords = useMemo(() => records.filter(r => !r.needsValidation), [records]);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    validRecords.forEach(r => { const y = (r.dueDate || '').slice(0, 4); if (y) years.add(parseInt(y)); });
    const arr = Array.from(years).filter(Boolean).sort((a, b) => b - a);
    return arr.length ? arr : [new Date().getFullYear()];
  }, [validRecords]);

  const [year, setYear] = useState<number>(availableYears[0]);

  // ---- Assinaturas / recorrência (independe do ano) ----
  const recurring = useMemo(() => {
    const active = subscriptions.filter(s => (s.status || 'ACTIVE') === 'ACTIVE');
    const mrr = active.reduce((sum, s) => sum + (s.value || 0) * monthlyFactor(s.cycle), 0);
    const activeSubscribers = new Set(active.map(s => s.client_id).filter(Boolean)).size;
    // clientes ativos por produto
    const byProduct = new Map<string, Set<string>>();
    active.forEach(s => {
      const pn = productName(s.product_id) || 'Sem produto';
      if (!byProduct.has(pn)) byProduct.set(pn, new Set());
      if (s.client_id) byProduct.get(pn)!.add(s.client_id);
    });
    const activeClientsByProduct = Array.from(byProduct.entries())
      .map(([name, set]) => ({ name, value: set.size })).sort((a, b) => b.value - a.value);
    return { mrr, arr: mrr * 12, activeSubscribers, activeClientsByProduct };
  }, [subscriptions, products]);

  // ---- Churn / novos clientes (a partir do histórico de cobranças) ----
  const clientsByMonth = useMemo(() => {
    const map = new Map<string, Set<string>>();
    validRecords.forEach(r => {
      if (r.amount < 0 || !r.companyId) return;
      const mk = (r.dueDate || '').slice(0, 7);
      if (!mk) return;
      if (!map.has(mk)) map.set(mk, new Set());
      map.get(mk)!.add(r.companyId);
    });
    return map;
  }, [validRecords]);

  const data = useMemo(() => {
    const yearStr = String(year);
    const inYear = validRecords.filter(r => (r.dueDate || '').startsWith(yearStr));
    const isIncome = (r: FinancialRecord) => r.amount >= 0;

    let totalIncome = 0, totalExpense = 0, receivedIncome = 0, pendingIncome = 0, overdueIncome = 0;
    const monthly = MONTHS.map((m, i) => ({ month: m, mi: i + 1, receita: 0, despesa: 0, saldo: 0 }));
    const byProduct = new Map<string, number>();
    const prodMonthly: Record<string, Record<string, number>> = {};
    const statusMap = { Pago: 0, Pendente: 0, Atrasado: 0 } as Record<string, number>;
    const byClient = new Map<string, number>();
    const addProdMonth = (prod: string, mi: number, val: number) => {
      if (!prodMonthly[prod]) prodMonthly[prod] = {};
      prodMonthly[prod][mi] = (prodMonthly[prod][mi] || 0) + val;
    };

    inYear.forEach(r => {
      const mo = parseInt((r.dueDate || '').slice(5, 7)) - 1;
      const amt = r.amount;
      if (isIncome(r)) {
        totalIncome += amt;
        if (mo >= 0) monthly[mo].receita += amt;
        const st = (r.status as string) || 'Pendente';
        if (st === 'Pago') { receivedIncome += amt; statusMap.Pago += amt; }
        else if (st === 'Atrasado') { overdueIncome += amt; statusMap.Atrasado += amt; }
        else { pendingIncome += amt; statusMap.Pendente += amt; }
        if (r.split_revenue && r.split_revenue.length > 0) {
          r.split_revenue.forEach(sp => {
            const pn = productName(sp.product_id) || 'Sem produto';
            byProduct.set(pn, (byProduct.get(pn) || 0) + Math.abs(sp.amount));
            if (mo >= 0) addProdMonth(pn, mo + 1, Math.abs(sp.amount));
          });
        } else {
          const pn = productName(r.product_id) || 'Sem produto';
          byProduct.set(pn, (byProduct.get(pn) || 0) + amt);
          if (mo >= 0) addProdMonth(pn, mo + 1, amt);
        }
        byClient.set(companyName(r.companyId), (byClient.get(companyName(r.companyId)) || 0) + amt);
      } else {
        totalExpense += Math.abs(amt);
        if (mo >= 0) monthly[mo].despesa += Math.abs(amt);
      }
    });
    monthly.forEach(m => { m.saldo = m.receita - m.despesa; });

    const productData = Array.from(byProduct.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    const topProductNames = productData.slice(0, 6).map(p => p.name);
    const prodMonthlyData = monthly.map(m => {
      const entry: Record<string, any> = { month: m.month };
      topProductNames.forEach(pn => { entry[pn] = prodMonthly[pn]?.[m.mi] || 0; });
      return entry;
    });
    const statusData = [
      { name: 'Pago', value: statusMap.Pago, color: '#10b981' },
      { name: 'Pendente', value: statusMap.Pendente, color: '#f59e0b' },
      { name: 'Atrasado', value: statusMap.Atrasado, color: '#ef4444' },
    ].filter(s => s.value > 0);
    const topClients = Array.from(byClient.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 7);

    // Churn & novos clientes por mês (até o mês corrente)
    const now = new Date();
    const nowKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const churnSeries: { month: string; churnPct: number; novos: number; churned: number }[] = [];
    let churnSum = 0, churnCount = 0, newThisYear = 0;
    for (let i = 0; i < 12; i++) {
      const mk = `${year}-${String(i + 1).padStart(2, '0')}`;
      if (mk > nowKey) break;
      const prevDate = new Date(year, i - 1, 1);
      const prevKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
      const prev = clientsByMonth.get(prevKey) || new Set<string>();
      const curr = clientsByMonth.get(mk) || new Set<string>();
      const churned = Array.from(prev).filter(c => !curr.has(c)).length;
      const novos = Array.from(curr).filter(c => !prev.has(c)).length;
      const churnPct = prev.size ? (churned / prev.size) * 100 : 0;
      if (prev.size) { churnSum += churnPct; churnCount++; }
      newThisYear += novos;
      churnSeries.push({ month: MONTHS[i], churnPct, novos, churned });
    }
    const avgChurn = churnCount ? churnSum / churnCount : 0;
    const newLastMonth = churnSeries.length ? churnSeries[churnSeries.length - 1].novos : 0;

    // Aging de recebíveis (pendentes/atrasados, todas as datas)
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const aging = { Vencido: 0, 'A vencer 0-30d': 0, '31-60d': 0, '60d+': 0 } as Record<string, number>;
    validRecords.forEach(r => {
      if (r.amount < 0 || (r.status as string) === 'Pago' || !r.dueDate) return;
      const due = new Date(r.dueDate + 'T00:00:00');
      const diff = Math.floor((due.getTime() - today.getTime()) / 86400000);
      if (diff < 0) aging['Vencido'] += r.amount;
      else if (diff <= 30) aging['A vencer 0-30d'] += r.amount;
      else if (diff <= 60) aging['31-60d'] += r.amount;
      else aging['60d+'] += r.amount;
    });
    const agingData = Object.entries(aging).map(([name, value]) => ({ name, value }));

    const balance = totalIncome - totalExpense;
    const margin = totalIncome > 0 ? (balance / totalIncome) * 100 : 0;
    const overdueRate = totalIncome > 0 ? (overdueIncome / totalIncome) * 100 : 0;

    return {
      totalIncome, totalExpense, balance, margin, receivedIncome, pendingIncome, overdueIncome, overdueRate,
      monthly, productData, topProductNames, prodMonthlyData, statusData, topClients,
      churnSeries, avgChurn, newThisYear, newLastMonth, agingData,
    };
  }, [validRecords, year, products, companies, clientsByMonth]);

  const arpu = recurring.activeSubscribers > 0 ? recurring.mrr / recurring.activeSubscribers : 0;
  const ltv = data.avgChurn > 0 ? arpu / (data.avgChurn / 100) : null;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-mcsystem-900">Dashboard Financeiro</h2>
          <p className="text-gray-500 text-sm">Receita, recorrência, clientes e saúde do negócio.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Ano:</span>
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium focus:border-mcsystem-500 outline-none">
            {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* KPIs financeiros */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Receita" value={brl(data.totalIncome)} icon={<TrendingUp size={20} />} tone="green" />
        <KpiCard label="Despesa" value={brl(data.totalExpense)} icon={<TrendingDown size={20} />} tone="red" />
        <KpiCard label="Saldo" value={brl(data.balance)} icon={<Wallet size={20} />} tone={data.balance >= 0 ? 'blue' : 'red'}
          sub={<span className={data.margin >= 0 ? 'text-green-600' : 'text-red-600'}>Margem {pct(data.margin)}</span>} />
        <KpiCard label="Em atraso" value={brl(data.overdueIncome)} icon={<AlertCircle size={20} />} tone="red"
          sub={<span className="text-gray-400">{pct(data.overdueRate)} da receita</span>} />
      </div>

      {/* KPIs de recorrência / crescimento */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="MRR" value={brl(recurring.mrr)} icon={<Repeat size={20} />} tone="purple"
          sub={<span className="text-gray-400">ARR {brl(recurring.arr)}</span>} />
        <KpiCard label="Clientes ativos" value={String(recurring.activeSubscribers)} icon={<Users size={20} />} tone="blue"
          sub={<span className="text-green-600">+{data.newLastMonth} no mês</span>} />
        <KpiCard label="ARPU" value={brl(arpu)} icon={<Target size={20} />} tone="amber"
          sub={<span className="text-gray-400">{ltv !== null ? `LTV ${brl(ltv)}` : 'LTV —'}</span>} />
        <KpiCard label="Churn médio / mês" value={pct(data.avgChurn)} icon={<Percent size={20} />} tone={data.avgChurn > 8 ? 'red' : 'green'}
          sub={<span className="text-gray-400">Retenção {pct(100 - data.avgChurn)}</span>} />
      </div>

      {/* Evolução mensal + Receita por produto */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card title="Evolução mensal" subtitle="Receita, despesa e saldo" className="lg:col-span-2">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.monthly} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={brlShort} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={55} />
                <Tooltip formatter={(v: any) => brl(v)} contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="receita" name="Receita" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={22} />
                <Bar dataKey="despesa" name="Despesa" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={22} />
                <Line dataKey="saldo" name="Saldo" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Receita por produto" subtitle={`Ano ${year}`}>
          <div className="h-72">
            {data.productData.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data.productData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                    {data.productData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => brl(v)} contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      {/* Churn/novos + Clientes ativos por produto */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card title="Churn e novos clientes" subtitle="Por mês (base cobranças)" className="lg:col-span-2">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.churnSeries} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={30} />
                <YAxis yAxisId="right" orientation="right" tickFormatter={(v: any) => `${v}%`} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={40} />
                <Tooltip formatter={(v: any, n: any) => n === 'Churn %' ? `${(v as number).toFixed(1)}%` : v} contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="left" dataKey="novos" name="Novos clientes" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={22} />
                <Bar yAxisId="left" dataKey="churned" name="Perdidos" fill="#fca5a5" radius={[4, 4, 0, 0]} maxBarSize={22} />
                <Line yAxisId="right" dataKey="churnPct" name="Churn %" stroke="#ef4444" strokeWidth={2.5} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Clientes ativos por produto" subtitle="Assinaturas ativas">
          <div className="h-72">
            {recurring.activeClientsByProduct.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={recurring.activeClientsByProduct} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }} />
                  <Bar dataKey="value" name="Clientes" fill="#8b5cf6" radius={[0, 4, 4, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      {/* Faturamento por produto/mês + Aging */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card title="Faturamento por produto / mês" subtitle="Comparativo por produto" className="lg:col-span-2">
          <div className="h-72">
            {data.topProductNames.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.prodMonthlyData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={brlShort} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={55} />
                  <Tooltip formatter={(v: any) => brl(v)} contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {data.topProductNames.map((pn, i) => (
                    <Line key={pn} type="monotone" dataKey={pn} stroke={PALETTE[i % PALETTE.length]} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card title="Recebíveis (aging)" subtitle="A receber por vencimento">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.agingData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} interval={0} />
                <YAxis tickFormatter={brlShort} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={55} />
                <Tooltip formatter={(v: any) => brl(v)} contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }} />
                <Bar dataKey="value" name="A receber" radius={[4, 4, 0, 0]} maxBarSize={40}>
                  {data.agingData.map((_, i) => <Cell key={i} fill={['#ef4444', '#f59e0b', '#3b82f6', '#9ca3af'][i]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Status cobranças + Top clientes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card title="Status das cobranças" subtitle={`Receitas ${year}`}>
          <div className="h-72">
            {data.statusData.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data.statusData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                    {data.statusData.map((s, i) => <Cell key={i} fill={s.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => brl(v)} contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card title="Top clientes por receita" subtitle={`Ano ${year}`} className="lg:col-span-2">
          {data.topClients.length === 0 ? <div className="h-40"><Empty /></div> : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={data.topClients} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                  <XAxis type="number" tickFormatter={brlShort} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={170} tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v: any) => brl(v)} contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }} />
                  <Bar dataKey="value" name="Receita" fill="#3b82f6" radius={[0, 4, 4, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <p className="text-[11px] text-gray-400 flex items-center gap-1">
        <Activity size={12} /> Churn e novos clientes calculados a partir do histórico de cobranças (clientes que cobravam e deixaram de cobrar no mês). MRR/ARPU baseados nas assinaturas ativas.
      </p>
    </div>
  );
};

// ---------- UI helpers ----------

const toneMap: Record<string, { bg: string; text: string }> = {
  green: { bg: 'bg-green-50', text: 'text-green-600' },
  red: { bg: 'bg-red-50', text: 'text-red-600' },
  blue: { bg: 'bg-blue-50', text: 'text-blue-600' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-600' },
  purple: { bg: 'bg-purple-50', text: 'text-purple-600' },
};

const KpiCard: React.FC<{ label: string; value: string; icon: React.ReactNode; tone: string; sub?: React.ReactNode }> = ({ label, value, icon, tone, sub }) => {
  const t = toneMap[tone] || toneMap.blue;
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</span>
        <span className={`p-2 rounded-lg ${t.bg} ${t.text}`}>{icon}</span>
      </div>
      <div className="text-2xl font-bold text-gray-800">{value}</div>
      {sub && <div className="mt-1 text-xs font-medium">{sub}</div>}
    </div>
  );
};

const Card: React.FC<{ title: string; subtitle?: string; className?: string; children: React.ReactNode }> = ({ title, subtitle, className = '', children }) => (
  <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 p-6 ${className}`}>
    <div className="mb-4">
      <h3 className="font-bold text-gray-900 text-base">{title}</h3>
      {subtitle && <p className="text-xs text-gray-400 uppercase tracking-wide mt-0.5">{subtitle}</p>}
    </div>
    {children}
  </div>
);

const Empty: React.FC = () => (
  <div className="h-full flex items-center justify-center text-gray-300 text-sm">Sem dados no período</div>
);
