/**
 * Faturamento e custo de cada sistema (Hello Growth, Kaivaa, MDT Cobranças).
 *
 * Receita vem do produto do lançamento (com rateio entre produtos). Custo é a
 * despesa marcada com o sistema no campo "Sistema" do lançamento — o que não
 * tem sistema é compartilhado e fica de fora, só com o total avisado no rodapé.
 *
 * MDT: a receita dos acordos não é toda da Mirai. Do que o devedor paga, 80%
 * vai para o cliente credor e 2% para o Diego da BR Clin; fica 18%.
 */

import React, { useMemo, useState } from 'react';
import { CalendarClock, Info, Layers, TrendingDown, TrendingUp, Users, Wallet } from 'lucide-react';
import { ChartOfAccount, Company, FinancialRecord, Product, Subscription } from '../types';
import { isProjected, projectSubscriptions } from '../lib/subscriptionProjection';

interface SystemsReportProps {
  records: FinancialRecord[];
  subscriptions: Subscription[];
  products: Product[];
  companies: Company[];
  chartOfAccounts: ChartOfAccount[];
}

/** Partilha dos acordos do MDT, sobre o valor pago pelo devedor. */
const REPASSE_CREDOR = 0.80;
const REPASSE_BRCLIN = 0.02;

type SistemaKey = 'HG' | 'KAIVAA' | 'MDT';

const SISTEMAS: { key: SistemaKey; nome: string; produtos: string[]; acordo?: string[] }[] = [
  // Hello Rating foi absorvido pelo Hello Growth; o que sobrar com o nome
  // antigo continua contando aqui.
  { key: 'HG', nome: 'Hello Growth', produtos: ['hellogrowth', 'hellorating'] },
  { key: 'KAIVAA', nome: 'Kaivaa', produtos: ['kaivaa'] },
  { key: 'MDT', nome: 'MDT Cobranças', produtos: ['mdtcobrancas'], acordo: ['acordo'] },
];

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const norm = (s?: string) => (s || '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');
const brl = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const brl0 = (v: number) =>
  Math.abs(v) < 0.5 ? '-' : new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(v);

/** Mês de competência — o mesmo critério do DRE. */
const mesDe = (r: FinancialRecord) => (r.competenceDate || r.dueDate || '').slice(0, 7);

/** Quanto da receita pertence aos produtos, respeitando o rateio. */
const fatia = (r: FinancialRecord, ids: Set<string>) =>
  r.split_revenue?.length
    ? r.split_revenue.filter(sp => sp.product_id && ids.has(sp.product_id)).reduce((a, sp) => a + (sp.amount || 0), 0)
    : r.product_id && ids.has(r.product_id) ? r.amount : 0;

