import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import { ChartOfAccount, Company, FinancialRecord } from '../types';
import { RecordsDrillModal } from './RecordsDrillModal';
import {
  RUBRICA_ENTRADA, RUBRICA_SAIDA, cobrancasMensageria, custosMensageria, emAberto,
} from '../lib/mensageria';

interface MensageriaReportProps {
  records: FinancialRecord[];
  companies: Company[];
  chartOfAccounts: ChartOfAccount[];
}

const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const nomeMes = (mk: string) => `${MESES[Number(mk.slice(5, 7)) - 1]}/${mk.slice(0, 4)}`;

type Linha = {
  mes: string;
  custo: number;
  cobrado: number;
  recebido: number;
  aberto: number;
  custoRecs: FinancialRecord[];
  cobradoRecs: FinancialRecord[];
  abertoRecs: FinancialRecord[];
};

/**
 * Mensageria por mês de consumo. O DRE é de caixa: o cliente paga e o Facebook
 * é reembolsado no mês seguinte ao do uso, então o DRE de um mês não mostra se
 * a mensageria daquele mês fechou. Aqui custo e cobrança do mesmo consumo ficam
 * na mesma linha, e a diferença é o que fica com a Mirai (uso interno, IOF).
 */
export const MensageriaReport: React.FC<MensageriaReportProps> = ({ records, companies, chartOfAccounts }) => {
  const [ano, setAno] = useState(new Date().getFullYear());
  const [aberto, setAberto] = useState<string | null>(null);
  const [drill, setDrill] = useState<{ title: string; records: FinancialRecord[]; total: number; rubrica: string } | null>(null);

  const cobrancas = useMemo(() => cobrancasMensageria(records), [records]);
  const custos = useMemo(() => custosMensageria(records), [records]);
  const nomeCliente = useMemo(() => new Map(companies.map(c => [c.id, c.name])), [companies]);

  const linhas = useMemo(() => {
    const porMes = new Map<string, Linha>();
    const linha = (mes: string) => {
      if (!porMes.has(mes)) porMes.set(mes, { mes, custo: 0, cobrado: 0, recebido: 0, aberto: 0, custoRecs: [], cobradoRecs: [], abertoRecs: [] });
      return porMes.get(mes)!;
    };
    for (const c of custos) {
      if (!c.mes.startsWith(String(ano))) continue;
      const l = linha(c.mes);
      l.custo += c.valor;
      if (!l.custoRecs.includes(c.record)) l.custoRecs.push(c.record);
    }
    for (const c of cobrancas) {
      if (!c.mes.startsWith(String(ano))) continue;
      const l = linha(c.mes);
      l.cobrado += c.valor;
      l.cobradoRecs.push(c.record);
      if (emAberto(c.record)) { l.aberto += c.valor; l.abertoRecs.push(c.record); } else l.recebido += c.valor;
    }
    return [...porMes.values()].sort((a, b) => b.mes.localeCompare(a.mes));
  }, [custos, cobrancas, ano]);

  const porCliente = (mes: string) => {
    const m = new Map<string, { nome: string; cobrado: number; aberto: number; recs: FinancialRecord[] }>();
    for (const c of cobrancas) {
      if (c.mes !== mes) continue;
      const id = c.record.companyId || '';
      if (!m.has(id)) m.set(id, { nome: nomeCliente.get(id) || 'Sem cliente', cobrado: 0, aberto: 0, recs: [] });
      const x = m.get(id)!;
      x.cobrado += c.valor;
      if (emAberto(c.record)) x.aberto += c.valor;
      x.recs.push(c.record);
    }
    return [...m.values()].sort((a, b) => b.cobrado - a.cobrado);
  };

  const total = linhas.reduce((t, l) => ({
    custo: t.custo + l.custo, cobrado: t.cobrado + l.cobrado, recebido: t.recebido + l.recebido, aberto: t.aberto + l.aberto,
  }), { custo: 0, cobrado: 0, recebido: 0, aberto: 0 });

  const abrir = (title: string, recs: FinancialRecord[], valor: number, rubrica: string) =>
    recs.length > 0 && setDrill({ title, records: recs, total: rubrica === RUBRICA_SAIDA ? -valor : valor, rubrica });

  const celula = (valor: number, onClick?: () => void, tom = 'text-gray-900') => (
    <td className="px-4 py-3 text-right tabular-nums">
      {valor ? (
        <button onClick={onClick} className={`${tom} hover:underline`}>{brl(valor)}</button>
      ) : <span className="text-gray-300">—</span>}
    </td>
  );

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-200/80 p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setAno(a => a - 1)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><ChevronLeft size={18} /></button>
          <span className="text-sm font-semibold text-gray-900 w-12 text-center">{ano}</span>
          <button onClick={() => setAno(a => a + 1)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><ChevronRight size={18} /></button>
        </div>
        <p className="text-xs text-gray-500 max-w-xl">
          Cada linha é um mês de consumo: o que a Mirai pagou ao Facebook e o que cobrou dos clientes por aquele uso,
          mesmo que o dinheiro tenha entrado no mês seguinte. A diferença é o que fica com a Mirai.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200/80 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3 text-left">Mês de consumo</th>
              <th className="px-4 py-3 text-right">Custo Facebook</th>
              <th className="px-4 py-3 text-right">Cobrado dos clientes</th>
              <th className="px-4 py-3 text-right">Recebido</th>
              <th className="px-4 py-3 text-right">Em aberto</th>
              <th className="px-4 py-3 text-right">Fica com a Mirai</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {linhas.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Nenhuma mensageria com consumo em {ano}.</td></tr>
            )}
            {linhas.map(l => {
              const dif = l.custo - l.cobrado;
              const expandido = aberto === l.mes;
              return (
                <React.Fragment key={l.mes}>
                  <tr className="hover:bg-gray-50/60">
                    <td className="px-4 py-3">
                      <button onClick={() => setAberto(expandido ? null : l.mes)} className="flex items-center gap-1.5 font-medium text-gray-900">
                        {expandido ? <ChevronUp size={15} /> : <ChevronDown size={15} />} {nomeMes(l.mes)}
                      </button>
                    </td>
                    {celula(l.custo, () => abrir(`Custo Facebook · ${nomeMes(l.mes)}`, l.custoRecs, l.custo, RUBRICA_SAIDA))}
                    {celula(l.cobrado, () => abrir(`Cobrado dos clientes · ${nomeMes(l.mes)}`, l.cobradoRecs, l.cobrado, RUBRICA_ENTRADA))}
                    {celula(l.recebido, undefined, 'text-green-700')}
                    {celula(l.aberto, () => abrir(`Em aberto · ${nomeMes(l.mes)}`, l.abertoRecs, l.aberto, RUBRICA_ENTRADA), 'text-red-600 font-semibold')}
                    <td className={`px-4 py-3 text-right tabular-nums font-semibold ${dif > 0 ? 'text-gray-900' : 'text-green-700'}`}>
                      {l.custo ? brl(dif) : <span className="text-gray-300 font-normal" title="Sem o custo do Facebook lançado para este mês">sem custo</span>}
                    </td>
                  </tr>
                  {expandido && (
                    <tr className="bg-gray-50/70">
                      <td colSpan={6} className="px-4 py-3">
                        <table className="w-full text-xs">
                          <thead className="text-gray-500">
                            <tr>
                              <th className="py-1.5 text-left font-medium">Cliente</th>
                              <th className="py-1.5 text-right font-medium">Cobrado</th>
                              <th className="py-1.5 text-right font-medium">Em aberto</th>
                            </tr>
                          </thead>
                          <tbody>
                            {porCliente(l.mes).map(c => (
                              <tr key={c.nome} className="border-t border-gray-200/70">
                                <td className="py-1.5 text-gray-700">{c.nome}</td>
                                <td className="py-1.5 text-right tabular-nums">
                                  <button className="hover:underline" onClick={() => abrir(`${c.nome} · ${nomeMes(l.mes)}`, c.recs, c.cobrado, RUBRICA_ENTRADA)}>{brl(c.cobrado)}</button>
                                </td>
                                <td className={`py-1.5 text-right tabular-nums ${c.aberto ? 'text-red-600 font-semibold' : 'text-gray-300'}`}>
                                  {c.aberto ? brl(c.aberto) : '—'}
                                </td>
                              </tr>
                            ))}
                            {porCliente(l.mes).length === 0 && (
                              <tr><td colSpan={3} className="py-2 text-gray-400">Nenhum cliente cobrado por este consumo.</td></tr>
                            )}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
          {linhas.length > 0 && (
            <tfoot className="bg-gray-50 font-semibold text-gray-900">
              <tr>
                <td className="px-4 py-3">Total {ano}</td>
                <td className="px-4 py-3 text-right tabular-nums">{brl(total.custo)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{brl(total.cobrado)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-green-700">{brl(total.recebido)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-red-600">{brl(total.aberto)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{brl(total.custo - total.cobrado)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <RecordsDrillModal
        open={!!drill}
        onClose={() => setDrill(null)}
        title={drill?.title || ''}
        subtitle="Mensageria e ads, pelo mês de consumo"
        records={drill?.records || []}
        expectedTotal={drill?.total}
        companies={companies}
        chartOfAccounts={chartOfAccounts}
        focusRubricIds={drill ? [drill.rubrica] : undefined}
      />
    </div>
  );
};
