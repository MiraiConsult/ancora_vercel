import React, { useMemo, useState, useRef, useEffect } from 'react';
import { FinancialRecord, Product, Company, Subscription, User } from '../types';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, BarChart, LineChart,
} from 'recharts';
import {
  TrendingUp, TrendingDown, Wallet, AlertCircle, Repeat, Users, Percent, Target, Activity,
  ChevronDown, Check, ArrowUpRight, ArrowDownRight, Minus, Package,
} from 'lucide-react';

interface OverviewDashboardProps {
  records: FinancialRecord[];
  products: Product[];
  companies: Company[];
  subscriptions: Subscription[];
  currentUser: User;
}

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const PALETTE = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#06b6d4', '#ec4899', '#ef4444', '#14b8a6', '#a855f7', '#f97316'];
const NO_PRODUCT = 'Sem produto';

const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const brlShort = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}k`;
  return `R$ ${v.toFixed(0)}`;
};
const pct = (v: number) => `${v.toFixed(1)}%`;

// Sigla curta para rotular a ponta das linhas (ex.: "Hello Growth" -> "HG")
const makeSigla = (name: string) => {
  const stop = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'o', 'a', 'em', 'para']);
  const words = name.trim().split(/\s+/).filter(w => !stop.has(w.toLowerCase()));
  if (words.length >= 2) return words.slice(0, 3).map(w => w[0]).join('').toUpperCase();
  return (words[0] || name).slice(0, 3).toUpperCase();
};
const buildSiglas = (names: string[]) => {
  const map: Record<string, string> = {};
  const used = new Set<string>();
  names.forEach(n => {
    let s = makeSigla(n);
    const base = s;
    let k = 2;
    while (used.has(s)) s = `${base}${k++}`;
    used.add(s);
    map[n] = s;
  });
  return map;
};
// Rótulo desenhado apenas no último ponto da linha
const endLabel = (text: string, color: string, lastIndex: number) => (props: any) => {
  const { x, y, index } = props;
  if (index !== lastIndex || x == null || y == null) return null;
  return <text x={x + 8} y={y} dy={4} fill={color} fontSize={11} fontWeight={700}>{text}</text>;
};

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

  const productOptions = useMemo(() => {
    const names = new Set<string>(products.map(p => p.name));
    names.add(NO_PRODUCT);
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [products]);

  // ---- Filtros ----
  const [year, setYear] = useState<number>(availableYears[0]);
  const [selectedMonths, setSelectedMonths] = useState<number[]>(ALL_MONTHS);
  const [selectedProducts, setSelectedProducts] = useState<string[] | null>(null); // null = todos
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [compareYear, setCompareYear] = useState<number>(availableYears[0] - 1);

  const activeProducts = selectedProducts ?? productOptions;
  const productSet = useMemo(() => new Set(activeProducts), [activeProducts]);
  const isProductFiltered = selectedProducts !== null && selectedProducts.length !== productOptions.length;

  const toggleMonth = (m: number) =>
    setSelectedMonths(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m].sort((a, b) => a - b));

  const monthsSorted = useMemo(() => [...selectedMonths].sort((a, b) => a - b), [selectedMonths]);

  // ---- Helpers de classificação por produto ----
  const recordProductNames = (r: FinancialRecord): string[] =>
    (r.split_revenue && r.split_revenue.length > 0)
      ? r.split_revenue.map(sp => productName(sp.product_id) || NO_PRODUCT)
      : [productName(r.product_id) || NO_PRODUCT];

  // Valor de receita considerando o filtro de produtos (respeita splits)
  const incomeUnderFilter = (r: FinancialRecord): number => {
    if (r.split_revenue && r.split_revenue.length > 0) {
      return r.split_revenue
        .filter(sp => productSet.has(productName(sp.product_id) || NO_PRODUCT))
        .reduce((s, sp) => s + Math.abs(sp.amount), 0);
    }
    return productSet.has(productName(r.product_id) || NO_PRODUCT) ? r.amount : 0;
  };

  // ---- Agregação de um período (ano + meses selecionados) ----
  const aggregate = (targetYear: number) => {
    const yearStr = String(targetYear);
    const monthIndex = new Map(monthsSorted.map((mi, idx) => [mi, idx]));
    const monthly = monthsSorted.map(mi => ({ month: MONTHS[mi - 1], mi, receita: 0, despesa: 0, saldo: 0 }));

    let totalIncome = 0, totalExpense = 0, receivedIncome = 0, pendingIncome = 0, overdueIncome = 0;
    const byProduct = new Map<string, number>();
    const prodMonthly: Record<string, Record<number, number>> = {};
    const clientsProdMonth: Record<string, Record<number, Set<string>>> = {};
    const statusMap: Record<string, number> = { Pago: 0, Pendente: 0, Atrasado: 0 };
    const byClient = new Map<string, number>();

    validRecords.forEach(r => {
      const d = r.dueDate || '';
      if (!d.startsWith(yearStr)) return;
      const mi = parseInt(d.slice(5, 7));
      const idx = monthIndex.get(mi);
      if (idx === undefined) return;

      if (r.amount >= 0) {
        const val = incomeUnderFilter(r);
        if (val === 0) return;
        totalIncome += val;
        monthly[idx].receita += val;

        const st = (r.status as string) || 'Pendente';
        if (st === 'Pago') { receivedIncome += val; statusMap.Pago += val; }
        else if (st === 'Atrasado') { overdueIncome += val; statusMap.Atrasado += val; }
        else { pendingIncome += val; statusMap.Pendente += val; }

        if (r.split_revenue && r.split_revenue.length > 0) {
          r.split_revenue.forEach(sp => {
            const pn = productName(sp.product_id) || NO_PRODUCT;
            if (!productSet.has(pn)) return;
            const amt = Math.abs(sp.amount);
            byProduct.set(pn, (byProduct.get(pn) || 0) + amt);
            if (!prodMonthly[pn]) prodMonthly[pn] = {};
            prodMonthly[pn][mi] = (prodMonthly[pn][mi] || 0) + amt;
            if (r.companyId) {
              if (!clientsProdMonth[pn]) clientsProdMonth[pn] = {};
              if (!clientsProdMonth[pn][mi]) clientsProdMonth[pn][mi] = new Set();
              clientsProdMonth[pn][mi].add(r.companyId);
            }
          });
        } else {
          const pn = productName(r.product_id) || NO_PRODUCT;
          byProduct.set(pn, (byProduct.get(pn) || 0) + val);
          if (!prodMonthly[pn]) prodMonthly[pn] = {};
          prodMonthly[pn][mi] = (prodMonthly[pn][mi] || 0) + val;
          if (r.companyId) {
            if (!clientsProdMonth[pn]) clientsProdMonth[pn] = {};
            if (!clientsProdMonth[pn][mi]) clientsProdMonth[pn][mi] = new Set();
            clientsProdMonth[pn][mi].add(r.companyId);
          }
        }
        byClient.set(companyName(r.companyId), (byClient.get(companyName(r.companyId)) || 0) + val);
      } else {
        // Despesas não são classificadas por produto
        const abs = Math.abs(r.amount);
        totalExpense += abs;
        monthly[idx].despesa += abs;
      }
    });
    monthly.forEach(m => { m.saldo = m.receita - m.despesa; });

    const balance = totalIncome - totalExpense;
    return {
      monthly, totalIncome, totalExpense, balance,
      margin: totalIncome > 0 ? (balance / totalIncome) * 100 : 0,
      receivedIncome, pendingIncome, overdueIncome,
      overdueRate: totalIncome > 0 ? (overdueIncome / totalIncome) * 100 : 0,
      byProduct, prodMonthly, clientsProdMonth, statusMap, byClient,
    };
  };

  // ---- Clientes por mês (para churn), respeitando filtro de produtos ----
  const clientsByMonth = useMemo(() => {
    const map = new Map<string, Set<string>>();
    validRecords.forEach(r => {
      if (r.amount < 0 || !r.companyId) return;
      if (!recordProductNames(r).some(pn => productSet.has(pn))) return;
      const mk = (r.dueDate || '').slice(0, 7);
      if (!mk) return;
      if (!map.has(mk)) map.set(mk, new Set());
      map.get(mk)!.add(r.companyId);
    });
    return map;
  }, [validRecords, productSet, products]);

  const primary = useMemo(() => aggregate(year), [validRecords, year, monthsSorted, productSet, products, companies]);
  const compare = useMemo(() => compareEnabled ? aggregate(compareYear) : null,
    [validRecords, compareYear, compareEnabled, monthsSorted, productSet, products, companies]);

  const derived = useMemo(() => {
    const now = new Date();
    const nowKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const productData = Array.from(primary.byProduct.entries())
      .map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    const topProductNames = productData.slice(0, 6).map(p => p.name);
    const prodMonthlyData = monthsSorted.map(mi => {
      const entry: Record<string, any> = { month: MONTHS[mi - 1] };
      topProductNames.forEach(pn => { entry[pn] = primary.prodMonthly[pn]?.[mi] || 0; });
      return entry;
    });

    // Churn / novos clientes
    const churnSeries: { month: string; churnPct: number; novos: number; churned: number }[] = [];
    let churnSum = 0, churnCount = 0;
    monthsSorted.forEach(mi => {
      const mk = `${year}-${String(mi).padStart(2, '0')}`;
      if (mk > nowKey) return;
      const prevDate = new Date(year, mi - 2, 1);
      const prevKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
      const prev = clientsByMonth.get(prevKey) || new Set<string>();
      const curr = clientsByMonth.get(mk) || new Set<string>();
      const churned = Array.from(prev).filter(c => !curr.has(c)).length;
      const novos = Array.from(curr).filter(c => !prev.has(c)).length;
      const churnPct = prev.size ? (churned / prev.size) * 100 : 0;
      if (prev.size) { churnSum += churnPct; churnCount++; }
      churnSeries.push({ month: MONTHS[mi - 1], churnPct, novos, churned });
    });
    const avgChurn = churnCount ? churnSum / churnCount : 0;
    const newLastMonth = churnSeries.length ? churnSeries[churnSeries.length - 1].novos : 0;

    // Evolução de clientes ativos por produto
    const clientProdNames = Object.entries(primary.clientsProdMonth)
      .map(([name, months]) => ({ name, total: new Set(Object.values(months).flatMap(s => Array.from(s))).size }))
      .sort((a, b) => b.total - a.total).slice(0, 6).map(p => p.name);
    const activeClientsSeries: Record<string, any>[] = [];
    monthsSorted.forEach(mi => {
      const mk = `${year}-${String(mi).padStart(2, '0')}`;
      if (mk > nowKey) return;
      const entry: Record<string, any> = { month: MONTHS[mi - 1] };
      clientProdNames.forEach(pn => { entry[pn] = primary.clientsProdMonth[pn]?.[mi]?.size || 0; });
      activeClientsSeries.push(entry);
    });

    // Aging de recebíveis (não depende do ano/meses)
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const aging: Record<string, number> = { 'Vencido': 0, '0-30d': 0, '31-60d': 0, '60d+': 0 };
    validRecords.forEach(r => {
      if (r.amount < 0 || (r.status as string) === 'Pago' || !r.dueDate) return;
      const val = incomeUnderFilter(r);
      if (val === 0) return;
      const due = new Date(r.dueDate + 'T00:00:00');
      const diff = Math.floor((due.getTime() - today.getTime()) / 86400000);
      if (diff < 0) aging['Vencido'] += val;
      else if (diff <= 30) aging['0-30d'] += val;
      else if (diff <= 60) aging['31-60d'] += val;
      else aging['60d+'] += val;
    });
    const agingData = Object.entries(aging).map(([name, value]) => ({ name, value }));

    const statusData = [
      { name: 'Pago', value: primary.statusMap.Pago, color: '#10b981' },
      { name: 'Pendente', value: primary.statusMap.Pendente, color: '#f59e0b' },
      { name: 'Atrasado', value: primary.statusMap.Atrasado, color: '#ef4444' },
    ].filter(s => s.value > 0);

    const topClients = Array.from(primary.byClient.entries())
      .map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 7);

    // Evolução mensal com série comparativa
    const evolution = primary.monthly.map((m, i) => ({
      ...m,
      receitaCmp: compare ? (compare.monthly[i]?.receita ?? 0) : undefined,
      despesaCmp: compare ? (compare.monthly[i]?.despesa ?? 0) : undefined,
    }));

    return {
      productData, topProductNames, prodMonthlyData, churnSeries, avgChurn, newLastMonth,
      clientProdNames, activeClientsSeries, agingData, statusData, topClients, evolution,
    };
  }, [primary, compare, monthsSorted, year, clientsByMonth, validRecords, productSet]);

  // ---- Recorrência (assinaturas ativas), respeitando filtro de produtos ----
  const recurring = useMemo(() => {
    const active = subscriptions.filter(s =>
      (s.status || 'ACTIVE') === 'ACTIVE' && productSet.has(productName(s.product_id) || NO_PRODUCT));
    const mrr = active.reduce((sum, s) => sum + (s.value || 0) * monthlyFactor(s.cycle), 0);
    const activeSubscribers = new Set(active.map(s => s.client_id).filter(Boolean)).size;
    const byProduct = new Map<string, Set<string>>();
    active.forEach(s => {
      const pn = productName(s.product_id) || NO_PRODUCT;
      if (!byProduct.has(pn)) byProduct.set(pn, new Set());
      if (s.client_id) byProduct.get(pn)!.add(s.client_id);
    });
    const activeClientsByProduct = Array.from(byProduct.entries())
      .map(([name, set]) => ({ name, value: set.size })).sort((a, b) => b.value - a.value);
    return { mrr, arr: mrr * 12, activeSubscribers, activeClientsByProduct };
  }, [subscriptions, productSet, products]);

  const arpu = recurring.activeSubscribers > 0 ? recurring.mrr / recurring.activeSubscribers : 0;
  const ltv = derived.avgChurn > 0 ? arpu / (derived.avgChurn / 100) : null;

  const siglaFat = useMemo(() => buildSiglas(derived.topProductNames), [derived.topProductNames]);
  const siglaCli = useMemo(() => buildSiglas(derived.clientProdNames), [derived.clientProdNames]);

  const periodLabel = monthsSorted.length === 12
    ? String(year)
    : `${monthsSorted.map(m => MONTHS[m - 1]).join(', ')} ${year}`;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-mcsystem-900">Dashboard Financeiro</h2>
          <p className="text-gray-500 text-sm">Receita, recorrência, clientes e saúde do negócio.</p>
        </div>
      </div>

      {/* Barra de filtros */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Ano */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Ano</span>
            <select value={year} onChange={e => setYear(Number(e.target.value))}
              className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium focus:border-mcsystem-500 outline-none">
              {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          <div className="h-6 w-px bg-gray-200 hidden md:block" />

          {/* Produtos */}
          <MultiSelect
            label="Produtos"
            options={productOptions}
            selected={activeProducts}
            onChange={sel => setSelectedProducts(sel.length === productOptions.length ? null : sel)}
            icon={<Package size={14} />}
          />

          <div className="h-6 w-px bg-gray-200 hidden md:block" />

          {/* Comparação */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={compareEnabled} onChange={e => setCompareEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-mcsystem-600 focus:ring-mcsystem-500" />
            <span className="text-sm text-gray-700">Comparar com</span>
          </label>
          <select value={compareYear} disabled={!compareEnabled} onChange={e => setCompareYear(Number(e.target.value))}
            className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium focus:border-mcsystem-500 outline-none disabled:bg-gray-100 disabled:text-gray-400">
            {[...new Set([...availableYears, year - 1, year - 2])].sort((a, b) => b - a).filter(y => y !== year)
              .map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          {compareEnabled && <span className="text-xs text-gray-400">mesmos meses</span>}
        </div>

        {/* Meses */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-400 mr-1">Meses</span>
          {MONTHS.map((m, i) => {
            const on = selectedMonths.includes(i + 1);
            return (
              <button key={m} onClick={() => toggleMonth(i + 1)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${on ? 'bg-mcsystem-500 text-white shadow-sm' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}>
                {m}
              </button>
            );
          })}
          <button onClick={() => setSelectedMonths(ALL_MONTHS)} className="ml-2 text-xs text-mcsystem-600 hover:underline">Todos</button>
          <button onClick={() => setSelectedMonths([new Date().getMonth() + 1])} className="text-xs text-mcsystem-600 hover:underline">Mês atual</button>
        </div>

        {isProductFiltered && (
          <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            Filtro de produto ativo — despesas não são classificadas por produto, então Despesa/Saldo consideram o total do período.
          </p>
        )}
      </div>

      {/* KPIs financeiros */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Receita" value={brl(primary.totalIncome)} icon={<TrendingUp size={20} />} tone="green"
          delta={compare ? deltaOf(primary.totalIncome, compare.totalIncome) : null} />
        <KpiCard label="Despesa" value={brl(primary.totalExpense)} icon={<TrendingDown size={20} />} tone="red"
          delta={compare ? deltaOf(primary.totalExpense, compare.totalExpense, true) : null} />
        <KpiCard label="Saldo" value={brl(primary.balance)} icon={<Wallet size={20} />} tone={primary.balance >= 0 ? 'blue' : 'red'}
          delta={compare ? deltaOf(primary.balance, compare.balance) : null}
          sub={<span className={primary.margin >= 0 ? 'text-green-600' : 'text-red-600'}>Margem {pct(primary.margin)}</span>} />
        <KpiCard label="Em atraso" value={brl(primary.overdueIncome)} icon={<AlertCircle size={20} />} tone="red"
          sub={<span className="text-gray-400">{pct(primary.overdueRate)} da receita</span>} />
      </div>

      {/* KPIs de recorrência */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="MRR" value={brl(recurring.mrr)} icon={<Repeat size={20} />} tone="purple"
          sub={<span className="text-gray-400">ARR {brl(recurring.arr)}</span>} />
        <KpiCard label="Clientes ativos" value={String(recurring.activeSubscribers)} icon={<Users size={20} />} tone="blue"
          sub={<span className="text-green-600">+{derived.newLastMonth} no último mês</span>} />
        <KpiCard label="ARPU" value={brl(arpu)} icon={<Target size={20} />} tone="amber"
          sub={<span className="text-gray-400">{ltv !== null ? `LTV ${brl(ltv)}` : 'LTV —'}</span>} />
        <KpiCard label="Churn médio / mês" value={pct(derived.avgChurn)} icon={<Percent size={20} />} tone={derived.avgChurn > 8 ? 'red' : 'green'}
          sub={<span className="text-gray-400">Retenção {pct(100 - derived.avgChurn)}</span>} />
      </div>

      {/* Evolução mensal + Receita por produto */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card title="Evolução mensal" subtitle={compare ? `${periodLabel} vs ${compareYear}` : periodLabel} className="lg:col-span-2">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={derived.evolution} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={brlShort} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={55} />
                <Tooltip formatter={(v: any) => brl(v)} contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="receita" name="Receita" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={22} />
                <Bar dataKey="despesa" name="Despesa" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={22} />
                <Line dataKey="saldo" name="Saldo" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3 }} />
                {compare && <Line dataKey="receitaCmp" name={`Receita ${compareYear}`} stroke="#10b981" strokeWidth={2} strokeDasharray="5 4" dot={false} />}
                {compare && <Line dataKey="despesaCmp" name={`Despesa ${compareYear}`} stroke="#ef4444" strokeWidth={2} strokeDasharray="5 4" dot={false} />}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Receita por produto" subtitle={periodLabel}>
          <div className="h-72">
            {derived.productData.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={derived.productData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                    {derived.productData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => brl(v)} contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      {/* Faturamento por produto / mês (linhas comparativas) */}
      <Card title="Faturamento por produto / mês" subtitle={`Comparativo por produto — ${periodLabel}`}>
        <div className="h-80">
          {derived.topProductNames.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={derived.prodMonthlyData} margin={{ top: 10, right: 56, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={brlShort} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={55} />
                <Tooltip formatter={(v: any) => brl(v)} contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v: any) => `${siglaFat[v] || ''} · ${v}`} />
                {derived.topProductNames.map((pn, i) => (
                  <Line key={pn} type="monotone" dataKey={pn} stroke={PALETTE[i % PALETTE.length]} strokeWidth={2.5}
                    dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls
                    label={endLabel(siglaFat[pn] || pn, PALETTE[i % PALETTE.length], derived.prodMonthlyData.length - 1)} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      {/* Evolução de clientes ativos por produto */}
      <Card title="Evolução de clientes ativos por produto" subtitle={`Clientes com cobrança no mês — ${periodLabel}`}>
        <div className="h-80">
          {derived.clientProdNames.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={derived.activeClientsSeries} margin={{ top: 10, right: 56, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={40} />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v: any) => `${siglaCli[v] || ''} · ${v}`} />
                {derived.clientProdNames.map((pn, i) => (
                  <Line key={pn} type="monotone" dataKey={pn} stroke={PALETTE[i % PALETTE.length]} strokeWidth={2.5}
                    dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls
                    label={endLabel(siglaCli[pn] || pn, PALETTE[i % PALETTE.length], derived.activeClientsSeries.length - 1)} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      {/* Churn + clientes ativos por produto (snapshot) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card title="Churn e novos clientes" subtitle="Por mês (base cobranças)" className="lg:col-span-2">
          <div className="h-72">
            {derived.churnSeries.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={derived.churnSeries} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="left" allowDecimals={false} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={30} />
                  <YAxis yAxisId="right" orientation="right" tickFormatter={(v: any) => `${v}%`} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={40} />
                  <Tooltip formatter={(v: any, n: any) => n === 'Churn %' ? `${(v as number).toFixed(1)}%` : v} contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar yAxisId="left" dataKey="novos" name="Novos clientes" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={22} />
                  <Bar yAxisId="left" dataKey="churned" name="Perdidos" fill="#fca5a5" radius={[4, 4, 0, 0]} maxBarSize={22} />
                  <Line yAxisId="right" dataKey="churnPct" name="Churn %" stroke="#ef4444" strokeWidth={2.5} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card title="Clientes ativos por produto" subtitle="Assinaturas ativas hoje">
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

      {/* Aging + Status + Top clientes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card title="Recebíveis (aging)" subtitle="A receber por vencimento">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={derived.agingData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} interval={0} />
                <YAxis tickFormatter={brlShort} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={55} />
                <Tooltip formatter={(v: any) => brl(v)} contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }} />
                <Bar dataKey="value" name="A receber" radius={[4, 4, 0, 0]} maxBarSize={40}>
                  {derived.agingData.map((_, i) => <Cell key={i} fill={['#ef4444', '#f59e0b', '#3b82f6', '#9ca3af'][i]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Status das cobranças" subtitle={periodLabel}>
          <div className="h-72">
            {derived.statusData.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={derived.statusData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                    {derived.statusData.map((s, i) => <Cell key={i} fill={s.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => brl(v)} contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card title="Top clientes" subtitle={`Receita — ${periodLabel}`}>
          <div className="h-72">
            {derived.topClients.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={derived.topClients} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                  <XAxis type="number" tickFormatter={brlShort} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v: any) => brl(v)} contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }} />
                  <Bar dataKey="value" name="Receita" fill="#3b82f6" radius={[0, 4, 4, 0]} maxBarSize={20} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      <p className="text-[11px] text-gray-400 flex items-center gap-1">
        <Activity size={12} /> Churn e novos clientes calculados a partir do histórico de cobranças. MRR/ARPU baseados nas assinaturas ativas.
      </p>
    </div>
  );
};

// ---------- Filtro multi-seleção ----------

const MultiSelect: React.FC<{
  label: string; options: string[]; selected: string[];
  onChange: (sel: string[]) => void; icon?: React.ReactNode;
}> = ({ label, options, selected, onChange, icon }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const all = selected.length === options.length;
  const toggle = (opt: string) =>
    onChange(selected.includes(opt) ? selected.filter(o => o !== opt) : [...selected, opt]);

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)}
        className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2">
        {icon}
        <span>{label}:</span>
        <span className="text-mcsystem-600">{all ? 'Todos' : `${selected.length} de ${options.length}`}</span>
        <ChevronDown size={14} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-2 w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-40 p-2 animate-in fade-in zoom-in-95 max-h-72 overflow-y-auto">
          <div className="flex justify-between px-2 py-1 mb-1 border-b border-gray-100">
            <button onClick={() => onChange(options)} className="text-xs text-mcsystem-600 hover:underline">Selecionar todos</button>
            <button onClick={() => onChange([])} className="text-xs text-red-500 hover:underline">Limpar</button>
          </div>
          {options.map(opt => {
            const on = selected.includes(opt);
            return (
              <button key={opt} onClick={() => toggle(opt)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 text-left">
                <span className={`h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 ${on ? 'bg-mcsystem-500 border-mcsystem-500' : 'border-gray-300'}`}>
                  {on && <Check size={11} className="text-white" />}
                </span>
                <span className="text-sm text-gray-700 truncate">{opt}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ---------- UI helpers ----------

const deltaOf = (curr: number, prev: number, inverse = false) => {
  if (!prev) return null;
  const p = ((curr - prev) / Math.abs(prev)) * 100;
  return { pct: p, good: inverse ? p <= 0 : p >= 0 };
};

const toneMap: Record<string, { bg: string; text: string }> = {
  green: { bg: 'bg-green-50', text: 'text-green-600' },
  red: { bg: 'bg-red-50', text: 'text-red-600' },
  blue: { bg: 'bg-blue-50', text: 'text-blue-600' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-600' },
  purple: { bg: 'bg-purple-50', text: 'text-purple-600' },
};

const KpiCard: React.FC<{
  label: string; value: string; icon: React.ReactNode; tone: string;
  sub?: React.ReactNode; delta?: { pct: number; good: boolean } | null;
}> = ({ label, value, icon, tone, sub, delta }) => {
  const t = toneMap[tone] || toneMap.blue;
  const DeltaIcon = !delta ? Minus : delta.pct >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</span>
        <span className={`p-2 rounded-lg ${t.bg} ${t.text}`}>{icon}</span>
      </div>
      <div className="text-2xl font-bold text-gray-800">{value}</div>
      <div className="mt-1 flex items-center gap-2 text-xs font-medium">
        {delta && (
          <span className={`inline-flex items-center gap-0.5 ${delta.good ? 'text-green-600' : 'text-red-600'}`}>
            <DeltaIcon size={13} />{Math.abs(delta.pct).toFixed(1)}%
          </span>
        )}
        {sub}
      </div>
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
