/**
 * Exclusão de cobranças, igual em todas as telas: pergunta o que fazer e apaga
 * no Asaas e aqui.
 *
 * Cobrança de assinatura ativa traz a escolha "só esta" ou "esta e as futuras".
 * Só excluir a cobrança não encerra nada — a assinatura gera a do mês seguinte
 * e parece que a exclusão não valeu. Encerrar é excluir a assinatura.
 *
 * Excluir a assinatura no Asaas leva junto tudo que está em aberto nela, até o
 * atraso antigo (visto nos webhooks de todas as exclusões de assinatura). Por
 * isso a janela avisa quando há atraso anterior, e essas cobranças são apagadas
 * explicitamente: o resultado não fica dependendo do tempo de resposta do Asaas.
 *
 * Parcelamento traz a mesma escolha quando há parcelas à frente, mas não tem o
 * que encerrar: as parcelas saem uma a uma e o atraso anterior fica onde está.
 */

import React, { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { asaasDeleteCharge, asaasDeleteSubscription } from '../services/asaasService';
import { FinancialRecord, Subscription, TransactionStatus } from '../types';

interface Opcoes {
  records: FinancialRecord[];
  subscriptions: Subscription[];
  setRecords?: React.Dispatch<React.SetStateAction<FinancialRecord[]>>;
  setSubscriptions?: React.Dispatch<React.SetStateAction<Subscription[]>>;
  /** Usuário de demonstração: mexe só na tela. */
  isMock?: boolean;
  nomeCliente: (id?: string) => string;
}

/** Uma assinatura ativa ou um parcelamento atingido pela exclusão. */
interface ItemPlano {
  /** Só em assinatura: é o que "todas as futuras" encerra. */
  sub?: Subscription;
  /** Em aberto, a partir da cobrança escolhida, fora as selecionadas. */
  futuras: FinancialRecord[];
  /** Em aberto, anteriores à cobrança escolhida. */
  antigas: FinancialRecord[];
}

interface Pedido {
  selecionadas: FinancialRecord[];
  plano: ItemPlano[];
  onProgress?: (feitos: number, total: number) => void;
  resolver: (ok: string[]) => void;
}

const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const soma = (l: FinancialRecord[]) => l.reduce((a, r) => a + (r.amount || 0), 0);
const fmtData = (iso?: string) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');

/**
 * Parcelas de um mesmo parcelamento. O id do Asaas vem do sync; a cobrança
 * parcelada criada aqui só tem o seriesId até o sync seguinte.
 */
const serieDe = (r: FinancialRecord) => r.asaas_installment_id || r.seriesId;
const assinaturaDe = (r: FinancialRecord) => r.asaas_subscription_id;

function planejar(selecionadas: FinancialRecord[], records: FinancialRecord[], subscriptions: Subscription[]) {
  const ids = new Set(selecionadas.map(r => r.id));

  const agrupar = (chave: (r: FinancialRecord) => string | undefined) => {
    const grupos = new Map<string, FinancialRecord[]>();
    selecionadas.forEach(r => {
      const k = chave(r);
      if (!k) return;
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k)!.push(r);
    });
    return grupos;
  };

  const emAberto = (lista: FinancialRecord[], chave: (r: FinancialRecord) => string | undefined, k: string) => {
    const desde = lista.map(r => r.dueDate || '').sort()[0];
    const abertas = records.filter(r => chave(r) === k && r.status !== TransactionStatus.PAID && !ids.has(r.id));
    return {
      futuras: abertas.filter(r => (r.dueDate || '') >= desde),
      antigas: abertas.filter(r => (r.dueDate || '') < desde),
    };
  };

  const plano: ItemPlano[] = [];
  agrupar(assinaturaDe).forEach((lista, sid) => {
    const sub = subscriptions.find(s => s.asaas_id === sid && (s.status || 'ACTIVE').toUpperCase() === 'ACTIVE');
    if (sub) plano.push({ sub, ...emAberto(lista, assinaturaDe, sid) });
  });
  agrupar(serieDe).forEach((lista, serie) => {
    // Na última parcela não há o que perguntar.
    const { futuras } = emAberto(lista, serieDe, serie);
    if (futuras.length) plano.push({ futuras, antigas: [] });
  });
  return plano;
}

