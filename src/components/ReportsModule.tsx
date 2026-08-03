import React, { useMemo, useState } from 'react';
import { FinancialRecord, Company, Product, TransactionType, TransactionStatus } from '../types';
import * as XLSX from 'xlsx';
import {
  Search, Download, AlertTriangle, CalendarClock, CheckCircle2, Layers,
  X, ChevronDown, Users, FileBarChart,
} from 'lucide-react';

interface ReportsModuleProps {
  records: FinancialRecord[];
  companies: Company[];
  products: Product[];
}

type View = 'OVERDUE' | 'UPCOMING' | 'PAID' | 'ALL';
type Flow = 'INCOME' | 'EXPENSE' | 'BOTH';

const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const fmtDate = (iso?: string) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');
const todayISO = () => new Date().toISOString().slice(0, 10);

/** Dias entre hoje e a data (negativo = já passou). */
const daysUntil = (iso?: string) => {
  if (!iso) return 0;
  const d = new Date(iso.slice(0, 10) + 'T00:00:00');
  const t = new Date(todayISO() + 'T00:00:00');
  return Math.round((d.getTime() - t.getTime()) / 86400000);
};

const VIEWS: { key: View; label: string; icon: React.ReactNode; tone: string }[] = [
  { key: 'OVERDUE', label: 'Em atraso', icon: <AlertTriangle size={15} />, tone: 'text-red-600' },
  { key: 'UPCOMING', label: 'A vencer', icon: <CalendarClock size={15} />, tone: 'text-amber-600' },
  { key: 'PAID', label: 'Pagos', icon: <CheckCircle2 size={15} />, tone: 'text-green-600' },
  { key: 'ALL', label: 'Todos', icon: <Layers size={15} />, tone: 'text-gray-600' },
];

