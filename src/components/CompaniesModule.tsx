import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Company, User, NoteColor, FinancialRecord, TransactionType, TransactionStatus, RevenueType, Bank, GeneralNote, Product, Subscription } from '../types';
import { Search, Plus, Pencil, Trash2, X, Save, User as UserIcon, ChevronDown, StickyNote, TrendingUp, LayoutDashboard, CheckSquare, HelpCircle, LayoutGrid, LayoutList, Square, Copy, ArrowUpDown, Bell, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { ClientNotificationsModal } from './ClientNotificationsModal';
import { lookupCnpj, isCnpjComplete, maskCnpj } from '../lib/lookup';

interface CompaniesModuleProps {
  companies: Company[];
  setCompanies: React.Dispatch<React.SetStateAction<Company[]>>;
  financeRecords: FinancialRecord[];
  setFinanceRecords: React.Dispatch<React.SetStateAction<FinancialRecord[]>>;
  generalNotes: GeneralNote[];
  setGeneralNotes: React.Dispatch<React.SetStateAction<GeneralNote[]>>;
  revenueTypes: RevenueType[];
  banks: Bank[];
  allUsers: User[];
  currentUser: User;
  products: Product[];
  subscriptions: Subscription[];
  onOpenHelp: (title: string, content: React.ReactNode) => void;
}

type CompanyTab = 'OVERVIEW' | 'FINANCE' | 'NOTES';

const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

/** Quantas vezes o ciclo da assinatura cabe em um mês (para normalizar o MRR). */
const CYCLE_LABEL: Record<string, string> = {
  WEEKLY: 'Semanal', BIWEEKLY: 'Quinzenal', MONTHLY: 'Mensal', BIMONTHLY: 'Bimestral',
  QUARTERLY: 'Trimestral', SEMIANNUALLY: 'Semestral', YEARLY: 'Anual',
};

const CYCLE_TO_MONTHLY: Record<string, number> = {
  WEEKLY: 52 / 12,
  BIWEEKLY: 26 / 12,
  MONTHLY: 1,
  BIMONTHLY: 1 / 2,
  QUARTERLY: 1 / 3,
  SEMIANNUALLY: 1 / 6,
  YEARLY: 1 / 12,
};

/**
 * Produtos do cliente. Recorrente (assinatura ativa) em destaque; produto que
 * só apareceu em cobrança avulsa fica apagado, para dar pra distinguir de
 * relance quem é receita recorrente e quem foi venda pontual.
 */
const ProductTags: React.FC<{ m: { products: string[]; recurring: Set<string> } }> = ({ m }) => {
  if (!m.products.length) return <span className="text-gray-300 text-xs">—</span>;
  return (
    <div className="flex flex-wrap gap-1 max-w-[240px]">
      {m.products.slice(0, 3).map(name => (
        <span
          key={name}
          title={m.recurring.has(name) ? 'Assinatura ativa' : 'Cobrança avulsa'}
          className={`px-2 py-1 rounded text-xs whitespace-nowrap ${
            m.recurring.has(name)
              ? 'bg-mcsystem-50 text-mcsystem-700 font-medium'
              : 'bg-gray-100 text-gray-500'
          }`}
        >
          {name}
        </span>
      ))}
      {m.products.length > 3 && (
        <span className="text-xs text-gray-400 self-center" title={m.products.slice(3).join(', ')}>
          +{m.products.length - 3}
        </span>
      )}
    </div>
  );
};

export const CompaniesModule: React.FC<CompaniesModuleProps> = ({
    companies, setCompanies,
    financeRecords = [], setFinanceRecords,
    generalNotes, setGeneralNotes,
    revenueTypes = [], banks = [], allUsers = [], currentUser,
    products = [], subscriptions = [],
    onOpenHelp
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<'name' | 'status' | 'segment' | 'paid' | 'mrr'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // View Mode State (LIST or CARDS)
  const [viewMode, setViewMode] = useState<'LIST' | 'CARDS'>('LIST');
  
  // Bulk Edit State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkEditModalOpen, setIsBulkEditModalOpen] = useState(false);
  const [bulkEditField, setBulkEditField] = useState<'status' | 'segment' | 'responsible'>('status');
  const [bulkEditValue, setBulkEditValue] = useState<string>('');
  const [selectedResponsibles, setSelectedResponsibles] = useState<string[]>([]);
  
  // Details View State
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [activeTab, setActiveTab] = useState<CompanyTab>('OVERVIEW');
  const [notifyCompany, setNotifyCompany] = useState<Company | null>(null);
  
  // --- LOCAL EDIT STATES ---
  
  // 1. Finance Modal
  const [isFinModalOpen, setIsFinModalOpen] = useState(false);
  const [editingFinId, setEditingFinId] = useState<string | null>(null);
  const [finForm, setFinForm] = useState<Partial<FinancialRecord>>({ description: '', amount: 0, type: TransactionType.INCOME, status: TransactionStatus.PENDING, dueDate: '', bankId: '' });

  // Note Modal State
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  // FIX: Removed 'collaboratorIds' property as it does not exist in type 'GeneralNote'.
  const [noteForm, setNoteForm] = useState<Partial<GeneralNote>>({
      title: '', content: '', category: 'Geral', color: 'yellow', companyId: ''
  });
  

  // Import State
  const [isImportMenuOpen, setIsImportMenuOpen] = useState(false);
  const importMenuRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modal State (Company)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Company>>({ name: '', cnpj: '', segment: '', location: '', status: 'Prospect' });
  const [buscandoCnpj, setBuscandoCnpj] = useState(false);
  const [cnpjMsg, setCnpjMsg] = useState('');

  /** Puxa da Receita e preenche o que estiver vazio — nada digitado se perde. */
  const buscarCnpjCliente = async (doc: string) => {
    if (!isCnpjComplete(doc)) return;
    setBuscandoCnpj(true); setCnpjMsg('');
    try {
      const d = await lookupCnpj(doc);
      setFormData(prev => ({
        ...prev,
        cnpj: maskCnpj(doc),
        name: prev.name?.trim() ? prev.name : (d.nomeFantasia || d.razaoSocial),
        location: prev.location?.trim() ? prev.location : [d.city, d.state].filter(Boolean).join('/'),
      }));
      setCnpjMsg(`${d.razaoSocial}${d.situacao ? ` · ${d.situacao}` : ''}`);
    } catch (e: any) {
      setCnpjMsg(e.message);
    } finally {
      setBuscandoCnpj(false);
    }
  };

  // Admin Check
  const isAdmin = currentUser.role === 'admin';
  // Check if current user is a mock user
  // Real Supabase IDs are UUIDs (36 characters with hyphens)
  // Mock IDs are typically short strings like 'u1', 'u2', etc.
  const isMockUser = !currentUser.id || currentUser.id.length < 20;

  // Reset view mode when opening a new company
  useEffect(() => {
      if (selectedCompany) {
          setActiveTab('OVERVIEW');
      }
  }, [selectedCompany?.id]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (importMenuRef.current && !importMenuRef.current.contains(event.target as Node)) {
        setIsImportMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => { document.removeEventListener("mousedown", handleClickOutside); };
  }, [importMenuRef]);

  /**
   * Produto contratado, quanto já pagou e MRR — por cliente.
   * O produto vem primeiro das assinaturas ativas (é o que ele contratou de
   * fato); quem só tem cobrança avulsa cai nos produtos das próprias cobranças.
   * Assinatura com rateio conta os dois produtos, cada um com sua fatia do MRR.
   */
  const clientMetrics = useMemo(() => {
    const productName = (id?: string | null) => products.find(p => p.id === id)?.name;
    const map = new Map<string, { subProducts: Map<string, number>; otherProducts: Set<string>; paid: number; mrr: number }>();
    const slot = (id: string) => {
      if (!map.has(id)) map.set(id, { subProducts: new Map(), otherProducts: new Set(), paid: 0, mrr: 0 });
      return map.get(id)!;
    };

    subscriptions.forEach(s => {
      if (!s.client_id || (s.status && s.status !== 'ACTIVE')) return;
      const factor = CYCLE_TO_MONTHLY[(s.cycle || 'MONTHLY').toUpperCase()] ?? 1;
      const monthly = (Number(s.value) || 0) * factor;
      const e = slot(s.client_id);
      e.mrr += monthly;
      if (s.split_products?.length) {
        s.split_products.forEach(sp => {
          const n = productName(sp.product_id);
          if (n) e.subProducts.set(n, (e.subProducts.get(n) || 0) + monthly * (sp.pct / 100));
        });
      } else {
        const n = productName(s.product_id);
        if (n) e.subProducts.set(n, (e.subProducts.get(n) || 0) + monthly);
      }
    });

    financeRecords.forEach(f => {
      // needsValidation fica de fora, igual ao Dashboard e ao DRE.
      if (!f.companyId || f.needsValidation || f.type !== TransactionType.INCOME) return;
      const e = slot(f.companyId);
      if (f.status === TransactionStatus.PAID) e.paid += Number(f.amount) || 0;
      if (f.split_revenue?.length) {
        f.split_revenue.forEach(sp => { const n = productName(sp.product_id); if (n) e.otherProducts.add(n); });
      } else {
        const n = productName(f.product_id);
        if (n) e.otherProducts.add(n);
      }
    });

    // Assinatura na frente; produto que só apareceu em cobrança avulsa depois.
    const out = new Map<string, { products: string[]; recurring: Set<string>; paid: number; mrr: number }>();
    map.forEach((e, id) => {
      const recurring = new Set(e.subProducts.keys());
      const extras = [...e.otherProducts].filter(n => !recurring.has(n)).sort();
      const ordered = [...e.subProducts.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
      out.set(id, { products: [...ordered, ...extras], recurring, paid: e.paid, mrr: e.mrr });
    });
    return out;
  }, [subscriptions, financeRecords, products]);

  const metricsFor = (id: string) => clientMetrics.get(id) || { products: [] as string[], recurring: new Set<string>(), paid: 0, mrr: 0 };

  const filteredCompanies = useMemo(() => {
    const list = companies.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()) || c.cnpj.includes(searchTerm));
    const dir = sortDir === 'asc' ? 1 : -1;
    const key = (c: Company) => {
      switch (sortField) {
        case 'status': return (c.status || '').toLowerCase();
        case 'segment': return (c.segment || '').toLowerCase();
        case 'paid': return metricsFor(c.id).paid;
        case 'mrr': return metricsFor(c.id).mrr;
        default: return (c.name || '').toLowerCase();
      }
    };
    return [...list].sort((a, b) => { const ka = key(a), kb = key(b); return ka < kb ? -dir : ka > kb ? dir : 0; });
  }, [companies, searchTerm, sortField, sortDir, clientMetrics]);

  /** Totais da carteira filtrada — o número que interessa no topo da tela. */
  const walletTotals = useMemo(() => filteredCompanies.reduce(
    (acc, c) => { const m = metricsFor(c.id); return { paid: acc.paid + m.paid, mrr: acc.mrr + m.mrr, active: acc.active + (m.mrr > 0 ? 1 : 0) }; },
    { paid: 0, mrr: 0, active: 0 },
  ), [filteredCompanies, clientMetrics]);

  // --- Derived Data ---
  const companyData = useMemo(() => {
      if (!selectedCompany) return { finance: [], notes: [] };
      return {
          finance: financeRecords.filter(f => f.companyId === selectedCompany.id || f.description.toLowerCase().includes(selectedCompany.name.toLowerCase())),
          notes: [
              ...(selectedCompany.notes || []),
              ...generalNotes.filter(n => n.companyId === selectedCompany.id)
          ].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      };
  }, [selectedCompany, financeRecords, generalNotes]);

  // Financial Stats
  const financialStats = useMemo(() => {
      const income = companyData.finance.filter(f => f.type === TransactionType.INCOME);
      const totalPaid = income.filter(f => f.status === TransactionStatus.PAID).reduce((acc, curr) => acc + (curr.amount || 0), 0);
      const totalPending = income.filter(f => f.status === TransactionStatus.PENDING).reduce((acc, curr) => acc + (curr.amount || 0), 0);
      return { totalPaid, totalPending };
  }, [companyData.finance]);
  
  const handleHelpClick = () => {
    onOpenHelp("Guia Rápido: Carteira de Clientes", (
        <ul className="space-y-4 text-sm text-gray-600 list-disc pl-5 leading-relaxed">
            <li>
                <strong>Visão Geral da Carteira:</strong> A lista principal exibe todos os seus clientes. Utilize a barra de busca para encontrar uma empresa por nome ou CNPJ.
            </li>
            <li>
                <strong>Painel Detalhado:</strong> Ao clicar em um cliente, um painel se abre, fornecendo uma visão completa das informações do cliente: dados gerais, histórico financeiro e notas.
            </li>
            <li>
                <strong>Registros Financeiros:</strong> Na aba "Financeiro" do painel, você pode lançar e acompanhar as movimentações financeiras vinculadas automaticamente àquele cliente.
            </li>
            <li>
                <strong>Notas:</strong> Na aba "Notas" do painel, registre lembretes e observações organizadas por cliente.
            </li>
        </ul>
    ));
  };
  
  // --- HANDLERS: FINANCE ---
  const handleOpenFinModal = (record?: FinancialRecord) => {
      if (record) { setEditingFinId(record.id); setFinForm(record); } 
      else { setEditingFinId(null); setFinForm({ description: '', amount: 0, type: TransactionType.INCOME, status: TransactionStatus.PENDING, dueDate: new Date().toISOString().split('T')[0], bankId: banks[0]?.id || '' }); }
      setIsFinModalOpen(true);
  };
  const handleSaveFinance = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedCompany || !setFinanceRecords) return;
      
      // FIX: Cast object to satisfy the Omit<FinancialRecord, 'tenant_id'> type, as the form data is a Partial type.
      const record: Omit<FinancialRecord, 'tenant_id'> = editingFinId 
        ? { ...financeRecords.find(f => f.id === editingFinId)!, ...finForm } as FinancialRecord
        : { id: `f${Date.now()}`, companyId: selectedCompany.id, category: 'Geral', ...finForm } as Omit<FinancialRecord, 'tenant_id'>;

      if (editingFinId) setFinanceRecords(prev => prev.map(f => f.id === editingFinId ? { ...record, tenant_id: selectedCompany.tenant_id } as FinancialRecord : f)); 
      else setFinanceRecords(prev => [{ ...record, tenant_id: selectedCompany.tenant_id } as FinancialRecord, ...prev]);
      
      setIsFinModalOpen(false);
      if (isMockUser) return;
      await supabase.from('financial_records').upsert(record);
  };
  const handleDeleteFinance = async (id: string) => {
      if (!window.confirm('Excluir registro?') || !setFinanceRecords) return;
      setFinanceRecords(prev => prev.filter(f => f.id !== id));
      if (isMockUser) return;
      await supabase.from('financial_records').delete().eq('id', id);
  };


  // --- HANDLERS: NOTES ---
  const handleOpenNoteModal = (note?: any) => { 
      if (note) { 
          setEditingNoteId(note.id); 
// FIX: Removed 'collaboratorIds' property as it does not exist on type 'GeneralNote'.
          setNoteForm({ 
              title: note.title || '', 
              content: note.content, 
              category: note.category || 'Geral', 
              color: note.color || 'yellow',
              companyId: selectedCompany?.id,
          }); 
      } else { 
          setEditingNoteId(null); 
// FIX: Removed 'collaboratorIds' property as it does not exist on type 'GeneralNote'.
          setNoteForm({ title: '', content: '', category: 'Geral', color: 'yellow', companyId: selectedCompany?.id }); 
      } 
      setIsNoteModalOpen(true); 
  };

  const handleSaveNote = async (e: React.FormEvent) => { 
      e.preventDefault(); 
      if (!selectedCompany) return; 

      const note: Omit<GeneralNote, 'tenant_id'> = editingNoteId 
          ? { ...generalNotes.find(n => n.id === editingNoteId), ...noteForm, companyName: selectedCompany.name }
          : { 
              id: `gn-${Date.now()}`, 
              title: noteForm.title || '', 
              content: noteForm.content || '', 
              date: new Date().toISOString(), 
              author: currentUser.name || 'Usuário', 
              category: noteForm.category || 'Geral', 
              color: (noteForm.color as NoteColor) || 'yellow',
              companyId: selectedCompany.id,
              companyName: selectedCompany.name,
            };

      if (editingNoteId) setGeneralNotes(prev => prev.map(n => n.id === editingNoteId ? { ...note, tenant_id: selectedCompany.tenant_id } as GeneralNote : n));
      else setGeneralNotes(prev => [{ ...note, tenant_id: selectedCompany.tenant_id } as GeneralNote, ...prev]);

      setIsNoteModalOpen(false); 
      if (isMockUser) return;
      await supabase.from('general_notes').upsert(note);
  };

  const handleDeleteNote = async (noteId: string) => { 
      if (!selectedCompany) return; 
      if (!window.confirm('Excluir esta nota?')) return; 
      
      setGeneralNotes(prev => prev.filter(n => n.id !== noteId));
      
      const updatedLegacyNotes = (selectedCompany.notes || []).filter(n => n.id !== noteId);
      if (updatedLegacyNotes.length !== (selectedCompany.notes || []).length) {
          const updatedCompany = { ...selectedCompany, notes: updatedLegacyNotes };
          setCompanies(prev => prev.map(c => c.id === selectedCompany.id ? updatedCompany : c));
          setSelectedCompany(updatedCompany);
          // Atualizado para 'clients'
          if (!isMockUser) await supabase.from('clients').update({ notes: updatedLegacyNotes }).eq('id', selectedCompany.id);
      }

      if (isMockUser) return;
      await supabase.from('general_notes').delete().eq('id', noteId);
  };

  

  const getCollaboratorAvatars = (ids: string[] | undefined, authorName?: string) => {
    let displayIds = ids || [];
    if (displayIds.length === 0 && authorName) {
        const user = allUsers?.find(u => u.name === authorName);
        if (user) displayIds = [user.id];
    }
    if (displayIds.length === 0) return null;
    return (
        <div className="flex -space-x-1">
            {displayIds.slice(0, 3).map(id => {
                const user = allUsers?.find(u => u.id === id);
                return <div key={id} className="w-5 h-6 rounded-full bg-gray-100 flex items-center justify-center text-[8px] font-bold text-gray-700 border border-white" title={user?.name}>{user?.avatar || user?.name?.substring(0,2).toUpperCase() || 'U'}</div>;
            })}
        </div>
    );
  };

  const getNoteStyles = (color?: string) => { switch(color) { case 'blue': return 'bg-blue-50 border-blue-200 text-blue-900'; case 'green': return 'bg-emerald-50 border-emerald-200 text-emerald-900'; case 'red': return 'bg-rose-50 border-rose-200 text-rose-900'; case 'purple': return 'bg-purple-50 border-purple-200 text-purple-900'; case 'gray': return 'bg-gray-50 border-gray-200 text-gray-900'; case 'yellow': default: return 'bg-yellow-50 border-yellow-200 text-yellow-900'; } };
  const getNoteBadgeStyles = (color?: string) => { switch(color) { case 'blue': return 'bg-blue-100 text-blue-700'; case 'green': return 'bg-emerald-100 text-emerald-700'; case 'red': return 'bg-rose-100 text-rose-700'; case 'purple': return 'bg-purple-100 text-purple-700'; case 'gray': return 'bg-gray-200 text-gray-700'; case 'yellow': default: return 'bg-yellow-100 text-yellow-800'; } };
  
  const handleSaveCompany = async (e: React.FormEvent) => { 
      e.preventDefault(); 
      
      const newCompanyBase: Omit<Company, 'id' | 'tenant_id'> = {
          name: formData.name || 'Nova Empresa',
          cnpj: formData.cnpj || '',
          segment: formData.segment || '',
          location: formData.location || '',
          status: (formData.status as any) || 'Prospect',
          responsible_users: formData.responsible_users || [],
      };

      let updatedCompany: Company;
      
      if (editingId) { 
          const existing = companies.find(c => c.id === editingId);
          if (!existing) return;

          updatedCompany = { 
              ...existing, 
              ...newCompanyBase 
          } as Company; 
          
          setCompanies(prev => prev.map(c => c.id === editingId ? updatedCompany : c)); 
      } else { 
          updatedCompany = { 
              id: `c${Date.now()}`, 
              ...newCompanyBase, 
              notes: [],
              tenant_id: currentUser.tenant_id,
          } as Company; 
          
          setCompanies(prev => [...prev, updatedCompany]); 
      } 
      
      if (selectedCompany && selectedCompany.id === (editingId || updatedCompany.id)) {
          setSelectedCompany(updatedCompany);
      }
      closeModal(); 

      // If mock user, skip DB sync
      if (isMockUser) {
          console.log('Mock user mode: Skipping database sync.');
          return;
      }

      const { tenant_id, ...payload } = updatedCompany;

      try {
          // Changed to 'clients' to match new table name
          const { error } = await supabase.from('clients').upsert(payload);
          if (error) {
              console.warn('Supabase sync warning:', error.message);
          }
      } catch (err) {
          console.error('Unexpected error saving company:', err);
      }
  };

  const handleEditClick = (e: React.MouseEvent, company: Company) => { e.stopPropagation(); openEditModal(company); };
  const openEditModal = (company: Company) => { setEditingId(company.id); setFormData(company); setIsModalOpen(true); };
  const handleDeleteClick = async (e: React.MouseEvent, id: string) => { 
      e.stopPropagation(); 
      if (window.confirm("Excluir cliente?")) { 
          setCompanies(prev => prev.filter(c => c.id !== id)); 
          if (selectedCompany?.id === id) setSelectedCompany(null); 
          
          if (!isMockUser) {
              // Changed to 'clients' to match new table name
              await supabase.from('clients').delete().eq('id', id); 
          }
      } 
  };
  const handleNewClick = () => { setEditingId(null); setFormData({ name: '', cnpj: '', segment: '', location: '', status: 'Prospect' }); setIsModalOpen(true); };
  const closeModal = () => { setIsModalOpen(false); setEditingId(null); };

  // --- BULK EDIT HANDLERS ---
  const toggleSelectCompany = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      setSelectedIds(prev => {
          const newSet = new Set(prev);
          if (newSet.has(id)) newSet.delete(id);
          else newSet.add(id);
          return newSet;
      });
  };

  const toggleSelectAll = () => {
      if (selectedIds.size === filteredCompanies.length) {
          setSelectedIds(new Set());
      } else {
          setSelectedIds(new Set(filteredCompanies.map(c => c.id)));
      }
  };

  const handleOpenBulkEdit = () => {
      if (selectedIds.size === 0) {
          alert('Selecione pelo menos um cliente para editar em massa.');
          return;
      }
      setBulkEditField('status');
      setBulkEditValue('');
      setSelectedResponsibles([]);
      setIsBulkEditModalOpen(true);
  };

  const handleBulkEditSave = async () => {
      if (bulkEditField === 'responsible' && selectedResponsibles.length === 0) {
          alert('Selecione pelo menos um responsável.');
          return;
      }
      if (bulkEditField !== 'responsible' && !bulkEditValue) {
          alert('Selecione um valor para aplicar.');
          return;
      }

      const updates: Partial<Company> = {};
      if (bulkEditField === 'status') updates.status = bulkEditValue as Company['status'];
      if (bulkEditField === 'segment') updates.segment = bulkEditValue;
      if (bulkEditField === 'responsible') {
          // Ensure we're sending a valid array
          updates.responsible_users = Array.isArray(selectedResponsibles) ? selectedResponsibles : [];
          console.log('📦 Preparando atualização de responsáveis:', updates.responsible_users);
      }

      // Optimistic update
      setCompanies(prev => prev.map(c => 
          selectedIds.has(c.id) ? { ...c, ...updates } : c
      ));

      // Persist to Supabase
      console.log('👤 isMockUser:', isMockUser, '| currentUser.id:', currentUser.id);
      
      if (!isMockUser) {
          const idsArray = Array.from(selectedIds);
          console.log('🔍 Bulk Edit - Atualizando clientes:', {
              field: bulkEditField,
              updates: updates,
              clientIds: idsArray,
              updateType: typeof updates.responsible_users
          });
          
          try {
              for (const id of idsArray) {
                  const { data, error } = await supabase
                      .from('clients')
                      .update(updates)
                      .eq('id', id)
                      .select();
                  
                  if (error) {
                      console.error('❌ Erro ao atualizar cliente:', id, error);
                      throw error;
                  }
                  
                  console.log('✅ Cliente atualizado com sucesso:', id, data);
              }
          } catch (error: any) {
              console.error('❌ Erro no salvamento em massa:', error);
              alert(`Erro ao salvar: ${error.message || 'Erro desconhecido'}. Verifique o console para mais detalhes.`);
              return;
          }
      }

      setIsBulkEditModalOpen(false);
      setSelectedIds(new Set());
      setSelectedResponsibles([]);
      alert(`${selectedIds.size} cliente(s) atualizado(s) com sucesso!`);
  };

  // --- BULK DELETE HANDLER ---
  const handleBulkDelete = async () => {
      const count = selectedIds.size;
      if (!window.confirm(`Tem certeza que deseja excluir ${count} cliente(s)?`)) return;

      // Optimistic delete
      setCompanies(prev => prev.filter(c => !selectedIds.has(c.id)));

      // Close details if selected company is deleted
      if (selectedCompany && selectedIds.has(selectedCompany.id)) {
          setSelectedCompany(null);
      }

      // Persist to Supabase
      if (!isMockUser) {
          const idsArray = Array.from(selectedIds);
          for (const id of idsArray) {
              await supabase.from('clients').delete().eq('id', id);
          }
      }

      setSelectedIds(new Set());
      alert(`${count} cliente(s) excluído(s) com sucesso!`);
  };

  // --- DUPLICATE HANDLER ---
  const handleDuplicateCompany = async (e: React.MouseEvent, company: Company) => {
      e.stopPropagation();

      const newCompany: Company = {
          ...company,
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name: `${company.name} (Cópia)`,
          cnpj: '', // Clear CNPJ to avoid duplicates
      };

      // Optimistic add
      setCompanies(prev => [newCompany, ...prev]);

      // Persist to Supabase
      if (!isMockUser) {
          const { error } = await supabase.from('clients').insert([{
              id: newCompany.id,
              name: newCompany.name,
              cnpj: newCompany.cnpj,
              segment: newCompany.segment,
              location: newCompany.location,
              status: newCompany.status,
              responsible_users: newCompany.responsible_users,
              tenant_id: currentUser.tenant_id
          }]);

          if (error) {
              console.error('Error duplicating company:', error);
              // Rollback
              setCompanies(prev => prev.filter(c => c.id !== newCompany.id));
              alert('Erro ao duplicar cliente.');
          } else {
              alert('Cliente duplicado com sucesso!');
          }
      }
  };

  return (
    <div className="space-y-6 relative h-full">
      {notifyCompany && (
        <ClientNotificationsModal
          clientId={notifyCompany.id}
          clientName={notifyCompany.name}
          onClose={() => setNotifyCompany(null)}
        />
      )}

      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">Carteira de Clientes</h2>
        <div className="flex items-center gap-2">
            <button onClick={handleHelpClick} className="p-2 bg-white text-gray-400 hover:text-mcsystem-500 hover:bg-mcsystem-50 rounded-md border border-gray-200 transition-colors" title="Ajuda">
                <HelpCircle size={20} />
            </button>
            <button onClick={handleNewClick} className="bg-mcsystem-500 hover:bg-mcsystem-400 text-white px-4 py-2 rounded-md flex items-center text-sm font-medium transition-colors">
              <Plus size={16} className="mr-2" /> Novo Cliente
            </button>
        </div>
      </div>

      {isAdmin && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div className="bg-white rounded-lg border border-gray-100 shadow-sm p-4">
            <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">MRR da carteira</p>
            <p className="text-2xl font-bold text-mcsystem-700 mt-1">{brl(walletTotals.mrr)}</p>
            <p className="text-xs text-gray-400 mt-0.5">{brl(walletTotals.mrr * 12)} por ano</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-100 shadow-sm p-4">
            <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Já recebido</p>
            <p className="text-2xl font-bold text-green-700 mt-1">{brl(walletTotals.paid)}</p>
            <p className="text-xs text-gray-400 mt-0.5">todo o histórico</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-100 shadow-sm p-4">
            <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Clientes com recorrência</p>
            <p className="text-2xl font-bold text-gray-800 mt-1">{walletTotals.active}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              de {filteredCompanies.length} · ticket médio {brl(walletTotals.active ? walletTotals.mrr / walletTotals.active : 0)}
            </p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-200 bg-gray-50 flex flex-wrap gap-4 items-center justify-between">
            <div className="flex items-center gap-4">
                <div className="relative flex-1 min-w-[250px] max-w-md">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                    <input type="text" placeholder="Buscar cliente por nome ou CNPJ..." className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-mcsystem-500" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>
                {/* View Mode Toggle */}
                <div className="bg-gray-100 p-1 rounded-lg flex text-gray-500">
                    <button onClick={() => setViewMode('LIST')} className={`p-1.5 rounded transition-all ${viewMode === 'LIST' ? 'bg-white text-mcsystem-600 shadow-sm' : 'hover:bg-gray-200'}`} title="Lista">
                        <LayoutList size={18} />
                    </button>
                    <button onClick={() => setViewMode('CARDS')} className={`p-1.5 rounded transition-all ${viewMode === 'CARDS' ? 'bg-white text-mcsystem-600 shadow-sm' : 'hover:bg-gray-200'}`} title="Cards">
                        <LayoutGrid size={18} />
                    </button>
                </div>
                {/* Ordenação */}
                <select
                    value={sortField}
                    onChange={(e) => setSortField(e.target.value as typeof sortField)}
                    className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-mcsystem-500"
                    title="Ordenar por"
                >
                    <option value="name">Nome</option>
                    <option value="status">Status</option>
                    <option value="segment">Segmento</option>
                    <option value="mrr">MRR</option>
                    <option value="paid">Já pagou</option>
                </select>
                <button
                    onClick={() => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))}
                    className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-600 hover:bg-gray-50 flex items-center gap-1.5"
                    title={sortDir === 'asc' ? 'Crescente' : 'Decrescente'}
                >
                    <ArrowUpDown size={16} /> {sortDir === 'asc' ? 'A-Z' : 'Z-A'}
                </button>
            </div>
            {/* Bulk Actions */}
            {selectedIds.size > 0 && (
                <div className="flex items-center gap-2 bg-mcsystem-50 px-3 py-2 rounded-lg border border-mcsystem-200">
                    <span className="text-sm font-medium text-mcsystem-700">{selectedIds.size} selecionado(s)</span>
                    <button onClick={handleOpenBulkEdit} className="bg-mcsystem-500 hover:bg-mcsystem-400 text-white px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center">
                        <Pencil size={14} className="mr-1" /> Editar
                    </button>
                    <button onClick={handleBulkDelete} className="bg-red-500 hover:bg-red-400 text-white px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center">
                        <Trash2 size={14} className="mr-1" /> Excluir
                    </button>
                    <button onClick={() => setSelectedIds(new Set())} className="text-gray-500 hover:text-gray-700 p-1">
                        <X size={16} />
                    </button>
                </div>
            )}
        </div>

        {/* LIST VIEW */}
        {viewMode === 'LIST' && (
          <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-100 text-gray-700 font-medium">
                  <tr>
                      <th className="p-4 w-10">
                          <button onClick={toggleSelectAll} className="p-1 hover:bg-gray-200 rounded transition-colors">
                              {selectedIds.size === filteredCompanies.length && filteredCompanies.length > 0 ? <CheckSquare size={18} className="text-mcsystem-500" /> : <Square size={18} />}
                          </button>
                      </th>
                      <th className="p-4">Cliente</th>
                      <th className="p-4">Produto contratado</th>
                      {isAdmin && <th className="p-4 text-right whitespace-nowrap">Já pagou</th>}
                      {isAdmin && <th className="p-4 text-right whitespace-nowrap">MRR</th>}
                      <th className="p-4">Segmento</th>
                      <th className="p-4">Responsáveis</th>
                      <th className="p-4">Status</th>
                      <th className="p-4 text-center">Ações</th>
                  </tr>
              </thead>
              <tbody>
                  {filteredCompanies.map(company => (
                      <tr key={company.id} onClick={() => setSelectedCompany(company)} className={`border-b border-gray-100 hover:bg-gray-50 group cursor-pointer transition-colors ${selectedCompany?.id === company.id ? 'bg-blue-50' : ''} ${selectedIds.has(company.id) ? 'bg-mcsystem-50' : ''}`}>
                          <td className="p-4" onClick={(e) => e.stopPropagation()}>
                              <button onClick={(e) => toggleSelectCompany(e, company.id)} className="p-1 hover:bg-gray-200 rounded transition-colors">
                                  {selectedIds.has(company.id) ? <CheckSquare size={18} className="text-mcsystem-500" /> : <Square size={18} className="text-gray-400" />}
                              </button>
                          </td>
                          <td className="p-4"><div className="flex items-center"><div className="h-10 w-10 bg-mcsystem-900 rounded-lg flex items-center justify-center text-white font-bold mr-3">{company.name.substring(0, 2).toUpperCase()}</div><div><p className="font-semibold text-gray-900">{company.name}</p><p className="text-xs text-gray-400">{company.cnpj}</p></div></div></td>
                          <td className="p-4"><ProductTags m={metricsFor(company.id)} /></td>
                          {isAdmin && <td className="p-4 text-right font-medium text-gray-700 whitespace-nowrap">{metricsFor(company.id).paid > 0 ? brl(metricsFor(company.id).paid) : <span className="text-gray-300">—</span>}</td>}
                          {isAdmin && <td className="p-4 text-right font-semibold whitespace-nowrap">{metricsFor(company.id).mrr > 0 ? <span className="text-mcsystem-700">{brl(metricsFor(company.id).mrr)}</span> : <span className="text-gray-300">—</span>}</td>}
                          <td className="p-4"><span className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs">{company.segment}</span></td>
                          <td className="p-4">
                            <div className="flex flex-wrap gap-1">
                              {(company.responsible_users && company.responsible_users.length > 0) ? (
                                company.responsible_users.slice(0, 3).map(userId => {
                                  const user = allUsers.find(u => u.id === userId);
                                  return user ? (
                                    <div key={userId} className="flex items-center bg-mcsystem-50 text-mcsystem-700 px-2 py-1 rounded text-xs" title={user.name}>
                                      <UserIcon size={12} className="mr-1" />
                                      {user.name.split(' ')[0]}
                                    </div>
                                  ) : null;
                                })
                              ) : (
                                <span className="text-xs text-gray-400">Sem responsável</span>
                              )}
                              {(company.responsible_users && company.responsible_users.length > 3) && (
                                <span className="text-xs text-gray-500">+{company.responsible_users.length - 3}</span>
                              )}
                            </div>
                          </td>
                          <td className="p-4"><span className={`flex items-center text-xs font-medium ${company.status === 'Active' ? 'text-green-600' : company.status === 'Churned' ? 'text-red-500' : 'text-yellow-600'}`}><span className={`h-2 w-2 rounded-full mr-2 ${company.status === 'Active' ? 'bg-green-500' : company.status === 'Churned' ? 'bg-red-500' : 'bg-yellow-500'}`}></span>{company.status}</span></td>
                          <td className="p-4 text-center"><div className="flex justify-center space-x-1"><button onClick={(e) => handleDuplicateCompany(e, company)} className="p-1.5 text-gray-400 hover:text-blue-500" title="Duplicar"><Copy size={16}/></button><button onClick={(e) => handleEditClick(e, company)} className="p-1.5 text-gray-400 hover:text-mcsystem-500" title="Editar"><Pencil size={16}/></button><button onClick={(e) => handleDeleteClick(e, company.id)} className="p-1.5 text-gray-400 hover:text-red-500" title="Excluir"><Trash2 size={16}/></button></div></td>
                      </tr>
                  ))}
              </tbody>
          </table>
          </div>
        )}

        {/* CARDS VIEW */}
        {viewMode === 'CARDS' && (
          <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                  <button onClick={toggleSelectAll} className="text-sm text-mcsystem-600 hover:text-mcsystem-700 flex items-center gap-1">
                      {selectedIds.size === filteredCompanies.length && filteredCompanies.length > 0 ? <CheckSquare size={16} /> : <Square size={16} />}
                      {selectedIds.size === filteredCompanies.length ? 'Desmarcar todos' : 'Selecionar todos'}
                  </button>
                  <span className="text-sm text-gray-500">{filteredCompanies.length} cliente(s)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {filteredCompanies.map(company => (
                      <div 
                          key={company.id} 
                          onClick={() => setSelectedCompany(company)} 
                          className={`bg-white rounded-xl border-2 p-4 cursor-pointer transition-all hover:shadow-lg group relative ${selectedIds.has(company.id) ? 'border-mcsystem-500 bg-mcsystem-50' : 'border-gray-100 hover:border-mcsystem-200'}`}
                      >
                          {/* Selection Checkbox */}
                          <button 
                              onClick={(e) => toggleSelectCompany(e, company.id)} 
                              className="absolute top-3 right-3 p-1 hover:bg-gray-100 rounded transition-colors z-10"
                          >
                              {selectedIds.has(company.id) ? <CheckSquare size={20} className="text-mcsystem-500" /> : <Square size={20} className="text-gray-300 group-hover:text-gray-400" />}
                          </button>

                          {/* Company Avatar & Name */}
                          <div className="flex items-center mb-4">
                              <div className="h-12 w-12 bg-mcsystem-900 rounded-xl flex items-center justify-center text-white font-bold text-lg mr-3">
                                  {company.name.substring(0, 2).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                  <p className="font-bold text-gray-900 truncate">{company.name}</p>
                                  <p className="text-xs text-gray-400 truncate">{company.cnpj || 'Sem CNPJ'}</p>
                              </div>
                          </div>

                          {/* Info Grid */}
                          <div className="space-y-3">
                              {/* Produto + faturamento */}
                              <div>
                                  <span className="text-xs text-gray-500 block mb-1.5">Produto contratado</span>
                                  <ProductTags m={metricsFor(company.id)} />
                              </div>
                              {isAdmin && (
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="bg-mcsystem-50 rounded-lg px-2 py-1.5">
                                        <span className="text-[9px] uppercase font-bold text-mcsystem-600 block">MRR</span>
                                        <span className="text-sm font-bold text-mcsystem-700">{metricsFor(company.id).mrr > 0 ? brl(metricsFor(company.id).mrr) : '—'}</span>
                                    </div>
                                    <div className="bg-green-50 rounded-lg px-2 py-1.5">
                                        <span className="text-[9px] uppercase font-bold text-green-600 block">Já pagou</span>
                                        <span className="text-sm font-bold text-green-700">{metricsFor(company.id).paid > 0 ? brl(metricsFor(company.id).paid) : '—'}</span>
                                    </div>
                                </div>
                              )}
                              {/* Segment */}
                              <div className="flex items-center justify-between">
                                  <span className="text-xs text-gray-500">Segmento</span>
                                  <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-xs font-medium truncate max-w-[120px]">{company.segment || 'N/A'}</span>
                              </div>

                              {/* Status */}
                              <div className="flex items-center justify-between">
                                  <span className="text-xs text-gray-500">Status</span>
                                  <span className={`flex items-center text-xs font-medium ${company.status === 'Active' ? 'text-green-600' : company.status === 'Churned' ? 'text-red-500' : 'text-yellow-600'}`}>
                                      <span className={`h-2 w-2 rounded-full mr-1.5 ${company.status === 'Active' ? 'bg-green-500' : company.status === 'Churned' ? 'bg-red-500' : 'bg-yellow-500'}`}></span>
                                      {company.status}
                                  </span>
                              </div>

                              {/* Responsáveis */}
                              <div>
                                  <span className="text-xs text-gray-500 block mb-1">Responsáveis</span>
                                  <div className="flex flex-wrap gap-1">
                                      {(company.responsible_users && company.responsible_users.length > 0) ? (
                                          company.responsible_users.slice(0, 2).map(userId => {
                                              const user = allUsers.find(u => u.id === userId);
                                              return user ? (
                                                  <div key={userId} className="flex items-center bg-mcsystem-50 text-mcsystem-700 px-2 py-0.5 rounded text-[10px]" title={user.name}>
                                                      <UserIcon size={10} className="mr-1" />
                                                      {user.name.split(' ')[0]}
                                                  </div>
                                              ) : null;
                                          })
                                      ) : (
                                          <span className="text-xs text-gray-400">Sem responsável</span>
                                      )}
                                      {(company.responsible_users && company.responsible_users.length > 2) && (
                                          <span className="text-[10px] text-gray-500">+{company.responsible_users.length - 2}</span>
                                      )}
                                  </div>
                              </div>
                          </div>

                          {/* Actions */}
                          <div className="flex justify-end gap-1 mt-4 pt-3 border-t border-gray-100 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={(e) => handleDuplicateCompany(e, company)} className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded" title="Duplicar"><Copy size={14}/></button>
                              <button onClick={(e) => handleEditClick(e, company)} className="p-1.5 text-gray-400 hover:text-mcsystem-500 hover:bg-mcsystem-50 rounded" title="Editar"><Pencil size={14}/></button>
                              <button onClick={(e) => handleDeleteClick(e, company.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded" title="Excluir"><Trash2 size={14}/></button>
                          </div>
                      </div>
                  ))}
              </div>
          </div>
        )}
      </div>

       {selectedCompany && (
           <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4 backdrop-blur-sm" onClick={() => setSelectedCompany(null)}>
               <div 
                  className="bg-slate-50 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-300"
                  onClick={(e) => e.stopPropagation()}
               >
                   <div className={`pt-6 px-6 pb-0 bg-white border-b border-gray-200 sticky top-0 z-10 flex-shrink-0 transition-colors rounded-t-2xl`}>
                       <div className="flex justify-between items-start mb-4">
                            <div className="flex items-center">
                                <div className="h-12 w-12 bg-mcsystem-900 rounded-xl flex items-center justify-center text-white font-bold text-lg mr-4 shadow-lg">{selectedCompany.name.substring(0, 2).toUpperCase()}</div>
                                <div><h2 className="text-xl font-bold text-gray-800 leading-tight">{selectedCompany.name}</h2><p className="text-sm text-gray-400 font-medium">{selectedCompany.cnpj}</p></div>
                            </div>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => setNotifyCompany(selectedCompany)}
                                    title="Como cobrar este cliente — e-mail, SMS, WhatsApp ou nenhum aviso"
                                    className="text-gray-400 hover:text-mcsystem-600 p-2 rounded-full hover:bg-mcsystem-50 transition-colors"
                                >
                                    <Bell size={20} />
                                </button>
                                <button onClick={() => setSelectedCompany(null)} className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-200 transition-colors">
                                    <X size={24} />
                                </button>
                            </div>
                       </div>
                       <div className="flex space-x-6 overflow-x-auto scrollbar-hide -mb-px">
                           {[
                               { id: 'OVERVIEW', label: 'Visão Geral', icon: LayoutDashboard },
                               { id: 'FINANCE', label: 'Financeiro', icon: TrendingUp },
                               { id: 'NOTES', label: 'Notas', icon: StickyNote, count: companyData.notes.length }
                           ].map(tab => (
                               <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex items-center pb-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === tab.id ? 'border-mcsystem-500 text-mcsystem-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}><tab.icon size={16} className={`mr-2 ${activeTab === tab.id ? 'text-mcsystem-500' : 'text-gray-400'}`} />{tab.label}{tab.count !== undefined && (<span className={`ml-2 text-xs py-0.5 px-1.5 rounded-full ${activeTab === tab.id ? 'bg-mcsystem-100 text-mcsystem-600' : 'bg-gray-100 text-gray-500'}`}>{tab.count}</span>)}</button>
                           ))}
                       </div>
                   </div>
                   
                   <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
                       {activeTab === 'OVERVIEW' && (
                           <div className="animate-in slide-in-from-left-4 duration-300 space-y-6">
                                {/* 0. CONTRATO — o que ele contratou e quanto vale */}
                                {isAdmin && (() => {
                                  const m = metricsFor(selectedCompany.id);
                                  const subs = subscriptions.filter(s => s.client_id === selectedCompany.id && (!s.status || s.status === 'ACTIVE'));
                                  return (
                                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                                      <h3 className="text-xs font-bold text-gray-900 mb-4 uppercase tracking-wider">Contrato</h3>
                                      <div className="grid grid-cols-3 gap-3 mb-4">
                                        <div className="bg-mcsystem-50 p-3 rounded-lg border border-mcsystem-100">
                                          <span className="text-[10px] text-mcsystem-600 uppercase font-bold">MRR</span>
                                          <p className="text-lg font-bold text-mcsystem-700">{brl(m.mrr)}</p>
                                        </div>
                                        <div className="bg-green-50 p-3 rounded-lg border border-green-100">
                                          <span className="text-[10px] text-green-600 uppercase font-bold">Já pagou</span>
                                          <p className="text-lg font-bold text-green-700">{brl(m.paid)}</p>
                                        </div>
                                        <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                                          <span className="text-[10px] text-gray-500 uppercase font-bold">Por ano</span>
                                          <p className="text-lg font-bold text-gray-700">{brl(m.mrr * 12)}</p>
                                        </div>
                                      </div>
                                      {subs.length > 0 ? (
                                        <div className="space-y-2">
                                          {subs.map(s => {
                                            const factor = CYCLE_TO_MONTHLY[(s.cycle || 'MONTHLY').toUpperCase()] ?? 1;
                                            const names = s.split_products?.length
                                              ? s.split_products.map(sp => ({
                                                  name: products.find(p => p.id === sp.product_id)?.name || 'Sem produto',
                                                  value: (Number(s.value) || 0) * sp.pct / 100,
                                                }))
                                              : [{ name: products.find(p => p.id === s.product_id)?.name || 'Sem produto', value: Number(s.value) || 0 }];
                                            return (
                                              <div key={s.id} className="border border-gray-100 rounded-lg p-3">
                                                <div className="flex justify-between items-start gap-3">
                                                  <div className="min-w-0">
                                                    <p className="text-sm font-semibold text-gray-800 truncate">{s.description || 'Assinatura'}</p>
                                                    <p className="text-xs text-gray-400 mt-0.5">
                                                      {CYCLE_LABEL[(s.cycle || 'MONTHLY').toUpperCase()] || s.cycle}
                                                      {s.next_due_date ? ` · próx. ${s.next_due_date.split('-').reverse().join('/')}` : ''}
                                                    </p>
                                                  </div>
                                                  <div className="text-right shrink-0">
                                                    <p className="text-sm font-bold text-gray-800">{brl(Number(s.value) || 0)}</p>
                                                    {factor !== 1 && <p className="text-[10px] text-gray-400">{brl((Number(s.value) || 0) * factor)}/mês</p>}
                                                  </div>
                                                </div>
                                                <div className="flex flex-wrap gap-1 mt-2">
                                                  {names.map((n, i) => (
                                                    <span key={i} className="bg-mcsystem-50 text-mcsystem-700 px-2 py-0.5 rounded text-xs">
                                                      {n.name} <span className="text-mcsystem-400">{brl(n.value)}</span>
                                                    </span>
                                                  ))}
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      ) : (
                                        <div>
                                          <p className="text-xs text-gray-400 italic mb-2">Sem assinatura ativa — só cobranças avulsas.</p>
                                          <ProductTags m={m} />
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}

                                {/* 1. DADOS GERAIS */}
                                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                                    <h3 className="text-xs font-bold text-gray-900 mb-4 uppercase tracking-wider flex justify-between">Dados Gerais<button onClick={() => openEditModal(selectedCompany)} className="text-mcsystem-500 hover:underline text-[10px] capitalize">Editar</button></h3>
                                    <div className="space-y-4 text-sm">
                                        <div className="flex justify-between items-center py-1 border-b border-gray-50"><span className="text-gray-500">Segmento</span><span className="font-semibold text-gray-800">{selectedCompany.segment}</span></div>
                                        <div className="flex justify-between items-center py-1 border-b border-gray-50"><span className="text-gray-500">Localização</span><span className="font-semibold text-gray-800">{selectedCompany.location}</span></div>
                                        <div className="flex justify-between items-center py-1 border-b border-gray-50">
                                          <span className="text-gray-500">Responsáveis</span>
                                          <div className="flex flex-wrap gap-1 justify-end">
                                            {(selectedCompany.responsible_users && selectedCompany.responsible_users.length > 0) ? (
                                              selectedCompany.responsible_users.map(userId => {
                                                const user = allUsers.find(u => u.id === userId);
                                                return user ? (
                                                  <div key={userId} className="flex items-center bg-mcsystem-50 text-mcsystem-700 px-2 py-1 rounded text-xs" title={user.name}>
                                                    <UserIcon size={12} className="mr-1" />
                                                    {user.name}
                                                  </div>
                                                ) : null;
                                              })
                                            ) : (
                                              <span className="text-xs text-gray-400 italic">Sem responsável</span>
                                            )}
                                          </div>
                                        </div>
                                        <div className="flex justify-between items-center py-1"><span className="text-gray-500">Status</span><span className={`px-2 py-0.5 rounded text-xs font-bold ${selectedCompany.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>{selectedCompany.status}</span></div>
                                    </div>
                                </div>

                               {/* 2. NOTAS RECENTES */}
                               <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                                   <div className="flex justify-between items-center mb-4">
                                       <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center"><StickyNote size={14} className="mr-2 text-yellow-500" /> Notas Recentes</h3>
                                       <button onClick={() => handleOpenNoteModal()} className="text-[10px] text-yellow-600 font-bold hover:underline">+ Criar Nota</button>
                                   </div>
                                   <div className="space-y-3">
                                       {companyData.notes.slice(0, 2).map(note => (
                                           <div key={note.id} onClick={() => handleOpenNoteModal(note)} className={`p-4 rounded-lg border shadow-sm cursor-pointer hover:shadow-md transition-all ${getNoteStyles(note.color)}`}>
                                               {note.title && <p className="text-xs font-bold mb-2 line-clamp-1">{note.title}</p>}
                                               <p className="text-xs opacity-90 line-clamp-3">{note.content}</p>
                                               <div className="mt-3 flex justify-between items-center text-[9px] opacity-70 font-bold">
                                                   <span className="flex items-center">
{/* FIX: Property 'collaboratorIds' does not exist on type 'GeneralNote'. Passed undefined instead. */}
                                                       {getCollaboratorAvatars(undefined, note.author)}
                                                       <span className="ml-1">{note.author}</span>
                                                   </span>
                                                   <span>{new Date(note.date).toLocaleDateString()}</span>
                                               </div>
                                           </div>
                                       ))}
                                       {companyData.notes.length === 0 && (
                                           <p className="text-xs text-gray-400 italic py-2 text-center">Nenhum registro encontrado.</p>
                                       )}
                                   </div>
                               </div>

                               {isAdmin && (
                                   <div onClick={() => setActiveTab('FINANCE')} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 cursor-pointer hover:shadow-md transition-shadow group relative">
                                       <div className="absolute top-5 right-5 text-gray-300 group-hover:text-mcsystem-500 transition-colors"><ChevronDown size={16} className="-rotate-90" /></div>
                                       <h3 className="text-xs font-bold text-gray-900 mb-4 uppercase tracking-wider flex items-center group-hover:text-mcsystem-600 transition-colors"><TrendingUp size={14} className="mr-2 text-green-600" /> Resumo Financeiro</h3>
                                       <div className="grid grid-cols-2 gap-3 mb-4">
                                           <div className="bg-green-50 p-3 rounded-lg border border-green-100"><span className="text-[10px] text-green-600 uppercase font-bold">Total Recebido</span><p className="text-lg font-bold text-green-700">R$ {financialStats.totalPaid.toLocaleString('pt-BR', { notation: 'compact' })}</p></div>
                                           <div className="bg-orange-50 p-3 rounded-lg border border-orange-100"><span className="text-[10px] text-orange-600 uppercase font-bold">A Receber</span><p className="text-lg font-bold text-orange-700">R$ {financialStats.totalPending.toLocaleString('pt-BR', { notation: 'compact' })}</p></div>
                                       </div>
                                   </div>
                               )}
                           </div>
                       )}

                       {activeTab === 'FINANCE' && isAdmin && (
                           <div className="animate-in slide-in-from-right-4 duration-200">
                               <div className="flex justify-between items-center mb-4"><h3 className="text-lg font-bold text-gray-800 flex items-center"><TrendingUp size={20} className="mr-2 text-green-600" /> Movimentações</h3><button onClick={() => handleOpenFinModal()} className="text-sm bg-green-600 text-white px-3 py-1.5 rounded hover:bg-green-500 flex items-center"><Plus size={16} className="mr-1"/> Novo</button></div>
                               <div className="space-y-3">
                                   {companyData.finance.map(f => (<div key={f.id} className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 flex justify-between items-center group"><div><p className="text-sm font-bold text-gray-800">{f.description}</p><div className="flex gap-2 mt-1"><span className={`text-[10px] px-2 py-0.5 rounded ${f.status === TransactionStatus.PAID ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{f.status}</span><span className="text-[10px] text-gray-500 border px-2 py-0.5 rounded">{new Date(f.dueDate).toLocaleDateString()}</span></div></div><div className="text-right flex items-center gap-3"><span className={`font-bold ${f.type === TransactionType.INCOME ? 'text-green-600' : 'text-red-500'}`}>{f.type === TransactionType.INCOME ? '+' : '-'} R$ {(f.amount || 0).toLocaleString('pt-BR')}</span><div className="flex opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={() => handleOpenFinModal(f)} className="p-1.5 text-gray-400 hover:text-blue-500"><Pencil size={14}/></button><button onClick={() => handleDeleteFinance(f.id)} className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 size={14}/></button></div></div></div>))}
                                   {companyData.finance.length === 0 && <div className="text-center py-8 text-gray-400">Nenhum registro financeiro.</div>}
                               </div>
                           </div>
                       )}

                       {activeTab === 'NOTES' && (
                           <div className={`animate-in slide-in-from-right-4 duration-300 flex flex-col h-full`}>
                               <div className="flex items-center justify-between mb-6">
                                   <div><h3 className="text-lg font-bold text-gray-800 flex items-center"><StickyNote size={20} className="mr-2 text-mcsystem-500" /> Bloco de Notas</h3><p className="text-xs text-gray-500 mt-1">Registros e lembretes deste cliente.</p></div>
                                   <button onClick={() => handleOpenNoteModal()} className="text-sm bg-mcsystem-500 text-white px-4 py-2 rounded-lg hover:bg-mcsystem-400 flex items-center font-medium shadow-sm transition-transform hover:scale-105"><Plus size={16} className="mr-1" /> Criar Nota</button>
                               </div>
                               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-6">
                                   {companyData.notes.length > 0 ? (
                                       companyData.notes.map(note => (<div key={note.id} className={`p-5 rounded-lg border shadow-sm relative group hover:shadow-md transition-all duration-200 flex flex-col ${getNoteStyles(note.color)} min-h-[160px]`}>
                                               <div className="flex justify-between items-start mb-3"><div className="flex flex-col flex-1 pr-8">{note.title && <span className="font-bold text-sm mb-1">{note.title}</span>}<span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded w-fit ${getNoteBadgeStyles(note.color)}`}>{note.category || 'Geral'}</span></div><div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/50 rounded-md p-0.5 absolute top-4 right-4 z-10"><button onClick={() => handleOpenNoteModal(note)} className="p-1 hover:text-blue-600"><Pencil size={14} /></button><button onClick={() => handleDeleteNote(note.id)} className="p-1 hover:text-red-600"><Trash2 size={14} /></button></div></div>
                                               <p className="text-xs leading-relaxed whitespace-pre-wrap flex-1 opacity-90 font-medium">{note.content}</p>
                                               <div className="mt-4 pt-3 border-t border-black/5 flex justify-between items-center text-[10px] opacity-70"><span className="flex items-center">{/* FIX: Property 'collaboratorIds' does not exist on type 'GeneralNote'. Passed undefined instead. */}{getCollaboratorAvatars(undefined, note.author)}<span className="ml-1 font-bold">{note.author}</span></span><span>{new Date(note.date).toLocaleDateString()}</span></div>
                                           </div>))
                                   ) : <div className="col-span-full p-12 border-2 border-dashed border-gray-200 rounded-xl text-center text-gray-400 bg-gray-50/50 flex flex-col items-center"><StickyNote size={48} className="mb-4 opacity-20" /><p className="text-sm font-medium text-gray-500">Nenhuma nota para este cliente.</p></div>}
                               </div>
                           </div>
                       )}
                   </div>
               </div>
           </div>
       )}

       {/* Sub-Modals */}
       {isFinModalOpen && (
           <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
               <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
                   <div className="p-4 border-b flex justify-between items-center"><h3 className="font-bold">Movimentação Financeira</h3><button onClick={() => setIsFinModalOpen(false)}><X size={20}/></button></div>
                   <form onSubmit={handleSaveFinance} className="p-4 space-y-3">
                       <input type="text" placeholder="Descrição" className="w-full border p-2 rounded text-sm" value={finForm.description} onChange={e => setFinForm({...finForm, description: e.target.value})} />
                       <div className="grid grid-cols-2 gap-2">
                           <input type="number" step="0.01" placeholder="Valor" className="w-full border p-2 rounded text-sm" value={finForm.amount} onChange={e => setFinForm({...finForm, amount: Number(e.target.value)})} />
                           <input type="date" className="w-full border p-2 rounded text-sm" value={finForm.dueDate} onChange={e => setFinForm({...finForm, dueDate: e.target.value})} />
                       </div>
                       <div className="grid grid-cols-2 gap-2">
                           <select className="w-full border p-2 rounded text-sm" value={finForm.type} onChange={e => setFinForm({...finForm, type: e.target.value as any})}><option value="Receita">Receita</option><option value="Despesa">Despesa</option></select>
                           <select className="w-full border p-2 rounded text-sm" value={finForm.status} onChange={e => setFinForm({...finForm, status: e.target.value as any})}><option value="Pendente">Pendente</option><option value="Pago">Pago</option></select>
                       </div>
                       <select className="w-full border p-2 rounded text-sm" value={finForm.bankId} onChange={e => setFinForm({...finForm, bankId: e.target.value})}><option value="">Selecione o Banco</option>{banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
                       <button type="submit" className="w-full bg-green-600 text-white p-2 rounded text-sm font-bold">Salvar</button>
                   </form>
               </div>
           </div>
       )}


       {isNoteModalOpen && (
           <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[110] p-4 overflow-visible">
               <div className="bg-white rounded-xl shadow-xl w-full max-w-md animate-in zoom-in-95 duration-200">
                   <div className="bg-mcsystem-900 px-6 py-4 border-b border-mcsystem-800 flex justify-between items-center rounded-t-xl text-white">
                        <h3 className="font-bold text-lg flex items-center"><StickyNote size={20} className="mr-2 text-mcsystem-400" /> {editingNoteId ? 'Editar Nota' : 'Nova Nota'}</h3>
                        <button onClick={() => setIsNoteModalOpen(false)} className="text-mcsystem-300 hover:text-white transition-colors"><X size={20} /></button>
                   </div>
                   <form onSubmit={handleSaveNote} className="p-6 space-y-4">
                       <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Título</label>
                            <input type="text" placeholder="Ex: Pendência Documental" className="w-full border border-gray-200 px-4 py-2.5 rounded-lg focus:ring-2 focus:ring-mcsystem-500 outline-none text-sm font-bold" value={noteForm.title} onChange={e => setNoteForm({...noteForm, title: e.target.value})} />
                       </div>
                       
                       {/* FIX: Removed collaborator selection UI as 'collaboratorIds' does not exist on GeneralNote. */}
                       <div>
                           <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Categoria</label>
                           <select className="w-full border border-gray-200 p-2.5 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-mcsystem-500" value={noteForm.category} onChange={e => setNoteForm({...noteForm, category: e.target.value})}>
                               <option value="Geral">Geral</option>
                               <option value="Reunião">Reunião</option>
                               <option value="Importante">Importante</option>
                               <option value="Lembrete">Lembrete</option>
                           </select>
                       </div>

                       <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-3 text-center">Cor do Card</label>
                            <div className="flex gap-2 justify-center p-2 bg-gray-50 rounded-xl border border-gray-100">
                                {(['yellow', 'blue', 'green', 'red', 'purple', 'gray'] as NoteColor[]).map((c) => (
                                    <button
                                        key={c}
                                        type="button"
                                        onClick={() => setNoteForm({...noteForm, color: c})}
                                        className={`w-8 h-8 rounded-full border-2 transition-all transform hover:scale-110 shadow-sm
                                            ${c === 'yellow' ? 'bg-yellow-100' : 
                                              c === 'blue' ? 'bg-blue-100' : 
                                              c === 'green' ? 'bg-emerald-100' : 
                                              c === 'red' ? 'bg-rose-100' : 
                                              c === 'purple' ? 'bg-purple-100' : 'bg-gray-200'}
                                            ${noteForm.color === c ? 'border-mcsystem-500 scale-110 ring-2 ring-mcsystem-200' : 'border-transparent'}
                                        `}
                                    />
                                ))}
                            </div>
                        </div>

                       <textarea placeholder="Escreva sua nota..." className="w-full border border-gray-200 p-4 rounded-xl text-sm h-32 resize-none focus:ring-2 focus:ring-mcsystem-500 outline-none leading-relaxed" value={noteForm.content} onChange={e => setNoteForm({...noteForm, content: e.target.value})}></textarea>
                       
                       <div className="flex justify-end space-x-2 pt-2 border-t border-gray-50">
                            <button type="button" onClick={() => setIsNoteModalOpen(false)} className="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded text-sm font-medium">Cancelar</button>
                            <button type="submit" className="px-5 py-2 bg-mcsystem-900 text-white rounded-lg hover:bg-mcsystem-800 font-bold flex items-center shadow-lg transition-all transform hover:scale-105"><Save size={18} className="mr-2" /> Salvar Nota</button>
                       </div>
                   </form>
               </div>
           </div>
       )}

        {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="font-bold text-gray-800">{editingId ? 'Editar Cliente' : 'Novo Cliente'}</h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveCompany} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Cliente</label>
                <input required type="text" className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-mcsystem-500 outline-none" 
                  value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">CNPJ / CPF</label>
                    <div className="relative">
                      <input type="text" className="w-full px-3 py-2 pr-9 border border-gray-300 rounded focus:ring-1 focus:ring-mcsystem-500 outline-none"
                        placeholder="00.000.000/0000-00"
                        value={formData.cnpj}
                        onChange={e => {
                          const v = e.target.value;
                          setFormData({ ...formData, cnpj: v });
                          if (isCnpjComplete(v)) buscarCnpjCliente(v);
                        }}
                        onBlur={e => buscarCnpjCliente(e.target.value)} />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                        {buscandoCnpj ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1 truncate" title={cnpjMsg}>
                      {cnpjMsg || 'Preenche nome e localização pela Receita ao completar o CNPJ.'}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Localização</label>
                    <input type="text" className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-mcsystem-500 outline-none" 
                      value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} />
                  </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Segmento</label>
                <input type="text" className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-mcsystem-500 outline-none"
                    placeholder="Ex: E-commerce B2B"
                    value={formData.segment || ''} onChange={e => setFormData({...formData, segment: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-mcsystem-500 outline-none bg-white"
                    value={formData.status} onChange={e => setFormData({...formData, status: e.target.value as any})}>
                    <option value="Prospect">Prospect</option>
                    <option value="Active">Active</option>
                    <option value="Churned">Churned</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Responsáveis</label>
                <div className="border border-gray-300 rounded p-3 bg-gray-50 max-h-32 overflow-y-auto space-y-2">
                  {allUsers.map(user => (
                    <label key={user.id} className="flex items-center gap-2 cursor-pointer hover:bg-white p-1 rounded transition-colors">
                      <input 
                        type="checkbox" 
                        checked={formData.responsible_users?.includes(user.id) || false}
                        onChange={(e) => {
                          const current = formData.responsible_users || [];
                          if (e.target.checked) {
                            setFormData({...formData, responsible_users: [...current, user.id]});
                          } else {
                            setFormData({...formData, responsible_users: current.filter(id => id !== user.id)});
                          }
                        }}
                        className="rounded border-gray-300 text-mcsystem-500"
                      />
                      <span className="text-sm">{user.name}</span>
                    </label>
                  ))}
                </div>
                {formData.responsible_users && formData.responsible_users.length > 0 && (
                  <p className="text-xs text-gray-500 mt-1">{formData.responsible_users.length} responsável(is) selecionado(s)</p>
                )}
              </div>
              
              <div className="flex justify-end space-x-2 pt-2">
                <button type="button" onClick={closeModal} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Cancelar</button>
                <button type="submit" className="px-4 py-2 bg-mcsystem-500 text-white rounded hover:bg-mcsystem-400 flex items-center">
                   <Save size={16} className="mr-2" /> Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Edit Modal */}
      {isBulkEditModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[110] p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="bg-gradient-to-r from-mcsystem-600 to-mcsystem-500 px-6 py-4 rounded-t-xl flex justify-between items-center">
                <h3 className="font-bold text-white flex items-center">
                    <Pencil size={18} className="mr-2" />
                    Edição em Massa
                </h3>
                <button onClick={() => setIsBulkEditModalOpen(false)} className="text-white/80 hover:text-white">
                  <X size={20} />
                </button>
            </div>
            <div className="p-6 space-y-5">
              <div className="bg-mcsystem-50 border border-mcsystem-200 rounded-lg p-3 text-center">
                  <span className="text-2xl font-bold text-mcsystem-700">{selectedIds.size}</span>
                  <span className="text-sm text-mcsystem-600 ml-2">cliente(s) selecionado(s)</span>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Campo a Editar</label>
                <select 
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-mcsystem-500 outline-none bg-white text-sm"
                    value={bulkEditField}
                    onChange={e => { setBulkEditField(e.target.value as any); setBulkEditValue(''); }}
                >
                    <option value="status">Status</option>
                    <option value="segment">Segmento</option>
                    <option value="responsible">Responsável</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Novo Valor</label>
                {bulkEditField === 'status' && (
                    <select 
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-mcsystem-500 outline-none bg-white text-sm"
                        value={bulkEditValue}
                        onChange={e => setBulkEditValue(e.target.value)}
                    >
                        <option value="">Selecione um status...</option>
                        <option value="Prospect">Prospect</option>
                        <option value="Active">Active (Ativo)</option>
                        <option value="Churned">Churned (Inativo)</option>
                    </select>
                )}
                {bulkEditField === 'segment' && (
                    <input
                        type="text"
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-mcsystem-500 outline-none bg-white text-sm"
                        placeholder="Digite o segmento..."
                        value={bulkEditValue}
                        onChange={e => setBulkEditValue(e.target.value)}
                    />
                )}
                {bulkEditField === 'responsible' && (
                    <div className="border border-gray-300 rounded-lg p-3 max-h-64 overflow-y-auto space-y-2 bg-white">
                        {allUsers.length === 0 ? (
                            <p className="text-xs text-gray-500 text-center py-2">Nenhum usuário disponível</p>
                        ) : (
                            allUsers.map(user => (
                                <label key={user.id} className="flex items-center space-x-2 p-2 hover:bg-gray-50 rounded cursor-pointer transition-colors">
                                    <input
                                        type="checkbox"
                                        checked={selectedResponsibles.includes(user.id)}
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                setSelectedResponsibles(prev => [...prev, user.id]);
                                            } else {
                                                setSelectedResponsibles(prev => prev.filter(id => id !== user.id));
                                            }
                                        }}
                                        className="rounded border-gray-300 text-mcsystem-500 focus:ring-mcsystem-500"
                                    />
                                    <span className="text-sm text-gray-700">{user.name}</span>
                                </label>
                            ))
                        )}
                        <p className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-100">
                            {selectedResponsibles.length} responsável(is) selecionado(s)
                        </p>
                    </div>
                )}
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-100">
                <button 
                    type="button" 
                    onClick={() => setIsBulkEditModalOpen(false)} 
                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium"
                >
                    Cancelar
                </button>
                <button 
                    type="button" 
                    onClick={handleBulkEditSave}
                    disabled={bulkEditField === 'responsible' ? selectedResponsibles.length === 0 : !bulkEditValue}
                    className="px-5 py-2 bg-mcsystem-500 text-white rounded-lg hover:bg-mcsystem-400 flex items-center text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                   <Save size={16} className="mr-2" /> Aplicar Alterações
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};