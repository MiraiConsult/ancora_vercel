/**
 * Base de clientes por sistema, editável na linha. É onde se confere o que a
 * cobrança não sabe: quando o cliente entrou de verdade, quanto paga por mês e
 * se saiu mesmo. O que for corrigido aqui vale para novos, saídas e retenção,
 * e fica em client_system_overrides — o sync do Asaas não mexe nisso, e nada
 * aqui altera cobrança ou assinatura no Asaas.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, RotateCcw, Search, X } from 'lucide-react';
import { Company } from '../types';
import { supabase } from '../lib/supabaseClient';
import { ClientSystemRow, SISTEMA_NOME, SistemaKey, SystemOverride } from '../lib/clientMovement';

interface Props {
  rows: ClientSystemRow[];
  companies: Company[];
  /** Título da aba aberta; em Geral aparece a coluna Sistema. */
  nomeEscopo: string;
  mostrarSistema: boolean;
  tenantId?: string;
  setOverrides: React.Dispatch<React.SetStateAction<SystemOverride[]>>;
  /** Número clicado na tabela de cima (ex.: Novos em out/26): restringe a lista. */
  filtroMes?: { titulo: string; ids: Set<string> } | null;
  onLimparFiltroMes?: () => void;
}

type Ordem = 'nome' | 'entrada' | 'valor' | 'situacao';
type FiltroSituacao = 'todos' | 'ativos' | 'sairam';

const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const hoje = () => new Date().toISOString().slice(0, 10);

const campo = 'h-8 px-2 rounded-md border border-transparent bg-transparent text-[13px] text-mirai-ink tabular-nums hover:border-gray-200 focus:border-mcsystem-500 focus:bg-white outline-none';

