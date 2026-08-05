import React, { useMemo, useState } from 'react';
import { FinancialRecord, Company, ChartOfAccount } from '../types';
import * as XLSX from 'xlsx';
import { Download, Wallet, AlertTriangle, CalendarClock, CheckCircle2 } from 'lucide-react';

interface PayablesReportProps {
  records: FinancialRecord[];
  companies: Company[];
  chartOfAccounts: ChartOfAccount[];
}

type GroupBy = 'RUBRIC' | 'SUPPLIER' | 'MONTH';

const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const brl0 = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v || 0);
const todayISO = () => new Date().toISOString().slice(0, 10);
const MONTH_ABBR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const monthLabel = (mk: string) => {
  const [y, m] = mk.split('-').map(Number);
  return `${MONTH_ABBR[m - 1]}/${String(y).slice(2)}`;
};

const GROUPS: { key: GroupBy; label: string }[] = [
  { key: 'RUBRIC', label: 'Por rubrica' },
  { key: 'SUPPLIER', label: 'Por fornecedor' },
  { key: 'MONTH', label: 'Por mês' },
];

type Bucket = { vencido: number; aVencer: number; pago: number; qtd: number };
const emptyBucket = (): Bucket => ({ vencido: 0, aVencer: 0, pago: 0, qtd: 0 });
const bucketOpen = (b: Bucket) => b.vencido + b.aVencer;
const bucketTotal = (b: Bucket) => b.vencido + b.aVencer + b.pago;

/**
 * Visão sintética do contas a pagar: quanto se deve, agrupado por rubrica,
 * fornecedor ou mês. A conta individual fica na tela de Contas a Pagar — aqui o
 * que interessa é o tamanho de cada bolo.
 */
