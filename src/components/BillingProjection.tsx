import React, { useMemo, useState } from 'react';
import { Company, FinancialRecord, Product, Subscription } from '../types';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts';
import { ChevronDown, ChevronRight, TrendingUp, X, Users } from 'lucide-react';
import { cycleStep, monthlyFactor } from '../lib/cycles';

interface BillingProjectionProps {
  /** Cobranças do Asaas (registros com asaas_payment_id). */
  charges: FinancialRecord[];
  subscriptions: Subscription[];
  products: Product[];
  companies: Company[];
}

/** Uma parcela de receita atribuída a produto, mês e cliente — base do drill-down. */
type Contrib = { pid: string; mk: string; cid: string; field: keyof Cell; amount: number };

const MONTH_ABBR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const NO_PRODUCT = 'Sem produto';

// Estados do recebimento — paleta validada (CVD-safe sobre fundo claro).
const TONE = { recebido: '#2a9d8f', aberto: '#d03b3b', previsto: '#2a78d6' };
const INK = { secondary: '#6b7280', muted: '#9ca3af', grid: '#eef0f3' };

const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const brl0 = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v || 0);
const short = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(1)} mi`;
  if (a >= 1_000) return `${(v / 1_000).toFixed(0)} mil`;
  return String(Math.round(v));
};

const todayISO = () => new Date().toISOString().slice(0, 10);

const shiftMonth = (key: string, n: number) => {
  const [y, m] = key.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
};
const monthLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  return `${MONTH_ABBR[m - 1]}/${String(y).slice(2)}`;
};

const addDays = (iso: string, days: number) => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
/** Anda meses preservando o dia — 31/jan + 1 mês vira 28/fev, como no Asaas. */
const addMonths = (iso: string, months: number) => {
  const d = new Date(iso + 'T00:00:00Z');
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d.toISOString().slice(0, 10);
};

type Cell = { recebido: number; aberto: number; previsto: number };
const emptyCell = (): Cell => ({ recebido: 0, aberto: 0, previsto: 0 });
const cellTotal = (c: Cell) => c.recebido + c.aberto + c.previsto;
const addCell = (a: Cell, b: Cell) => {
  a.recebido += b.recebido; a.aberto += b.aberto; a.previsto += b.previsto;
};

/** Fatias por produto de uma cobrança — respeita o rateio quando existe. */
const splitCharge = (r: FinancialRecord) =>
  r.split_revenue?.length
    ? r.split_revenue.map(s => ({ pid: s.product_id || '', amount: s.amount || 0 }))
    : [{ pid: r.product_id || '', amount: r.amount || 0 }];

/** Fatias por produto de uma assinatura — o rateio é guardado em %. */
const splitSubscription = (s: Subscription) =>
  s.split_products?.length
    ? s.split_products.map(sp => ({ pid: sp.product_id || '', amount: (s.value || 0) * sp.pct / 100 }))
    : [{ pid: s.product_id || '', amount: s.value || 0 }];

/**
 * Recebimentos por mês e por produto: passado a partir das cobranças emitidas,
 * futuro somando as cobranças já emitidas com as renovações projetadas das
 * assinaturas ativas (sem contar duas vezes o mês que já tem cobrança gerada).
 */
export const BillingProjection: React.FC<BillingProjectionProps> = ({ charges, subscriptions, products, companies }) => {
  const [open, setOpen] = useState(true);
  // Janela curta por padrão: 13 colunas obrigavam a rolar de lado para ler
  // qualquer coisa. O histórico longo continua a um clique.
  const [back, setBack] = useState(3);
  const [fwd, setFwd] = useState(6);
  /** A matriz produto × mês é o bloco mais pesado — fica sob demanda. */
  const [showMatrix, setShowMatrix] = useState(true);
  /** Produto (e mês, quando vem de uma célula) aberto no drill-down. */
  const [drill, setDrill] = useState<{ pid: string; name: string; mk?: string } | null>(null);

  const today = todayISO();
  const curMonth = today.slice(0, 7);
  const productName = (id?: string) => products.find(p => p.id === id)?.name || NO_PRODUCT;
  const clientName = (id?: string) => companies.find(c => c.id === id)?.name || 'Sem cliente';

  const data = useMemo(() => {
    const months = Array.from({ length: back + fwd + 1 }, (_, i) => shiftMonth(curMonth, i - back));
    const first = months[0];
    const last = months[months.length - 1];

    const byProduct = new Map<string, Map<string, Cell>>();
    const contribs: Contrib[] = [];
    const bump = (pid: string, mk: string, field: keyof Cell, value: number, cid: string) => {
      if (!value) return;
      if (!byProduct.has(pid)) byProduct.set(pid, new Map());
      const row = byProduct.get(pid)!;
      if (!row.has(mk)) row.set(mk, emptyCell());
      row.get(mk)![field] += value;
      contribs.push({ pid, mk, cid, field, amount: value });
    };

    // Cobranças já emitidas. Guarda quantas existem por assinatura/mês para a
    // projeção não duplicar o que o Asaas já gerou.
    const issued = new Map<string, Map<string, number>>();
    for (const r of charges) {
      if (!r.dueDate) continue;
      const mk = r.dueDate.slice(0, 7);
      if (r.asaas_subscription_id) {
        if (!issued.has(r.asaas_subscription_id)) issued.set(r.asaas_subscription_id, new Map());
        const m = issued.get(r.asaas_subscription_id)!;
        m.set(mk, (m.get(mk) || 0) + 1);
      }
      if (mk < first || mk > last) continue;
      const field: keyof Cell = (r.status as string) === 'Pago'
        ? 'recebido'
        : (r.dueDate <= today ? 'aberto' : 'previsto');
      for (const s of splitCharge(r)) bump(s.pid, mk, field, s.amount, r.companyId || '');
    }

    // Renovações futuras das assinaturas ativas. O passado nunca é projetado —
    // lá vale só o que foi efetivamente cobrado.
    for (const sub of subscriptions) {
      if ((sub.status || 'ACTIVE').toUpperCase() !== 'ACTIVE') continue;
      const step = cycleStep(sub.cycle);
      const pending = new Map(issued.get(sub.asaas_id || '') || []);
      const slices = splitSubscription(sub);
      // Assinatura com prazo (3x, 12x...) para de gerar receita na última
      // cobrança. Sem isso ela apareceria rendendo até o fim da janela.
      const stop = sub.end_date?.slice(0, 10) || null;
      let d = sub.next_due_date?.slice(0, 10) || today;
      for (let i = 0; i < 400; i++) {
        if (stop && d > stop) break;
        const mk = d.slice(0, 7);
        if (mk > last) break;
        if (mk >= curMonth) {
          const already = pending.get(mk) || 0;
          if (already > 0) pending.set(mk, already - 1);
          else for (const s of slices) bump(s.pid, mk, 'previsto', s.amount, sub.client_id || '');
        }
        d = step.days ? addDays(d, step.days) : addMonths(d, step.months!);
      }
    }

    const rows = Array.from(byProduct.entries())
      .map(([pid, cells]) => {
        const total = emptyCell();
        cells.forEach(c => addCell(total, c));
        return { pid, name: productName(pid), cells, total };
      })
      .filter(r => cellTotal(r.total) > 0.005)
      .sort((a, b) => cellTotal(b.total) - cellTotal(a.total));

    const columnTotals = months.map(mk => {
      const t = emptyCell();
      rows.forEach(r => { const c = r.cells.get(mk); if (c) addCell(t, c); });
      return t;
    });
    const grand = emptyCell();
    columnTotals.forEach(c => addCell(grand, c));

    const chart = months.map((mk, i) => ({
      mk,
      label: monthLabel(mk),
      Recebido: columnTotals[i].recebido,
      'Em aberto': columnTotals[i].aberto,
      Previsto: columnTotals[i].previsto,
    }));

    const mrr = subscriptions
      .filter(s => (s.status || 'ACTIVE').toUpperCase() === 'ACTIVE')
      .reduce((sum, s) => sum + (s.value || 0) * monthlyFactor(s.cycle), 0);

    const futureTotal = months
      .filter(mk => mk > curMonth)
      .reduce((sum, mk) => sum + cellTotal(columnTotals[months.indexOf(mk)]), 0);

    return { months, rows, columnTotals, grand, chart, mrr, futureTotal, contribs };
  }, [charges, subscriptions, products, back, fwd, curMonth, today]);

  const { months, rows, columnTotals, grand, chart } = data;

  /** Clientes por trás de um produto (opcionalmente de um mês só). */
  const drillRows = useMemo(() => {
    if (!drill) return [];
    const byClient = new Map<string, Cell>();
    for (const c of data.contribs) {
      if (c.pid !== drill.pid) continue;
      if (drill.mk && c.mk !== drill.mk) continue;
      if (!byClient.has(c.cid)) byClient.set(c.cid, emptyCell());
      byClient.get(c.cid)![c.field] += c.amount;
    }
    return Array.from(byClient.entries())
      .map(([cid, cell]) => ({ cid, name: clientName(cid), cell }))
      .filter(r => cellTotal(r.cell) > 0.005)
      .sort((a, b) => cellTotal(b.cell) - cellTotal(a.cell));
  }, [drill, data.contribs, companies]);
  const pastCols = back + 1; // meses fechados + o mês corrente

  const cellText = (c?: Cell) => {
    if (!c || cellTotal(c) < 0.005) return <span className="text-gray-200">—</span>;
    const color = c.aberto > 0 ? 'text-red-600'
      : c.recebido === 0 && c.previsto > 0 ? 'text-blue-600'
      : 'text-gray-800';
    const detail = [
      c.recebido ? `Recebido ${brl(c.recebido)}` : null,
      c.aberto ? `Em aberto ${brl(c.aberto)}` : null,
      c.previsto ? `Previsto ${brl(c.previsto)}` : null,
    ].filter(Boolean).join(' · ');
    return <span className={`font-medium ${color}`} title={detail}>{brl0(cellTotal(c))}</span>;
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-6 py-4 flex items-center justify-between gap-3 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
          <TrendingUp size={17} className="text-mcsystem-500" />
          <h3 className="font-bold text-gray-800">Recebimentos por mês e produto</h3>
        </div>
        <span className="text-xs text-gray-400">
          MRR {brl0(data.mrr)} · previsto {brl0(data.futureTotal)} nos próximos {fwd} meses
        </span>
      </button>

      {open && (
        <div className="border-t border-gray-100">
          {/* Totais */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-gray-100">
            <Kpi label="MRR ativo" value={brl0(data.mrr)} hint={`ARR ${brl0(data.mrr * 12)}`} />
            <Kpi label={`Recebido (${back} meses)`} value={brl0(grand.recebido)} hint="cobranças pagas" tone={TONE.recebido} />
            <Kpi label="Em aberto" value={brl0(grand.aberto)} hint="vencidas e não pagas" tone={TONE.aberto} />
            <Kpi label={`Previsto (${fwd} meses)`} value={brl0(grand.previsto)} hint="emitido + renovações" tone={TONE.previsto} />
          </div>

          {/* Janela */}
          <div className="px-6 py-3 flex flex-wrap items-center gap-3 border-b border-gray-100 text-sm">
            <span className="text-gray-500">Janela:</span>
            <select
              value={back} onChange={e => setBack(Number(e.target.value))}
              className="px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 outline-none focus:border-mcsystem-500"
            >
              {[3, 6, 12, 24].map(n => <option key={n} value={n}>{n} meses atrás</option>)}
            </select>
            <select
              value={fwd} onChange={e => setFwd(Number(e.target.value))}
              className="px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 outline-none focus:border-mcsystem-500"
            >
              {[3, 6, 12].map(n => <option key={n} value={n}>{n} meses à frente</option>)}
            </select>
            <button
              onClick={() => setShowMatrix(v => !v)}
              className={`px-2.5 py-1.5 rounded-lg border text-sm transition-colors ${showMatrix ? 'border-mcsystem-200 bg-mcsystem-50 text-mcsystem-700' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              {showMatrix ? 'Ocultar detalhe por produto' : 'Detalhar por produto'}
            </button>
            <span className="text-xs text-gray-400">Valores por data de vencimento. Clique num produto para ver os clientes.</span>
          </div>

          {/* Gráfico */}
          <div className="px-4 pt-5 pb-2">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chart} margin={{ top: 4, right: 12, left: 4, bottom: 0 }} barCategoryGap="22%">
                <CartesianGrid vertical={false} stroke={INK.grid} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: INK.secondary }} />
                <YAxis tickFormatter={short} tickLine={false} axisLine={false} width={54} tick={{ fontSize: 11, fill: INK.muted }} />
                <Tooltip
                  formatter={(v: any, name: any) => [brl(Number(v)), name]}
                  contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 12 }}
                  cursor={{ fill: 'rgba(0,0,0,0.03)' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12, color: INK.secondary }} />
                <ReferenceLine x={monthLabel(curMonth)} stroke={INK.muted} strokeDasharray="3 3" />
                <Bar dataKey="Recebido" stackId="a" fill={TONE.recebido} stroke="#fff" strokeWidth={2} />
                <Bar dataKey="Em aberto" stackId="a" fill={TONE.aberto} stroke="#fff" strokeWidth={2} />
                <Bar dataKey="Previsto" stackId="a" fill={TONE.previsto} stroke="#fff" strokeWidth={2} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Matriz produto × mês */}
          {!showMatrix ? null : rows.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-gray-400">
              Sem cobranças ou assinaturas nesta janela.
            </div>
          ) : (
            <div className="overflow-x-auto border-t border-gray-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 uppercase text-[11px] tracking-wider">
                    <th rowSpan={2} className="px-5 py-2 text-left font-semibold sticky left-0 bg-gray-50 z-10 min-w-[180px]">Produto</th>
                    <th colSpan={pastCols} className="px-3 py-1.5 font-semibold text-center border-l border-gray-200">Realizado</th>
                    <th colSpan={fwd} className="px-3 py-1.5 font-semibold text-center border-l border-gray-200">Projeção</th>
                    <th rowSpan={2} className="px-5 py-2 text-right font-semibold border-l border-gray-200">Total</th>
                  </tr>
                  <tr className="bg-gray-50 text-gray-500 uppercase text-[11px] tracking-wider">
                    {months.map((mk, i) => (
                      <th
                        key={mk}
                        className={`px-3 py-2 text-right font-semibold whitespace-nowrap ${i === pastCols - 1 || i === pastCols ? 'border-l border-gray-200' : ''} ${mk === curMonth ? 'text-mcsystem-700' : ''}`}
                      >
                        {monthLabel(mk)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map(r => (
                    <tr key={r.pid || '__none__'} className="hover:bg-gray-50/70 transition-colors">
                      <td className="px-5 py-2.5 font-medium sticky left-0 bg-white z-10 whitespace-nowrap">
                        <button
                          onClick={() => setDrill({ pid: r.pid, name: r.name })}
                          className="text-gray-800 hover:text-mcsystem-600 hover:underline text-left"
                          title="Ver os clientes deste produto"
                        >
                          {r.name}
                        </button>
                      </td>
                      {months.map((mk, i) => {
                        const cell = r.cells.get(mk);
                        const has = cell && cellTotal(cell) >= 0.005;
                        return (
                        <td key={mk} className={`px-3 py-2.5 text-right tabular-nums ${i === pastCols - 1 || i === pastCols ? 'border-l border-gray-100' : ''} ${mk === curMonth ? 'bg-mcsystem-50/40' : ''}`}>
                          {has ? (
                            <button
                              onClick={() => setDrill({ pid: r.pid, name: r.name, mk })}
                              className="hover:underline"
                              title={`Ver os clientes de ${r.name} em ${monthLabel(mk)}`}
                            >
                              {cellText(cell)}
                            </button>
                          ) : cellText(cell)}
                        </td>
                        );
                      })}
                      <td className="px-5 py-2.5 text-right font-semibold text-gray-800 tabular-nums border-l border-gray-100">
                        {brl0(cellTotal(r.total))}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 font-semibold text-gray-800">
                    <td className="px-5 py-3 sticky left-0 bg-gray-50 z-10">Total</td>
                    {columnTotals.map((c, i) => (
                      <td key={months[i]} className={`px-3 py-3 text-right tabular-nums ${i === pastCols - 1 || i === pastCols ? 'border-l border-gray-200' : ''}`}>
                        {cellTotal(c) < 0.005 ? <span className="text-gray-300">—</span> : brl0(cellTotal(c))}
                      </td>
                    ))}
                    <td className="px-5 py-3 text-right tabular-nums border-l border-gray-200">{brl0(cellTotal(grand))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <div className="px-6 py-3 border-t border-gray-100 flex flex-wrap items-center gap-4 text-xs text-gray-500">
            <Dot color={TONE.recebido} label="Recebido" />
            <Dot color={TONE.aberto} label="Em aberto (vencido)" />
            <Dot color={TONE.previsto} label="Previsto (a vencer + renovações)" />
            <span className="text-gray-400">A projeção repete o ciclo de cada assinatura ativa a partir do próximo vencimento, e para na última cobrança de quem tem prazo definido.</span>
          </div>
        </div>
      )}

      {drill && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[90] p-4" onClick={() => setDrill(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex justify-between items-center rounded-t-2xl">
              <div className="min-w-0">
                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                  <Users size={17} className="text-mcsystem-500" />{drill.name}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {drill.mk ? `Clientes em ${monthLabel(drill.mk)}` : `Clientes na janela de ${back + fwd + 1} meses`}
                </p>
              </div>
              <button onClick={() => setDrill(null)} className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-200"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {drillRows.length === 0 ? (
                <p className="px-6 py-10 text-center text-sm text-gray-400">Nenhum cliente neste recorte.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 uppercase text-[11px] tracking-wider sticky top-0">
                    <tr>
                      <th className="px-6 py-2.5 text-left font-semibold">Cliente</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Recebido</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Em aberto</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Previsto</th>
                      <th className="px-6 py-2.5 text-right font-semibold">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {drillRows.map(r => (
                      <tr key={r.cid || '__none__'} className="hover:bg-gray-50/70">
                        <td className="px-6 py-2.5 font-medium text-gray-800">{r.name}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: r.cell.recebido ? TONE.recebido : INK.muted }}>{r.cell.recebido ? brl0(r.cell.recebido) : '—'}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: r.cell.aberto ? TONE.aberto : INK.muted }}>{r.cell.aberto ? brl0(r.cell.aberto) : '—'}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: r.cell.previsto ? TONE.previsto : INK.muted }}>{r.cell.previsto ? brl0(r.cell.previsto) : '—'}</td>
                        <td className="px-6 py-2.5 text-right font-semibold text-gray-800 tabular-nums">{brl0(cellTotal(r.cell))}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 font-semibold text-gray-800 sticky bottom-0">
                    <tr>
                      <td className="px-6 py-3">{drillRows.length} cliente(s)</td>
                      <td className="px-3 py-3 text-right tabular-nums">{brl0(drillRows.reduce((s, r) => s + r.cell.recebido, 0))}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{brl0(drillRows.reduce((s, r) => s + r.cell.aberto, 0))}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{brl0(drillRows.reduce((s, r) => s + r.cell.previsto, 0))}</td>
                      <td className="px-6 py-3 text-right tabular-nums">{brl0(drillRows.reduce((s, r) => s + cellTotal(r.cell), 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Dot: React.FC<{ color: string; label: string }> = ({ color, label }) => (
  <span className="inline-flex items-center gap-1.5">
    <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />{label}
  </span>
);

const Kpi: React.FC<{ label: string; value: string; hint: string; tone?: string }> = ({ label, value, hint, tone }) => (
  <div className="bg-white px-5 py-4">
    <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
      {tone && <span className="w-2 h-2 rounded-full" style={{ background: tone }} />}{label}
    </div>
    <div className="mt-1.5 text-xl font-bold text-gray-900 tabular-nums">{value}</div>
    <div className="mt-0.5 text-xs text-gray-400">{hint}</div>
  </div>
);
