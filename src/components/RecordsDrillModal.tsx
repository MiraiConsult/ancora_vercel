/**
 * Detalhe de um número de relatório: quais lançamentos formam aquele valor.
 *
 * É o mesmo modal no Fluxo de Caixa, no DRE, nos Relatórios e no Contas a
 * Pagar — antes cada tela tinha (ou não tinha) o seu, e quem clicava num total
 * do DRE via uma lista diferente da do Fluxo para o mesmo lançamento.
 *
 * Aqui é só leitura. Editar um lançamento se faz em Lançamentos, e a lista
 * inclui renovações previstas, que sequer existem no banco.
 */

import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { ArrowDown, ArrowUp, ArrowUpDown, CalendarClock, Download, List, X } from 'lucide-react';
import { ChartOfAccount, Company, FinancialRecord, Product, RevenueType, Supplier, TransactionStatus } from '../types';
import { isProjected } from '../lib/subscriptionProjection';

interface RecordsDrillModalProps {
  open: boolean;
  onClose: () => void;
  /** Nome do número clicado, ex. "VENDAS CARTÃO CRÉDITO · out/2026". */
  title: string;
  /** Linha de contexto: período, filtro, o que exatamente entrou na conta. */
  subtitle?: string;
  records: FinancialRecord[];
  /**
   * Valor que a tela mostrava naquele número. Serve para o rodapé avisar
   * quando a soma dos lançamentos não bate — normalmente rateio.
   */
  expectedTotal?: number;
  companies?: Company[];
  suppliers?: Supplier[];
  products?: Product[];
  chartOfAccounts?: ChartOfAccount[];
  revenueTypes?: RevenueType[];
  /**
   * Rubricas por trás do número clicado. Preenchida, o lançamento rateado entra
   * só com as fatias dessas rubricas — é o que faz a soma da lista fechar com a
   * célula em vez de trazer o lançamento inteiro.
   */
  focusRubricIds?: string[];
  /**
   * Produtos (ou tipos de receita) por trás do número clicado. Mesma ideia da
   * rubrica: a receita rateada entra só com a fatia daquele produto. Use
   * 'SEM_PRODUTO' para a linha do que não tem produto.
   */
  focusProductIds?: string[];
  focusRevenueTypeIds?: string[];
  /**
   * Habilita trocar o produto direto na lista. Sem isso a coluna é só texto —
   * classificar exigia sair do relatório, achar o lançamento em Lançamentos e
   * voltar. Não aparece em renovação prevista (não existe no banco) nem em
   * linha de rateio (lá o produto está na fatia, não no lançamento).
   */
  onEditProduct?: (record: FinancialRecord, productId: string | null) => Promise<string[] | void> | void;
}

type SortKey = 'dueDate' | 'description' | 'party' | 'category' | 'status' | 'amount';

const brl = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const fmtDate = (iso?: string) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');

const STATUS_TONE: Record<string, string> = {
  Pago: 'bg-green-50 text-green-700 border-green-100',
  Pendente: 'bg-amber-50 text-amber-700 border-amber-100',
  Atrasado: 'bg-red-50 text-red-700 border-red-100',
};

