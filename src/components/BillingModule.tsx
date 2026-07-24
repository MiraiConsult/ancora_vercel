import React, { useState, useMemo } from 'react';
import { Company, Product, FinancialRecord, Subscription, RevenueType, User } from '../types';
import { asaasCreateCharge, asaasCreateSubscription, asaasSyncAll } from '../services/asaasService';
import {
  FileText, Repeat, Plus, X, Save, Search, ExternalLink, Loader2,
  CheckCircle2, Clock, AlertCircle, DollarSign, Zap, RefreshCw,
} from 'lucide-react';

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
  const [tab, setTab] = useState<'CHARGES' | 'SUBSCRIPTIONS'>('CHARGES');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<null | 'charge' | 'subscription'>(null);
  const [submitting, setSubmitting] = useState(false);
  const [syncing, setSyncing] = useState(false);

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

  const activeProducts = useMemo(() => products.filter(p => p.active), [products]);
  const clientName = (id?: string) => companies.find(c => c.id === id)?.name || '—';

  const charges = useMemo(
    () => financeRecords
      .filter(r => r.asaas_payment_id)
      .sort((a, b) => (b.dueDate || '').localeCompare(a.dueDate || '')),
    [financeRecords],
  );

  const filteredCharges = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return charges;
    return charges.filter(r =>
      (r.description || '').toLowerCase().includes(q) ||
      clientName(r.companyId).toLowerCase().includes(q));
  }, [charges, search]);

  const filteredSubs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return subscriptions;
    return subscriptions.filter(s =>
      (s.description || '').toLowerCase().includes(q) ||
      clientName(s.client_id).toLowerCase().includes(q));
  }, [subscriptions, search]);

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
            onClick={() => setModal(tab === 'CHARGES' ? 'charge' : 'subscription')}
            className="px-5 py-3 bg-mcsystem-900 text-white rounded-xl font-semibold hover:bg-mcsystem-800 transition-all shadow-md flex items-center justify-center gap-2"
          >
            <Plus size={18} /> {tab === 'CHARGES' ? 'Nova Cobrança' : 'Nova Assinatura'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab('CHARGES')}
          className={`px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-colors ${tab === 'CHARGES' ? 'bg-mcsystem-900 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
        >
          <FileText size={16} /> Cobranças avulsas
        </button>
        <button
          onClick={() => setTab('SUBSCRIPTIONS')}
          className={`px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-colors ${tab === 'SUBSCRIPTIONS' ? 'bg-mcsystem-900 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
        >
          <Repeat size={16} /> Assinaturas
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por cliente ou descrição..."
          className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-200 focus:border-mcsystem-500 focus:ring-2 focus:ring-mcsystem-100 outline-none"
        />
      </div>

      {/* Content */}
      {tab === 'CHARGES' ? (
        <ChargeList charges={filteredCharges} clientName={clientName} statusBadge={statusBadge} />
      ) : (
        <SubscriptionList subs={filteredSubs} clientName={clientName} />
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

const ChargeList: React.FC<{ charges: FinancialRecord[]; clientName: (id?: string) => string; statusBadge: (s?: string) => React.ReactNode }> = ({ charges, clientName, statusBadge }) => {
  if (charges.length === 0) return <EmptyState icon={<FileText size={48} />} text="Nenhuma cobrança Asaas ainda." />;
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-left uppercase text-xs tracking-wider">
              <th className="px-6 py-4 font-semibold">Cliente / Descrição</th>
              <th className="px-6 py-4 font-semibold">Valor</th>
              <th className="px-6 py-4 font-semibold">Vencimento</th>
              <th className="px-6 py-4 font-semibold text-center">Status</th>
              <th className="px-6 py-4 font-semibold text-right">Fatura</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {charges.map(r => (
              <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4">
                  <div className="font-semibold text-gray-800">{clientName(r.companyId)}</div>
                  <div className="text-gray-400 text-xs mt-0.5 max-w-md truncate">{r.description}</div>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const SubscriptionList: React.FC<{ subs: Subscription[]; clientName: (id?: string) => string }> = ({ subs, clientName }) => {
  if (subs.length === 0) return <EmptyState icon={<Repeat size={48} />} text="Nenhuma assinatura ainda." />;
  const cycleLabel = (c?: string) => CYCLES.find(x => x.value === c)?.label || c || '—';
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-left uppercase text-xs tracking-wider">
              <th className="px-6 py-4 font-semibold">Cliente / Descrição</th>
              <th className="px-6 py-4 font-semibold">Valor</th>
              <th className="px-6 py-4 font-semibold">Ciclo</th>
              <th className="px-6 py-4 font-semibold">Próx. vencimento</th>
              <th className="px-6 py-4 font-semibold text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {subs.map(s => (
              <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4">
                  <div className="font-semibold text-gray-800">{clientName(s.client_id)}</div>
                  <div className="text-gray-400 text-xs mt-0.5 max-w-md truncate">{s.description}</div>
                </td>
                <td className="px-6 py-4 font-medium text-gray-700">{formatBRL(s.value)}</td>
                <td className="px-6 py-4 text-gray-600">{cycleLabel(s.cycle)}</td>
                <td className="px-6 py-4 text-gray-600">{s.next_due_date}</td>
                <td className="px-6 py-4 text-center">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full text-green-700 bg-green-50">
                    {s.status || 'ACTIVE'}
                  </span>
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
    if (!nextDueDate) return alert('Informe o primeiro vencimento.');
    onSubmit({ clientId, productId: productId || undefined, value, cycle, nextDueDate, description, billingType });
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

const ModalFooter: React.FC<{ submitting: boolean; onClose: () => void; onSubmit: () => void; label: string }> = ({ submitting, onClose, onSubmit, label }) => (
  <div className="bg-gray-50 px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
    <button onClick={onClose} disabled={submitting} className="px-4 py-2.5 rounded-lg text-gray-600 font-medium hover:bg-gray-200 transition-colors disabled:opacity-50">Cancelar</button>
    <button onClick={onSubmit} disabled={submitting} className="px-5 py-2.5 bg-mcsystem-900 text-white rounded-lg font-semibold hover:bg-mcsystem-800 transition-colors flex items-center gap-2 disabled:opacity-50">
      {submitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}{label}
    </button>
  </div>
);
