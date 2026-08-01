import React, { useState, useMemo } from 'react';
import { Company, Product, FinancialRecord, Subscription, RevenueType, User } from '../types';
import {
  asaasCreateCharge, asaasCreateSubscription, asaasSyncAll,
  asaasUpdateCharge, asaasDeleteCharge, asaasUpdateSubscription, asaasDeleteSubscription,
} from '../services/asaasService';
import { supabase } from '../lib/supabaseClient';
import {
  FileText, Repeat, Plus, X, Save, Search, ExternalLink, Loader2,
  CheckCircle2, Clock, AlertCircle, DollarSign, Zap, RefreshCw, ArrowUpDown, ArrowUp, ArrowDown,
  Pencil, Trash2, CalendarClock, ChevronDown, ChevronRight, Wallet,
} from 'lucide-react';
import { ReceivablesAgenda } from './ReceivablesAgenda';
import { BillingProjection } from './BillingProjection';
import { CYCLE_OPTIONS, cycleLabel } from '../lib/cycles';

interface BillingModuleProps {
  companies: Company[];
  products: Product[];
  financeRecords: FinancialRecord[];
  setFinanceRecords: React.Dispatch<React.SetStateAction<FinancialRecord[]>>;
  subscriptions: Subscription[];
  setSubscriptions: React.Dispatch<React.SetStateAction<Subscription[]>>;
  revenueTypes: RevenueType[];
  currentUser: User;
  onRefresh: () => void | Promise<void>;
}

const BILLING_TYPES = [
  { value: 'UNDEFINED', label: 'Cliente escolhe (boleto/PIX/cartão)' },
  { value: 'PIX', label: 'PIX' },
  { value: 'BOLETO', label: 'Boleto' },
  { value: 'CREDIT_CARD', label: 'Cartão de crédito' },
];

const formatBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const todayISO = () => new Date().toISOString().slice(0, 10);

/**
 * Cobrança avulsa é exceção: quase tudo aqui nasce de uma assinatura. Por isso a
 * lista é uma só — a assinatura é a linha, e as cobranças que ela gerou ficam
 * dentro dela; vira linha própria só a cobrança sem assinatura.
 */
type RowFilter = 'all' | 'sub' | 'avulsa' | 'overdue' | 'inactive';

interface BillingRow {
  id: string;
  kind: 'sub' | 'charge';
  sub?: Subscription;
  charge?: FinancialRecord;
  charges: FinancialRecord[];
  client: string;
  description: string;
  productLabel: string;
  value: number;
  cycle: string;
  date: string;
  status: string;
  paid: number;
  overdue: number;
  active: boolean;
}