export const RecordsDrillModal: React.FC<RecordsDrillModalProps> = ({
  open, onClose, title, subtitle, records, expectedTotal,
  companies = [], suppliers = [], products = [], chartOfAccounts = [], revenueTypes = [],
  focusRubricIds, focusProductIds, focusRevenueTypeIds, onEditProduct,
}) => {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'dueDate', dir: 1 });
  /**
   * A lista é um retrato tirado no clique — atualizar os lançamentos lá fora
   * não a reescreve. Guardar aqui o que foi trocado mantém o select mostrando
   * a escolha, sem fechar e reabrir o detalhe.
   */
  const [produtoEditado, setProdutoEditado] = useState<Record<string, string | null>>({});

  const hoje = new Date().toISOString().slice(0, 10);

  /** Cliente na entrada, fornecedor na saída — a coluna é a mesma. */
  const partyOf = (r: FinancialRecord) =>
    (r.supplier_id && suppliers.find(s => s.id === r.supplier_id)?.name)
    || (r.companyId && companies.find(c => c.id === r.companyId)?.name)
    || '—';

  /** O que classifica o lançamento: rubrica, produto ou tipo de receita. */
  const categoryOf = (r: FinancialRecord) => {
    const rubricas = r.split_rubrics?.length
      ? r.split_rubrics.map(sp => chartOfAccounts.find(c => c.id === sp.rubric_id)?.rubricName).filter(Boolean)
      : [chartOfAccounts.find(c => c.id === r.rubricId)?.rubricName].filter(Boolean);
    if (rubricas.length) return rubricas.join(' + ');
    const rt = revenueTypes.find(t => t.id === r.revenueTypeId)?.name;
    return rt || r.category || '—';
  };

  const productOf = (r: FinancialRecord) => {
    const nomes = r.split_revenue?.length
      ? r.split_revenue.map(sp => products.find(p => p.id === sp.product_id)?.name).filter(Boolean)
      : [products.find(p => p.id === r.product_id)?.name].filter(Boolean);
    return nomes.length ? nomes.join(' + ') : '—';
  };

  const statusOf = (r: FinancialRecord): string => {
    if (r.status === TransactionStatus.PAID) return 'Pago';
    return (r.dueDate || '') < hoje ? 'Atrasado' : 'Pendente';
  };

  const rubricName = (id?: string) => chartOfAccounts.find(c => c.id === id)?.rubricName;

  /**
   * Lançamento rateado entre rubricas vira uma linha por fatia, com a descrição
   * e a rubrica daquela fatia. Antes ele aparecia inteiro, com as rubricas
   * concatenadas e o valor cheio — quem clicou numa rubrica via um número que
   * não era o dela, e a lista precisava de uma nota de rodapé se explicando.
   */
  const linhas = useMemo(() => {
    const l = records.flatMap(r => {
      const base = { r, party: partyOf(r), product: productOf(r), status: statusOf(r) };
      const rateio = r.split_rubrics?.length ? r.split_rubrics : null;

      // Receita dividida entre produtos: a fatia do produto clicado é a linha.
      // Sem isso, "Hello Rating" mostrava a mensalidade inteira de Kaivaa +
      // HelloGrowth, e a lista somava mais que a célula.
      const porReceita = !rateio && (focusProductIds || focusRevenueTypeIds) && r.split_revenue?.length
        ? r.split_revenue : null;
      if (porReceita) {
        const chave = (sp: { product_id?: string; revenue_type_id?: string }) =>
          focusProductIds ? (sp.product_id || 'SEM_PRODUTO') : (sp.revenue_type_id || 'SEM_PRODUTO');
        const alvos = focusProductIds || focusRevenueTypeIds!;
        return porReceita
          .filter(sp => alvos.includes(chave(sp)))
          .map((sp, i) => ({
            ...base, key: r.id + '#p' + i,
            description: r.description || '—', origem: null as string | null,
            category: categoryOf(r),
            product: (focusProductIds
              ? products.find(x => x.id === sp.product_id)?.name
              : revenueTypes.find(x => x.id === sp.revenue_type_id)?.name) || 'Sem produto',
            amount: sp.amount || 0,
          }));
      }

      if (!rateio) {
        return [{
          ...base, key: r.id, description: r.description || '—', origem: null as string | null,
          category: categoryOf(r), amount: r.amount || 0,
        }];
      }
      // Fatia de outra rubrica não entrou naquele número — não entra na lista.
      return rateio
        .filter(f => !focusRubricIds || focusRubricIds.includes(f.rubric_id))
        .map((f, i) => ({
          ...base, key: `${r.id}#${i}`,
          description: f.description || r.description || '—',
          // Rastro de onde a fatia saiu, sem virar o nome da linha.
          origem: f.description ? (r.description || null) : null,
          category: rubricName(f.rubric_id) || r.category || '—',
          amount: f.amount || 0,
        }));
    });
    const pick = (x: typeof l[number]): string | number => {
      switch (sort.key) {
        case 'amount': return x.amount;
        case 'description': return x.description.toLowerCase();
        case 'party': return x.party.toLowerCase();
        case 'category': return x.category.toLowerCase();
        case 'status': return x.status;
        default: return x.r.dueDate || '';
      }
    };
    return l.sort((a, b) => {
      const va = pick(a), vb = pick(b);
      if (va === vb) return 0;
      return (va > vb ? 1 : -1) * sort.dir;
    });
  }, [records, sort, focusRubricIds, focusProductIds, focusRevenueTypeIds,
      companies, suppliers, products, chartOfAccounts, revenueTypes]);

  const total = linhas.reduce((s, x) => s + x.amount, 0);
  const previsto = linhas.filter(x => isProjected(x.r)).reduce((s, x) => s + x.amount, 0);
  /** Linhas podem ser mais que lançamentos: um rateado ocupa várias. */
  const qtdLancamentos = new Set(linhas.map(x => x.r.id)).size;
  // Rateio faz a soma dos lançamentos passar do valor da célula: o lançamento
  // inteiro aparece na lista, mas só uma fatia dele entrou naquele número.
  const divergente = expectedTotal !== undefined && Math.abs(total - expectedTotal) > 0.01;

  const exportar = () => {
    const head = ['Vencimento', 'Competência', 'Descrição', 'Cliente/Fornecedor', 'Categoria', 'Produto', 'Status', 'Valor'];
    const body = linhas.map(x => [
      fmtDate(x.r.dueDate), fmtDate(x.r.competenceDate), x.description,
      x.party, x.category, x.product, x.status, x.amount,
    ]);
    const ws = XLSX.utils.aoa_to_sheet([[title], subtitle ? [subtitle] : [], head, ...body, [], ['TOTAL', '', '', '', '', '', '', total]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Detalhe');
    XLSX.writeFile(wb, `detalhe-${title.replace(/[^\w]+/g, '-').toLowerCase()}.xlsx`);
  };

  if (!open) return null;

  const Th: React.FC<{ k: SortKey; children: React.ReactNode; align?: string }> = ({ k, children, align = 'text-left' }) => (
    <th className={`px-4 py-2.5 font-semibold ${align}`}>
      <button
        onClick={() => setSort(s => (s.key === k ? { key: k, dir: (s.dir * -1) as 1 | -1 } : { key: k, dir: 1 }))}
        className="inline-flex items-center gap-1 hover:text-mcsystem-600"
      >
        {children}
        {sort.key !== k ? <ArrowUpDown size={11} className="text-gray-300" />
          : sort.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
      </button>
    </th>
  );

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[90] p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex justify-between items-center gap-4 rounded-t-2xl">
          <div className="min-w-0">
            <h3 className="font-bold text-gray-800 flex items-center gap-2 truncate">
              <List size={17} className="text-mcsystem-500 flex-shrink-0" />{title}
            </h3>
            <p className="text-xs text-gray-400 mt-0.5 truncate">
              {subtitle ? `${subtitle} · ` : ''}{qtdLancamentos} lançamento(s)
              {linhas.length > qtdLancamentos && ` · ${linhas.length} linhas de rateio`}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={exportar} disabled={linhas.length === 0}
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-white disabled:opacity-40 flex items-center gap-1.5">
              <Download size={14} /> Excel
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-200"><X size={20} /></button>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {linhas.length === 0 ? (
            <p className="px-6 py-14 text-center text-sm text-gray-400">Nenhum lançamento por trás deste valor.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 uppercase text-[11px] tracking-wider sticky top-0 z-10">
                <tr>
                  <Th k="dueDate">Vencimento</Th>
                  <th className="px-4 py-2.5 font-semibold text-left">Competência</th>
                  <Th k="description">Descrição</Th>
                  <Th k="party">Cliente/Fornecedor</Th>
                  <Th k="category">Categoria</Th>
                  <th className="px-4 py-2.5 font-semibold text-left">Produto</th>
                  <Th k="status">Status</Th>
                  <Th k="amount" align="text-right">Valor</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {linhas.map(({ r, key, party, category, product, status, description, origem, amount }) => (
                  <tr key={key} className="hover:bg-gray-50/70">
                    <td className="px-4 py-2.5 whitespace-nowrap tabular-nums text-gray-600">{fmtDate(r.dueDate)}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap tabular-nums text-gray-400">{fmtDate(r.competenceDate)}</td>
                    <td className="px-4 py-2.5 font-medium text-gray-800">
                      {description}
                      {origem && <span className="block text-[11px] font-normal text-gray-400">de {origem}</span>}
                      {isProjected(r) && (
                        <span title="Renovação da assinatura que o Asaas ainda não emitiu"
                          className="ml-2 inline-flex items-center px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-medium align-middle">
                          <CalendarClock size={10} className="mr-1" /> Previsto
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{party}</td>
                    <td className="px-4 py-2.5 text-gray-600">{category}</td>
                    <td className="px-4 py-2.5 text-gray-400">
                      {onEditProduct && !key.includes('#') ? (
                        <select
                          value={(produtoEditado[r.id] !== undefined ? produtoEditado[r.id] : r.product_id) || ''}
                          onChange={async e => {
                            const pid = e.target.value || null;
                            setProdutoEditado(m => ({ ...m, [r.id]: pid }));
                            // Quem grava devolve tudo que mudou junto — aplicar
                            // "a todos iguais" tem que aparecer nas outras
                            // linhas da lista, não só naquela que foi clicada.
                            const alterados = await onEditProduct(r, pid);
                            if (Array.isArray(alterados) && alterados.length) {
                              setProdutoEditado(m => ({
                                ...m,
                                ...Object.fromEntries(alterados.map(id => [id, pid])),
                              }));
                            }
                          }}
                          className="w-full max-w-[190px] px-2 py-1 rounded-md border border-transparent bg-transparent text-gray-600 hover:border-gray-200 focus:border-mcsystem-500 focus:bg-white outline-none cursor-pointer"
                          title={isProjected(r)
                            ? 'Trocar o produto da assinatura — vale para todas as renovações'
                            : 'Trocar o produto deste lançamento'}
                        >
                          <option value="">Sem produto</option>
                          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      ) : product}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-medium border ${STATUS_TONE[status] || 'bg-gray-50 text-gray-600 border-gray-100'}`}>{status}</span>
                    </td>
                    <td className={`px-4 py-2.5 text-right font-semibold tabular-nums whitespace-nowrap ${amount >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {brl(amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 sticky bottom-0">
                <tr className="font-bold text-gray-800">
                  <td className="px-4 py-3" colSpan={7}>
                    {qtdLancamentos} lançamento(s)
                    {linhas.length > qtdLancamentos && <span className="ml-2 font-normal text-xs text-gray-500">em {linhas.length} linhas de rateio</span>}
                    {previsto !== 0 && <span className="ml-2 font-normal text-xs text-blue-600">inclui {brl(previsto)} de renovações previstas</span>}
                  </td>
                  <td className={`px-4 py-3 text-right tabular-nums ${total >= 0 ? 'text-green-700' : 'text-red-600'}`}>{brl(total)}</td>
                </tr>
                {divergente && (
                  <tr className="text-[11px] text-gray-500">
                    <td className="px-4 pb-3" colSpan={8}>
                      O número clicado é {brl(expectedTotal!)} e a lista soma {brl(total)}. A diferença costuma ser
                      rateio por produto, que divide o valor sem dividir o lançamento.
                    </td>
                  </tr>
                )}
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