/** Multi-seleção em pílula, com busca — usada para produtos e clientes. */
const MultiPicker: React.FC<{
  label: string;
  options: { value: string; label: string }[];
  selected: string[] | null; // null = todos
  onChange: (v: string[] | null) => void;
}> = ({ label, options, selected, onChange }) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const all = selected === null;
  const shown = options.filter(o => o.label.toLowerCase().includes(q.toLowerCase()));

  const toggle = (value: string) => {
    const base = selected ?? options.map(o => o.value);
    const next = base.includes(value) ? base.filter(v => v !== value) : [...base, value];
    onChange(next.length === options.length ? null : next);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`px-3 py-2 rounded-lg border text-sm flex items-center gap-2 transition-colors ${
          all ? 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50' : 'border-mcsystem-300 bg-mcsystem-50 text-mcsystem-700 font-medium'
        }`}
      >
        {label}{!all && <span className="bg-mcsystem-600 text-white rounded-full px-1.5 text-[10px]">{selected!.length}</span>}
        <ChevronDown size={14} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 w-64 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
            <div className="p-2 border-b border-gray-100">
              <input
                autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar..."
                className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:ring-1 focus:ring-mcsystem-400"
              />
            </div>
            <div className="flex justify-between px-3 py-1.5 border-b border-gray-100 text-xs">
              <button onClick={() => onChange(null)} className="text-mcsystem-600 font-medium hover:underline">Todos</button>
              <button onClick={() => onChange([])} className="text-gray-400 hover:text-gray-600">Limpar</button>
            </div>
            <div className="max-h-60 overflow-y-auto py-1">
              {shown.map(o => {
                const on = all || selected!.includes(o.value);
                return (
                  <label key={o.value} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" checked={on} onChange={() => toggle(o.value)}
                      className="rounded border-gray-300 text-mcsystem-600 focus:ring-mcsystem-500" />
                    <span className="truncate">{o.label}</span>
                  </label>
                );
              })}
              {shown.length === 0 && <p className="px-3 py-3 text-xs text-gray-400 text-center">Nada encontrado.</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export const ReportsModule: React.FC<ReportsModuleProps> = ({ records, companies, products }) => {
  const [view, setView] = useState<View>('OVERDUE');
  const [flow, setFlow] = useState<Flow>('INCOME');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selProducts, setSelProducts] = useState<string[] | null>(null);
  const [selClients, setSelClients] = useState<string[] | null>(null);
  const [search, setSearch] = useState('');
  const [groupByClient, setGroupByClient] = useState(false);

  const productName = (id?: string | null) => products.find(p => p.id === id)?.name;
  const clientName = (id?: string) => companies.find(c => c.id === id)?.name || 'Sem cliente';

  const productOptions = useMemo(
    () => [...products].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map(p => ({ value: p.id, label: p.name }))
      .concat([{ value: '__none__', label: 'Sem produto' }]),
    [products],
  );
  const clientOptions = useMemo(
    () => [...companies].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map(c => ({ value: c.id, label: c.name })),
    [companies],
  );

  /** Produtos do lançamento, respeitando o rateio. */
  const recordProducts = (r: FinancialRecord): string[] =>
    r.split_revenue?.length
      ? r.split_revenue.map(s => s.product_id || '__none__')
      : [r.product_id || '__none__'];

  /** Valor do lançamento dentro do filtro de produto (rateio conta só a fatia). */
  const valueUnderFilter = (r: FinancialRecord): number => {
    if (selProducts === null) return r.amount;
    if (r.split_revenue?.length) {
      return r.split_revenue
        .filter(s => selProducts.includes(s.product_id || '__none__'))
        .reduce((t, s) => t + s.amount, 0);
    }
    return selProducts.includes(r.product_id || '__none__') ? r.amount : 0;
  };

  const rows = useMemo(() => {
    const today = todayISO();
    return records
      .filter(r => {
        if (r.needsValidation) return false;
        // Aporte e afins entram no caixa, mas não são cobrança de ninguém.
        if (r.non_operating) return false;

        if (flow === 'INCOME' && r.type !== TransactionType.INCOME) return false;
        if (flow === 'EXPENSE' && r.type !== TransactionType.EXPENSE) return false;

        // A data que importa muda conforme a visão: pagos olham a baixa,
        // em aberto olham o vencimento.
        const refDate = view === 'PAID' ? (r.paymentDate || r.dueDate) : r.dueDate;
        if (from && (!refDate || refDate < from)) return false;
        if (to && (!refDate || refDate > to)) return false;

        const paid = r.status === TransactionStatus.PAID;
        if (view === 'PAID' && !paid) return false;
        if (view === 'OVERDUE' && (paid || !r.dueDate || r.dueDate >= today)) return false;
        if (view === 'UPCOMING' && (paid || !r.dueDate || r.dueDate < today)) return false;

        if (selClients !== null && !selClients.includes(r.companyId || '')) return false;
        if (selProducts !== null && !recordProducts(r).some(p => selProducts.includes(p))) return false;

        if (search) {
          const q = search.toLowerCase();
          const hit = (r.description || '').toLowerCase().includes(q)
            || clientName(r.companyId).toLowerCase().includes(q)
            || recordProducts(r).some(p => (productName(p) || '').toLowerCase().includes(q));
          if (!hit) return false;
        }
        return true;
      })
      .map(r => ({ record: r, value: valueUnderFilter(r) }))
      .filter(x => x.value !== 0)
      .sort((a, b) => {
        const ka = view === 'PAID' ? (a.record.paymentDate || a.record.dueDate) : a.record.dueDate;
        const kb = view === 'PAID' ? (b.record.paymentDate || b.record.dueDate) : b.record.dueDate;
        // Atrasado: o mais velho primeiro. Pago: o mais recente primeiro.
        return view === 'PAID' ? (kb || '').localeCompare(ka || '') : (ka || '').localeCompare(kb || '');
      });
  }, [records, view, flow, from, to, selProducts, selClients, search, products, companies]);

  const totals = useMemo(() => {
    const total = rows.reduce((s, x) => s + x.value, 0);
    const clients = new Set(rows.map(x => x.record.companyId).filter(Boolean));
    const overdueDays = rows
      .filter(x => x.record.status !== TransactionStatus.PAID && x.record.dueDate < todayISO())
      .map(x => -daysUntil(x.record.dueDate));
    const avgLate = overdueDays.length ? overdueDays.reduce((a, b) => a + b, 0) / overdueDays.length : 0;
    return { total, count: rows.length, clients: clients.size, avgLate };
  }, [rows]);

  /** Agrupamento por cliente — para cobrar quem deve mais, não item a item. */
  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; total: number; count: number; oldest: string }>();
    rows.forEach(({ record, value }) => {
      const key = record.companyId || '__none__';
      const cur = map.get(key) || { name: clientName(record.companyId), total: 0, count: 0, oldest: record.dueDate };
      cur.total += value;
      cur.count += 1;
      if ((record.dueDate || '') < (cur.oldest || '')) cur.oldest = record.dueDate;
      map.set(key, cur);
    });
    return [...map.values()].sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  }, [rows, companies]);

  const exportXlsx = () => {
    const head = ['Cliente', 'Produto', 'Descrição', 'Vencimento', 'Pagamento', 'Status', 'Valor', 'Dias em atraso'];
    const body = rows.map(({ record: r, value }) => {
      const late = r.status !== TransactionStatus.PAID && r.dueDate < todayISO() ? -daysUntil(r.dueDate) : '';
      return [
        clientName(r.companyId),
        recordProducts(r).map(p => productName(p) || 'Sem produto').join(' + '),
        r.description || '',
        fmtDate(r.dueDate),
        fmtDate(r.paymentDate),
        r.status,
        value,
        late,
      ];
    });
    const ws = XLSX.utils.aoa_to_sheet([head, ...body, [], ['TOTAL', '', '', '', '', '', totals.total, '']]);
    const wb = XLSX.utils.book_new();
    const label = VIEWS.find(v => v.key === view)!.label;
    XLSX.utils.book_append_sheet(wb, ws, label.slice(0, 28));
    XLSX.writeFile(wb, `Relatorio_${label.replace(/\s/g, '')}_${todayISO()}.xlsx`);
  };

  const clearFilters = () => {
    setFrom(''); setTo(''); setSelProducts(null); setSelClients(null); setSearch('');
  };
  const hasFilters = !!(from || to || selProducts || selClients || search);

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <div className="bg-white p-6 rounded-2xl border border-gray-200/80 flex items-start gap-4">
        <div className="bg-gray-900 p-3 rounded-xl text-white"><FileBarChart size={26} /></div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Relatórios</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Quem está em atraso, o que vence adiante e o que já foi pago — com filtros de período e produto.
          </p>
        </div>
      </div>

      {/* Visões */}
      <div className="flex flex-wrap gap-2">
        {VIEWS.map(v => (
          <button
            key={v.key} onClick={() => setView(v.key)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 border transition-all ${
              view === v.key
                ? 'bg-gray-900 text-white border-gray-900 shadow-sm'
                : `bg-white border-gray-200 hover:bg-gray-50 ${v.tone}`
            }`}
          >
            {v.icon} {v.label}
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-2xl border border-gray-200/80 p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por cliente, produto ou descrição..."
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-1 focus:ring-mcsystem-400"
          />
        </div>

        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-500 whitespace-nowrap">
            {view === 'PAID' ? 'Pago de' : 'Vence de'}
          </span>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="px-2.5 py-2 border border-gray-200 rounded-lg text-sm" />
          <span className="text-gray-500">até</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="px-2.5 py-2 border border-gray-200 rounded-lg text-sm" />
        </div>

        <MultiPicker label="Produtos" options={productOptions} selected={selProducts} onChange={setSelProducts} />
        <MultiPicker label="Clientes" options={clientOptions} selected={selClients} onChange={setSelClients} />

        <select value={flow} onChange={e => setFlow(e.target.value as Flow)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-gray-600">
          <option value="INCOME">Receitas</option>
          <option value="EXPENSE">Despesas</option>
          <option value="BOTH">Receitas e despesas</option>
        </select>

        <button
          onClick={() => setGroupByClient(g => !g)}
          className={`px-3 py-2 rounded-lg border text-sm flex items-center gap-2 transition-colors ${
            groupByClient ? 'border-mcsystem-300 bg-mcsystem-50 text-mcsystem-700 font-medium' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          <Users size={14} /> Por cliente
        </button>

        {hasFilters && (
          <button onClick={clearFilters} className="px-3 py-2 text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1.5">
            <X size={14} /> Limpar
          </button>
        )}

        <button
          onClick={exportXlsx} disabled={rows.length === 0}
          className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-semibold flex items-center gap-2 hover:bg-gray-800 disabled:opacity-40 ml-auto"
        >
          <Download size={15} /> Exportar
        </button>
      </div>

      {/* Totais */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200/80 p-4">
          <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Total</p>
          <p className={`text-2xl font-bold mt-1 ${totals.total < 0 ? 'text-red-600' : 'text-gray-900'}`}>{brl(totals.total)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200/80 p-4">
          <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Lançamentos</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{totals.count}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200/80 p-4">
          <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Clientes</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{totals.clients}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200/80 p-4">
          <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">
            {view === 'PAID' ? 'Ticket médio' : 'Atraso médio'}
          </p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {view === 'PAID'
              ? brl(totals.count ? totals.total / totals.count : 0)
              : `${Math.round(totals.avgLate)} ${Math.round(totals.avgLate) === 1 ? 'dia' : 'dias'}`}
          </p>
        </div>
      </div>

      {/* Resultado */}
      <div className="bg-white rounded-2xl border border-gray-200/80 overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-10 text-center text-gray-400 text-sm">Nenhum lançamento com esses filtros.</p>
        ) : groupByClient ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold">Cliente</th>
                  <th className="text-center px-5 py-3 font-semibold">Lançamentos</th>
                  <th className="text-left px-5 py-3 font-semibold">Mais antigo</th>
                  <th className="text-right px-5 py-3 font-semibold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {grouped.map((g, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-semibold text-gray-900">{g.name}</td>
                    <td className="px-5 py-3 text-center text-gray-500">{g.count}</td>
                    <td className="px-5 py-3 text-gray-500">{fmtDate(g.oldest)}</td>
                    <td className={`px-5 py-3 text-right font-bold tabular-nums ${g.total < 0 ? 'text-red-600' : 'text-gray-900'}`}>{brl(g.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold">Cliente</th>
                  <th className="text-left px-5 py-3 font-semibold">Produto</th>
                  <th className="text-left px-5 py-3 font-semibold">Descrição</th>
                  <th className="text-left px-5 py-3 font-semibold whitespace-nowrap">Vencimento</th>
                  {view === 'PAID' && <th className="text-left px-5 py-3 font-semibold whitespace-nowrap">Pagamento</th>}
                  {view !== 'PAID' && <th className="text-center px-5 py-3 font-semibold whitespace-nowrap">Prazo</th>}
                  <th className="text-right px-5 py-3 font-semibold">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(({ record: r, value }) => {
                  const d = daysUntil(r.dueDate);
                  const late = r.status !== TransactionStatus.PAID && d < 0;
                  return (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 font-medium text-gray-900">{clientName(r.companyId)}</td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap gap-1">
                          {recordProducts(r).map((p, i) => (
                            <span key={i} className="bg-mcsystem-50 text-mcsystem-700 px-1.5 py-0.5 rounded text-xs whitespace-nowrap">
                              {productName(p) || 'Sem produto'}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-gray-500 max-w-xs truncate" title={r.description}>{r.description}</td>
                      <td className="px-5 py-3 text-gray-600 whitespace-nowrap">{fmtDate(r.dueDate)}</td>
                      {view === 'PAID' && <td className="px-5 py-3 text-gray-600 whitespace-nowrap">{fmtDate(r.paymentDate)}</td>}
                      {view !== 'PAID' && (
                        <td className="px-5 py-3 text-center whitespace-nowrap">
                          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                            late ? 'bg-red-50 text-red-600' : d <= 7 ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500'
                          }`}>
                            {late ? `${-d} ${-d === 1 ? 'dia' : 'dias'} em atraso` : d === 0 ? 'vence hoje' : `em ${d} ${d === 1 ? 'dia' : 'dias'}`}
                          </span>
                        </td>
                      )}
                      <td className={`px-5 py-3 text-right font-semibold tabular-nums ${value < 0 ? 'text-red-600' : 'text-gray-900'}`}>{brl(value)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 border-t-2 border-gray-200">
                  <td colSpan={view === 'PAID' ? 5 : 5} className="px-5 py-3 text-right text-xs uppercase tracking-wider font-bold text-gray-500">Total</td>
                  <td className={`px-5 py-3 text-right font-bold tabular-nums ${totals.total < 0 ? 'text-red-600' : 'text-gray-900'}`}>{brl(totals.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