export const BillingModule: React.FC<BillingModuleProps> = ({
  companies, products, financeRecords, setFinanceRecords,
  subscriptions, setSubscriptions, revenueTypes, currentUser, onRefresh,
}) => {
  const [tab, setTab] = useState<'AGENDA' | 'BILLING'>('AGENDA');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<null | 'charge' | 'subscription'>(null);
  const [submitting, setSubmitting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [sortField, setSortField] = useState('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [rowFilter, setRowFilter] = useState<RowFilter>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const requestSort = (field: string) => {
    if (sortField === field) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };
  const sortProps = { sortField, sortDir, onSort: requestSort };

  const [editCharge, setEditCharge] = useState<FinancialRecord | null>(null);
  const [editSub, setEditSub] = useState<Subscription | null>(null);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const r = await asaasSyncAll();
      await onRefresh();
      alert(
        `Sincronização concluída!\n\n` +
        `Clientes novos: ${r.customers_new}\n` +
        `Clientes vinculados: ${r.customers_linked}\n` +
        `Cobranças: ${r.payments}\n` +
        `Assinaturas: ${r.subscriptions}`,
      );
    } catch (e: any) {
      alert(`Erro ao sincronizar com o Asaas: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  };

  // Pergunta se quer aplicar o mesmo produto às demais cobranças do cliente (local)
  const applyProductToClient = async (companyId: string | undefined, productId: string | null) => {
    if (!companyId) return;
    const targets = financeRecords.filter(r =>
      r.companyId === companyId && r.asaas_payment_id && (r.product_id || null) !== (productId || null));
    if (targets.length === 0) return;
    const pname = products.find(p => p.id === productId)?.name || 'Sem produto';
    if (!window.confirm(`Aplicar o produto "${pname}" às outras ${targets.length} cobrança(s) deste cliente?`)) return;

    const ids = new Set(targets.map(t => t.id));
    setFinanceRecords(prev => prev.map(r => ids.has(r.id)
      ? { ...r, product_id: (productId || undefined) as any, split_revenue: undefined, product_manual: true }
      : r));
    // product_manual trava o sync horário, senão a classificação volta ao
    // casamento pela descrição na próxima rodada.
    const { error } = await supabase
      .from('financial_records')
      .update({ product_id: productId, split_revenue: null, product_manual: true })
      .in('id', [...ids]);
    if (error) alert('Erro ao aplicar aos demais lançamentos: ' + error.message);
  };

  const handleDeleteCharge = async (r: FinancialRecord) => {
    if (!window.confirm(`Excluir a cobrança de ${clientName(r.companyId)} (${formatBRL(r.amount)})?\nIsso também remove no Asaas (só funciona se não estiver paga).`)) return;
    try {
      await asaasDeleteCharge({ recordId: r.id, paymentId: r.asaas_payment_id });
      setFinanceRecords(prev => prev.filter(x => x.id !== r.id));
    } catch (e: any) {
      alert(`Erro ao excluir cobrança: ${e.message}`);
    }
  };

  const handleDeleteSub = async (s: Subscription) => {
    if (!window.confirm(`Excluir a assinatura de ${clientName(s.client_id)} (${formatBRL(s.value)})?\nIsso também remove no Asaas.`)) return;
    try {
      await asaasDeleteSubscription({ rowId: s.id, subscriptionId: s.asaas_id });
      setSubscriptions(prev => prev.filter(x => x.id !== s.id));
    } catch (e: any) {
      alert(`Erro ao excluir assinatura: ${e.message}`);
    }
  };

  const activeProducts = useMemo(() => products.filter(p => p.active), [products]);
  const clientName = (id?: string) => companies.find(c => c.id === id)?.name || '—';
  const productName = (id?: string) => products.find(p => p.id === id)?.name || null;

  const charges = useMemo(
    () => financeRecords
      .filter(r => r.asaas_payment_id)
      .sort((a, b) => (b.dueDate || '').localeCompare(a.dueDate || '')),
    [financeRecords],
  );

  /**
   * Lista única: cada assinatura vira uma linha com as cobranças que ela gerou
   * dentro; vira linha própria só a cobrança que não pertence a assinatura
   * nenhuma (a de fato avulsa).
   */
  const rows = useMemo<BillingRow[]>(() => {
    const today = todayISO();
    const chargesBySub = new Map<string, FinancialRecord[]>();
    for (const r of charges) {
      const k = r.asaas_subscription_id;
      if (!k) continue;
      if (!chargesBySub.has(k)) chargesBySub.set(k, []);
      chargesBySub.get(k)!.push(r);
    }
    const isOverdue = (r: FinancialRecord) => (r.status as string) !== 'Pago' && !!r.dueDate && r.dueDate < today;
    const productLabelOf = (ids: (string | undefined)[]) =>
      ids.map(id => productName(id) || '').filter(Boolean).join(' ');

    const subRows: BillingRow[] = subscriptions.map(s => {
      const list = (chargesBySub.get(s.asaas_id || '') || [])
        .sort((a, b) => (b.dueDate || '').localeCompare(a.dueDate || ''));
      const active = (s.status || 'ACTIVE').toUpperCase() === 'ACTIVE';
      return {
        id: `s:${s.id}`,
        kind: 'sub',
        sub: s,
        charges: list,
        client: clientName(s.client_id),
        description: s.description || '',
        productLabel: productLabelOf(s.split_products?.length
          ? s.split_products.map(p => p.product_id)
          : [s.product_id]),
        value: s.value || 0,
        cycle: cycleLabel(s.cycle),
        date: s.next_due_date || '',
        status: active ? 'Ativa' : 'Inativa',
        paid: list.filter(r => (r.status as string) === 'Pago').reduce((sum, r) => sum + (r.amount || 0), 0),
        overdue: list.filter(isOverdue).length,
        active,
      };
    });

    const knownSubs = new Set(subscriptions.map(s => s.asaas_id).filter(Boolean) as string[]);
    const looseRows: BillingRow[] = charges
      .filter(r => !r.asaas_subscription_id || !knownSubs.has(r.asaas_subscription_id))
      .map(r => ({
        id: `c:${r.id}`,
        kind: 'charge',
        charge: r,
        charges: [],
        client: clientName(r.companyId),
        description: r.description || '',
        productLabel: productLabelOf(r.split_revenue?.length
          ? r.split_revenue.map(s => s.product_id)
          : [r.product_id]),
        value: r.amount || 0,
        cycle: 'Avulsa',
        date: r.dueDate || '',
        status: (r.status as string) || 'Pendente',
        paid: (r.status as string) === 'Pago' ? (r.amount || 0) : 0,
        overdue: isOverdue(r) ? 1 : 0,
        active: (r.status as string) !== 'Pago',
      }));

    return [...subRows, ...looseRows];
  }, [charges, subscriptions, companies, products]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = rows.filter(row => {
      if (rowFilter === 'sub' && row.kind !== 'sub') return false;
      if (rowFilter === 'avulsa' && row.kind !== 'charge') return false;
      if (rowFilter === 'overdue' && row.overdue === 0) return false;
      if (rowFilter === 'inactive' && (row.kind !== 'sub' || row.active)) return false;
      if (!q) return true;
      return row.client.toLowerCase().includes(q)
        || row.description.toLowerCase().includes(q)
        || row.productLabel.toLowerCase().includes(q);
    });
    const dir = sortDir === 'asc' ? 1 : -1;
    const key = (row: BillingRow): string | number => {
      switch (sortField) {
        case 'value': return row.value;
        case 'client': return row.client.toLowerCase();
        case 'product': return row.productLabel.toLowerCase();
        case 'status': return row.status;
        case 'cycle': return row.cycle;
        default: return row.date || '9999-99-99';
      }
    };
    return [...list].sort((a, b) => { const ka = key(a), kb = key(b); return ka < kb ? -dir : ka > kb ? dir : 0; });
  }, [rows, search, rowFilter, sortField, sortDir]);

  const listTotals = useMemo(() => filteredRows.reduce(
    (acc, row) => ({
      paid: acc.paid + row.paid,
      overdue: acc.overdue + row.overdue,
      subs: acc.subs + (row.kind === 'sub' && row.active ? 1 : 0),
    }),
    { paid: 0, overdue: 0, subs: 0 },
  ), [filteredRows]);

  const statusBadge = (status?: string) => {
    const map: Record<string, { cls: string; icon: React.ReactNode; label: string }> = {
      Pago: { cls: 'text-green-700 bg-green-50', icon: <CheckCircle2 size={13} />, label: 'Pago' },
      Pendente: { cls: 'text-yellow-700 bg-yellow-50', icon: <Clock size={13} />, label: 'Pendente' },
      Atrasado: { cls: 'text-red-700 bg-red-50', icon: <AlertCircle size={13} />, label: 'Atrasado' },
    };
    const s = map[status || 'Pendente'] || map.Pendente;
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${s.cls}`}>
        {s.icon}{s.label}
      </span>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="bg-mcsystem-100 p-3 rounded-xl text-mcsystem-500"><Zap size={28} /></div>
          <div>
            <h2 className="text-2xl font-bold text-mcsystem-900">Assinaturas e cobranças (Asaas)</h2>
            <p className="text-gray-500 mt-1 text-sm max-w-xl">
              Tudo em uma lista só: a assinatura é a linha e as cobranças que ela gerou ficam dentro.
              O status é atualizado automaticamente quando o cliente paga.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="px-4 py-3 bg-white text-mcsystem-700 border border-mcsystem-200 rounded-xl font-semibold hover:bg-mcsystem-50 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
            title="Importar clientes, cobranças e assinaturas existentes do Asaas"
          >
            <RefreshCw size={18} className={syncing ? 'animate-spin' : ''} /> {syncing ? 'Sincronizando...' : 'Sincronizar'}
          </button>
          <button
            onClick={() => setModal('charge')}
            className="px-4 py-3 bg-white text-mcsystem-700 border border-mcsystem-200 rounded-xl font-semibold hover:bg-mcsystem-50 transition-all flex items-center justify-center gap-2"
            title="Cobrança única, fora de qualquer assinatura"
          >
            <FileText size={18} /> Cobrança avulsa
          </button>
          <button
            onClick={() => setModal('subscription')}
            className="px-5 py-3 bg-mcsystem-900 text-white rounded-xl font-semibold hover:bg-mcsystem-800 transition-all shadow-md flex items-center justify-center gap-2"
          >
            <Plus size={18} /> Nova assinatura
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab('AGENDA')}
          className={`px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-colors ${tab === 'AGENDA' ? 'bg-mcsystem-900 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
        >
          <CalendarClock size={16} /> Agenda de recebimentos
        </button>
        <button
          onClick={() => setTab('BILLING')}
          className={`px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-colors ${tab === 'BILLING' ? 'bg-mcsystem-900 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
        >
          <Repeat size={16} /> Assinaturas e cobranças
        </button>
      </div>

      {/* Content */}
      {tab === 'AGENDA' ? (
        <ReceivablesAgenda records={financeRecords} companies={companies} products={products} />
      ) : (
        <>
          <BillingProjection charges={charges} subscriptions={subscriptions} products={products} />

          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por cliente, produto ou descrição..."
                className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-200 focus:border-mcsystem-500 focus:ring-2 focus:ring-mcsystem-100 outline-none"
              />
            </div>
            <select
              value={rowFilter}
              onChange={e => setRowFilter(e.target.value as RowFilter)}
              className="px-3 py-3 rounded-xl border border-gray-200 bg-white text-sm text-gray-700 focus:border-mcsystem-500 outline-none"
              title="Filtrar a lista"
            >
              <option value="all">Tudo</option>
              <option value="sub">Só assinaturas</option>
              <option value="avulsa">Só cobranças avulsas</option>
              <option value="overdue">Com atraso</option>
              <option value="inactive">Assinaturas inativas</option>
            </select>
          </div>

          <BillingList
            rows={filteredRows}
            totals={listTotals}
            expanded={expanded}
            onToggle={toggleExpand}
            productName={productName}
            statusBadge={statusBadge}
            onEditSub={setEditSub}
            onDeleteSub={handleDeleteSub}
            onEditCharge={setEditCharge}
            onDeleteCharge={handleDeleteCharge}
            {...sortProps}
          />
        </>
      )}

      {editCharge && (
        <ChargeEditModal
          charge={editCharge}
          products={products}
          onClose={() => setEditCharge(null)}
          onSaved={async (updated) => {
            const original = editCharge;
            setFinanceRecords(prev => prev.map(x => x.id === updated.id ? { ...x, ...updated } : x));
            setEditCharge(null);
            const newProduct = (updated.product_id ?? null) as string | null;
            // Rateio é específico da cobrança (depende do valor) — não replica.
            const hasSplit = (updated.split_revenue?.length || 0) > 0;
            if (original && !hasSplit && (original.product_id || null) !== newProduct) {
              await applyProductToClient(original.companyId, newProduct);
            }
          }}
        />
      )}

      {editSub && (
        <SubscriptionEditModal
          sub={editSub}
          products={products}
          onClose={() => setEditSub(null)}
          onSaved={(updated) => {
            setSubscriptions(prev => prev.map(x => x.id === updated.id ? { ...x, ...updated } : x));
            setEditSub(null);
          }}
        />
      )}

      {modal === 'charge' && (
        <ChargeModal
          companies={companies}
          products={activeProducts}
          revenueTypes={revenueTypes}
          submitting={submitting}
          onClose={() => setModal(null)}
          onSubmit={async (form) => {
            setSubmitting(true);
            try {
              const res = await asaasCreateCharge(form);
              if (res?.record) setFinanceRecords(prev => [res.record as FinancialRecord, ...prev]);
              setModal(null);
              if (res?.payment?.invoiceUrl) {
                window.open(res.payment.invoiceUrl, '_blank');
              }
            } catch (e: any) {
              alert(`Erro ao gerar cobrança: ${e.message}`);
            } finally {
              setSubmitting(false);
            }
          }}
        />
      )}

      {modal === 'subscription' && (
        <SubscriptionModal
          companies={companies}
          products={activeProducts}
          submitting={submitting}
          onClose={() => setModal(null)}
          onSubmit={async (form) => {
            setSubmitting(true);
            try {
              const res = await asaasCreateSubscription(form);
              if (res?.row) setSubscriptions(prev => [res.row as Subscription, ...prev]);
              setModal(null);
            } catch (e: any) {
              alert(`Erro ao criar assinatura: ${e.message}`);
            } finally {
              setSubmitting(false);
            }
          }}
        />
      )}
    </div>
  );
};

// ---------- Lista ----------

interface SortProps { sortField: string; sortDir: 'asc' | 'desc'; onSort: (f: string) => void }

const SortTh: React.FC<{ label: string; field: string; align?: 'left' | 'right' | 'center' } & SortProps> = ({ label, field, align = 'left', sortField, sortDir, onSort }) => {
  const justify = align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : '';
  return (
    <th className={`px-6 py-4 font-semibold cursor-pointer group hover:bg-gray-100 select-none ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : ''}`} onClick={() => onSort(field)}>
      <div className={`flex items-center gap-1.5 ${justify}`}>
        {label}
        {sortField === field
          ? (sortDir === 'asc' ? <ArrowUp size={12} className="text-mcsystem-500" /> : <ArrowDown size={12} className="text-mcsystem-500" />)
          : <ArrowUpDown size={12} className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />}
      </div>
    </th>
  );
};

interface BillingListProps extends SortProps {
  rows: BillingRow[];
  totals: { paid: number; overdue: number; subs: number };
  expanded: Set<string>;
  onToggle: (id: string) => void;
  productName: (id?: string) => string | null;
  statusBadge: (s?: string) => React.ReactNode;
  onEditSub: (s: Subscription) => void;
  onDeleteSub: (s: Subscription) => void;
  onEditCharge: (r: FinancialRecord) => void;
  onDeleteCharge: (r: FinancialRecord) => void;
}

const BillingList: React.FC<BillingListProps> = ({
  rows, totals, expanded, onToggle, productName, statusBadge,
  onEditSub, onDeleteSub, onEditCharge, onDeleteCharge, sortField, sortDir, onSort,
}) => {
  const sp = { sortField, sortDir, onSort };
  const today = todayISO();

  const chips = (items: { id?: string; value: number }[]) => {
    const named = items.filter(i => i.id);
    if (named.length === 0) return <span className="text-gray-300 text-xs">—</span>;
    if (named.length === 1) {
      return <span className="inline-block text-xs bg-mcsystem-50 text-mcsystem-700 px-2 py-1 rounded-md">{productName(named[0].id) || 'Sem produto'}</span>;
    }
    return <ProductChips items={named.map(i => ({ name: productName(i.id) || undefined, value: i.value }))} />;
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Totais da lista */}
      <div className="px-6 py-4 border-b border-gray-100 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <span className="font-bold text-gray-800 flex items-center gap-2">
          <Wallet size={16} className="text-mcsystem-500" /> {rows.length} linha(s)
        </span>
        <span className="text-gray-500">Assinaturas ativas: <b className="text-gray-800">{totals.subs}</b></span>
        <span className="text-gray-500">Recebido: <b className="text-green-600">{formatBRL(totals.paid)}</b></span>
        <span className="text-gray-500">Em atraso: <b className={totals.overdue ? 'text-red-600' : 'text-gray-800'}>{totals.overdue} cobrança(s)</b></span>
      </div>

      {rows.length === 0 ? (
        <div className="p-16 text-center text-gray-400">
          <Repeat size={48} className="mx-auto mb-4 opacity-30" />
          <p className="font-medium">Nada por aqui ainda.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-left uppercase text-xs tracking-wider">
                <SortTh label="Cliente / Descrição" field="client" {...sp} />
                <SortTh label="Produto" field="product" {...sp} />
                <SortTh label="Valor" field="value" {...sp} />
                <SortTh label="Recorrência" field="cycle" {...sp} />
                <SortTh label="Vencimento" field="date" {...sp} />
                <SortTh label="Status" field="status" align="center" {...sp} />
                <th className="px-6 py-4 font-semibold text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(row => {
                const isSub = row.kind === 'sub';
                const isOpen = expanded.has(row.id);
                const s = row.sub;
                const r = row.charge;
                return (
                  <React.Fragment key={row.id}>
                    <tr className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-start gap-2">
                          {isSub && row.charges.length > 0 ? (
                            <button
                              onClick={() => onToggle(row.id)}
                              className="mt-0.5 text-gray-400 hover:text-mcsystem-600"
                              title={isOpen ? 'Ocultar cobranças' : 'Ver cobranças'}
                            >
                              {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </button>
                          ) : <span className="w-4 flex-shrink-0" />}
                          <div className="min-w-0">
                            <div className="font-semibold text-gray-800">{row.client}</div>
                            <div className="text-gray-400 text-xs mt-0.5 max-w-md truncate">{row.description}</div>
                            {isSub && row.charges.length > 0 && (
                              <div className="text-[11px] text-gray-400 mt-1">
                                {row.charges.length} cobrança(s) · {formatBRL(row.paid)} recebidos
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {isSub
                          ? chips(s!.split_products?.length
                            ? s!.split_products.map(p => ({ id: p.product_id, value: (s!.value || 0) * p.pct / 100 }))
                            : [{ id: s!.product_id, value: s!.value || 0 }])
                          : chips(r!.split_revenue?.length
                            ? r!.split_revenue.map(x => ({ id: x.product_id, value: x.amount }))
                            : [{ id: r!.product_id, value: r!.amount || 0 }])}
                      </td>
                      <td className="px-6 py-4 font-medium text-gray-700 whitespace-nowrap">{formatBRL(row.value)}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-block text-xs px-2 py-1 rounded-md whitespace-nowrap ${isSub ? 'bg-mcsystem-50 text-mcsystem-700 font-medium' : 'bg-gray-100 text-gray-500'}`}>
                          {row.cycle}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-600 whitespace-nowrap">{row.date || '—'}</td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex flex-col items-center gap-1">
                          {isSub ? (
                            <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${row.active ? 'text-green-700 bg-green-50' : 'text-gray-500 bg-gray-100'}`}>
                              {row.active ? <Repeat size={13} /> : <X size={13} />}{row.status}
                            </span>
                          ) : statusBadge(row.status)}
                          {row.overdue > 0 && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full whitespace-nowrap">
                              <AlertCircle size={11} /> {row.overdue} em atraso
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-1">
                          {!isSub && r!.asaas_invoice_url && (
                            <a href={r!.asaas_invoice_url} target="_blank" rel="noreferrer" title="Abrir fatura"
                               className="p-2 text-gray-400 hover:text-mcsystem-600 hover:bg-mcsystem-50 rounded-lg transition-colors">
                              <ExternalLink size={16} />
                            </a>
                          )}
                          <button
                            onClick={() => (isSub ? onEditSub(s!) : onEditCharge(r!))}
                            className="p-2 text-gray-400 hover:text-mcsystem-600 hover:bg-mcsystem-50 rounded-lg transition-colors"
                            title="Editar"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => (isSub ? onDeleteSub(s!) : onDeleteCharge(r!))}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Excluir"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {isSub && isOpen && (
                      <tr>
                        <td colSpan={7} className="bg-gray-50/70 px-6 py-4">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-gray-400 uppercase tracking-wider text-left">
                                <th className="py-2 font-semibold">Vencimento</th>
                                <th className="py-2 font-semibold">Descrição</th>
                                <th className="py-2 font-semibold">Produto</th>
                                <th className="py-2 font-semibold text-right">Valor</th>
                                <th className="py-2 font-semibold text-center">Status</th>
                                <th className="py-2 font-semibold text-center">Ações</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200/70">
                              {row.charges.map(c => (
                                <tr key={c.id}>
                                  <td className={`py-2 whitespace-nowrap ${(c.status as string) !== 'Pago' && (c.dueDate || '') < today ? 'text-red-600 font-medium' : 'text-gray-600'}`}>{c.dueDate}</td>
                                  <td className="py-2 text-gray-500 max-w-xs truncate">{c.description}</td>
                                  <td className="py-2">
                                    {chips(c.split_revenue?.length
                                      ? c.split_revenue.map(x => ({ id: x.product_id, value: x.amount }))
                                      : [{ id: c.product_id, value: c.amount || 0 }])}
                                  </td>
                                  <td className="py-2 text-right font-medium text-gray-700 whitespace-nowrap">{formatBRL(c.amount)}</td>
                                  <td className="py-2 text-center">{statusBadge(c.status as string)}</td>
                                  <td className="py-2">
                                    <div className="flex items-center justify-center gap-1">
                                      {c.asaas_invoice_url && (
                                        <a href={c.asaas_invoice_url} target="_blank" rel="noreferrer" title="Abrir fatura"
                                           className="p-1.5 text-gray-400 hover:text-mcsystem-600 rounded-md">
                                          <ExternalLink size={14} />
                                        </a>
                                      )}
                                      <button onClick={() => onEditCharge(c)} className="p-1.5 text-gray-400 hover:text-mcsystem-600 rounded-md" title="Editar cobrança"><Pencil size={14} /></button>
                                      <button onClick={() => onDeleteCharge(c)} className="p-1.5 text-gray-400 hover:text-red-600 rounded-md" title="Excluir cobrança"><Trash2 size={14} /></button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ---------- Modals ----------

const ModalShell: React.FC<{ title: string; icon: React.ReactNode; onClose: () => void; children: React.ReactNode }> = ({ title, icon, onClose, children }) => (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[200] p-4 backdrop-blur-sm">
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg animate-in zoom-in-95 duration-300 overflow-hidden">
      <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex justify-between items-center">
        <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">{icon}{title}</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-200 transition-colors"><X size={22} /></button>
      </div>
      {children}
    </div>
  </div>
);

const inputCls = 'w-full px-3 py-2.5 rounded-lg border border-gray-200 focus:border-mcsystem-500 focus:ring-2 focus:ring-mcsystem-100 outline-none';
const labelCls = 'block text-sm font-medium text-gray-600 mb-1';

const todayPlus = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const ChargeModal: React.FC<{
  companies: Company[]; products: Product[]; revenueTypes: RevenueType[];
  submitting: boolean; onClose: () => void; onSubmit: (form: any) => void;
}> = ({ companies, products, revenueTypes, submitting, onClose, onSubmit }) => {
  const [clientId, setClientId] = useState('');
  const [productId, setProductId] = useState('');
  const [value, setValue] = useState(0);
  const [dueDate, setDueDate] = useState(todayPlus(5));
  const [description, setDescription] = useState('');
  const [billingType, setBillingType] = useState('UNDEFINED');
  const [revenueTypeId, setRevenueTypeId] = useState('');

  const onProduct = (id: string) => {
    setProductId(id);
    const p = products.find(x => x.id === id);
    if (p) {
      setValue(p.price);
      if (!description) setDescription(p.name);
    }
  };

  const submit = () => {
    if (!clientId) return alert('Selecione o cliente.');
    if (!value || value <= 0) return alert('Informe um valor válido.');
    if (!dueDate) return alert('Informe o vencimento.');
    onSubmit({ clientId, productId: productId || undefined, value, dueDate, description, billingType, revenueTypeId: revenueTypeId || undefined });
  };

  const clientsWithoutDoc = companies.find(c => c.id === clientId && !c.cnpj);

  return (
    <ModalShell title="Nova Cobrança" icon={<FileText size={20} className="text-mcsystem-500" />} onClose={onClose}>
      <div className="p-6 space-y-4">
        <div className="bg-mcsystem-50 border border-mcsystem-100 text-mcsystem-800 text-xs rounded-lg px-3 py-2">
          Cobrança única, sem recorrência. Se o cliente paga todo mês, crie uma <b>assinatura</b>.
        </div>
        <div>
          <label className={labelCls}>Cliente *</label>
          <select value={clientId} onChange={e => setClientId(e.target.value)} className={inputCls}>
            <option value="">Selecione...</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}{c.cnpj ? '' : ' (sem CNPJ/CPF)'}</option>)}
          </select>
          {clientsWithoutDoc && (
            <p className="text-xs text-red-500 mt-1">Este cliente não tem CNPJ/CPF — obrigatório para o Asaas. Cadastre em Clientes.</p>
          )}
        </div>

        <div>
          <label className={labelCls}>Produto (opcional — preenche valor/descrição)</label>
          <select value={productId} onChange={e => onProduct(e.target.value)} className={inputCls}>
            <option value="">Nenhum</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name} — {formatBRL(p.price)}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Valor (R$) *</label>
            <div className="relative">
              <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="number" step="0.01" min="0" value={value} onChange={e => setValue(parseFloat(e.target.value))} className={`${inputCls} pl-9`} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Vencimento *</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={inputCls} />
          </div>
        </div>

        <div>
          <label className={labelCls}>Descrição</label>
          <input type="text" value={description} onChange={e => setDescription(e.target.value)} className={inputCls} placeholder="Ex: Mensalidade Julho" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Forma de pagamento</label>
            <select value={billingType} onChange={e => setBillingType(e.target.value)} className={inputCls}>
              {BILLING_TYPES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Tipo de receita (opcional)</label>
            <select value={revenueTypeId} onChange={e => setRevenueTypeId(e.target.value)} className={inputCls}>
              <option value="">Nenhum</option>
              {revenueTypes.map(rt => <option key={rt.id} value={rt.id}>{rt.name}</option>)}
            </select>
          </div>
        </div>
      </div>
      <ModalFooter submitting={submitting} onClose={onClose} onSubmit={submit} label="Gerar cobrança" />
    </ModalShell>
  );
};

const SubscriptionModal: React.FC<{
  companies: Company[]; products: Product[];
  submitting: boolean; onClose: () => void; onSubmit: (form: any) => void;
}> = ({ companies, products, submitting, onClose, onSubmit }) => {
  const [clientId, setClientId] = useState('');
  const [productId, setProductId] = useState('');
  const [value, setValue] = useState(0);
  const [cycle, setCycle] = useState('MONTHLY');
  const [nextDueDate, setNextDueDate] = useState(todayPlus(5));
  const [description, setDescription] = useState('');
  const [billingType, setBillingType] = useState('UNDEFINED');
  const [multi, setMulti] = useState(false);
  const [splitRows, setSplitRows] = useState<SplitRow[]>([]);

  const onProduct = (id: string) => {
    setProductId(id);
    const p = products.find(x => x.id === id);
    if (p) {
      setValue(p.price);
      if (!description) setDescription(p.name);
    }
  };

  const splitSum = Math.round(splitRows.reduce((s, r) => s + (Number(r.amount) || 0), 0) * 100) / 100;

  const submit = () => {
    if (!clientId) return alert('Selecione o cliente.');
    if (!value || value <= 0) return alert('Informe um valor válido.');
    if (!nextDueDate) return alert('Informe o primeiro vencimento.');
    if (multi && (splitSum !== Math.round(value * 100) / 100 || !splitRows.every(r => r.product_id) || !splitRows.length)) {
      return alert('O rateio precisa fechar com o valor da assinatura e todos os produtos precisam estar preenchidos.');
    }
    onSubmit({
      clientId,
      productId: (multi ? dominantProduct(splitRows) : productId) || undefined,
      splitProducts: multi ? rowsToPct(splitRows) : undefined,
      value, cycle, nextDueDate, description, billingType,
    });
  };

  return (
    <ModalShell title="Nova Assinatura" icon={<Repeat size={20} className="text-mcsystem-500" />} onClose={onClose}>
      <div className="p-6 space-y-4">
        <div>
          <label className={labelCls}>Cliente *</label>
          <select value={clientId} onChange={e => setClientId(e.target.value)} className={inputCls}>
            <option value="">Selecione...</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}{c.cnpj ? '' : ' (sem CNPJ/CPF)'}</option>)}
          </select>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className={`${labelCls} mb-0`}>Produto (opcional — preenche valor/descrição)</label>
            <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
              <input
                type="checkbox" checked={multi}
                onChange={e => {
                  setMulti(e.target.checked);
                  if (e.target.checked && splitRows.length === 0) {
                    setSplitRows(productId ? [{ product_id: productId, amount: Number(value) || 0 }] : [{ product_id: '', amount: 0 }]);
                  }
                }}
                className="rounded border-gray-300 text-mcsystem-600 focus:ring-mcsystem-500"
              />
              Mais de um produto (rateio)
            </label>
          </div>
          {multi ? (
            <SplitEditor products={products} total={Number(value) || 0} rows={splitRows} onChange={setSplitRows} />
          ) : (
            <select value={productId} onChange={e => onProduct(e.target.value)} className={inputCls}>
              <option value="">Nenhum</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name} — {formatBRL(p.price)}</option>)}
            </select>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Valor (R$) *</label>
            <div className="relative">
              <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="number" step="0.01" min="0" value={value} onChange={e => setValue(parseFloat(e.target.value))} className={`${inputCls} pl-9`} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Ciclo</label>
            <select value={cycle} onChange={e => setCycle(e.target.value)} className={inputCls}>
              {CYCLE_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>1º vencimento *</label>
            <input type="date" value={nextDueDate} onChange={e => setNextDueDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Forma de pagamento</label>
            <select value={billingType} onChange={e => setBillingType(e.target.value)} className={inputCls}>
              {BILLING_TYPES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className={labelCls}>Descrição</label>
          <input type="text" value={description} onChange={e => setDescription(e.target.value)} className={inputCls} placeholder="Ex: Plano mensal" />
        </div>
      </div>
      <ModalFooter submitting={submitting} onClose={onClose} onSubmit={submit} label="Criar assinatura" />
    </ModalShell>
  );
};

type SplitRow = { product_id: string; amount: number };

/** Mostra o rateio da linha sem precisar abrir o modal. */
const ProductChips: React.FC<{ items: { name: string | undefined; value: number }[] }> = ({ items }) => (
  <div className="flex flex-wrap gap-1">
    {items.map((it, i) => (
      <span key={i} className="inline-block text-xs bg-mcsystem-50 text-mcsystem-700 px-2 py-1 rounded-md whitespace-nowrap">
        {it.name || 'Sem produto'} <span className="text-mcsystem-400">{formatBRL(it.value)}</span>
      </span>
    ))}
  </div>
);

/**
 * Rateio de um valor entre vários produtos (ex: "Kaivaa + Hello Rating" numa
 * cobrança só). O usuário digita em R$ porque é como ele pensa o preço; quem
 * consome converte para % quando precisa.
 */
const SplitEditor: React.FC<{
  products: Product[];
  total: number;
  rows: SplitRow[];
  onChange: (rows: SplitRow[]) => void;
  disabled?: boolean;
}> = ({ products, total, rows, onChange, disabled }) => {
  const sum = Math.round(rows.reduce((s, r) => s + (Number(r.amount) || 0), 0) * 100) / 100;
  const left = Math.round(((total || 0) - sum) * 100) / 100;
  const ok = left === 0 && rows.length > 0;
  const patch = (i: number, p: Partial<SplitRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));

  return (
    <div className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50">
      {rows.map((r, i) => (
        <div key={i} className="flex gap-2 items-center">
          <select
            value={r.product_id}
            disabled={disabled}
            onChange={e => patch(i, { product_id: e.target.value })}
            className={`${inputCls} flex-1 bg-white disabled:bg-gray-100`}
          >
            <option value="">Selecione o produto</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input
            type="number" step="0.01" min="0" value={r.amount || ''}
            disabled={disabled}
            onChange={e => patch(i, { amount: parseFloat(e.target.value) || 0 })}
            placeholder="R$"
            className={`${inputCls} w-28 bg-white disabled:bg-gray-100`}
          />
          <button
            type="button" disabled={disabled}
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
            className="p-2 text-gray-400 hover:text-red-600 disabled:opacity-40"
            title="Remover"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}

      <button
        type="button" disabled={disabled}
        onClick={() => onChange([...rows, { product_id: '', amount: left > 0 ? left : 0 }])}
        className="text-sm font-medium text-mcsystem-700 hover:text-mcsystem-900 flex items-center gap-1 disabled:opacity-40"
      >
        <Plus size={14} /> Adicionar produto
      </button>

      <div className={`flex justify-between text-sm px-2 py-1.5 rounded-md ${ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
        <span className="font-semibold">{ok ? 'Rateio fechado' : 'Restante a dividir'}</span>
        <span className="font-bold">{formatBRL(ok ? total : left)}</span>
      </div>
    </div>
  );
};

/** Converte o rateio em R$ para %, normalizando pela soma (fecha sempre 100). */
const rowsToPct = (rows: SplitRow[]) => {
  const valid = rows.filter(r => r.product_id && Number(r.amount) > 0);
  const sum = valid.reduce((s, r) => s + Number(r.amount), 0);
  if (!sum) return [];
  return valid.map(r => ({ product_id: r.product_id, pct: (Number(r.amount) / sum) * 100 }));
};

/** Produto que fica com a maior fatia — usado nas listagens e como fallback. */
const dominantProduct = (rows: SplitRow[]): string | null => {
  const valid = rows.filter(r => r.product_id && Number(r.amount) > 0);
  if (!valid.length) return null;
  return valid.reduce((a, b) => (Number(b.amount) > Number(a.amount) ? b : a)).product_id;
};

const ChargeEditModal: React.FC<{ charge: FinancialRecord; products: Product[]; onClose: () => void; onSaved: (u: Partial<FinancialRecord> & { id: string }) => void }> = ({ charge, products, onClose, onSaved }) => {
  const isPaid = (charge.status as string) === 'Pago';
  const [productId, setProductId] = useState(charge.product_id || '');
  const [value, setValue] = useState(charge.amount || 0);
  const [dueDate, setDueDate] = useState(charge.dueDate || '');
  const [description, setDescription] = useState(charge.description || '');
  const [saving, setSaving] = useState(false);
  const [multi, setMulti] = useState((charge.split_revenue?.length || 0) > 0);
  const [splitRows, setSplitRows] = useState<SplitRow[]>(
    (charge.split_revenue || []).map(s => ({ product_id: s.product_id || '', amount: s.amount })),
  );

  const splitSum = Math.round(splitRows.reduce((s, r) => s + (Number(r.amount) || 0), 0) * 100) / 100;
  const splitOk = !multi || (splitRows.length > 0 && splitSum === Math.round((Number(value) || 0) * 100) / 100
    && splitRows.every(r => r.product_id));

  const save = async () => {
    if (!splitOk) {
      alert('O rateio precisa fechar com o valor da cobrança e todos os produtos precisam estar preenchidos.');
      return;
    }
    setSaving(true);
    try {
      const split = multi ? splitRows.filter(r => r.product_id && Number(r.amount) > 0) : null;
      const finalProduct = multi ? dominantProduct(splitRows) : (productId || null);
      const params: any = {
        recordId: charge.id, paymentId: charge.asaas_payment_id,
        productId: finalProduct,
        splitRevenue: split,
        // Marca como definido na mão: o sync horário para de sobrescrever.
        productManual: true,
      };
      if (!isPaid) { params.value = value; params.dueDate = dueDate; params.description = description; }
      await asaasUpdateCharge(params);
      const updated: Partial<FinancialRecord> & { id: string } = {
        id: charge.id,
        product_id: (finalProduct || undefined) as any,
        split_revenue: (split || undefined) as any,
        product_manual: true,
      };
      if (!isPaid) { updated.amount = Number(value); updated.dueDate = dueDate; updated.competenceDate = dueDate; updated.description = description; }
      onSaved(updated);
    } catch (e: any) {
      alert(`Erro ao salvar cobrança: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title="Editar Cobrança" icon={<FileText size={20} className="text-mcsystem-500" />} onClose={onClose}>
      <div className="p-6 space-y-4">
        {isPaid && (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-xs rounded-lg px-3 py-2">
            Cobrança já paga — no Asaas só dá pra alterar o <b>produto</b> (valor/vencimento ficam travados).
          </div>
        )}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className={`${labelCls} mb-0`}>Produto</label>
            <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
              <input
                type="checkbox" checked={multi}
                onChange={e => {
                  setMulti(e.target.checked);
                  if (e.target.checked && splitRows.length === 0) {
                    setSplitRows(productId ? [{ product_id: productId, amount: Number(value) || 0 }] : [{ product_id: '', amount: 0 }]);
                  }
                }}
                className="rounded border-gray-300 text-mcsystem-600 focus:ring-mcsystem-500"
              />
              Mais de um produto (rateio)
            </label>
          </div>
          {multi ? (
            <SplitEditor products={products} total={Number(value) || 0} rows={splitRows} onChange={setSplitRows} />
          ) : (
            <select value={productId} onChange={e => setProductId(e.target.value)} className={inputCls}>
              <option value="">Sem produto</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Valor (R$)</label>
            <input type="number" step="0.01" min="0" value={value} disabled={isPaid} onChange={e => setValue(parseFloat(e.target.value))} className={`${inputCls} disabled:bg-gray-100 disabled:text-gray-400`} />
          </div>
          <div>
            <label className={labelCls}>Vencimento</label>
            <input type="date" value={dueDate} disabled={isPaid} onChange={e => setDueDate(e.target.value)} className={`${inputCls} disabled:bg-gray-100 disabled:text-gray-400`} />
          </div>
        </div>
        <div>
          <label className={labelCls}>Descrição</label>
          <input type="text" value={description} disabled={isPaid} onChange={e => setDescription(e.target.value)} className={`${inputCls} disabled:bg-gray-100 disabled:text-gray-400`} />
        </div>
      </div>
      <ModalFooter submitting={saving} onClose={onClose} onSubmit={save} label="Salvar" />
    </ModalShell>
  );
};

const SubscriptionEditModal: React.FC<{ sub: Subscription; products: Product[]; onClose: () => void; onSaved: (u: Partial<Subscription> & { id: string }) => void }> = ({ sub, products, onClose, onSaved }) => {
  const [productId, setProductId] = useState(sub.product_id || '');
  const [value, setValue] = useState(sub.value || 0);
  const [nextDueDate, setNextDueDate] = useState(sub.next_due_date || '');
  const [cycle, setCycle] = useState(sub.cycle || 'MONTHLY');
  const [description, setDescription] = useState(sub.description || '');
  const [saving, setSaving] = useState(false);
  const [multi, setMulti] = useState((sub.split_products?.length || 0) > 0);
  // O rateio é guardado em %, mas editado em R$ sobre o valor atual da assinatura.
  const [splitRows, setSplitRows] = useState<SplitRow[]>(
    (sub.split_products || []).map(s => ({
      product_id: s.product_id,
      amount: Math.round((sub.value || 0) * s.pct) / 100,
    })),
  );

  const splitSum = Math.round(splitRows.reduce((s, r) => s + (Number(r.amount) || 0), 0) * 100) / 100;
  const splitOk = !multi || (splitRows.length > 0 && splitSum === Math.round((Number(value) || 0) * 100) / 100
    && splitRows.every(r => r.product_id));

  const save = async () => {
    if (!splitOk) {
      alert('O rateio precisa fechar com o valor da assinatura e todos os produtos precisam estar preenchidos.');
      return;
    }
    setSaving(true);
    try {
      const splitProducts = multi ? rowsToPct(splitRows) : null;
      const finalProduct = multi ? dominantProduct(splitRows) : (productId || null);
      const res: any = await asaasUpdateSubscription({
        rowId: sub.id, subscriptionId: sub.asaas_id,
        value, nextDueDate, cycle, description,
        productId: finalProduct,
        splitProducts,
        // Trava contra o sync horário, que reclassifica pela descrição.
        productManual: true,
      });
      onSaved({
        id: sub.id, product_id: (finalProduct || null) as any,
        split_products: (splitProducts || null) as any,
        value: Number(value), next_due_date: nextDueDate, cycle, description,
      });
      const n = res?.chargesUpdated || 0;
      if (multi && n > 0) alert(`Rateio aplicado a ${n} cobrança(s) desta assinatura.`);
    } catch (e: any) {
      alert(`Erro ao salvar assinatura: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title="Editar Assinatura" icon={<Repeat size={20} className="text-mcsystem-500" />} onClose={onClose}>
      <div className="p-6 space-y-4">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className={`${labelCls} mb-0`}>Produto</label>
            <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
              <input
                type="checkbox" checked={multi}
                onChange={e => {
                  setMulti(e.target.checked);
                  if (e.target.checked && splitRows.length === 0) {
                    setSplitRows(productId ? [{ product_id: productId, amount: Number(value) || 0 }] : [{ product_id: '', amount: 0 }]);
                  }
                }}
                className="rounded border-gray-300 text-mcsystem-600 focus:ring-mcsystem-500"
              />
              Mais de um produto (rateio)
            </label>
          </div>
          {multi ? (
            <>
              <SplitEditor products={products} total={Number(value) || 0} rows={splitRows} onChange={setSplitRows} />
              <p className="text-xs text-gray-500 mt-1.5">
                O rateio é guardado em % e aplicado a toda cobrança gerada por esta assinatura —
                continua certo mesmo com desconto ou reajuste.
              </p>
            </>
          ) : (
            <select value={productId} onChange={e => setProductId(e.target.value)} className={inputCls}>
              <option value="">Sem produto</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Valor (R$)</label>
            <input type="number" step="0.01" min="0" value={value} onChange={e => setValue(parseFloat(e.target.value))} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Ciclo</label>
            <select value={cycle} onChange={e => setCycle(e.target.value)} className={inputCls}>
              {CYCLE_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Próx. vencimento</label>
            <input type="date" value={nextDueDate} onChange={e => setNextDueDate(e.target.value)} className={inputCls} />
          </div>
        </div>
        <div>
          <label className={labelCls}>Descrição</label>
          <input type="text" value={description} onChange={e => setDescription(e.target.value)} className={inputCls} />
        </div>
      </div>
      <ModalFooter submitting={saving} onClose={onClose} onSubmit={save} label="Salvar" />
    </ModalShell>
  );
};

const ModalFooter: React.FC<{ submitting: boolean; onClose: () => void; onSubmit: () => void; label: string }> = ({ submitting, onClose, onSubmit, label }) => (
  <div className="bg-gray-50 px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
    <button onClick={onClose} disabled={submitting} className="px-4 py-2.5 rounded-lg text-gray-600 font-medium hover:bg-gray-200 transition-colors disabled:opacity-50">Cancelar</button>
    <button onClick={onSubmit} disabled={submitting} className="px-5 py-2.5 bg-mcsystem-900 text-white rounded-lg font-semibold hover:bg-mcsystem-800 transition-colors flex items-center gap-2 disabled:opacity-50">
      {submitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}{label}
    </button>
  </div>
);
