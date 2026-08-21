import React, { useMemo, useState } from 'react';
import { FinancialRecord, Company, ChartOfAccount } from '../types';
import * as XLSX from 'xlsx';
import { DateRangeFilter } from './DateRangeFilter';
import { RecordsDrillModal } from './RecordsDrillModal';
import {
  Download, Wallet, AlertTriangle, CalendarClock, CheckCircle2,
  ChevronLeft, ChevronRight, Search, List,
} from 'lucide-react';

interface PayablesReportProps {
  records: FinancialRecord[];
  companies: Company[];
  chartOfAccounts: ChartOfAccount[];
}

/** Três recortes sintéticos + o analítico, linha a linha. */
type View = 'RUBRIC' | 'SUPPLIER' | 'MONTH' | 'ENTRIES';

const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const brl0 = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v || 0);
const todayISO = () => new Date().toISOString().slice(0, 10);
const fmtDate = (iso?: string) => {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};
const MONTH_ABBR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const monthLabel = (mk: string) => {
  const [y, m] = mk.split('-').map(Number);
  return `${MONTH_ABBR[m - 1]}/${String(y).slice(2)}`;
};

const addDaysISO = (iso: string, days: number) => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b.slice(0, 10) + 'T00:00:00Z').getTime() - new Date(a.slice(0, 10) + 'T00:00:00Z').getTime()) / 86400000);

