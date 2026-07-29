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
  Pencil, Trash2, CalendarClock,
} from 'lucide-react';
import { ReceivablesAgenda } from './ReceivablesAgenda';

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

const CYCLES = [
  { value: 'WEEKLY', label: 'Semanal' },
  { value: 'MONTHLY', label: 'Mensal' },
  { value: 'QUARTERLY', label: 'Trimestral' },
  { value: 'SEMIANNUALLY', label: 'Semestral' },
  { value: 'YEARLY', label: 'Anual' },
];

const formatBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export const BillingModule: React.FC<BillingModuleProps> = ({
  companies, products, financeRecords, setFinanceRecords,
  subscriptions, setSubscriptions, revenueTypes, currentUser, onRefresh,
}) => {
  const [tab, setTab] = useState<'AGENDA' | 'CHARGES' | 'SUBSCRIPTIONS'>('AGENDA');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<null | 'charge' | 'subscription'>(null);
  const [submitting, setSubmitting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [sortField, setSortField] = useState('dueDate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Pendente' | 'Pago' | 'Atrasado'>('all');

  const changeTab = (t: 'AGENDA' | 'CHARGES' | 'SUBSCRIPTIONS') => {
    setTab(t);
    if (t !== 'AGENDA') setSortField(t === 'CHARGES' ? 'dueDate' : 'next_due_date');
  };

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

  // Faturamento por produto (a partir das cobranças Asaas)
  const revenueByProduct = useMemo(() => {
    const map = new Map<string, { name: string; count: number; total: number; recebido: number }>();
    for (const r of charges) {
      const key = r.product_id || '__none__';
      const name = productName(r.product_id) || 'Sem produto';
      const cur = map.get(key) || { name, count: 0, total: 0, recebido: 0 };
      cur.count++;
      cur.total += r.amount || 0;
      if ((r.status as string) === 'Pago') cur.recebido += r.amount || 0;
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [charges, products]);

  const filteredCharges = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = charges.filter(r => {
      if (statusFilter !== 'all' && (r.status as string) !== statusFilter) return false;
      if (!q) return true;
      return (r.description || '').toLowerCase().includes(q)
        || clientName(r.companyId).toLowerCase().includes(q)
        || (productName(r.product_id) || '').toLowerCase().includes(q);
    });
    const dir = sortDir === 'asc' ? 1 : -1;
    const key = (r: FinancialRecord): string | number => {
      switch (sortField) {
        case 'amount': return r.amount || 0;
        case 'client': return clientName(r.companyId).toLowerCase();
        case 'product': return (productName(r.product_id) || '').toLowerCase();
        case 'status': return (r.status as string) || '';
        default: return r.dueDate || '';
      }
    };
    return [...list].sort((a, b) => { const ka = key(a), kb = key(b); return ka < kb ? -dir : ka > kb ? dir : 0; });
  }, [charges, search, statusFilter, sortField, sortDir]);

  const filteredSubs = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = subscriptions.filter(s => !q
      || (s.description || '').toLowerCase().includes(q)
      || clientName(s.client_id).toLowerCase().includes(q)
      || (productName(s.product_id) || '').toLowerCase().includes(q));
    const dir = sortDir === 'asc' ? 1 : -1;
    const key = (s: Subscription): string | number => {
      switch (sortField) {
        case 'value': case 'amount': return s.value || 0;
        case 'client': return clientName(s.client_id).toLowerCase();
        case 'product': return (productName(s.product_id) || '').toLowerCase();
        default: return s.next_due_date || '';
      }
    };
    return [...list].sort((a, b) => { const ka = key(a), kb = key(b); return ka < kb ? -dir : ka > kb ? dir : 0; });
  }, [subscriptions, search, sortField, sortDir]);

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
            <h2 className="text-2xl font-bold text-mcsystem-900">Cobranças (Asaas)</h2>
            <p className="text-gray-500 mt-1 text-sm max-w-xl">
              Gere cobranças e assinaturas via Asaas. O status é atualizado automaticamente quando o cliente paga.
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
            onClick={() => setModal(tab === 'SUBSCRIPTIONS' ? 'subscription' : 'charge')}
            className="px-5 py-3 bg-mcsystem-900 text-white rounded-xl font-semibold hover:bg-mcsystem-800 transition-all shadow-md flex items-center justify-center gap-2"
          >
            <Plus size={18} /> {tab === 'SUBSCRIPTIONS' ? 'Nova Assinatura' : 'Nova Cobrança'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => changeTab('AGENDA')}
          className={`px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-colors ${tab === 'AGENDA' ? 'bg-mcsystem-900 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
        >
          <CalendarClock size={16} /> Agenda de recebimentos
        </button>
        <button
          onClick={() => changeTab('CHARGES')}
          className={`px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-colors ${tab === 'CHARGES' ? 'bg-mcsystem-900 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
        >
          <FileText size={16} /> Cobranças avulsas
        </button>
        <button
          onClick={() => changeTab('SUBSCRIPTIONS')}
          className={`px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-colors ${tab === 'SUBSCRIPTIONS' ? 'bg-mcsystem-900 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
        >
          <Repeat size={16} /> Assinaturas
        </button>
      </div>

      {/* Busca + ordenação */}
      {tab !== 'AGENDA' && (
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
        {tab === 'CHARGES' && (
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
            className="px-3 py-3 rounded-xl border border-gray-200 bg-white text-sm text-gray-700 focus:border-mcsystem-500 outline-none"
            title="Filtrar por status"
          >
            <option value="all">Todos os status</option>
            <option value="Pendente">Pendente</option>
            <option value="Pago">Pago</option>
            <option value="Atrasado">Atrasado</option>
          </select>
        )}
      </div>
      )}

      {/* Content */}
      {tab === 'AGENDA' ? (
        <ReceivablesAgenda records={financeRecords} companies={companies} products={products} />
      ) : tab === 'CHARGES' ? (
        <>
          {revenueByProduct.length > 0 && <RevenueByProduct rows={revenueByProduct} />}
          <ChargeList charges={filteredCharges} clientName={clientName} productName={productName} statusBadge={statusBadge} onEdit={setEditCharge} onDelete={handleDeleteCharge} {...sortProps} />
        </>
      ) : (
        <SubscriptionList subs={filteredSubs} clientName={clientName} productName={productName} onEdit={setEditSub} onDelete={handleDeleteSub} {...sortProps} />
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

// ---------- Lists ----------

const EmptyState: React.FC<{ icon: React.ReactNode; text: string }> = ({ icon, text }) => (
  <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-16 text-center text-gray-400">
    <div className="mx-auto mb-4 opacity-40 flex justify-center">{icon}</div>
    <p className="font-medium">{text}</p>
  </div>
);

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

const RevenueByProduct: React.FC<{ rows: { name: string; count: number; total: number; recebido: number }[] }> = ({ rows }) => {
  const totalGeral = rows.reduce((s, r) => s + r.total, 0);
  const recebidoGeral = rows.reduce((s, r) => s + r.recebido, 0);
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-bold text-gray-800">Faturamento por produto</h3>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-500">Total: <b className="text-gray-800">{formatBRL(totalGeral)}</b></span>
          <span className="text-gray-500">Recebido: <b className="text-green-600">{formatBRL(recebidoGeral)}</b></span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-left uppercase text-xs tracking-wider">
              <th className="px-6 py-3 font-semibold">Produto</th>
              <th className="px-6 py-3 font-semibold text-center">Cobranças</th>
              <th className="px-6 py-3 font-semibold text-right">Total cobrado</th>
              <th className="px-6 py-3 font-semibold text-right">Recebido</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r, i) => (
              <tr key={i} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-3 font-medium text-gray-800">{r.name}</td>
                <td className="px-6 py-3 text-center text-gray-600">{r.count}</td>
                <td className="px-6 py-3 text-right font-medium text-gray-700">{formatBRL(r.total)}</td>
                <td className="px-6 py-3 text-right font-medium text-green-600">{formatBRL(r.recebido)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const ChargeList: React.FC<{ charges: FinancialRecord[]; clientName: (id?: string) => string; productName: (id?: string) => string | null; statusBadge: (s?: string) => React.ReactNode; onEdit: (r: FinancialRecord) => void; onDelete: (r: FinancialRecord) => void } & SortProps> = ({ charges, clientName, productName, statusBadge, onEdit, onDelete, sortField, sortDir, onSort }) => {
  if (charges.length === 0) return <EmptyState icon={<FileText size={48} />} text="Nenhuma cobrança Asaas ainda." />;
  const sp = { sortField, sortDir, onSort };
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-left uppercase text-xs tracking-wider">
              <SortTh label="Cliente / Descrição" field="client" {...sp} />
              <SortTh label="Produto" field="product" {...sp} />
              <SortTh label="Valor" field="amount" {...sp} />
              <SortTh label="Vencimento" field="dueDate" {...sp} />
              <SortTh label="Status" field="status" align="center" {...sp} />
              <th className="px-6 py-4 font-semibold text-right">Fatura</th>
              <th className="px-6 py-4 font-semibold text-center">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {charges.map(r => (
              <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4">
                  <div className="font-semibold text-gray-800">{clientName(r.companyId)}</div>
                  <div className="text-gray-400 text-xs mt-0.5 max-w-md truncate">{r.description}</div>
                </td>
                <td className="px-6 py-4">
                  {r.split_revenue?.length
                    ? <ProductChips items={r.split_revenue.map(s => ({ name: productName(s.product_id), value: s.amount }))} />
                    : productName(r.product_id)
                      ? <span className="inline-block text-xs bg-mcsystem-50 text-mcsystem-700 px-2 py-1 rounded-md">{productName(r.product_id)}</span>
                      : <span className="text-gray-300 text-xs">—</span>}
                </td>
                <td className="px-6 py-4 font-medium text-gray-700">{formatBRL(r.amount)}</td>
                <td className="px-6 py-4 text-gray-600">{r.dueDate}</td>
                <td className="px-6 py-4 text-center">{statusBadge(r.status as string)}</td>
                <td className="px-6 py-4 text-right">
                  {r.asaas_invoice_url ? (
                    <a href={r.asaas_invoice_url} target="_blank" rel="noreferrer"
                       className="inline-flex items-center gap-1 text-mcsystem-600 hover:text-mcsystem-800 text-xs font-medium">
                      Abrir <ExternalLink size={12} />
                    </a>
                  ) : <span className="text-gray-300 text-xs">—</span>}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center justify-center gap-1">
                    <button onClick={() => onEdit(r)} className="p-2 text-gray-400 hover:text-mcsystem-600 hover:bg-mcsystem-50 rounded-lg transition-colors" title="Editar"><Pencil size={16} /></button>
                    <button onClick={() => onDelete(r)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Excluir"><Trash2 size={16} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const SubscriptionList: React.FC<{ subs: Subscription[]; clientName: (id?: string) => string; productName: (id?: string) => string | null; onEdit: (s: Subscription) => void; onDelete: (s: Subscription) => void } & SortProps> = ({ subs, clientName, productName, onEdit, onDelete, sortField, sortDir, onSort }) => {
  if (subs.length === 0) return <EmptyState icon={<Repeat size={48} />} text="Nenhuma assinatura ainda." />;
  const cycleLabel = (c?: string) => CYCLES.find(x => x.value === c)?.label || c || '—';
  const sp = { sortField, sortDir, onSort };
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-left uppercase text-xs tracking-wider">
              <SortTh label="Cliente / Descrição" field="client" {...sp} />
              <SortTh label="Produto" field="product" {...sp} />
              <SortTh label="Valor" field="value" {...sp} />
              <th className="px-6 py-4 font-semibold">Ciclo</th>
              <SortTh label="Próx. vencimento" field="next_due_date" {...sp} />
              <th className="px-6 py-4 font-semibold text-center">Status</th>
              <th className="px-6 py-4 font-semibold text-center">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {subs.map(s => (
              <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4">
                  <div className="font-semibold text-gray-800">{clientName(s.client_id)}</div>
                  <div className="text-gray-400 text-xs mt-0.5 max-w-md truncate">{s.description}</div>
                </td>
                <td className="px-6 py-4">
                  {s.split_products?.length
                    ? <ProductChips items={s.split_products.map(sp => ({ name: productName(sp.product_id), value: (s.value || 0) * sp.pct / 100 }))} />
                    : productName(s.product_id)
                      ? <span className="inline-block text-xs bg-mcsystem-50 text-mcsystem-700 px-2 py-1 rounded-md">{productName(s.product_id)}</span>
                      : <span className="text-gray-300 text-xs">—</span>}
                </td>
                <td className="px-6 py-4 font-medium text-gray-700">{formatBRL(s.value)}</td>
                <td className="px-6 py-4 text-gray-600">{cycleLabel(s.cycle)}</td>
                <td className="px-6 py-4 text-gray-600">{s.next_due_date}</td>
                <td className="px-6 py-4 text-center">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full text-green-700 bg-green-50">
                    {s.status || 'ACTIVE'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center justify-center gap-1">
                    <button onClick={() => onEdit(s)} className="p-2 text-gray-400 hover:text-mcsystem-600 hover:bg-mcsystem-50 rounded-lg transition-colors" title="Editar"><Pencil size={16} /></button>
                    <button onClick={() => onDelete(s)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Excluir"><Trash2 size={16} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
              {CYCLES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
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
              {CYCLES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
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
