import React, { useMemo, useState, useEffect } from 'react';
import { FinancialRecord, Company, Product } from '../types';
import { asaasCustomerContacts, AsaasContact } from '../services/asaasService';
import {
  AlertTriangle, CalendarClock, CheckCircle2, ExternalLink, MessageCircle, Loader2,
  Search, Copy, Check, Phone, ChevronDown,
} from 'lucide-react';

interface ReceivablesAgendaProps {
  records: FinancialRecord[];
  companies: Company[];
  products: Product[];
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

export const ReceivablesAgenda: React.FC<ReceivablesAgendaProps> = ({ records, companies, products }) => {
  const [contacts, setContacts] = useState<Record<string, AsaasContact>>({});
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [horizon, setHorizon] = useState(30);

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

  const Row: React.FC<{ r: FinancialRecord; late?: boolean }> = ({ r, late }) => {
    const c = contactFor(r.companyId);
    const hasPhone = !!waPhone(c?.phone);
    const lateDays = Math.max(0, -daysBetween(r.dueDate));
    const pn = productName(r.product_id);
    return (
      <div className="flex flex-col md:flex-row md:items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors">
        <div className="flex-1 min-w-0">
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
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
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
            {overdue.map(r => <Row key={r.id} r={r} late />)}
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
                    <span className="text-xs font-semibold text-gray-600">{fmtDate(date)} · {label}</span>
                    <span className="text-xs text-gray-400 tabular-nums">{brl(list.reduce((s, r) => s + r.amount, 0))}</span>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {list.map(r => <Row key={r.id} r={r} />)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
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