export const SystemsReport: React.FC<SystemsReportProps> = ({
  records, subscriptions, products, companies, chartOfAccounts,
}) => {
  const anoAtual = new Date().getFullYear();
  const mesAtual = new Date().toISOString().slice(0, 7);
  const [sistema, setSistema] = useState<SistemaKey>('HG');
  const [ano, setAno] = useState(anoAtual);
  const [comPrevisto, setComPrevisto] = useState(true);

  const cfg = SISTEMAS.find(s => s.key === sistema)!;
  const idsDe = (nomes: string[]) =>
    new Set(products.filter(p => nomes.includes(norm(p.name))).map(p => p.id));
  const idsProduto = useMemo(() => idsDe(cfg.produtos), [products, sistema]);
  const idsAcordo = useMemo(() => idsDe(cfg.acordo || []), [products, sistema]);
  const idsTodos = useMemo(() => new Set([...idsProduto, ...idsAcordo]), [idsProduto, idsAcordo]);

  const anos = useMemo(() => {
    const s = new Set<number>([anoAtual]);
    records.forEach(r => { const y = Number(mesDe(r).slice(0, 4)); if (y > 2000) s.add(y); });
    return [...s].sort((a, b) => b - a);
  }, [records]);

  const chaves = MESES.map((_, i) => `${ano}-${String(i + 1).padStart(2, '0')}`);

  /** Lançamentos do ano + renovações que o Asaas ainda não emitiu. */
  const base = useMemo(() => {
    const validos = records.filter(r => !r.needsValidation && !r.non_operating);
    const previstos = comPrevisto && ano >= anoAtual
      ? projectSubscriptions(subscriptions, records, { fromMonth: mesAtual, toMonth: `${ano}-12` })
      : [];
    return [...validos, ...previstos].filter(r => mesDe(r).startsWith(String(ano)));
  }, [records, subscriptions, ano, comPrevisto]);

  const dados = useMemo(() => {
    const zero = () => Object.fromEntries(chaves.map(k => [k, 0])) as Record<string, number>;
    const mensal = zero(), acordos = zero(), custos = zero(), compartilhado = zero();
    const porCliente = new Map<string, { receita: number; ultimo: string }>();
    const porRubrica = new Map<string, number>();
    let previsto = 0;

    for (const r of base) {
      const k = mesDe(r);
      if (!(k in mensal)) continue;
      if (r.amount > 0) {
        const m = fatia(r, idsProduto);
        const a = fatia(r, idsAcordo);
        if (!m && !a) continue;
        mensal[k] += m;
        acordos[k] += a;
        if (isProjected(r)) previsto += m + a;
        const cid = r.companyId || '';
        const c = porCliente.get(cid) || { receita: 0, ultimo: '' };
        c.receita += m + a;
        if (k > c.ultimo) c.ultimo = k;
        porCliente.set(cid, c);
      } else if (r.amount < 0) {
        if (r.product_id && idsTodos.has(r.product_id)) {
          custos[k] += r.amount;
          const nome = chartOfAccounts.find(c => c.id === r.rubricId)?.rubricName || r.category || 'Sem rubrica';
          porRubrica.set(nome, (porRubrica.get(nome) || 0) + r.amount);
        } else if (!r.product_id) {
          compartilhado[k] += r.amount;
        }
      }
    }

    const credor = zero(), brclin = zero(), liquida = zero(), resultado = zero();
    chaves.forEach(k => {
      credor[k] = -acordos[k] * REPASSE_CREDOR;
      brclin[k] = -acordos[k] * REPASSE_BRCLIN;
      liquida[k] = mensal[k] + acordos[k] + credor[k] + brclin[k];
      resultado[k] = liquida[k] + custos[k];
    });
    const soma = (o: Record<string, number>) => chaves.reduce((a, k) => a + o[k], 0);

    return {
      mensal, acordos, credor, brclin, liquida, custos, resultado, compartilhado, soma, previsto,
      clientes: [...porCliente.entries()]
        .map(([id, v]) => ({ id, nome: companies.find(c => c.id === id)?.name || 'Sem cliente', ...v }))
        .sort((a, b) => b.receita - a.receita),
      rubricas: [...porRubrica.entries()].sort((a, b) => a[1] - b[1]),
    };
  }, [base, idsProduto, idsAcordo, idsTodos, companies, chartOfAccounts, ano]);

  /** Assinaturas ativas hoje: a receita recorrente que o sistema tem contratada. */
  const recorrente = useMemo(() => {
    const ativas = subscriptions.filter(s => (s.status || 'ACTIVE').toUpperCase() === 'ACTIVE');
    let mrr = 0;
    const clientes = new Set<string>();
    let manuais = 0;
    for (const s of ativas) {
      const v = s.split_products?.length
        ? s.split_products.filter(sp => sp.product_id && idsProduto.has(sp.product_id))
            .reduce((a, sp) => a + (s.value || 0) * sp.pct / 100, 0)
        : s.product_id && idsProduto.has(s.product_id) ? s.value || 0 : 0;
      if (!v) continue;
      mrr += v;
      if (s.client_id) clientes.add(s.client_id);
      if (!s.asaas_id) manuais += 1;
    }
    return { mrr, clientes: clientes.size, manuais };
  }, [subscriptions, idsProduto]);

  const ehMDT = sistema === 'MDT';
  const receitaAno = dados.soma(ehMDT ? dados.liquida : dados.mensal);
  const custoAno = dados.soma(dados.custos);
  const resultadoAno = dados.soma(dados.resultado);
  const margem = receitaAno > 0 ? resultadoAno / receitaAno : 0;
  const compartilhadoAno = dados.soma(dados.compartilhado);

  const linhas: { nome: string; valores: Record<string, number>; destaque?: boolean; sub?: boolean; tom?: string }[] = ehMDT
    ? [
        { nome: 'Mensalidades MDT', valores: dados.mensal, sub: true },
        { nome: 'Acordos recebidos', valores: dados.acordos, sub: true },
        { nome: 'Repasse ao credor (80%)', valores: dados.credor, sub: true, tom: 'neg' },
        { nome: 'Diego BR Clin (2%)', valores: dados.brclin, sub: true, tom: 'neg' },
        { nome: 'RECEITA LÍQUIDA MIRAI', valores: dados.liquida, destaque: true },
        { nome: 'CUSTOS DO SISTEMA', valores: dados.custos, destaque: true, tom: 'neg' },
        { nome: 'RESULTADO', valores: dados.resultado, destaque: true },
      ]
    : [
        { nome: 'FATURAMENTO', valores: dados.mensal, destaque: true },
        { nome: 'CUSTOS DO SISTEMA', valores: dados.custos, destaque: true, tom: 'neg' },
        { nome: 'RESULTADO', valores: dados.resultado, destaque: true },
      ];

  const Kpi: React.FC<{ label: string; valor: string; extra?: string; icon: React.ReactNode; tom?: string }> = ({ label, valor, extra, icon, tom }) => (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-gray-400">
        {label}{icon}
      </div>
      <p className={`mt-2 text-2xl font-bold tabular-nums ${tom || 'text-gray-800'}`}>{valor}</p>
      {extra && <p className="text-xs text-gray-500 mt-1">{extra}</p>}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex bg-gray-100 p-1 rounded-lg w-fit">
          {SISTEMAS.map(s => (
            <button key={s.key} onClick={() => setSistema(s.key)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${sistema === s.key ? 'bg-white text-mcsystem-600 shadow-sm font-bold' : 'text-gray-500 hover:text-gray-700'}`}>
              {s.nome}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <select value={ano} onChange={e => setAno(Number(e.target.value))}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white">
            {anos.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <label className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white cursor-pointer select-none">
            <input type="checkbox" checked={comPrevisto} onChange={e => setComPrevisto(e.target.checked)}
              className="rounded border-gray-300 text-mcsystem-600" />
            Incluir renovações previstas
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Kpi label="Recorrente hoje" valor={brl(recorrente.mrr)} icon={<Wallet size={16} />}
          extra={`${recorrente.clientes} cliente(s) com assinatura ativa${recorrente.manuais ? ` · ${recorrente.manuais} fora do Asaas` : ''}`} />
        <Kpi label={ehMDT ? `Receita líquida ${ano}` : `Faturamento ${ano}`} valor={brl(receitaAno)} icon={<TrendingUp size={16} />}
          extra={dados.previsto ? `inclui ${brl(dados.previsto)} previsto` : undefined} />
        <Kpi label={`Custos ${ano}`} valor={brl(custoAno)} icon={<TrendingDown size={16} />} tom="text-red-600"
          extra={custoAno === 0 ? 'nenhuma despesa marcada com este sistema' : undefined} />
        <Kpi label={`Resultado ${ano}`} valor={brl(resultadoAno)} icon={<Layers size={16} />}
          tom={resultadoAno >= 0 ? 'text-green-700' : 'text-red-600'}
          extra={receitaAno > 0 ? `margem ${(margem * 100).toFixed(1)}%` : undefined} />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 uppercase text-[11px] tracking-wider">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Item</th>
                {chaves.map((k, i) => (
                  <th key={k} className={`px-3 py-3 text-right font-semibold ${k > mesAtual ? 'text-blue-500' : ''}`}>
                    {MESES[i]}{k > mesAtual && <CalendarClock size={10} className="inline ml-1 -mt-0.5" />}
                  </th>
                ))}
                <th className="px-4 py-3 text-right font-semibold bg-gray-100">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {linhas.map(l => {
                const total = dados.soma(l.valores);
                return (
                  <tr key={l.nome} className={l.destaque ? 'bg-gray-50/60 font-bold text-gray-800' : 'text-gray-600'}>
                    <td className={`px-4 py-2.5 whitespace-nowrap ${l.sub ? 'pl-8 font-normal' : ''}`}>{l.nome}</td>
                    {chaves.map(k => (
                      <td key={k} className={`px-3 py-2.5 text-right tabular-nums whitespace-nowrap ${l.valores[k] < 0 ? 'text-red-600' : l.valores[k] > 0 && l.destaque ? 'text-green-700' : ''}`}>
                        {brl0(l.valores[k])}
                      </td>
                    ))}
                    <td className={`px-4 py-2.5 text-right tabular-nums bg-gray-100/70 ${total < 0 ? 'text-red-600' : total > 0 ? 'text-green-700' : ''}`}>{brl0(total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-500 flex items-start gap-2">
          <Info size={14} className="mt-0.5 flex-shrink-0 text-gray-400" />
          <span>
            Por competência, como no DRE. Meses em azul são previsão.
            {ehMDT && ' Repasse calculado sobre o valor dos acordos: 80% ao credor, 2% ao Diego da BR Clin, 18% Mirai.'}
            {compartilhadoAno < 0 && ` Há ${brl(-compartilhadoAno)} de despesas sem sistema em ${ano} (custo compartilhado), que não entram aqui — marque o sistema na despesa para atribuir.`}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2 font-bold text-gray-800">
            <Users size={16} className="text-mcsystem-500" /> Clientes em {ano}
            <span className="ml-auto text-xs font-normal text-gray-400">{dados.clientes.length}</span>
          </div>
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 uppercase text-[11px] tracking-wider sticky top-0">
                <tr>
                  <th className="px-4 py-2.5 text-left font-semibold">Cliente</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Último mês</th>
                  <th className="px-4 py-2.5 text-right font-semibold">{ehMDT ? 'Valor bruto' : 'Faturamento'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {dados.clientes.length === 0 ? (
                  <tr><td colSpan={3} className="px-4 py-10 text-center text-gray-400">Sem receita neste ano.</td></tr>
                ) : dados.clientes.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50/70">
                    <td className="px-4 py-2.5 text-gray-800">{c.nome}</td>
                    <td className={`px-4 py-2.5 tabular-nums ${c.ultimo > mesAtual ? 'text-blue-600' : 'text-gray-500'}`}>
                      {c.ultimo ? `${MESES[Number(c.ultimo.slice(5)) - 1]}/${c.ultimo.slice(2, 4)}` : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-green-700">{brl(c.receita)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2 font-bold text-gray-800">
            <TrendingDown size={16} className="text-red-500" /> Custos por rubrica em {ano}
          </div>
          {dados.rubricas.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-gray-400">
              Nenhuma despesa marcada com {cfg.nome}.<br />
              Abra a despesa (em Lançamentos, DRE ou Fluxo de Caixa) e escolha o sistema.
            </p>
          ) : (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                {dados.rubricas.map(([nome, v]) => (
                  <tr key={nome}>
                    <td className="px-5 py-2.5 text-gray-700">{nome}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-red-600 font-semibold">{brl(v)}</td>
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