export const ClientSystemList: React.FC<Props> = ({ rows, companies, nomeEscopo, mostrarSistema, tenantId, setOverrides, filtroMes, onLimparFiltroMes }) => {
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<FiltroSituacao>('todos');
  const [ordem, setOrdem] = useState<{ key: Ordem; dir: 1 | -1 }>({ key: 'nome', dir: 1 });
  const [erro, setErro] = useState<string | null>(null);

  // Quem saiu em setembro hoje consta como "Saiu": com o filtro Ativos ligado, a
  // lista ficaria vazia e pareceria que o clique não funcionou.
  useEffect(() => { if (filtroMes) setFiltro('todos'); }, [filtroMes?.titulo]);

  const nomes = useMemo(() => new Map(companies.map(c => [c.id, c.name])), [companies]);
  const nome = (id: string) => nomes.get(id) || 'Sem cliente';

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const lista = rows.filter(r => {
      if (filtroMes && !filtroMes.ids.has(r.clientId)) return false;
      if (filtro === 'ativos' && !r.ativo) return false;
      if (filtro === 'sairam' && r.ativo) return false;
      return !q || nome(r.clientId).toLowerCase().includes(q);
    });
    const chave = (r: ClientSystemRow): string | number => {
      switch (ordem.key) {
        case 'entrada': return r.entrada || '9999';
        case 'valor': return r.valor;
        case 'situacao': return r.ativo ? 0 : 1;
        default: return nome(r.clientId).toLowerCase();
      }
    };
    return [...lista].sort((a, b) => {
      const ka = chave(a), kb = chave(b);
      if (ka === kb) return nome(a.clientId).localeCompare(nome(b.clientId));
      return (ka > kb ? 1 : -1) * ordem.dir;
    });
  }, [rows, busca, filtro, ordem, nomes, filtroMes]);

  const ativos = rows.filter(r => r.ativo);
  const totalAtivos = ativos.reduce((a, r) => a + r.valor, 0);

  const salvar = async (row: ClientSystemRow, patch: Partial<SystemOverride>) => {
    const novo: SystemOverride = { ...(row.ajuste || { client_id: row.clientId, system: row.system }), ...patch };
    const mesmo = (o: SystemOverride) => o.client_id === novo.client_id && o.system === novo.system;
    // Atualiza a tela antes: os números de cima recalculam na hora.
    setOverrides(list => [...list.filter(o => !mesmo(o)), novo]);
    setErro(null);
    const { error } = await supabase.from('client_system_overrides').upsert({
      tenant_id: tenantId,
      client_id: novo.client_id,
      system: novo.system,
      entry_date: novo.entry_date ?? null,
      exit_date: novo.exit_date ?? null,
      monthly_value: novo.monthly_value ?? null,
      status: novo.status ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id,client_id,system' });
    if (error) setErro(`Não foi possível salvar ${nome(row.clientId)}: ${error.message}`);
  };

  const desfazer = async (row: ClientSystemRow) => {
    setOverrides(list => list.filter(o => !(o.client_id === row.clientId && o.system === row.system)));
    setErro(null);
    const { error } = await supabase.from('client_system_overrides').delete()
      .eq('tenant_id', tenantId).eq('client_id', row.clientId).eq('system', row.system);
    if (error) setErro(`Não foi possível desfazer ${nome(row.clientId)}: ${error.message}`);
  };

  const Titulo = (key: Ordem, texto: string, classe = 'text-left') => (
    <th scope="col" className={`font-semibold px-2 py-2.5 ${classe}`}>
      <button type="button" onClick={() => setOrdem(o => (o.key === key ? { key, dir: (o.dir * -1) as 1 | -1 } : { key, dir: 1 }))}
        className="inline-flex items-center gap-1 hover:text-mirai-ink">
        {texto}
        {ordem.key === key && (ordem.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
      </button>
    </th>
  );

  return (
    <div className="border-t border-[rgba(11,20,11,0.08)] pt-6 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-mirai-ink">Clientes · {nomeEscopo}</h3>
          <p className="text-[13px] text-mirai-muted mt-0.5">
            {ativos.length} ativos · {rows.length - ativos.length} saíram · {brl(totalAtivos)} por mês.
            {' '}Corrija entrada, valor e situação direto na linha.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {filtroMes && (
            <button type="button" onClick={onLimparFiltroMes} title="Tirar o filtro"
              className="inline-flex items-center gap-1.5 h-9 pl-3 pr-2 rounded-xl bg-mirai-lime text-mirai-ink text-[13px] font-semibold">
              {filtroMes.titulo} · {filtroMes.ids.size} cliente{filtroMes.ids.size === 1 ? '' : 's'}
              <X size={14} />
            </button>
          )}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar cliente..." aria-label="Buscar cliente"
              className="h-9 w-52 pl-8 pr-3 rounded-xl border border-gray-200 text-[13px] outline-none focus:border-mcsystem-500" />
          </div>
          <div className="flex gap-1 p-1 bg-mcsystem-100 rounded-full">
            {([['todos', 'Todos'], ['ativos', 'Ativos'], ['sairam', 'Saíram']] as [FiltroSituacao, string][]).map(([k, t]) => (
              <button key={k} type="button" onClick={() => setFiltro(k)}
                className={`h-7 px-3 rounded-full text-[12px] transition-colors ${filtro === k ? 'bg-white text-mirai-ink font-semibold' : 'text-mirai-ink2 font-medium hover:bg-white/60'}`}>
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {erro && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">{erro}</p>}

      <div className="overflow-auto max-h-[560px] rounded-2xl border border-[rgba(11,20,11,0.08)]">
        <table className="w-full text-[13px] border-collapse min-w-[760px]">
          <thead className="sticky top-0 z-10 bg-mcsystem-50 text-mirai-muted">
            <tr>
              {Titulo('nome', 'Cliente')}
              {mostrarSistema && <th scope="col" className="font-semibold px-2 py-2.5 text-left">Sistema</th>}
              {Titulo('entrada', 'Data de entrada')}
              {Titulo('valor', 'Valor mensal')}
              {Titulo('situacao', 'Situação')}
              <th scope="col" className="font-semibold px-2 py-2.5 text-left">Saiu em</th>
              <th scope="col" className="w-9"><span className="sr-only">Desfazer</span></th>
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 && (
              <tr><td colSpan={mostrarSistema ? 7 : 6} className="px-4 py-10 text-center text-mirai-muted">Nenhum cliente encontrado.</td></tr>
            )}
            {visiveis.map(r => {
              const chave = `${r.clientId}|${r.system}`;
              const n = nome(r.clientId);
              return (
                <tr key={chave} className="border-t border-[rgba(11,20,11,0.06)] hover:bg-mcsystem-50/60">
                  <td className="px-3 py-1 max-w-[320px]">
                    <span className="block truncate text-mirai-ink" title={n}>{n}</span>
                  </td>
                  {mostrarSistema && <td className="px-3 py-1 text-mirai-muted whitespace-nowrap">{SISTEMA_NOME[r.system as SistemaKey]}</td>}
                  <td className="px-1 py-1">
                    {/* A key inclui o valor: depois de salvar, o campo volta a refletir o dado. */}
                    <input key={`e:${chave}:${r.entrada}`} type="date" defaultValue={r.entrada} aria-label={`Data de entrada de ${n}`}
                      title={r.entradaAuto ? `Primeira cobrança: ${r.entradaAuto.split('-').reverse().join('/')}` : undefined}
                      onBlur={e => {
                        const v = e.target.value;
                        if (v === r.entrada) return;
                        salvar(r, { entry_date: v && v !== r.entradaAuto ? v : null });
                      }}
                      className={campo} />
                  </td>
                  <td className="px-1 py-1">
                    <input key={`v:${chave}:${r.valor}`} type="number" step="0.01" min="0" defaultValue={r.valor ? r.valor.toFixed(2) : ''}
                      aria-label={`Valor mensal de ${n}`} title={`Pela cobrança: ${brl(r.valorAuto)}`}
                      onBlur={e => {
                        const v = e.target.value === '' ? null : Number(e.target.value);
                        if (v !== null && !Number.isFinite(v)) return;
                        if (Math.abs((v ?? r.valorAuto) - r.valor) < 0.005) return;
                        salvar(r, { monthly_value: v === null || Math.abs(v - r.valorAuto) < 0.005 ? null : v });
                      }}
                      className={`${campo} w-28`} />
                  </td>
                  <td className="px-1 py-1">
                    <select value={r.ativo ? 'ATIVO' : 'SAIU'} aria-label={`Situação de ${n}`}
                      onChange={e => (e.target.value === 'ATIVO'
                        ? salvar(r, { status: 'ATIVO', exit_date: null })
                        : salvar(r, { status: 'SAIU', exit_date: r.saida || hoje() }))}
                      className={`${campo} cursor-pointer font-semibold ${r.ativo ? '!text-mcsystem-700' : '!text-[#a3470f]'}`}>
                      <option value="ATIVO">Ativo</option>
                      <option value="SAIU">Saiu</option>
                    </select>
                  </td>
                  <td className="px-1 py-1">
                    {!r.ativo && (
                      <input key={`s:${chave}:${r.saida}`} type="date" defaultValue={r.saida} aria-label={`Data de saída de ${n}`}
                        onBlur={e => {
                          const v = e.target.value;
                          if (!v || v === r.saida) return;
                          salvar(r, { status: 'SAIU', exit_date: v });
                        }}
                        className={campo} />
                    )}
                  </td>
                  <td className="px-1 py-1 text-center">
                    {r.ajuste && (
                      <button type="button" onClick={() => desfazer(r)} title="Desfazer o ajuste e voltar ao que vem da cobrança"
                        aria-label={`Desfazer ajuste de ${n}`}
                        className="p-1.5 rounded-md text-mcsystem-700 hover:bg-mcsystem-100">
                        <RotateCcw size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-mirai-muted">
        Os ajustes valem para novos, saídas e retenção. Não mudam cobrança nem assinatura no Asaas.
      </p>
    </div>
  );
};