export function useExcluirCobrancas({ records, subscriptions, setRecords, setSubscriptions, isMock, nomeCliente }: Opcoes) {
  const [pedido, setPedido] = useState<Pedido | null>(null);
  // Lidos na hora de executar: a tela pode ter mudado com a janela aberta.
  const refs = useRef({ setRecords, setSubscriptions, isMock });
  refs.current = { setRecords, setSubscriptions, isMock };

  /** Abre a pergunta. Resolve com os ids excluídos ([] se desistir). */
  const pedirExclusao = (
    selecionadas: FinancialRecord[],
    onProgress?: (feitos: number, total: number) => void,
  ) => new Promise<string[]>(resolver => {
    if (!selecionadas.length) { resolver([]); return; }
    setPedido({ selecionadas, plano: planejar(selecionadas, records, subscriptions), onProgress, resolver });
  });

  const executar = async (p: Pedido, comFuturas: boolean) => {
    setPedido(null);
    const { setRecords: tirar, setSubscriptions: tirarSub, isMock: mock } = refs.current;
    const alvo = [...p.selecionadas];
    if (comFuturas) p.plano.forEach(i => alvo.push(...i.futuras, ...i.antigas));

    const ok: string[] = [];
    const falhas: string[] = [];
    let feitos = 0;
    p.onProgress?.(0, alvo.length);

    const fila = [...alvo];
    // Quatro de cada vez: no Asaas é uma chamada por cobrança.
    const trabalhador = async () => {
      for (let r = fila.shift(); r; r = fila.shift()) {
        const id = r.id;
        try {
          if (!mock) {
            if (r.asaas_payment_id) {
              await asaasDeleteCharge({ recordId: id, paymentId: r.asaas_payment_id });
            } else {
              const { error } = await supabase.from('financial_records').delete().eq('id', id);
              if (error) throw new Error(error.message);
            }
          }
          ok.push(id);
          tirar?.(prev => prev.filter(x => x.id !== id));
        } catch (e: any) {
          falhas.push(`${nomeCliente(r.companyId)} (${brl(r.amount)}): ${e.message}`);
        }
        p.onProgress?.(++feitos, alvo.length);
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, alvo.length) }, trabalhador));

    if (comFuturas) {
      for (const { sub } of p.plano) {
        if (!sub) continue;
        try {
          if (!mock) await asaasDeleteSubscription({ rowId: sub.id, subscriptionId: sub.asaas_id });
          tirarSub?.(prev => prev.filter(s => s.id !== sub.id));
        } catch (e: any) {
          falhas.push(`Assinatura de ${nomeCliente(sub.client_id)}: ${e.message}`);
        }
      }
    }

    if (falhas.length) alert(`${ok.length} excluída(s). Não foi possível concluir:\n\n${falhas.join('\n')}`);
    p.resolver(ok);
  };

  const desistir = () => { pedido?.resolver([]); setPedido(null); };

  const dialogoExclusao = useMemo(() => {
    if (!pedido) return null;
    const { selecionadas, plano } = pedido;
    const umaSo = selecionadas.length === 1;
    const noAsaas = selecionadas.some(r => r.asaas_payment_id);
    const antigas = plano.flatMap(i => i.antigas);
    const assinaturas = plano.filter(i => i.sub);
    const parcelamentos = plano.filter(i => !i.sub);
    const futurasAssinatura = assinaturas.flatMap(i => i.futuras);
    const futurasParcelas = parcelamentos.flatMap(i => i.futuras);
    const titulo = umaSo
      ? (noAsaas ? 'Excluir cobrança' : 'Excluir lançamento')
      : `Excluir ${selecionadas.length} lançamentos`;

    return createPortal(
      <div className="fixed inset-0 z-[300] bg-black/50 flex items-center justify-center p-4" onClick={desistir}>
        <div role="dialog" aria-modal="true" aria-label={titulo}
          className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-mirai-ink">{titulo}</h3>
            <button onClick={desistir} aria-label="Voltar sem excluir"
              className="p-1.5 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100"><X size={18} /></button>
          </div>

          <div className="px-6 py-4 space-y-3 text-sm text-mirai-ink2">
            {umaSo ? (
              <p>
                <b className="text-mirai-ink">{nomeCliente(selecionadas[0].companyId)}</b>
                {' · '}{selecionadas[0].description}{' · '}{brl(selecionadas[0].amount)}
                {selecionadas[0].dueDate && ` · vence ${fmtData(selecionadas[0].dueDate)}`}
              </p>
            ) : (
              <p>Somando <b className="text-mirai-ink">{brl(soma(selecionadas))}</b>.</p>
            )}
            {noAsaas && <p>A exclusão vale também no Asaas. Cobrança já paga o Asaas não deixa excluir.</p>}

            {assinaturas.length > 0 && (
              <div className="rounded-xl bg-mcsystem-50 border border-[rgba(11,20,11,0.08)] p-3 space-y-1">
                <p className="font-semibold text-mirai-ink">
                  {assinaturas.length === 1
                    ? `É de uma assinatura ativa de ${brl(assinaturas[0].sub!.value)} por mês.`
                    : `São de ${assinaturas.length} assinaturas ativas.`}
                </p>
                <p>
                  Excluindo só {umaSo ? 'esta' : 'estas'}, a assinatura continua e gera a cobrança do próximo mês.
                  {futurasAssinatura.length > 0 && ` Já há mais ${futurasAssinatura.length} emitida(s) à frente (${brl(soma(futurasAssinatura))}).`}
                </p>
              </div>
            )}

            {parcelamentos.length > 0 && (
              <div className="rounded-xl bg-mcsystem-50 border border-[rgba(11,20,11,0.08)] p-3 space-y-1">
                <p className="font-semibold text-mirai-ink">
                  {parcelamentos.length === 1 ? 'Faz parte de um parcelamento.' : `São de ${parcelamentos.length} parcelamentos.`}
                </p>
                <p>
                  Há mais {futurasParcelas.length} parcela(s) em aberto à frente ({brl(soma(futurasParcelas))}).
                  {' '}Excluindo só {umaSo ? 'esta' : 'estas'}, elas continuam valendo.
                </p>
              </div>
            )}

            {antigas.length > 0 && (
              <p className="flex gap-2 rounded-xl bg-amber-50 border border-amber-200 p-3 text-amber-900">
                <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
                <span>
                  Cancelar a assinatura também apaga {antigas.length} cobrança(s) em aberto mais antiga(s),
                  somando <b>{brl(soma(antigas))}</b>: o Asaas não mantém o que está em aberto numa assinatura excluída.
                </span>
              </p>
            )}
          </div>

          <div className="px-6 py-4 bg-gray-50 flex flex-wrap justify-end gap-2">
            <button onClick={desistir} className="px-4 py-2 rounded-xl text-sm text-gray-600 hover:bg-gray-200">Voltar</button>
            <button onClick={() => executar(pedido, false)}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold ${plano.length
                ? 'bg-white border border-gray-300 text-gray-800 hover:bg-gray-100'
                : 'bg-red-600 text-white hover:bg-red-700'}`}>
              <Trash2 size={15} /> {plano.length ? (umaSo ? 'Só esta' : 'Só estas') : 'Excluir'}
            </button>
            {plano.length > 0 && (
              <button onClick={() => executar(pedido, true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-red-600 text-white hover:bg-red-700">
                <Trash2 size={15} /> {umaSo ? 'Esta e todas as futuras' : 'Estas e todas as futuras'}
              </button>
            )}
          </div>
        </div>
      </div>,
      document.body,
    );
  }, [pedido]);

  return { pedirExclusao, dialogoExclusao };
}