export const PayablesReport: React.FC<PayablesReportProps> = ({ records, companies, chartOfAccounts }) => {
  const [groupBy, setGroupBy] = useState<GroupBy>('RUBRIC');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [includePaid, setIncludePaid] = useState(true);

  const today = todayISO();
  const supplierName = (id?: string) => companies.find(c => c.id === id)?.name || 'Sem fornecedor';
  const rubricOf = (r: FinancialRecord) =>
    chartOfAccounts.find(c => c.id === r.rubricId)?.rubricName || r.category || 'A CLASSIFICAR';

  const data = useMemo(() => {
    // Despesa é o valor negativo; needsValidation fica de fora, como no DRE.
    const base = records.filter(r =>
      r.amount < 0 && !r.needsValidation && r.dueDate
      && (!from || r.dueDate >= from)
      && (!to || r.dueDate <= to)
      && (includePaid || (r.status as string) !== 'Pago'));

    const keyOf = (r: FinancialRecord) =>
      groupBy === 'RUBRIC' ? rubricOf(r)
        : groupBy === 'SUPPLIER' ? supplierName(r.companyId)
          : (r.dueDate || '').slice(0, 7);

    const map = new Map<string, Bucket>();
    for (const r of base) {
      const k = keyOf(r);
      if (!map.has(k)) map.set(k, emptyBucket());
      const b = map.get(k)!;
      const v = Math.abs(r.amount || 0);
      if ((r.status as string) === 'Pago') b.pago += v;
      else if ((r.dueDate || '') < today) b.vencido += v;
      else b.aVencer += v;
      b.qtd += 1;
    }

    const rows = Array.from(map.entries())
      .map(([key, b]) => ({ key, label: groupBy === 'MONTH' ? monthLabel(key) : key, b }))
      .filter(r => bucketTotal(r.b) > 0.005)
      .sort((a, b) => groupBy === 'MONTH'
        ? a.key.localeCompare(b.key)
        : bucketTotal(b.b) - bucketTotal(a.b));

    const total = emptyBucket();
    rows.forEach(r => {
      total.vencido += r.b.vencido; total.aVencer += r.b.aVencer;
      total.pago += r.b.pago; total.qtd += r.b.qtd;
    });

    // Vence nos próximos 7 dias — o número que decide o caixa da semana.
    const in7 = base
      .filter(r => (r.status as string) !== 'Pago' && r.dueDate >= today
        && (new Date(r.dueDate + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000 <= 7)
      .reduce((s, r) => s + Math.abs(r.amount || 0), 0);

    return { rows, total, in7 };
  }, [records, companies, chartOfAccounts, groupBy, from, to, includePaid, today]);

  const exportXlsx = () => {
    const label = GROUPS.find(g => g.key === groupBy)!.label;
    const head = [label.replace('Por ', '').replace(/^./, c => c.toUpperCase()), 'Vencido', 'A vencer', 'Em aberto', 'Pago', 'Total', 'Lançamentos'];
    const body = data.rows.map(r => [
      r.label, r.b.vencido, r.b.aVencer, bucketOpen(r.b), r.b.pago, bucketTotal(r.b), r.b.qtd,
    ]);
    const foot = ['TOTAL', data.total.vencido, data.total.aVencer, bucketOpen(data.total), data.total.pago, bucketTotal(data.total), data.total.qtd];
    const ws = XLSX.utils.aoa_to_sheet([head, ...body, [], foot]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Contas a Pagar');
    XLSX.writeFile(wb, `ContasAPagar_${groupBy.toLowerCase()}_${today}.xlsx`);
  };

  return (
    <div className="space-y-5">
      {/* Indicadores */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-gray-100 rounded-2xl overflow-hidden border border-gray-100">
        <Kpi label="Vencido" value={brl0(data.total.vencido)} hint="não pago, já venceu" icon={<AlertTriangle size={14} />} tone="text-red-600" />
        <Kpi label="Vence em 7 dias" value={brl0(data.in7)} hint="caixa da semana" icon={<CalendarClock size={14} />} tone="text-amber-600" />
        <Kpi label="Em aberto" value={brl0(bucketOpen(data.total))} hint="vencido + a vencer" icon={<Wallet size={14} />} tone="text-gray-800" />
        <Kpi label="Pago" value={brl0(data.total.pago)} hint="no período filtrado" icon={<CheckCircle2 size={14} />} tone="text-green-600" />
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-2xl border border-gray-200/80 px-5 py-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-2">
          {GROUPS.map(g => (
            <button
              key={g.key} onClick={() => setGroupBy(g.key)}
              className={`px-3.5 py-2 rounded-xl text-sm font-semibold border transition-all ${
                groupBy === g.key ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span>Vencimento de</span>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-gray-200 outline-none focus:border-mcsystem-500" />
          <span>até</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-gray-200 outline-none focus:border-mcsystem-500" />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={includePaid} onChange={e => setIncludePaid(e.target.checked)}
            className="rounded border-gray-300 text-mcsystem-600 focus:ring-mcsystem-500" />
          Incluir pagos
        </label>
        <button onClick={exportXlsx} disabled={data.rows.length === 0}
          className="ml-auto px-3.5 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50">
          <Download size={15} /> Excel
        </button>
      </div>

      {/* Tabela sintética */}
      <div className="bg-white rounded-2xl border border-gray-200/80 overflow-hidden">
        {data.rows.length === 0 ? (
          <p className="py-16 text-center text-gray-400">Nenhuma conta a pagar neste recorte.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 uppercase text-[11px] tracking-wider">
                  <th className="px-6 py-3 text-left font-semibold">{GROUPS.find(g => g.key === groupBy)!.label.replace('Por ', '')}</th>
                  <th className="px-4 py-3 text-right font-semibold">Vencido</th>
                  <th className="px-4 py-3 text-right font-semibold">A vencer</th>
                  <th className="px-4 py-3 text-right font-semibold">Em aberto</th>
                  <th className="px-4 py-3 text-right font-semibold">Pago</th>
                  <th className="px-6 py-3 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.rows.map(r => (
                  <tr key={r.key} className="hover:bg-gray-50/70">
                    <td className="px-6 py-3">
                      <span className="font-medium text-gray-800">{r.label}</span>
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
