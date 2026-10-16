/**
 * Movimento de clientes: quantos entraram, renovaram, voltaram e saíram por
 * mês — no geral e em cada sistema. Os números da tabela abrem a lista de
 * nomes, para saber quem é, e não só quantos.
 */

import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts';
import { X } from 'lucide-react';
import { Company, FinancialRecord, Product, Subscription } from '../types';
import { computeMovement, MovementMonth, MOVEMENT_SCOPES } from '../lib/clientMovement';

interface Props {
  records: FinancialRecord[];
  subscriptions: Subscription[];
  products: Product[];
  companies: Company[];
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const rotulo = (mes: string) => `${MESES[Number(mes.slice(5)) - 1]}/${mes.slice(2, 4)}`;
const pct = (v: number | null) => (v === null ? '—' : `${v.toFixed(0)}%`);

// Mesma paleta do dashboard: série categórica e, para saída, o tom de alerta.
const COR = { novos: '#2a9d8f', voltaram: '#2a78d6', sairam: '#e76f51', ativos: '#111827' };

type Campo = 'novos' | 'renovaram' | 'voltaram' | 'sairam' | 'ativos';
const CAMPOS: { campo: Campo; nome: string; tom: string }[] = [
  { campo: 'ativos', nome: 'Ativos', tom: 'text-gray-900' },
  { campo: 'novos', nome: 'Novos', tom: 'text-[#1f7a6f]' },
  { campo: 'renovaram', nome: 'Renovaram', tom: 'text-gray-700' },
  { campo: 'voltaram', nome: 'Voltaram', tom: 'text-[#2a78d6]' },
  { campo: 'sairam', nome: 'Saíram', tom: 'text-[#c2502f]' },
];

const retencao = (m: MovementMonth) => {
  const base = m.renovaram.length + m.sairam.length;
  return base ? (m.renovaram.length / base) * 100 : null;
};

export const ClientMovement: React.FC<Props> = ({ records, subscriptions, products, companies }) => {
  const [escopo, setEscopo] = useState('GERAL');
  const [lista, setLista] = useState<{ mes: string; campo: Campo } | null>(null);

  const porEscopo = useMemo(() => Object.fromEntries(
    MOVEMENT_SCOPES.map(s => [s.key, computeMovement(records, subscriptions, products, s)])),
  [records, subscriptions, products]);

  const meses = porEscopo[escopo];
  const atual = meses[meses.length - 1];
  const nomeEscopo = MOVEMENT_SCOPES.find(s => s.key === escopo)!.nome;
  const nome = (id: string) => companies.find(c => c.id === id)?.name || 'Sem cliente';

  const grafico = meses.map(m => ({
    mes: rotulo(m.mes),
    Novos: m.novos.length,
    Voltaram: m.voltaram.length,
    // Negativo para a barra descer abaixo do zero: entrada em cima, saída embaixo.
    Saíram: -m.sairam.length,
    Ativos: m.ativos.length,
  }));

  const nomesDaLista = lista
    ? (meses.find(m => m.mes === lista.mes)?.[lista.campo] || []).map(nome).sort((a, b) => a.localeCompare(b))
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {MOVEMENT_SCOPES.map(s => (
          <button key={s.key} onClick={() => { setEscopo(s.key); setLista(null); }}
            className={`px-4 py-2 rounded-full text-sm font-semibold border transition-colors ${escopo === s.key ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
            {s.nome}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {CAMPOS.map(c => (
          <button key={c.campo} onClick={() => setLista({ mes: atual.mes, campo: c.campo })}
            className="bg-white rounded-2xl border border-gray-200/80 p-5 text-left hover:border-gray-300 hover:shadow-md transition-all">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{c.nome} · {rotulo(atual.mes)}</div>
            <div className={`mt-2 text-2xl font-bold tabular-nums ${c.tom}`}>{atual[c.campo].length}</div>
            {c.campo === 'renovaram' && <div className="mt-1 text-xs text-gray-500">retenção {pct(retencao(atual))}</div>}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200/80 p-6">
        <div className="mb-5">
          <h3 className="font-semibold text-gray-900">Entradas e saídas · {nomeEscopo}</h3>
          <p className="text-xs text-gray-400 mt-0.5">Novos e voltaram acima do zero, saíram abaixo; a linha é a base ativa</p>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={grafico} stackOffset="sign" margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#eef0f3" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} dy={6} />
              <YAxis yAxisId="mov" allowDecimals={false} tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} width={36} />
              <YAxis yAxisId="base" orientation="right" allowDecimals={false} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={36} />
              <Tooltip formatter={(v: any) => Math.abs(v)}
                contentStyle={{ borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 12 }} cursor={{ fill: 'rgba(0,0,0,.03)' }} />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="circle" iconSize={8} />
              <ReferenceLine yAxisId="mov" y={0} stroke="#d1d5db" />
              <Bar yAxisId="mov" dataKey="Novos" stackId="m" fill={COR.novos} maxBarSize={22} />
              <Bar yAxisId="mov" dataKey="Voltaram" stackId="m" fill={COR.voltaram} maxBarSize={22} radius={[4, 4, 0, 0]} />
              <Bar yAxisId="mov" dataKey="Saíram" stackId="m" fill={COR.sairam} maxBarSize={22} radius={[0, 0, 4, 4]} />
              <Line yAxisId="base" dataKey="Ativos" stroke={COR.ativos} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl border border-gray-200/80 overflow-hidden xl:col-span-2">
          <div className="px-6 pt-5 pb-3">
            <h3 className="font-semibold text-gray-900">Mês a mês · {nomeEscopo}</h3>
            <p className="text-xs text-gray-400 mt-0.5">Clique num número para ver os clientes</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 uppercase text-[11px] tracking-wider">
                <tr>
                  <th className="px-4 py-2.5 text-left font-semibold">Mês</th>
                  {CAMPOS.map(c => <th key={c.campo} className="px-4 py-2.5 text-right font-semibold">{c.nome}</th>)}
                  <th className="px-4 py-2.5 text-right font-semibold">Retenção</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[...meses].reverse().map(m => (
                  <tr key={m.mes} className="hover:bg-gray-50/60">
                    <td className="px-4 py-2.5 font-medium text-gray-700 capitalize">{rotulo(m.mes)}</td>
                    {CAMPOS.map(c => {
                      const n = m[c.campo].length;
                      const ativo = lista?.mes === m.mes && lista.campo === c.campo;
                      return (
                        <td key={c.campo} className="px-4 py-1.5 text-right">
                          <button disabled={!n} onClick={() => setLista({ mes: m.mes, campo: c.campo })}
                            className={`tabular-nums px-2 py-1 rounded-md font-semibold ${n ? `${c.tom} hover:bg-gray-100` : 'text-gray-300'} ${ativo ? 'ring-2 ring-gray-900/20 bg-gray-100' : ''}`}>
                            {n}
                          </button>
                        </td>
                      );
                    })}
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">{pct(retencao(m))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200/80 overflow-hidden flex flex-col">
          {lista ? (
            <>
              <div className="px-6 pt-5 pb-3 flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-gray-900">
                    {CAMPOS.find(c => c.campo === lista.campo)!.nome} · {rotulo(lista.mes)}
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">{nomeEscopo} · {nomesDaLista.length} cliente(s)</p>
                </div>
                <button onClick={() => setLista(null)} className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"><X size={16} /></button>
              </div>
              <ul className="px-6 pb-5 space-y-1.5 overflow-y-auto max-h-[420px] text-sm text-gray-700">
                {nomesDaLista.map((n, i) => <li key={i} className="py-1 border-b border-gray-50">{n}</li>)}
              </ul>
            </>
          ) : (
            <>
              <div className="px-6 pt-5 pb-3">
                <h3 className="font-semibold text-gray-900">Por sistema · últimos 12 meses</h3>
                <p className="text-xs text-gray-400 mt-0.5">Clique para abrir o sistema</p>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 uppercase text-[11px] tracking-wider">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-semibold">Sistema</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Ativos</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Novos</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Saíram</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {MOVEMENT_SCOPES.map(s => {
                    const ms = porEscopo[s.key];
                    const novos = ms.reduce((a, m) => a + m.novos.length, 0);
                    const sairam = ms.reduce((a, m) => a + m.sairam.length, 0);
                    const voltaram = ms.reduce((a, m) => a + m.voltaram.length, 0);
                    const saldo = novos + voltaram - sairam;
                    return (
                      <tr key={s.key} onClick={() => setEscopo(s.key)}
                        className={`cursor-pointer hover:bg-gray-50 ${escopo === s.key ? 'bg-gray-50 font-semibold' : ''}`}>
                        <td className="px-4 py-2.5 text-gray-800">{s.nome}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{ms[ms.length - 1].ativos.length}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-[#1f7a6f]">{novos}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-[#c2502f]">{sairam}</td>
                        <td className={`px-4 py-2.5 text-right tabular-nums ${saldo >= 0 ? 'text-green-700' : 'text-red-600'}`}>{saldo > 0 ? '+' : ''}{saldo}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="px-6 py-4 text-xs text-gray-400 mt-auto">
                Ativo é quem teve cobrança no mês (paga ou não). Saiu: tinha no mês anterior e não tem neste.
                Saldo = novos + voltaram − saíram. Devedores de acordo não contam.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
