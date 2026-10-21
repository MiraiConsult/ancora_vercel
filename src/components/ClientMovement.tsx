/**
 * Movimento de clientes: quantos entraram, renovaram, voltaram e saíram por
 * mês — no geral e em cada sistema. Os números da tabela abrem a lista de
 * nomes, para saber quem é, e não só quantos.
 */

import React, { useMemo, useState } from 'react';
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
const pct = (v: number | null) => (v === null ? '—' : `${v.toFixed(1).replace('.', ',')}%`);

// Entrada em verde da marca, retorno em azul, saída em laranja: diferem também
// em luminosidade, para quem não distingue as cores.
const COR = { novos: '#3c8d10', voltaram: '#2a78d6', sairam: '#f2a46a' };

type Campo = 'novos' | 'renovaram' | 'voltaram' | 'sairam' | 'ativos';
const CAMPOS: { campo: Campo; nome: string; tom: string; sinal?: string }[] = [
  { campo: 'ativos', nome: 'Ativos', tom: 'text-mirai-ink' },
  { campo: 'novos', nome: 'Novos', tom: 'text-mcsystem-700', sinal: '+' },
  { campo: 'renovaram', nome: 'Renovaram', tom: 'text-mirai-ink2' },
  { campo: 'voltaram', nome: 'Voltaram', tom: 'text-[#1f5fae]', sinal: '+' },
  { campo: 'sairam', nome: 'Saíram', tom: 'text-[#a3470f]', sinal: '−' },
];

const retencao = (m: MovementMonth) => {
  const base = m.renovaram.length + m.sairam.length;
  return base ? (m.renovaram.length / base) * 100 : null;
};

/** Altura máxima de cada metade do gráfico, em px. */
const ALTURA = 112;

