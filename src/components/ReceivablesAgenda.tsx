import React, { useMemo, useState, useEffect } from 'react';
import { FinancialRecord, Company, Product } from '../types';
import { asaasCustomerContacts, AsaasContact } from '../services/asaasService';
import {
  AlertTriangle, CalendarClock, CheckCircle2, ExternalLink, MessageCircle, Loader2,
  Search, Copy, Check, Phone, ChevronDown, QrCode, Pencil, Trash2, X,
} from 'lucide-react';
import { ChargeShareModal } from './ChargeShareModal';

interface ReceivablesAgendaProps {
  records: FinancialRecord[];
  companies: Company[];
  products: Product[];
  /** Mesmas ações da aba de assinaturas, para não ter que trocar de aba. */
  onEditCharge?: (r: FinancialRecord) => void;
  onDeleteCharge?: (r: FinancialRecord) => void;
  /** Exclusão em massa; devolve os ids que de fato saíram. */
  onDeleteCharges?: (rs: FinancialRecord[]) => Promise<string[]>;
}

const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const fmtDate = (iso?: string) => {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};
const todayISO = () => new Date().toISOString().slice(0, 10);
const daysBetween = (iso: string) => {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const d = new Date(iso.slice(0, 10) + 'T00:00:00');
  return Math.round((d.getTime() - t.getTime()) / 86400000);
};

/** Normaliza telefone brasileiro para o formato do wa.me */
const waPhone = (raw?: string | null) => {
  if (!raw) return null;
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('0')) d = d.replace(/^0+/, '');
  if (d.length === 10 || d.length === 11) d = '55' + d;      // DDD + número
  if (d.length === 12 || d.length === 13) return d;           // já com DDI
  return d.length >= 12 ? d : null;
};

const buildMessage = (clientName: string, r: FinancialRecord, late: number) => {
  const linha = late > 0
    ? `📅 Venceu em ${fmtDate(r.dueDate)} (${late} ${late === 1 ? 'dia' : 'dias'} em atraso)`
    : `📅 Vence em ${fmtDate(r.dueDate)}`;
  return [
    `Olá, ${clientName}! 👋`,
    '',
    late > 0
      ? 'Passando para lembrar que a cobrança abaixo está em aberto:'
      : 'Passando para lembrar da cobrança abaixo:',
    '',
    `📄 ${r.description || 'Cobrança'}`,
    `💰 ${brl(r.amount)}`,
    linha,
    ...(r.asaas_invoice_url ? ['', 'Link para pagamento:', r.asaas_invoice_url] : []),
    '',
    'Se já tiver efetuado o pagamento, por favor desconsidere. Qualquer dúvida, estou à disposição!',
  ].join('\n');
};

