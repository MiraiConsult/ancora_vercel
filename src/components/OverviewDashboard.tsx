import React, { useMemo, useState, useRef, useEffect } from 'react';
import { FinancialRecord, Product, Company, Subscription, User } from '../types';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  BarChart, LineChart, Cell,
} from 'recharts';
import { ChevronDown, Check, ArrowUp, ArrowDown, X, ExternalLink } from 'lucide-react';

interface OverviewDashboardProps {
  records: FinancialRecord[];
  products: Product[];
  companies: Company[];
  subscriptions: Subscription[];
  currentUser: User;
  onNavigate?: (page: string) => void;
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const NO_PRODUCT = 'Sem produto';

// Paleta categórica validada (CVD-safe, ordem fixa — nunca ciclar)
const SERIES = ['#2a9d8f', '#e76f51', '#7c5ce0', '#eda100', '#2a78d6', '#e87ba4'];
// Paleta de status (reservada — nunca usada como série)
const STATUS = { good: '#0ca30c', warning: '#fab219', critical: '#d03b3b' };

const INK = { primary: '#111827', secondary: '#6b7280', muted: '#9ca3af', grid: '#eef0f3' };

const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v || 0);
const brlExact = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const brlShort = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(1)} mi`;
  if (a >= 1_000) return `${(v / 1_000).toFixed(0)} mil`;
  return String(Math.round(v));
};
const pct = (v: number) => `${v.toFixed(1)}%`;

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
    const base = s; let k = 2;
    while (used.has(s)) s = `${base}${k++}`;
    used.add(s); map[n] = s;
  });
  return map;
};
const endLabel = (text: string, color: string, lastIndex: number) => (props: any) => {
  const { x, y, index } = props;
  if (index !== lastIndex || x == null || y == null) return null;
  return (
    <g>
      <circle cx={x} cy={y} r={3.5} fill={color} stroke="#fff" strokeWidth={2} />
      <text x={x + 9} y={y} dy={4} fill={INK.secondary} fontSize={11} fontWeight={600}>{text}</text>
    </g>
  );
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

export const OverviewDashboard: React.FC<OverviewDashboardProps> = ({ records, products, companies, subscriptions, onNavigate }) => {
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

  const [year, setYear] = useState<number>(availableYears[0]);
  const [selectedMonths, setSelectedMonths] = useState<number[]>(ALL_MONTHS);
  const [selectedProducts, setSelectedProducts] = useState<string[] | null>(null);
  const [compareEnabled, setCompareEnabled] = useState(true);
  const [compareYear, setCompareYear] = useState<number>(availableYears[0] - 1);

  const activeProducts = selectedProducts ?? productOptions;
  const productSet = useMemo(() => new Set(activeProducts), [activeProducts]);
  const isProductFiltered = selectedProducts !== null && selectedProducts.length !== productOptions.length;
  const monthsSorted = useMemo(() => [...selectedMonths].sort((a, b) => a - b), [selectedMonths]);

  const recordProductNames = (r: FinancialRecord): string[] =>
    (r.split_revenue && r.split_revenue.length > 0)
      ? r.split_revenue.map(sp => productName(sp.product_id) || NO_PRODUCT)
      : [productName(r.product_id) || NO_PRODUCT];

  const incomeUnderFilter = (r: FinancialRecord): number => {
    if (r.split_revenue && r.split_revenue.length > 0) {
      return r.split_revenue
        .filter(sp => productSet.has(productName(sp.product_id) || NO_PRODUCT))
        .reduce((s, sp) => s + Math.abs(sp.amount), 0);
    }
    return productSet.has(productName(r.product_id) || NO_PRODUCT) ? r.amount : 0;
  };

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

        const bump = (pn: string, amt: number) => {
          byProduct.set(pn, (byProduct.get(pn) || 0) + amt);
          if (!prodMonthly[pn]) prodMonthly[pn] = {};
          prodMonthly[pn][mi] = (prodMonthly[pn][mi] || 0) + amt;
          if (r.companyId) {
            if (!clientsProdMonth[pn]) clientsProdMonth[pn] = {};
            if (!clientsProdMonth[pn][mi]) clientsProdMonth[pn][mi] = new Set();
            clientsProdMonth[pn][mi].add(r.companyId);
          }
        };
        if (r.split_revenue && r.split_revenue.length > 0) {
          r.split_revenue.forEach(sp => {
            const pn = productName(sp.product_id) || NO_PRODUCT;
            if (productSet.has(pn)) bump(pn, Math.abs(sp.amount));
          });
        } else {
          bump(productName(r.product_id) || NO_PRODUCT, val);
        }
        byClient.set(companyName(r.companyId), (byClient.get(companyName(r.companyId)) || 0) + val);
      } else {
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

    const churnSeries: { month: string; churnPct: number; novos: number; perdidos: number }[] = [];
    let churnSum = 0, churnCount = 0;
    monthsSorted.forEach(mi => {
      const mk = `${year}-${String(mi).padStart(2, '0')}`;
      if (mk > nowKey) return;
      const prevDate = new Date(year, mi - 2, 1);
      const prevKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
      const prev = clientsByMonth.get(prevKey) || new Set<string>();
      const curr = clientsByMonth.get(mk) || new Set<string>();
      const perdidos = Array.from(prev).filter(c => !curr.has(c)).length;
      const novos = Array.from(curr).filter(c => !prev.has(c)).length;
      const churnPct = prev.size ? (perdidos / prev.size) * 100 : 0;
      if (prev.size) { churnSum += churnPct; churnCount++; }
      churnSeries.push({ month: MONTHS[mi - 1], churnPct, novos, perdidos });
    });
    const avgChurn = churnCount ? churnSum / churnCount : 0;
    const newLastMonth = churnSeries.length ? churnSeries[churnSeries.length - 1].novos : 0;

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

    const statusTotal = primary.statusMap.Pago + primary.statusMap.Pendente + primary.statusMap.Atrasado;
    const statusRows = [
      { name: 'Pago', value: primary.statusMap.Pago, color: STATUS.good },
      { name: 'Pendente', value: primary.statusMap.Pendente, color: STATUS.warning },
      { name: 'Atrasado', value: primary.statusMap.Atrasado, color: STATUS.critical },
    ].map(s => ({ ...s, share: statusTotal ? (s.value / statusTotal) * 100 : 0 }));

    const topClients = Array.from(primary.byClient.entries())
      .map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 7);

    const evolution = primary.monthly.map((m, i) => ({
      ...m,
      receitaCmp: compare ? (compare.monthly[i]?.receita ?? 0) : undefined,
      despesaCmp: compare ? (compare.monthly[i]?.despesa ?? 0) : undefined,
    }));

    return {
      productData, topProductNames, prodMonthlyData, churnSeries, avgChurn, newLastMonth,
      clientProdNames, activeClientsSeries, agingData, statusRows, topClients, evolution,
    };
  }, [primary, compare, monthsSorted, year, clientsByMonth, validRecords, productSet]);

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
    // Um item por cliente, somando o MRR de todas as assinaturas dele
    const perClient = new Map<string, { label: string; tag?: string; value: number }>();
    active.forEach(s => {
      const key = s.client_id || s.id;
      const cur = perClient.get(key) || { label: companyName(s.client_id), tag: productName(s.product_id) || undefined, value: 0 };
      cur.value += (s.value || 0) * monthlyFactor(s.cycle);
      perClient.set(key, cur);
    });
    const activeClientList = Array.from(perClient.entries())
      .map(([id, v]) => ({ id, label: v.label, sub: 'Assinatura ativa', tag: v.tag, value: v.value }))
      .sort((a, b) => b.value - a.value);
    return { mrr, arr: mrr * 12, activeSubscribers, activeClientsByProduct, activeClientList };
  }, [subscriptions, productSet, products]);

  const arpu = recurring.activeSubscribers > 0 ? recurring.mrr / recurring.activeSubscribers : 0;
  const ltv = derived.avgChurn > 0 ? arpu / (derived.avgChurn / 100) : null;

  const siglaFat = useMemo(() => buildSiglas(derived.topProductNames), [derived.topProductNames]);
  const siglaCli = useMemo(() => buildSiglas(derived.clientProdNames), [derived.clientProdNames]);

  // ---- Drill-down dos KPIs ----
  const [drill, setDrill] = useState<null | { title: string; rows: DrillRow[]; goTo?: string }>(null);

  const inPeriod = (r: FinancialRecord) => {
    const d = r.dueDate || '';
    if (!d.startsWith(String(year))) return false;
    return monthsSorted.includes(parseInt(d.slice(5, 7)));
  };
  const toRow = (r: FinancialRecord): DrillRow => ({
    id: r.id,
    label: r.description || 'Lançamento',
    sub: companyName(r.companyId),
    tag: (r.split_revenue?.length ? 'Múltiplos' : productName(r.product_id)) || undefined,
    date: r.dueDate,
    value: r.amount >= 0 ? incomeUnderFilter(r) : -Math.abs(r.amount),
    status: r.status as string,
  });
  const incomeRows = (extra?: (r: FinancialRecord) => boolean) =>
    validRecords.filter(r => r.amount >= 0 && inPeriod(r) && incomeUnderFilter(r) !== 0 && (!extra || extra(r)))
      .sort((a, b) => (b.dueDate || '').localeCompare(a.dueDate || '')).map(toRow);

  const openDrill = (title: string, rows: DrillRow[], goTo?: string) => setDrill({ title, rows, goTo });

  const monthsLabel = monthsSorted.length === 12 ? 'Ano cheio'
    : monthsSorted.length === 1 ? MONTHS[monthsSorted[0] - 1]
    : isContiguous(monthsSorted) ? `${MONTHS[monthsSorted[0] - 1]}–${MONTHS[monthsSorted[monthsSorted.length - 1] - 1]}`
    : `${monthsSorted.length} meses`;
  const productsLabel = isProductFiltered ? `${activeProducts.length} de ${productOptions.length}` : 'Todos';
  const scopeLabel = `${isProductFiltered ? `${activeProducts.length} produtos` : 'todos os produtos'} · ${year}`;

  return (
    <div className="-m-8">
      {/* Barra de filtros */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-gray-200/70 px-8 py-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Faturamento</h1>
            <p className="text-sm text-gray-500">Receita, produtos, clientes e retenção</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Pill label="Ano" value={String(year)}>
              {close => (
                <div className="p-1">
                  {availableYears.map(y => (
                    <Option key={y} active={y === year} onClick={() => { setYear(y); close(); }}>{y}</Option>
                  ))}
                </div>
              )}
            </Pill>

            <Pill label="Meses" value={monthsLabel}>
              {() => (
                <div className="p-3 w-64">
                  <div className="grid grid-cols-4 gap-1.5 mb-3">
                    {MONTHS.map((m, i) => {
                      const on = selectedMonths.includes(i + 1);
                      return (
                        <button key={m} onClick={() => setSelectedMonths(prev =>
                          prev.includes(i + 1) ? prev.filter(x => x !== i + 1) : [...prev, i + 1].sort((a, b) => a - b))}
                          className={`py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${on ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                          {m}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex justify-between text-xs border-t border-gray-100 pt-2">
                    <button onClick={() => setSelectedMonths(ALL_MONTHS)} className="text-gray-700 font-medium hover:underline">Ano cheio</button>
                    <button onClick={() => setSelectedMonths([new Date().getMonth() + 1])} className="text-gray-700 font-medium hover:underline">Mês atual</button>
                    <button onClick={() => setSelectedMonths(ALL_MONTHS.slice(0, new Date().getMonth() + 1))} className="text-gray-700 font-medium hover:underline">Até hoje</button>
                  </div>
                </div>
              )}
            </Pill>

            <Pill label="Produtos" value={productsLabel}>
              {() => (
                <div className="p-2 w-64 max-h-72 overflow-y-auto">
                  <div className="flex justify-between px-2 pb-2 mb-1 border-b border-gray-100 text-xs">
                    <button onClick={() => setSelectedProducts(null)} className="text-gray-700 font-medium hover:underline">Todos</button>
                    <button onClick={() => setSelectedProducts([])} className="text-red-500 font-medium hover:underline">Limpar</button>
                  </div>
                  {productOptions.map(opt => {
                    const on = activeProducts.includes(opt);
                    return (
                      <button key={opt} onClick={() => {
                        const next = on ? activeProducts.filter(o => o !== opt) : [...activeProducts, opt];
                        setSelectedProducts(next.length === productOptions.length ? null : next);
                      }} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-50 text-left">
                        <span className={`h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 ${on ? 'bg-gray-900 border-gray-900' : 'border-gray-300'}`}>
                          {on && <Check size={11} className="text-white" strokeWidth={3} />}
                        </span>
                        <span className="text-sm text-gray-700 truncate">{opt}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </Pill>

            <Pill label="Comparar com" value={compareEnabled ? String(compareYear) : 'Desligado'}>
              {close => (
                <div className="p-1 w-48">
                  <Option active={!compareEnabled} onClick={() => { setCompareEnabled(false); close(); }}>Desligado</Option>
                  {[...new Set([...availableYears, year - 1, year - 2])].sort((a, b) => b - a).filter(y => y !== year).map(y => (
                    <Option key={y} active={compareEnabled && y === compareYear}
                      onClick={() => { setCompareYear(y); setCompareEnabled(true); close(); }}>{y} · mesmos meses</Option>
                  ))}
                </div>
              )}
            </Pill>
          </div>
        </div>
      </div>

      <div className="px-8 py-8 space-y-10">
        {/* Resumo */}
        <section className="space-y-4">
          <SectionTitle title="Resumo" context={`${scopeLabel}${compare ? ` contra ${compareYear}` : ''}`} />
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <Kpi label="Receita total" value={brl(primary.totalIncome)}
              delta={compare ? deltaOf(primary.totalIncome, compare.totalIncome) : null} compareYear={compareYear}
              onClick={() => openDrill('Receita total', incomeRows(), 'entries')} />
            <Kpi label="Recebido" value={brl(primary.receivedIncome)}
              delta={compare ? deltaOf(primary.receivedIncome, compare.receivedIncome) : null} compareYear={compareYear}
              onClick={() => openDrill('Recebido', incomeRows(r => (r.status as string) === 'Pago'), 'entries')} />
            <Kpi label="Saldo" value={brl(primary.balance)} hint={`Margem ${pct(primary.margin)}`}
              delta={compare ? deltaOf(primary.balance, compare.balance) : null} compareYear={compareYear}
              onClick={() => openDrill('Despesas do período',
                validRecords.filter(r => r.amount < 0 && inPeriod(r))
                  .sort((a, b) => (b.dueDate || '').localeCompare(a.dueDate || '')).map(toRow), 'entries')} />
            <Kpi label="MRR" value={brl(recurring.mrr)} hint={`ARR ${brl(recurring.arr)}`}
              onClick={() => openDrill('Assinaturas ativas', subscriptions
                .filter(s => (s.status || 'ACTIVE') === 'ACTIVE' && productSet.has(productName(s.product_id) || NO_PRODUCT))
                .sort((a, b) => (b.value || 0) - (a.value || 0))
                .map(s => ({
                  id: s.id, label: s.description || 'Assinatura', sub: companyName(s.client_id),
                  tag: productName(s.product_id) || undefined, date: s.next_due_date,
                  value: s.value || 0, status: s.cycle,
                })), 'billing')} />
            <Kpi label="Clientes ativos" value={String(recurring.activeSubscribers)} hint={`+${derived.newLastMonth} no último mês`}
              onClick={() => openDrill('Clientes com assinatura ativa', recurring.activeClientList, 'companies')} />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Kpi label="Em atraso" value={brl(primary.overdueIncome)} hint={`${pct(primary.overdueRate)} da receita`}
              onClick={() => openDrill('Cobranças em atraso', incomeRows(r => (r.status as string) === 'Atrasado'), 'entries')} />
            <Kpi label="A receber" value={brl(primary.pendingIncome)}
              onClick={() => openDrill('A receber', incomeRows(r => (r.status as string) === 'Pendente'), 'entries')} />
            <Kpi label="ARPU" value={brl(arpu)} hint={ltv !== null ? `LTV ${brl(ltv)}` : undefined} />
            <Kpi label="Churn médio" value={pct(derived.avgChurn)} hint={`Retenção ${pct(100 - derived.avgChurn)}`} />
          </div>
          {isProductFiltered && (
            <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5">
              Filtro de produto ativo — despesas não são classificadas por produto, então Saldo considera a despesa total do período.
            </p>
          )}
        </section>

        {/* Receita */}
        <section className="space-y-4">
          <SectionTitle title="Receita" context="evolução, produtos e mix" />
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Panel title="Receita mensal" subtitle={compare ? `${year} contra ${compareYear}` : 'Receita, despesa e saldo'}>
              <ChartBox>
                <ComposedChart data={derived.evolution} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={INK.grid} vertical={false} />
                  <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} dy={6} />
                  <YAxis tickFormatter={brlShort} tick={axisTick} axisLine={false} tickLine={false} width={54} />
                  <Tooltip {...tooltipProps} formatter={(v: any) => brlExact(v)} />
                  <Legend {...legendProps} />
                  <Bar dataKey="receita" name="Receita" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={18} />
                  <Bar dataKey="despesa" name="Despesa" fill={SERIES[1]} radius={[4, 4, 0, 0]} maxBarSize={18} />
                  <Line dataKey="saldo" name="Saldo" stroke={SERIES[2]} strokeWidth={2} dot={false} />
                  {compare && <Line dataKey="receitaCmp" name={`Receita ${compareYear}`} stroke={SERIES[0]} strokeWidth={2} strokeDasharray="4 4" dot={false} />}
                </ComposedChart>
              </ChartBox>
            </Panel>

            <Panel title="Faturamento por produto" subtitle={`Mensal · ${siglaLegend(siglaFat, derived.topProductNames)}`}>
              <ChartBox empty={derived.topProductNames.length === 0}>
                <LineChart data={derived.prodMonthlyData} margin={{ top: 8, right: 52, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={INK.grid} vertical={false} />
                  <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} dy={6} />
                  <YAxis tickFormatter={brlShort} tick={axisTick} axisLine={false} tickLine={false} width={54} />
                  <Tooltip {...tooltipProps} formatter={(v: any) => brlExact(v)} />
                  <Legend {...legendProps} />
                  {derived.topProductNames.map((pn, i) => (
                    <Line key={pn} type="monotone" dataKey={pn} stroke={SERIES[i]} strokeWidth={2}
                      dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }} connectNulls
                      label={endLabel(siglaFat[pn], SERIES[i], derived.prodMonthlyData.length - 1)} />
                  ))}
                </LineChart>
              </ChartBox>
            </Panel>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Panel title="Receita por produto" subtitle={`Total do período · ${year}`}>
              <ChartBox empty={derived.productData.length === 0}>
                <BarChart layout="vertical" data={derived.productData} margin={{ top: 4, right: 60, left: 8, bottom: 4 }}>
                  <CartesianGrid stroke={INK.grid} horizontal={false} />
                  <XAxis type="number" tickFormatter={brlShort} tick={axisTick} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12, fill: INK.secondary }} axisLine={false} tickLine={false} />
                  <Tooltip {...tooltipProps} formatter={(v: any) => brlExact(v)} />
                  <Bar dataKey="value" name="Receita" radius={[0, 4, 4, 0]} maxBarSize={20}
                    label={{ position: 'right', formatter: (v: any) => brl(v), fontSize: 11, fill: INK.secondary }}>
                    {derived.productData.map((_, i) => <Cell key={i} fill={SERIES[i % SERIES.length]} />)}
                  </Bar>
                </BarChart>
              </ChartBox>
            </Panel>

            <Panel title="Top clientes" subtitle={`Receita no período · ${year}`}>
              <ChartBox empty={derived.topClients.length === 0}>
                <BarChart layout="vertical" data={derived.topClients} margin={{ top: 4, right: 60, left: 8, bottom: 4 }}>
                  <CartesianGrid stroke={INK.grid} horizontal={false} />
                  <XAxis type="number" tickFormatter={brlShort} tick={axisTick} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11, fill: INK.secondary }} axisLine={false} tickLine={false} />
                  <Tooltip {...tooltipProps} formatter={(v: any) => brlExact(v)} />
                  <Bar dataKey="value" name="Receita" fill={SERIES[4]} radius={[0, 4, 4, 0]} maxBarSize={18}
                    label={{ position: 'right', formatter: (v: any) => brl(v), fontSize: 11, fill: INK.secondary }} />
                </BarChart>
              </ChartBox>
            </Panel>
          </div>
        </section>

        {/* Clientes & retenção */}
        <section className="space-y-4">
          <SectionTitle title="Clientes & retenção" context="base ativa, entradas e saídas" />
          <Panel title="Clientes ativos por produto" subtitle={`Evolução mensal · ${siglaLegend(siglaCli, derived.clientProdNames)}`}>
            <ChartBox height="h-80" empty={derived.clientProdNames.length === 0}>
              <LineChart data={derived.activeClientsSeries} margin={{ top: 8, right: 52, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={INK.grid} vertical={false} />
                <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} dy={6} />
                <YAxis allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} width={40} />
                <Tooltip {...tooltipProps} />
                <Legend {...legendProps} />
                {derived.clientProdNames.map((pn, i) => (
                  <Line key={pn} type="monotone" dataKey={pn} stroke={SERIES[i]} strokeWidth={2}
                    dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }} connectNulls
                    label={endLabel(siglaCli[pn], SERIES[i], derived.activeClientsSeries.length - 1)} />
                ))}
              </LineChart>
            </ChartBox>
          </Panel>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <Panel title="Novos e perdidos" subtitle="Clientes por mês" className="xl:col-span-2">
              <ChartBox empty={derived.churnSeries.length === 0}>
                <BarChart data={derived.churnSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={INK.grid} vertical={false} />
                  <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} dy={6} />
                  <YAxis allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} width={40} />
                  <Tooltip {...tooltipProps} />
                  <Legend {...legendProps} />
                  <Bar dataKey="novos" name="Novos" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={18} />
                  <Bar dataKey="perdidos" name="Perdidos" fill={SERIES[1]} radius={[4, 4, 0, 0]} maxBarSize={18} />
                </BarChart>
              </ChartBox>
            </Panel>

            <Panel title="Churn mensal" subtitle={`Média ${pct(derived.avgChurn)}`}>
              <ChartBox empty={derived.churnSeries.length === 0}>
                <LineChart data={derived.churnSeries} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={INK.grid} vertical={false} />
                  <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} dy={6} />
                  <YAxis tickFormatter={(v: any) => `${v}%`} tick={axisTick} axisLine={false} tickLine={false} width={42} />
                  <Tooltip {...tooltipProps} formatter={(v: any) => pct(v)} />
                  <Line dataKey="churnPct" name="Churn" stroke={SERIES[1]} strokeWidth={2}
                    dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }} />
                </LineChart>
              </ChartBox>
            </Panel>
          </div>

          <Panel title="Base ativa por produto" subtitle="Assinaturas ativas hoje">
            <ChartBox height="h-64" empty={recurring.activeClientsByProduct.length === 0}>
              <BarChart layout="vertical" data={recurring.activeClientsByProduct} margin={{ top: 4, right: 48, left: 8, bottom: 4 }}>
                <CartesianGrid stroke={INK.grid} horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12, fill: INK.secondary }} axisLine={false} tickLine={false} />
                <Tooltip {...tooltipProps} />
                <Bar dataKey="value" name="Clientes" radius={[0, 4, 4, 0]} maxBarSize={20}
                  label={{ position: 'right', fontSize: 11, fill: INK.secondary }}>
                  {recurring.activeClientsByProduct.map((_, i) => <Cell key={i} fill={SERIES[i % SERIES.length]} />)}
                </Bar>
              </BarChart>
            </ChartBox>
          </Panel>
        </section>

        {/* Recebíveis */}
        <section className="space-y-4">
          <SectionTitle title="Recebíveis" context="aging e situação das cobranças" />
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Panel title="Aging de recebíveis" subtitle="A receber por vencimento">
              <ChartBox>
                <BarChart data={derived.agingData} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={INK.grid} vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: INK.secondary }} axisLine={false} tickLine={false} dy={6} interval={0} />
                  <YAxis tickFormatter={brlShort} tick={axisTick} axisLine={false} tickLine={false} width={54} />
                  <Tooltip {...tooltipProps} formatter={(v: any) => brlExact(v)} />
                  <Bar dataKey="value" name="A receber" radius={[4, 4, 0, 0]} maxBarSize={56}
                    label={{ position: 'top', formatter: (v: any) => brl(v), fontSize: 11, fill: INK.secondary }}>
                    {derived.agingData.map((_, i) => (
                      <Cell key={i} fill={i === 0 ? STATUS.critical : SERIES[4]} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartBox>
            </Panel>

            <Panel title="Situação das cobranças" subtitle={`Receita do período · ${year}`}>
              <div className="h-72 flex flex-col justify-center gap-5">
                <div className="flex h-3 rounded-full overflow-hidden bg-gray-100 gap-0.5">
                  {derived.statusRows.filter(s => s.value > 0).map(s => (
                    <div key={s.name} style={{ width: `${s.share}%`, background: s.color }} />
                  ))}
                </div>
                <div className="space-y-3">
                  {derived.statusRows.map(s => (
                    <div key={s.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                        <span className="text-sm font-medium text-gray-700">{s.name}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-sm font-semibold text-gray-900 tabular-nums">{brlExact(s.value)}</span>
                        <span className="text-xs text-gray-400 tabular-nums w-12 text-right">{pct(s.share)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>
          </div>
        </section>

        <p className="text-xs text-gray-400 pb-2">
          Churn e novos clientes calculados a partir do histórico de cobranças. MRR, ARPU e base ativa consideram as assinaturas ativas.
        </p>
      </div>

      {drill && (
        <DrillModal
          title={drill.title}
          rows={drill.rows}
          onClose={() => setDrill(null)}
          onGoTo={drill.goTo && onNavigate ? () => { onNavigate(drill.goTo!); setDrill(null); } : undefined}
        />
      )}
    </div>
  );
};

// ---------- Drill-down ----------

interface DrillRow {
  id: string;
  label: string;
  sub?: string;
  tag?: string;
  date?: string;
  value: number;
  status?: string;
}

const statusChip = (s?: string) => {
  if (!s) return null;
  const map: Record<string, string> = {
    Pago: 'text-green-700 bg-green-50',
    Pendente: 'text-amber-700 bg-amber-50',
    Atrasado: 'text-red-700 bg-red-50',
  };
  return <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${map[s] || 'text-gray-500 bg-gray-100'}`}>{s}</span>;
};

const DrillModal: React.FC<{ title: string; rows: DrillRow[]; onClose: () => void; onGoTo?: () => void }> = ({ title, rows, onClose, onGoTo }) => {
  const total = rows.reduce((s, r) => s + r.value, 0);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col animate-in fade-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-900">{title}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{rows.length} registro(s) · {brlExact(total)}</p>
          </div>
          <div className="flex items-center gap-2">
            {onGoTo && (
              <button onClick={onGoTo}
                className="text-xs font-semibold text-gray-700 hover:text-gray-900 border border-gray-200 hover:border-gray-300 rounded-lg px-3 py-1.5 flex items-center gap-1.5">
                Abrir módulo <ExternalLink size={12} />
              </button>
            )}
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto">
          {rows.length === 0 ? (
            <div className="py-16 text-center text-gray-300 text-sm">Nenhum registro no período</div>
          ) : (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                {rows.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3">
                      <div className="font-medium text-gray-800 truncate max-w-md">{r.label}</div>
                      <div className="text-xs text-gray-400 flex items-center gap-2 mt-0.5">
                        {r.sub}
                        {r.tag && <span className="text-[11px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{r.tag}</span>}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-gray-500 text-xs whitespace-nowrap">{r.date}</td>
                    <td className="px-3 py-3">{statusChip(r.status)}</td>
                    <td className={`px-6 py-3 text-right font-semibold tabular-nums whitespace-nowrap ${r.value < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                      {brlExact(r.value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------- helpers ----------

const isContiguous = (arr: number[]) => arr.every((v, i) => i === 0 || v === arr[i - 1] + 1);
const siglaLegend = (map: Record<string, string>, names: string[]) =>
  names.map(n => map[n]).filter(Boolean).join(' × ') || '—';

const axisTick = { fontSize: 11, fill: INK.muted };
const tooltipProps = {
  contentStyle: { borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 12, boxShadow: '0 4px 16px rgba(0,0,0,.06)' },
  cursor: { fill: 'rgba(0,0,0,.03)' },
};
const legendProps = {
  wrapperStyle: { fontSize: 12, paddingTop: 8 },
  iconType: 'circle' as const,
  iconSize: 8,
};

const deltaOf = (curr: number, prev: number) => {
  if (!prev) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
};

const SectionTitle: React.FC<{ title: string; context?: string }> = ({ title, context }) => (
  <div className="flex items-baseline gap-2">
    <h2 className="text-lg font-bold text-gray-900">{title}</h2>
    {context && <span className="text-sm text-gray-400">· {context}</span>}
  </div>
);

const Kpi: React.FC<{ label: string; value: string; hint?: string; delta?: number | null; compareYear?: number; onClick?: () => void }> = ({ label, value, hint, delta, compareYear, onClick }) => {
  const up = (delta ?? 0) >= 0;
  const Tag: any = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick}
      className={`bg-white rounded-2xl border border-gray-200/80 p-5 text-left w-full transition-all ${onClick ? 'cursor-pointer hover:border-gray-300 hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-gray-900/10' : ''}`}>
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
        {onClick && <ChevronDown size={13} className="text-gray-300 -rotate-90" />}
      </div>
      <div className="mt-2 text-2xl font-bold text-gray-900 tracking-tight tabular-nums">{value}</div>
      <div className="mt-2 flex items-center gap-2 min-h-[22px]">
        {delta !== null && delta !== undefined && (
          <span className={`inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-md ${up ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50'}`}>
            {up ? <ArrowUp size={11} strokeWidth={3} /> : <ArrowDown size={11} strokeWidth={3} />}
            {Math.abs(delta).toFixed(1)}%
          </span>
        )}
        {delta !== null && delta !== undefined && compareYear && <span className="text-xs text-gray-400">vs. {compareYear}</span>}
        {hint && <span className="text-xs text-gray-500">{hint}</span>}
      </div>
    </Tag>
  );
};

const Panel: React.FC<{ title: string; subtitle?: string; className?: string; children: React.ReactNode }> = ({ title, subtitle, className = '', children }) => (
  <div className={`bg-white rounded-2xl border border-gray-200/80 p-6 ${className}`}>
    <div className="mb-5">
      <h3 className="font-semibold text-gray-900">{title}</h3>
      {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
    </div>
    {children}
  </div>
);

const ChartBox: React.FC<{ children: React.ReactElement; height?: string; empty?: boolean }> = ({ children, height = 'h-72', empty }) => (
  <div className={height}>
    {empty
      ? <div className="h-full flex items-center justify-center text-gray-300 text-sm">Sem dados no período</div>
      : <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>}
  </div>
);

const Pill: React.FC<{ label: string; value: string; children: (close: () => void) => React.ReactNode }> = ({ label, value, children }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)}
        className="pl-4 pr-3 py-2 rounded-full border border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm transition-all flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</span>
        <span className="text-sm font-semibold text-gray-900">{value}</span>
        <ChevronDown size={14} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-2 bg-white border border-gray-200 rounded-2xl shadow-xl z-50 animate-in fade-in zoom-in-95 duration-150 overflow-hidden">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
};

const Option: React.FC<{ active?: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button onClick={onClick}
    className={`w-full text-left px-3 py-2 rounded-lg text-sm whitespace-nowrap flex items-center justify-between gap-4 ${active ? 'bg-gray-900 text-white font-semibold' : 'text-gray-700 hover:bg-gray-50'}`}>
    {children}
    {active && <Check size={13} strokeWidth={3} />}
  </button>
);