export const ClientMovement: React.FC<Props> = ({ records, subscriptions, products, companies }) => {
  const [escopo, setEscopo] = useState('GERAL');
  const [lista, setLista] = useState<{ mes: string; campo: Campo } | null>(null);

  const porEscopo = useMemo(() => Object.fromEntries(
    MOVEMENT_SCOPES.map(s => [s.key, computeMovement(records, subscriptions, products, s)])),
  [records, subscriptions, products]);

  const meses = porEscopo[escopo];
  const nomeEscopo = MOVEMENT_SCOPES.find(s => s.key === escopo)!.nome;
  const nome = (id: string) => companies.find(c => c.id === id)?.name || 'Sem cliente';

  // Mesma escala para cima e para baixo: uma saída e uma entrada do mesmo
  // tamanho têm de parecer do mesmo tamanho.
  const maior = Math.max(1, ...meses.map(m => Math.max(m.novos.length + m.voltaram.length, m.sairam.length)));
  const px = (n: number) => (n ? Math.max(16, Math.round((n / maior) * ALTURA)) : 0);

  const nomesDaLista = lista
    ? (meses.find(m => m.mes === lista.mes)?.[lista.campo] || []).map(nome).sort((a, b) => a.localeCompare(b))
    : [];
  const abrir = (mes: string, campo: Campo) =>
    setLista(l => (l && l.mes === mes && l.campo === campo ? null : { mes, campo }));

  return (
    <div className="bg-white rounded-[28px] border border-[rgba(11,20,11,0.08)] p-5 sm:p-7 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-[22px] font-semibold text-mirai-ink">Clientes: entradas e saídas</h2>
          <p className="text-[13px] text-mirai-muted mt-1">Últimos 12 meses · clique num número para ver os nomes</p>
        </div>
        <div className="flex flex-wrap gap-1 p-1 bg-mcsystem-100 rounded-full">
          {MOVEMENT_SCOPES.map(s => (
            <button key={s.key} onClick={() => { setEscopo(s.key); setLista(null); }}
              className={`h-9 px-4 rounded-full text-[13px] transition-colors ${escopo === s.key ? 'bg-mirai-lime text-mirai-ink font-semibold' : 'text-mirai-ink2 font-medium hover:bg-white'}`}>
              {s.nome}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-8 items-start">
        <figure className="m-0 space-y-3">
          <div role="img" aria-label={`Novos, voltaram e saíram por mês · ${nomeEscopo}`}
            className="grid gap-1.5 sm:gap-2.5" style={{ gridTemplateColumns: `repeat(${meses.length}, minmax(0, 1fr))` }}>
            {meses.map(m => {
              const ativo = lista?.mes === m.mes;
              return (
                <button key={m.mes} type="button" onClick={() => abrir(m.mes, 'sairam')}
                  title={`${rotulo(m.mes)}: ${m.ativos.length} ativos · +${m.novos.length} novos · +${m.voltaram.length} voltaram · −${m.sairam.length} saíram`}
                  className={`flex flex-col items-center gap-1.5 rounded-xl py-1 transition-colors ${ativo ? 'bg-mcsystem-100' : 'hover:bg-mcsystem-50'}`}>
                  <span className="text-[10px] sm:text-[11px] text-mirai-muted tabular-nums">{m.ativos.length}</span>
                  <div className="w-full flex flex-col items-center justify-end" style={{ height: ALTURA }}>
                    {m.voltaram.length > 0 && (
                      <div className="w-3/5 max-w-[34px] rounded-t-md" style={{ height: px(m.voltaram.length), background: COR.voltaram }} />
                    )}
                    {m.novos.length > 0 && (
                      <div className={`w-3/5 max-w-[34px] flex justify-center ${m.voltaram.length ? '' : 'rounded-t-md'}`}
                        style={{ height: px(m.novos.length), background: COR.novos }}>
                        <span className="text-[11px] font-bold text-white pt-0.5 tabular-nums">{m.novos.length}</span>
                      </div>
                    )}
                  </div>
                  <div className="h-px w-full bg-[rgba(11,20,11,0.18)]" />
                  <div className="w-full flex flex-col items-center" style={{ height: ALTURA }}>
                    {m.sairam.length > 0 && (
                      <div className="w-3/5 max-w-[34px] rounded-b-md flex justify-center items-end"
                        style={{ height: px(m.sairam.length), background: COR.sairam }}>
                        <span className="text-[11px] font-bold text-[#4a2208] pb-0.5 tabular-nums">{m.sairam.length}</span>
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] sm:text-[12px] font-semibold text-mirai-ink2">{MESES[Number(m.mes.slice(5)) - 1]}</span>
                </button>
              );
            })}
          </div>
          <figcaption className="flex flex-wrap gap-4 text-xs text-mirai-muted">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: COR.novos }} />Novos</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: COR.voltaram }} />Voltaram</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: COR.sairam }} />Saíram</span>
            <span>· número no topo: clientes ativos</span>
          </figcaption>
        </figure>

        <div className="overflow-x-auto">
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr className="text-mirai-muted">
                <th scope="col" className="text-left font-semibold pb-2.5 pr-2 border-b border-[rgba(11,20,11,0.10)]">Mês</th>
                {CAMPOS.map(c => (
                  <th key={c.campo} scope="col" className="text-right font-semibold pb-2.5 px-2 border-b border-[rgba(11,20,11,0.10)]">{c.nome}</th>
                ))}
                <th scope="col" className="text-right font-semibold pb-2.5 pl-2 border-b border-[rgba(11,20,11,0.10)]">Retenção</th>
              </tr>
            </thead>
            <tbody>
              {[...meses].reverse().map(m => (
                <tr key={m.mes} className={lista?.mes === m.mes ? 'bg-mcsystem-50' : ''}>
                  <td className="py-1.5 pr-2 font-semibold text-mirai-ink2 border-b border-[rgba(11,20,11,0.06)] whitespace-nowrap">{rotulo(m.mes)}</td>
                  {CAMPOS.map(c => {
                    const n = m[c.campo].length;
                    const ativo = lista?.mes === m.mes && lista.campo === c.campo;
                    return (
                      <td key={c.campo} className="py-1 px-1 text-right border-b border-[rgba(11,20,11,0.06)]">
                        <button disabled={!n} onClick={() => abrir(m.mes, c.campo)}
                          className={`tabular-nums px-2 py-1 rounded-md font-semibold ${n ? `${c.tom} hover:bg-mcsystem-100` : 'text-gray-300'} ${ativo ? 'bg-mirai-lime !text-mirai-ink' : ''}`}>
                          {n && c.sinal ? c.sinal : ''}{n}
                        </button>
                      </td>
                    );
                  })}
                  <td className="py-1.5 pl-2 text-right tabular-nums text-mirai-ink2 border-b border-[rgba(11,20,11,0.06)]">{pct(retencao(m))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {lista && (
        <div className="rounded-2xl bg-mcsystem-50 border border-[rgba(11,20,11,0.08)] p-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h3 className="text-base font-semibold text-mirai-ink">
                {CAMPOS.find(c => c.campo === lista.campo)!.nome} · {rotulo(lista.mes)}
              </h3>
              <p className="text-xs text-mirai-muted mt-0.5">{nomeEscopo} · {nomesDaLista.length} cliente(s)</p>
            </div>
            <button onClick={() => setLista(null)} aria-label="Fechar lista"
              className="p-1.5 text-mirai-muted hover:text-mirai-ink rounded-full hover:bg-white"><X size={16} /></button>
          </div>
          {nomesDaLista.length === 0 ? (
            <p className="text-sm text-mirai-muted">Ninguém neste mês.</p>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-1.5 text-sm text-mirai-ink">
              {nomesDaLista.map((n, i) => <li key={i} className="truncate py-1 border-b border-[rgba(11,20,11,0.06)]">{n}</li>)}
            </ul>
          )}
        </div>
      )}

      <p className="text-xs text-mirai-muted">
        Ativo é quem teve cobrança no mês, paga ou não. Saiu: estava no mês anterior e não está neste. Voltou: já foi
        cliente, ficou ao menos um mês fora e voltou. Devedores de acordo não contam.
      </p>
    </div>
  );
};