export const ReceivablesAgenda: React.FC<ReceivablesAgendaProps> = ({ records, companies, products, onEditCharge, onDeleteCharge, onDeleteCharges }) => {
  const [contacts, setContacts] = useState<Record<string, AsaasContact>>({});
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [horizon, setHorizon] = useState(30);
  const [shareCharge, setShareCharge] = useState<FinancialRecord | null>(null);
  /** Cobranças marcadas para agir em grupo (cobrar ou excluir). */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /**
   * Fila de cobrança: o navegador só deixa abrir uma janela do WhatsApp por
   * clique, então o disparo em massa passa cliente a cliente, cada um com o
   * seu clique.
   */
  const [fila, setFila] = useState<FinancialRecord[] | null>(null);
  const [filaPos, setFilaPos] = useState(0);
  const [copiouTodas, setCopiouTodas] = useState(false);

  const companyById = useMemo(() => new Map(companies.map(c => [c.id, c])), [companies]);
  const clientName = (id?: string) => companyById.get(id || '')?.name || 'Sem cliente';
  const productName = (id?: string | null) => products.find(p => p.id === id)?.name || null;

  // Contatos vêm do Asaas (telefone não fica guardado no nosso banco)
  useEffect(() => {
    let alive = true;
    setLoadingContacts(true);
    asaasCustomerContacts()
      .then(list => {
        if (!alive) return;
        const map: Record<string, AsaasContact> = {};
        list.forEach(c => { map[c.id] = c; });
        setContacts(map);
      })
      .catch(e => alive && setContactError(e.message))
      .finally(() => alive && setLoadingContacts(false));
    return () => { alive = false; };
  }, []);

  const contactFor = (companyId?: string) => {
    const asaasId = companyById.get(companyId || '')?.asaas_customer_id;
    return asaasId ? contacts[asaasId] : undefined;
  };

  const open = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records
      .filter(r => r.amount >= 0 && (r.status as string) !== 'Pago' && r.dueDate && !r.needsValidation)
      .filter(r => !q || clientName(r.companyId).toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q));
  }, [records, search, companies]);

  const today = todayISO();
  const overdue = useMemo(() =>
    open.filter(r => r.dueDate < today).sort((a, b) => a.dueDate.localeCompare(b.dueDate)), [open, today]);
  const upcoming = useMemo(() =>
    open.filter(r => r.dueDate >= today && daysBetween(r.dueDate) <= horizon)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate)), [open, today, horizon]);

  const sum = (list: FinancialRecord[]) => list.reduce((s, r) => s + r.amount, 0);

  // Na ordem da tela (atrasados, depois próximos). Some sozinho da seleção o
  // que saiu da lista — paga, excluída ou fora do filtro.
  const selecionadas = useMemo(
    () => [...overdue, ...upcoming].filter(r => selected.has(r.id)),
    [overdue, upcoming, selected],
  );
  const alternar = (id: string) => setSelected(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const alternarTodos = (list: FinancialRecord[]) => setSelected(prev => {
    const n = new Set(prev);
    const todos = list.every(r => n.has(r.id));
    list.forEach(r => (todos ? n.delete(r.id) : n.add(r.id)));
    return n;
  });
  // Funções que devolvem JSX, e não componentes: componente declarado aqui
  // dentro é um tipo novo a cada render, e o React remontava a lista inteira a
  // cada clique na caixinha — a tela voltava para o topo.
  const checkTodos = (list: FinancialRecord[], label: string) => (
    <input type="checkbox" aria-label={label} title={label}
      checked={list.length > 0 && list.every(r => selected.has(r.id))}
      onChange={() => alternarTodos(list)}
      className="h-4 w-4 rounded border-gray-300 accent-[#3c8d10] cursor-pointer" />
  );
  const dueToday = open.filter(r => r.dueDate === today);
  const next7 = open.filter(r => r.dueDate >= today && daysBetween(r.dueDate) <= 7);

  // Agrupa os próximos por data
  const upcomingByDate = useMemo(() => {
    const m = new Map<string, FinancialRecord[]>();
    upcoming.forEach(r => {
      if (!m.has(r.dueDate)) m.set(r.dueDate, []);
      m.get(r.dueDate)!.push(r);
    });
    return Array.from(m.entries());
  }, [upcoming]);

  const sendWhatsApp = (r: FinancialRecord) => {
    const c = contactFor(r.companyId);
    const phone = waPhone(c?.phone);
    const msg = buildMessage(clientName(r.companyId), r, Math.max(0, -daysBetween(r.dueDate)));
    if (!phone) {
      navigator.clipboard?.writeText(msg);
      alert(`Este cliente não tem telefone cadastrado no Asaas.\n\nA mensagem foi copiada para a área de transferência — é só colar no WhatsApp.`);
      return;
    }
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const copyMessage = (r: FinancialRecord) => {
    const msg = buildMessage(clientName(r.companyId), r, Math.max(0, -daysBetween(r.dueDate)));
    navigator.clipboard?.writeText(msg);
    setCopiedId(r.id);
    setTimeout(() => setCopiedId(null), 1600);
  };

  const renderRow = (r: FinancialRecord, late?: boolean) => {
    const c = contactFor(r.companyId);
    const hasPhone = !!waPhone(c?.phone);
    const lateDays = Math.max(0, -daysBetween(r.dueDate));
    const pn = productName(r.product_id);
    return (
      <div key={r.id} className={`flex flex-col md:flex-row md:items-center gap-3 px-5 py-3.5 transition-colors ${selected.has(r.id) ? 'bg-mcsystem-50' : 'hover:bg-gray-50'}`}>
        <div className="flex-1 min-w-0 flex items-start gap-3">
          <input type="checkbox" checked={selected.has(r.id)} onChange={() => alternar(r.id)}
            aria-label={`Selecionar cobrança de ${clientName(r.companyId)}`}
            className="mt-1 h-4 w-4 rounded border-gray-300 accent-[#3c8d10] cursor-pointer flex-shrink-0" />
          <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 truncate">{clientName(r.companyId)}</span>
            {pn && <span className="text-[11px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{pn}</span>}
            {!hasPhone && !loadingContacts && (
              <span className="text-[11px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                <Phone size={10} /> sem telefone
              </span>
            )}
          </div>
          <div className="text-xs text-gray-400 truncate mt-0.5">{r.description}</div>
          </div>
        </div>

        <div className="flex items-center gap-4 flex-shrink-0">
          <div className="text-right">
            <div className="font-semibold text-gray-900 tabular-nums">{brl(r.amount)}</div>
            <div className={`text-xs ${late ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
              {late ? `${lateDays} ${lateDays === 1 ? 'dia' : 'dias'} · ${fmtDate(r.dueDate)}` : fmtDate(r.dueDate)}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button onClick={() => sendWhatsApp(r)} title={hasPhone ? 'Cobrar via WhatsApp' : 'Copiar mensagem (sem telefone)'}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-[#25D366]/10 text-[#0f8a43] hover:bg-[#25D366]/20 transition-colors">
              <MessageCircle size={14} /> Cobrar
            </button>
            {r.asaas_payment_id && (
              <button onClick={() => setShareCharge(r)} title="Boleto, PIX e link para mandar ao cliente"
                className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
                <QrCode size={15} />
              </button>
            )}
            <button onClick={() => copyMessage(r)} title="Copiar mensagem"
              className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
              {copiedId === r.id ? <Check size={15} className="text-green-600" /> : <Copy size={15} />}
            </button>
            {r.asaas_invoice_url && (
              <a href={r.asaas_invoice_url} target="_blank" rel="noreferrer" title="Abrir fatura"
                className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
                <ExternalLink size={15} />
              </a>
            )}
            {onEditCharge && (
              <button onClick={() => onEditCharge(r)} title="Editar cobrança"
                className="p-2 text-gray-400 hover:text-mcsystem-600 hover:bg-gray-100 rounded-lg">
                <Pencil size={15} />
              </button>
            )}
            {onDeleteCharge && (
              <button onClick={() => onDeleteCharge(r)} title="Excluir cobrança (também no Asaas)"
                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                <Trash2 size={15} />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={`space-y-6 ${selecionadas.length > 0 ? 'pb-24' : ''}`}>
      {shareCharge && (
        <ChargeShareModal
          charge={shareCharge}
          clientName={clientName(shareCharge.companyId)}
          waPhone={waPhone(contactFor(shareCharge.companyId)?.phone)}
          onClose={() => setShareCharge(null)}
        />
      )}

      {/* Indicadores */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Em atraso" value={brl(sum(overdue))} hint={`${overdue.length} cobrança(s)`} tone="critical" />
        <Stat label="Vence hoje" value={brl(sum(dueToday))} hint={`${dueToday.length} cobrança(s)`} tone="warning" />
        <Stat label="Próximos 7 dias" value={brl(sum(next7))} hint={`${next7.length} cobrança(s)`} tone="neutral" />
        <Stat label={`Próximos ${horizon} dias`} value={brl(sum(upcoming))} hint={`${upcoming.length} cobrança(s)`} tone="neutral" />
      </div>

      {/* Busca + horizonte */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente ou descrição..."
            className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-gray-200 focus:border-gray-400 outline-none text-sm" />
        </div>
        <div className="relative">
          <select value={horizon} onChange={e => setHorizon(Number(e.target.value))}
            className="appearance-none pl-4 pr-9 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-medium outline-none focus:border-gray-400">
            <option value={7}>Próximos 7 dias</option>
            <option value={15}>Próximos 15 dias</option>
            <option value={30}>Próximos 30 dias</option>
            <option value={60}>Próximos 60 dias</option>
            <option value={90}>Próximos 90 dias</option>
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {contactError && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
          Não foi possível carregar os telefones do Asaas ({contactError}). Você ainda pode copiar as mensagens e colar no WhatsApp.
        </div>
      )}

      {/* Atrasados */}
      <div className="bg-white rounded-2xl border border-gray-200/80 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {overdue.length > 0 && checkTodos(overdue, 'Selecionar todos os atrasados')}
            <AlertTriangle size={17} className="text-red-500" />
            <h3 className="font-semibold text-gray-900">Atrasados</h3>
            <span className="text-xs text-gray-400">{overdue.length} · {brl(sum(overdue))}</span>
          </div>
          {loadingContacts && <span className="text-xs text-gray-400 flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> carregando contatos</span>}
        </div>
        {overdue.length === 0 ? (
          <div className="py-14 text-center">
            <CheckCircle2 size={36} className="mx-auto text-green-500/40 mb-2" />
            <p className="text-sm text-gray-400">Nenhuma cobrança em atraso 🎉</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {overdue.map(r => renderRow(r, true))}
          </div>
        )}
      </div>

      {/* Próximos vencimentos */}
      <div className="bg-white rounded-2xl border border-gray-200/80 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <CalendarClock size={17} className="text-gray-400" />
          <h3 className="font-semibold text-gray-900">Próximos vencimentos</h3>
          <span className="text-xs text-gray-400">{upcoming.length} · {brl(sum(upcoming))}</span>
        </div>
        {upcomingByDate.length === 0 ? (
          <div className="py-14 text-center text-sm text-gray-300">Nada a vencer nos próximos {horizon} dias</div>
        ) : (
          <div>
            {upcomingByDate.map(([date, list]) => {
              const d = daysBetween(date);
              const label = d === 0 ? 'Hoje' : d === 1 ? 'Amanhã' : `Em ${d} dias`;
              return (
                <div key={date}>
                  <div className="px-5 py-2 bg-gray-50/80 border-y border-gray-100 flex items-center justify-between">
                    <span className="flex items-center gap-2.5 text-xs font-semibold text-gray-600">
                      {checkTodos(list, `Selecionar as cobranças de ${fmtDate(date)}`)}
                      {fmtDate(date)} · {label}
                    </span>
                    <span className="text-xs text-gray-400 tabular-nums">{brl(list.reduce((s, r) => s + r.amount, 0))}</span>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {list.map(r => renderRow(r))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selecionadas.length > 0 && (
        // Fixa na tela, e não "sticky": o <main> do app tem overflow-x-hidden,
        // o que anula o sticky — a barra ficava lá no fim da página.
        <div role="toolbar" aria-label="Ações nas cobranças selecionadas"
          className="fixed bottom-6 left-4 right-4 lg:left-auto lg:right-8 z-40 flex flex-wrap items-center gap-3 rounded-2xl bg-mirai-panel text-white px-5 py-3.5 shadow-2xl">
          <span className="text-sm">
            <b>{selecionadas.length}</b> selecionada{selecionadas.length === 1 ? '' : 's'} · <span className="tabular-nums">{brl(sum(selecionadas))}</span>
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button onClick={() => { setFila(selecionadas); setFilaPos(0); }}
              className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl bg-mirai-lime text-mirai-ink hover:brightness-95">
              <MessageCircle size={15} /> Reenviar no WhatsApp
            </button>
            <button onClick={() => {
                const txt = selecionadas.map(r => buildMessage(clientName(r.companyId), r, Math.max(0, -daysBetween(r.dueDate)))).join('\n\n———\n\n');
                navigator.clipboard?.writeText(txt);
                setCopiouTodas(true); setTimeout(() => setCopiouTodas(false), 1600);
              }}
              className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15">
              {copiouTodas ? <Check size={15} /> : <Copy size={15} />} Copiar mensagens
            </button>
            {onDeleteCharges && (
              <button onClick={async () => {
                  const saiu = await onDeleteCharges(selecionadas);
                  if (saiu.length) setSelected(prev => { const n = new Set(prev); saiu.forEach(id => n.delete(id)); return n; });
                }}
                className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-xl bg-white/10 hover:bg-red-500/80">
                <Trash2 size={15} /> Cancelar cobranças
              </button>
            )}
            <button onClick={() => setSelected(new Set())} aria-label="Limpar seleção"
              className="p-2 rounded-xl text-[#b9c6ba] hover:text-white hover:bg-white/10"><X size={16} /></button>
          </div>
        </div>
      )}

      {fila && (() => {
        const r = fila[filaPos];
        const fechar = () => setFila(null);
        if (!r) {
          return (
            <div className="fixed inset-0 z-[90] bg-black/40 flex items-center justify-center p-4" onClick={fechar}>
              <div className="bg-white rounded-2xl p-6 w-full max-w-md text-center space-y-3" onClick={e => e.stopPropagation()}>
                <CheckCircle2 size={36} className="mx-auto text-mcsystem-600" />
                <p className="font-semibold text-gray-900">Fila concluída</p>
                <p className="text-sm text-gray-500">{fila.length} cobrança(s) passadas pelo WhatsApp.</p>
                <button onClick={() => { fechar(); setSelected(new Set()); }}
                  className="mt-2 px-4 py-2 rounded-xl bg-mcsystem-500 text-white text-sm font-semibold hover:bg-mcsystem-400">Fechar</button>
              </div>
            </div>
          );
        }
        const tel = waPhone(contactFor(r.companyId)?.phone);
        const atraso = Math.max(0, -daysBetween(r.dueDate));
        const msg = buildMessage(clientName(r.companyId), r, atraso);
        return (
          <div className="fixed inset-0 z-[90] bg-black/40 flex items-center justify-center p-4" onClick={fechar}>
            <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-mcsystem-700">Cobrança {filaPos + 1} de {fila.length}</p>
                  <p className="font-semibold text-gray-900">{clientName(r.companyId)}</p>
                </div>
                <button onClick={fechar} aria-label="Fechar fila" className="p-1.5 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100"><X size={18} /></button>
              </div>
              <div className="px-6 py-4 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">{r.description}</span>
                  <span className="font-semibold tabular-nums">{brl(r.amount)}</span>
                </div>
                <p className={`text-xs ${atraso ? 'text-red-600' : 'text-gray-500'}`}>
                  {atraso ? `${atraso} dia(s) em atraso · venceu em ${fmtDate(r.dueDate)}` : `Vence em ${fmtDate(r.dueDate)}`}
                  {!tel && ' · sem telefone no Asaas (a mensagem será copiada)'}
                </p>
                <pre className="whitespace-pre-wrap text-xs text-gray-700 bg-gray-50 rounded-xl p-3 max-h-48 overflow-auto font-sans">{msg}</pre>
              </div>
              <div className="px-6 py-4 bg-gray-50 flex items-center justify-between gap-2">
                <button onClick={() => setFilaPos(p => p + 1)} className="text-sm text-gray-500 hover:text-gray-800">Pular</button>
                <button onClick={() => { sendWhatsApp(r); setFilaPos(p => p + 1); }}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl bg-[#25D366] text-[#073b1c] hover:brightness-95">
                  <MessageCircle size={15} /> {tel ? 'Abrir WhatsApp e ir para o próximo' : 'Copiar e ir para o próximo'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string; hint: string; tone: 'critical' | 'warning' | 'neutral' }> = ({ label, value, hint, tone }) => {
  const ring = tone === 'critical' ? 'border-red-200 bg-red-50/40' : tone === 'warning' ? 'border-amber-200 bg-amber-50/40' : 'border-gray-200/80 bg-white';
  const text = tone === 'critical' ? 'text-red-700' : tone === 'warning' ? 'text-amber-700' : 'text-gray-900';
  return (
    <div className={`rounded-2xl border p-5 ${ring}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
      <div className={`mt-2 text-2xl font-bold tabular-nums ${text}`}>{value}</div>
      <div className="mt-1 text-xs text-gray-500">{hint}</div>
    </div>
  );
};