/** Primeiro e último dia do mês de uma data. */
const monthRange = (iso: string) => {
  const [y, m] = iso.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${iso.slice(0, 7)}-01`, to: `${iso.slice(0, 7)}-${String(last).padStart(2, '0')}` };
};

const VIEWS: { key: View; label: string }[] = [
  { key: 'RUBRIC', label: 'Por rubrica' },
  { key: 'SUPPLIER', label: 'Por fornecedor' },
  { key: 'MONTH', label: 'Por mês' },
  { key: 'ENTRIES', label: 'Lançamentos' },
];

type Bucket = { vencido: number; aVencer: number; pago: number; qtd: number };
const emptyBucket = (): Bucket => ({ vencido: 0, aVencer: 0, pago: 0, qtd: 0 });
const bucketOpen = (b: Bucket) => b.vencido + b.aVencer;
const bucketTotal = (b: Bucket) => b.vencido + b.aVencer + b.pago;

/**
 * Contas a pagar em quatro recortes: por rubrica, fornecedor ou mês para
 * enxergar o tamanho de cada bolo, e Lançamentos para conferir conta a conta.
 * O período abre no mês corrente e anda com as setas, um intervalo por vez.
 */
export const PayablesReport: React.FC<PayablesReportProps> = ({ records, companies, chartOfAccounts }) => {
  const [view, setView] = useState<View>('RUBRIC');
  const initial = monthRange(todayISO());
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [includePaid, setIncludePaid] = useState(true);
  const [search, setSearch] = useState('');
  /** Linha sintética aberta no detalhe. */
  const [drill, setDrill] = useState<{ title: string; records: FinancialRecord[]; total: number } | null>(null);

  const today = todayISO();
  const supplierName = (id?: string) => companies.find(c => c.id === id)?.name || 'Sem fornecedor';
  const rubricOf = (r: FinancialRecord) =>
    chartOfAccounts.find(c => c.id === r.rubricId)?.rubricName || r.category || 'A CLASSIFICAR';

  /** Anda o período inteiro para trás/frente, preservando o tamanho da janela. */
  const shiftPeriod = (dir: -1 | 1) => {
    if (!from || !to) return;
    const len = daysBetween(from, to) + 1;
    setFrom(addDaysISO(from, dir * len));
    setTo(addDaysISO(to, dir * len));
  };
  const setMonth = (iso: string) => { const r = monthRange(iso); setFrom(r.from); setTo(r.to); };

  /** Contas do período, já filtradas — base das duas visões. */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    // Despesa é o valor negativo; needsValidation fica de fora, como no DRE.
    return records
      .filter(r => r.amount < 0 && !r.needsValidation && r.dueDate
        && (!from || r.dueDate >= from)
        && (!to || r.dueDate <= to)
        && (includePaid || (r.status as string) !== 'Pago'))
      .filter(r => !q
        || (r.description || '').toLowerCase().includes(q)
        || supplierName(r.companyId).toLowerCase().includes(q)
        || rubricOf(r).toLowerCase().includes(q))
      .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
  }, [records, companies, chartOfAccounts, from, to, includePaid, search]);

  const statusOf = (r: FinancialRecord): 'PAGO' | 'VENCIDO' | 'A_VENCER' =>
    (r.status as string) === 'Pago' ? 'PAGO' : (r.dueDate || '') < today ? 'VENCIDO' : 'A_VENCER';

  const data = useMemo(() => {
    const keyOf = (r: FinancialRecord) =>
      view === 'SUPPLIER' ? supplierName(r.companyId)
        : view === 'MONTH' ? (r.dueDate || '').slice(0, 7)
          : rubricOf(r);

    const map = new Map<string, Bucket>();
    // Os lançamentos de cada linha, para o clique abrir o detalhe.
    const porLinha = new Map<string, FinancialRecord[]>();
    for (const r of filtered) {
      const k = keyOf(r);
      if (!map.has(k)) map.set(k, emptyBucket());
      if (!porLinha.has(k)) porLinha.set(k, []);
      porLinha.get(k)!.push(r);
      const b = map.get(k)!;
      const v = Math.abs(r.amount || 0);
      const st = statusOf(r);
      if (st === 'PAGO') b.pago += v; else if (st === 'VENCIDO') b.vencido += v; else b.aVencer += v;
      b.qtd += 1;
    }

    const rows = Array.from(map.entries())
      .map(([key, b]) => ({ key, label: view === 'MONTH' ? monthLabel(key) : key, b, records: porLinha.get(key) || [] }))
      .filter(r => bucketTotal(r.b) > 0.005)
      .sort((a, b) => view === 'MONTH'
        ? a.key.localeCompare(b.key)
        : bucketTotal(b.b) - bucketTotal(a.b));

    const total = emptyBucket();
    rows.forEach(r => {
      total.vencido += r.b.vencido; total.aVencer += r.b.aVencer;
      total.pago += r.b.pago; total.qtd += r.b.qtd;
    });

    // Vence nos próximos 7 dias — o número que decide o caixa da semana.
    const in7 = filtered
      .filter(r => statusOf(r) === 'A_VENCER' && daysBetween(today, r.dueDate) <= 7)
      .reduce((s, r) => s + Math.abs(r.amount || 0), 0);

    return { rows, total, in7 };
  }, [filtered, view, today]);

  const exportXlsx = () => {
    let head: any[]; let body: any[][]; let foot: any[];
    if (view === 'ENTRIES') {
      head = ['Vencimento', 'Pagamento', 'Descrição', 'Fornecedor', 'Rubrica', 'Situação', 'Valor', 'A pagar'];
      body = filtered.map(r => {
        const st = statusOf(r);
        const v = Math.abs(r.amount || 0);
        return [
          fmtDate(r.dueDate), fmtDate(r.paymentDate), r.description || '',
          supplierName(r.companyId), rubricOf(r),
          st === 'PAGO' ? 'Pago' : st === 'VENCIDO' ? 'Vencido' : 'A vencer',
          v, st === 'PAGO' ? 0 : v,
        ];
      });
      foot = ['TOTAL', '', '', '', '', '',
        filtered.reduce((s, r) => s + Math.abs(r.amount || 0), 0),
        filtered.filter(r => statusOf(r) !== 'PAGO').reduce((s, r) => s + Math.abs(r.amount || 0), 0)];
    } else {
      const label = VIEWS.find(v => v.key === view)!.label;
      head = [label.replace('Por ', '').replace(/^./, c => c.toUpperCase()), 'Vencido', 'A vencer', 'Em aberto', 'Pago', 'Total', 'Lançamentos'];
      body = data.rows.map(r => [r.label, r.b.vencido, r.b.aVencer, bucketOpen(r.b), r.b.pago, bucketTotal(r.b), r.b.qtd]);
      foot = ['TOTAL', data.total.vencido, data.total.aVencer, bucketOpen(data.total), data.total.pago, bucketTotal(data.total), data.total.qtd];
    }
    const periodo = [['Período', from ? fmtDate(from) : 'início', 'até', to ? fmtDate(to) : 'fim'], []];
    const ws = XLSX.utils.aoa_to_sheet([...periodo, head, ...body, [], foot]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Contas a Pagar');
    XLSX.writeFile(wb, `ContasAPagar_${view.toLowerCase()}_${today}.xlsx`);
  };

  const periodLabel = from && to
    ? `${fmtDate(from)} até ${fmtDate(to)}`
    : from ? `a partir de ${fmtDate(from)}`
      : to ? `até ${fmtDate(to)}` : 'todo o período';

  return (
    <div className="space-y-5">
      {/* Indicadores */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-gray-100 rounded-2xl overflow-hidden border border-gray-100">
        <Kpi label="Vencido" value={brl0(data.total.vencido)} hint="não pago, já venceu" icon={<AlertTriangle size={14} />} tone="text-red-600" />
        <Kpi label="Vence em 7 dias" value={brl0(data.in7)} hint="caixa da semana" icon={<CalendarClock size={14} />} tone="text-amber-600" />
        <Kpi label="Em aberto" value={brl0(bucketOpen(data.total))} hint="vencido + a vencer" icon={<Wallet size={14} />} tone="text-gray-800" />
        <Kpi label="Pago" value={brl0(data.total.pago)} hint="no período filtrado" icon={<CheckCircle2 size={14} />} tone="text-green-600" />
      </div>

      {/* Período */}
      <div className="bg-white rounded-2xl border border-gray-200/80 px-5 py-4 flex flex-wrap items-center gap-3">
        <DateRangeFilter value={{ from, to }} onChange={r => { setFrom(r.from); setTo(r.to); }} label="Vencimento" />

        <div className="flex gap-1.5 text-sm">
          <button onClick={() => setMonth(today)} className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">Mês atual</button>
          <button onClick={() => { setFrom(today); setTo(addDaysISO(today, 30)); }} className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">Próximos 30 dias</button>
          <button onClick={() => { setFrom(''); setTo(''); }} className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">Tudo</button>
        </div>

        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar descrição, fornecedor ou rubrica..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-mcsystem-500" />
        </div>
      </div>

      {/* Visões */}
      <div className="bg-white rounded-2xl border border-gray-200/80 px-5 py-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-2">
          {VIEWS.map(v => (
            <button
              key={v.key} onClick={() => setView(v.key)}
              className={`px-3.5 py-2 rounded-xl text-sm font-semibold border transition-all flex items-center gap-1.5 ${
                view === v.key ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {v.key === 'ENTRIES' && <List size={14} />}{v.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={includePaid} onChange={e => setIncludePaid(e.target.checked)}
            className="rounded border-gray-300 text-mcsystem-600 focus:ring-mcsystem-500" />
          Incluir pagos
        </label>
        <span className="text-xs text-gray-400">Vencimento em {periodLabel}.</span>
        <button onClick={exportXlsx} disabled={filtered.length === 0}
          className="ml-auto px-3.5 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50">
          <Download size={15} /> Excel
        </button>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-2xl border border-gray-200/80 overflow-hidden">
        {filtered.length === 0 ? (
          <p className="py-16 text-center text-gray-400">Nenhuma conta a pagar neste recorte.</p>
        ) : view === 'ENTRIES' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 uppercase text-[11px] tracking-wider">
                  <th className="px-5 py-3 text-left font-semibold">Vencimento</th>
                  <th className="px-4 py-3 text-left font-semibold">Pagamento</th>
                  <th className="px-4 py-3 text-left font-semibold">Lançamento</th>
                  <th className="px-4 py-3 text-center font-semibold">Situação</th>
                  <th className="px-4 py-3 text-right font-semibold">Valor</th>
                  <th className="px-5 py-3 text-right font-semibold">A pagar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(r => {
                  const st = statusOf(r);
                  const v = Math.abs(r.amount || 0);
                  return (
                    <tr key={r.id} className="hover:bg-gray-50/70">
                      <td className={`px-5 py-3 whitespace-nowrap ${st === 'VENCIDO' ? 'text-red-600 font-medium' : 'text-gray-700'}`}>{fmtDate(r.dueDate)}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-500">{fmtDate(r.paymentDate)}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-800">{r.description || 'Despesa'}</div>
                        <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-2 flex-wrap">
                          <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{rubricOf(r)}</span>
                          {r.companyId && <span>{supplierName(r.companyId)}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <span className={`inline-block text-[11px] font-semibold px-2 py-1 rounded-full ${
                          st === 'PAGO' ? 'bg-green-50 text-green-700'
                            : st === 'VENCIDO' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
                        }`}>
                          {st === 'PAGO' ? 'Pago' : st === 'VENCIDO' ? 'Vencido' : 'A vencer'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700">{brl(v)}</td>
                      <td className={`px-5 py-3 text-right tabular-nums font-semibold ${st === 'PAGO' ? 'text-gray-300' : 'text-gray-900'}`}>
                        {st === 'PAGO' ? '—' : brl(v)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-bold text-gray-900">
                  <td colSpan={4} className="px-5 py-3.5">{filtered.length} lançamento(s)</td>
                  <td className="px-4 py-3.5 text-right tabular-nums">{brl(bucketTotal(data.total))}</td>
                  <td className="px-5 py-3.5 text-right tabular-nums">{brl(bucketOpen(data.total))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 uppercase text-[11px] tracking-wider">
                  <th className="px-6 py-3 text-left font-semibold">{VIEWS.find(v => v.key === view)!.label.replace('Por ', '')}</th>
                  <th className="px-4 py-3 text-right font-semibold">Vencido</th>
                  <th className="px-4 py-3 text-right font-semibold">A vencer</th>
                  <th className="px-4 py-3 text-right font-semibold">Em aberto</th>
                  <th className="px-4 py-3 text-right font-semibold">Pago</th>
                  <th className="px-6 py-3 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.rows.map(r => (
                  <tr key={r.key} className="hover:bg-gray-50/70 cursor-pointer"
                      title="Ver os lançamentos desta linha"
                      onClick={() => setDrill({ title: r.label, records: r.records, total: -bucketTotal(r.b) })}>
                    <td className="px-6 py-3">
                      <span className="font-medium text-gray-800 hover:text-mcsystem-600">{r.label}</span>
                      <span className="text-gray-400 text-xs ml-2">{r.b.qtd} lanç.</span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-red-600">{r.b.vencido ? brl(r.b.vencido) : <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-amber-700">{r.b.aVencer ? brl(r.b.aVencer) : <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-800">{bucketOpen(r.b) ? brl(bucketOpen(r.b)) : <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-green-600">{r.b.pago ? brl(r.b.pago) : <span className="text-gray-300">—</span>}</td>
                    <td className="px-6 py-3 text-right tabular-nums font-semibold text-gray-900">{brl(bucketTotal(r.b))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-bold text-gray-900">
                  <td className="px-6 py-3.5">{data.rows.length} linha(s) · {data.total.qtd} lanç.</td>
                  <td className="px-4 py-3.5 text-right tabular-nums text-red-600">{brl(data.total.vencido)}</td>
                  <td className="px-4 py-3.5 text-right tabular-nums text-amber-700">{brl(data.total.aVencer)}</td>
                  <td className="px-4 py-3.5 text-right tabular-nums">{brl(bucketOpen(data.total))}</td>
                  <td className="px-4 py-3.5 text-right tabular-nums text-green-600">{brl(data.total.pago)}</td>
                  <td className="px-6 py-3.5 text-right tabular-nums">{brl(bucketTotal(data.total))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <RecordsDrillModal
        open={!!drill}
        onClose={() => setDrill(null)}
        title={drill?.title || ''}
        subtitle={`${from ? fmtDate(from) : 'início'} a ${to ? fmtDate(to) : 'fim'}`}
        records={drill?.records || []}
        expectedTotal={drill?.total}
        companies={companies}
        chartOfAccounts={chartOfAccounts}
      />
    </div>
  );
};

const Kpi: React.FC<{ label: string; value: string; hint: string; icon: React.ReactNode; tone: string }> = ({ label, value, hint, icon, tone }) => (
  <div className="bg-white px-5 py-4">
    <div className={`text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5 ${tone}`}>
      {icon}{label}
    </div>
    <div className="mt-1.5 text-xl font-bold text-gray-900 tabular-nums">{value}</div>
    <div className="mt-0.5 text-xs text-gray-400">{hint}</div>
  </div>
);
