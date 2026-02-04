import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Company, Contact, Deal, ListItem, CompanyNote, User, NoteColor, Task, FinancialRecord, TransactionType, TransactionStatus, RevenueType, Bank, DealStage, TaskType, GeneralNote } from '../types';
// FIX: Added ChevronRight to the import list from lucide-react
import { Search, MapPin, Building2, Plus, Pencil, Trash2, X, Save, Phone, Mail, DollarSign, Calendar, Briefcase, User as UserIcon, Upload, Download, FileText, ChevronDown, ChevronRight, StickyNote, Send, Palette, Tag, Maximize2, Minimize2, MoreHorizontal, ArrowLeft, TrendingUp, Clock, CheckCircle2, Wallet, AlertCircle, Contact as ContactIcon, LayoutDashboard, Video, CheckSquare, HelpCircle, LayoutGrid, LayoutList, Check, Square, Copy } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

// FIX: Removed unused 'sectors' prop.
interface CompaniesModuleProps {
  companies: Company[];
  setCompanies: React.Dispatch<React.SetStateAction<Company[]>>;
  contacts?: Contact[];
  setContacts?: React.Dispatch<React.SetStateAction<Contact[]>>;
  
  deals?: Deal[];
  setDeals?: React.Dispatch<React.SetStateAction<Deal[]>>;
  
  tasks?: Task[];
  setTasks?: React.Dispatch<React.SetStateAction<Task[]>>;
  
  financeRecords?: FinancialRecord[];
  setFinanceRecords?: React.Dispatch<React.SetStateAction<FinancialRecord[]>>;
  
  generalNotes: GeneralNote[];
  setGeneralNotes: React.Dispatch<React.SetStateAction<GeneralNote[]>>;

  segments: ListItem[];
  setSegments: React.Dispatch<React.SetStateAction<ListItem[]>>;
  revenueTypes?: RevenueType[];
  banks?: Bank[];
  allUsers?: User[];
  currentUser: User;
  onOpenHelp: (title: string, content: React.ReactNode) => void;
}

type CompanyTab = 'OVERVIEW' | 'CONTACTS' | 'DEALS' | 'FINANCE' | 'TASKS' | 'NOTES';

export const CompaniesModule: React.FC<CompaniesModuleProps> = ({ 
    companies, setCompanies, 
    contacts = [], setContacts,
    deals = [], setDeals,
    tasks = [], setTasks,
    financeRecords = [], setFinanceRecords,
    generalNotes, setGeneralNotes,
    segments, setSegments, revenueTypes = [], banks = [], allUsers = [], currentUser,
    onOpenHelp 
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  
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
  
  // --- LOCAL EDIT STATES ---
  
  // 1. Finance Modal
  const [isFinModalOpen, setIsFinModalOpen] = useState(false);
  const [editingFinId, setEditingFinId] = useState<string | null>(null);
  const [finForm, setFinForm] = useState<Partial<FinancialRecord>>({ description: '', amount: 0, type: TransactionType.INCOME, status: TransactionStatus.PENDING, dueDate: '', bankId: '' });

  // 2. Deal Modal
  const [isDealModalOpen, setIsDealModalOpen] = useState(false);
  const [editingDealId, setEditingDealId] = useState<string | null>(null);
  const [dealForm, setDealForm] = useState<Partial<Deal>>({ title: '', value: 0, stage: DealStage.PROSPECTING, probability: 50 });

  // 3. Task/Meeting Modal
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [activityType, setActivityType] = useState<'TASK' | 'MEETING'>('TASK');
  const [taskForm, setTaskForm] = useState<Partial<Task>>({ title: '', type: TaskType.CALL, dueDate: '', priority: 'Medium' });

  // 4. Contact Modal (New)
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [contactForm, setContactForm] = useState<Partial<Contact>>({ name: '', role: '', email: '', phone: '' });

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

  // New Segment Modal State
  const [isNewSegmentModalOpen, setIsNewSegmentModalOpen] = useState(false);
  const [newSegmentName, setNewSegmentName] = useState('');

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

  const filteredCompanies = companies.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()) || c.cnpj.includes(searchTerm));

  // --- Derived Data ---
  const companyData = useMemo(() => {
      if (!selectedCompany) return { contacts: [], deals: [], tasks: [], finance: [], notes: [] };
      return {
          contacts: contacts.filter(c => c.companyId === selectedCompany.id),
          deals: deals.filter(d => d.companyId === selectedCompany.id),
          tasks: tasks.filter(t => t.companyId === selectedCompany.id || t.relatedTo?.toLowerCase() === selectedCompany.name.toLowerCase()),
          finance: financeRecords.filter(f => f.companyId === selectedCompany.id || f.description.toLowerCase().includes(selectedCompany.name.toLowerCase())),
          notes: [
              ...(selectedCompany.notes || []),
              ...generalNotes.filter(n => n.companyId === selectedCompany.id)
          ].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      };
  }, [selectedCompany, contacts, deals, tasks, financeRecords, generalNotes]);

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
                <strong>Painel Detalhado 360º:</strong> Ao clicar em um cliente, um painel lateral se abre, fornecendo uma visão completa e integrada de todas as informações: contatos, negócios, histórico financeiro, tarefas e notas.
            </li>
            <li>
                <strong>Ações Contextuais:</strong> Dentro do painel detalhado de um cliente, você pode adicionar novos contatos, iniciar negociações, lançar registros financeiros e agendar compromissos, tudo já vinculado automaticamente àquela empresa.
            </li>
            <li>
                <strong>Gerenciamento de Contatos:</strong> Na aba "Contatos" do painel, você pode gerenciar todas as pessoas de contato daquela empresa, mantendo sua base de dados organizada.
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

  // --- HANDLERS: DEALS ---
  const handleOpenDealModal = (deal?: Deal) => {
      if (deal) { setEditingDealId(deal.id); setDealForm(deal); } 
      else { setEditingDealId(null); setDealForm({ title: '', value: 0, stage: DealStage.PROSPECTING, probability: 50 }); }
      setIsDealModalOpen(true);
  };
  const handleSaveDeal = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedCompany || !setDeals) return;
      
      // FIX: Cast object to satisfy the Omit<Deal, 'tenant_id'> type, as the form data is a Partial type.
      const deal: Omit<Deal, 'tenant_id'> = editingDealId 
          ? { ...deals.find(d => d.id === editingDealId)!, ...dealForm } as Deal
          : { id: `d${Date.now()}`, companyId: selectedCompany.id, lastActivity: new Date().toISOString(), history: [], ...dealForm } as Omit<Deal, 'tenant_id'>;

      if (editingDealId) setDeals(prev => prev.map(d => d.id === editingDealId ? { ...deal, tenant_id: selectedCompany.tenant_id } as Deal : d)); 
      else setDeals(prev => [{ ...deal, tenant_id: selectedCompany.tenant_id } as Deal, ...prev]);
      
      setIsDealModalOpen(false);
      if (isMockUser) return;
      await supabase.from('deals').upsert(deal);
  };
  const handleDeleteDeal = async (id: string) => {
      if (!window.confirm('Excluir negociação?') || !setDeals) return;
      setDeals(prev => prev.filter(d => d.id !== id));
      if (isMockUser) return;
      await supabase.from('deals').delete().eq('id', id);
  };

  // --- HANDLERS: TASKS & MEETINGS ---
  const handleOpenTaskModal = (task?: Task, type: string = TaskType.CALL) => {
      if (task) { 
          setEditingTaskId(task.id); 
          // If editing, determine if it's a meeting or task based on existing type
          const isMeeting = task.type === TaskType.MEETING;
          setActivityType(isMeeting ? 'MEETING' : 'TASK');
          setTaskForm(task); 
      } else { 
          setEditingTaskId(null);
          // If new, rely on the passed 'type' argument (Meeting vs Call/Task)
          const isMeeting = type === TaskType.MEETING;
          setActivityType(isMeeting ? 'MEETING' : 'TASK');
          
          setTaskForm({ 
              title: '', 
              type: type, 
              dueDate: isMeeting ? new Date().toISOString().slice(0,16) : new Date().toISOString().split('T')[0], 
              priority: isMeeting ? 'High' : 'Medium', 
          }); 
      }
      setIsTaskModalOpen(true);
  };

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany || !setTasks) return;
  
    if (editingTaskId) {
      // --- UPDATE LOGIC ---
      const originalTask = tasks.find(t => t.id === editingTaskId);
      if (!originalTask) return;
  
      const finalType = activityType === 'MEETING' ? TaskType.MEETING : (taskForm.type || TaskType.CALL);
      const updatedTask = { ...originalTask, ...taskForm, type: finalType };
  
      setTasks(prev => prev.map(t => (t.id === editingTaskId ? updatedTask : t)));
      setIsTaskModalOpen(false);
      
      const { id, tenant_id, createdAt, ...payload } = updatedTask;
      try {
        const { error } = await supabase.from('tasks').update(payload).eq('id', id);
        if (error) throw error;
      } catch (error: any) {
        console.error("Erro ao atualizar tarefa:", error.message);
        alert(`Falha ao salvar alterações da tarefa: ${error.message}`);
        setTasks(prev => prev.map(t => (t.id === editingTaskId ? originalTask : t))); // Revert on failure
      }
    } else {
      // --- INSERT LOGIC ---
      const finalType = activityType === 'MEETING' ? TaskType.MEETING : (taskForm.type || TaskType.CALL);
      const finalDueDate = taskForm.dueDate || new Date().toISOString();
  
      const newTaskDataForDb: Omit<Task, 'id' | 'tenant_id' | 'createdAt'> = {
        title: taskForm.title || 'Nova Tarefa',
        description: taskForm.description,
        type: finalType,
        dueDate: finalDueDate,
        priority: (activityType === 'MEETING' ? 'High' : taskForm.priority || 'Medium') as 'High' | 'Medium' | 'Low',
        status: 'Pending' as const,
        companyId: selectedCompany.id,
        relatedTo: selectedCompany.name,
      };
      
      const now = new Date().toISOString();
      const tempId = `temp-${now}`;
      const tempTask: Task = { ...newTaskDataForDb, createdAt: now, id: tempId, tenant_id: selectedCompany.tenant_id };
      
      setTasks(prev => [...prev, tempTask]);
      setIsTaskModalOpen(false);
  
      try {
        const { data, error } = await supabase.from('tasks').insert(newTaskDataForDb).select().single();
        if (error) throw error;
  
        if (data) {
          setTasks(prev => prev.map(t => (t.id === tempId ? { ...t, ...data } : t)));
        }
      } catch (error: any) {
        console.error("Erro ao criar tarefa:", error.message);
        alert(`A tarefa foi criada localmente, mas falhou ao salvar no servidor: ${error.message}`);
      }
    }
  };

  const handleDeleteTask = async (id: string) => {
      if (!window.confirm('Excluir item?') || !setTasks) return;
      setTasks(prev => prev.filter(t => t.id !== id));
      if (isMockUser) return;
      await supabase.from('tasks').delete().eq('id', id);
  };

  // --- HANDLERS: CONTACTS ---
  const handleOpenContactModal = (contact?: Contact) => {
      if (contact) { setEditingContactId(contact.id); setContactForm(contact); }
      else { setEditingContactId(null); setContactForm({ name: '', role: '', email: '', phone: '' }); }
      setIsContactModalOpen(true);
  };
  const handleSaveContact = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedCompany || !setContacts) return;
      
      // FIX: Cast object to satisfy the Omit<Contact, 'tenant_id'> type, as the form data is a Partial type.
      const contact: Omit<Contact, 'tenant_id'> = editingContactId 
        ? { ...contacts.find(c => c.id === editingContactId)!, ...contactForm } as Contact
        : { id: `ct${Date.now()}`, companyId: selectedCompany.id, ...contactForm } as Omit<Contact, 'tenant_id'>;
      
      if (editingContactId) setContacts(prev => prev.map(c => c.id === editingContactId ? { ...contact, tenant_id: selectedCompany.tenant_id } as Contact : c));
      else setContacts(prev => [...prev, { ...contact, tenant_id: selectedCompany.tenant_id } as Contact]);
      
      setIsContactModalOpen(false);
      if (isMockUser) return;
      await supabase.from('contacts').upsert(contact);
  };
  const handleDeleteContact = async (id: string) => {
      if (!window.confirm('Excluir contato?') || !setContacts) return;
      setContacts(prev => prev.filter(c => c.id !== id));
      if (isMockUser) return;
      await supabase.from('contacts').delete().eq('id', id);
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
          segment: formData.segment || (segments[0]?.name || 'Small'),
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

  const handleSaveNewSegment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSegmentName.trim() || !currentUser) return;

    const newSegment: ListItem = {
      id: `seg_${Date.now()}`,
      tenant_id: currentUser.tenant_id,
      name: newSegmentName.trim(),
    };

    // Optimistic update
    setSegments(prev => [...prev, newSegment]);
    setFormData(prev => ({ ...prev, segment: newSegment.name }));

    if (!isMockUser) {
      const { error } = await supabase.from('segments').upsert(newSegment);
      if (error) {
        console.error("Error saving new segment:", error);
        // Revert on error
        setSegments(prev => prev.filter(s => s.id !== newSegment.id));
        setFormData(prev => ({ ...prev, segment: segments[0]?.name || '' }));
        alert("Erro ao salvar novo segmento.");
      }
    }

    setIsNewSegmentModalOpen(false);
    setNewSegmentName('');
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
  const handleNewClick = () => { setEditingId(null); setFormData({ name: '', cnpj: '', segment: segments[0]?.name || '', location: '', status: 'Prospect' }); setIsModalOpen(true); };
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
          <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-100 text-gray-700 font-medium">
                  <tr>
                      <th className="p-4 w-10">
                          <button onClick={toggleSelectAll} className="p-1 hover:bg-gray-200 rounded transition-colors">
                              {selectedIds.size === filteredCompanies.length && filteredCompanies.length > 0 ? <CheckSquare size={18} className="text-mcsystem-500" /> : <Square size={18} />}
                          </button>
                      </th>
                      <th className="p-4">Cliente</th>
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
                            <button onClick={() => setSelectedCompany(null)} className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-200 transition-colors">
                                <X size={24} />
                            </button>
                       </div>
                       <div className="flex space-x-6 overflow-x-auto scrollbar-hide -mb-px">
                           {[
                               { id: 'OVERVIEW', label: 'Visão Geral', icon: LayoutDashboard },
                               { id: 'CONTACTS', label: 'Contatos', icon: ContactIcon, count: companyData.contacts.length },
                               { id: 'DEALS', label: 'Negócios', icon: DollarSign, count: companyData.deals.length },
                               { id: 'FINANCE', label: 'Financeiro', icon: TrendingUp },
                               { id: 'TASKS', label: 'Compromissos', icon: Calendar, count: companyData.tasks.length },
                               { id: 'NOTES', label: 'Notas', icon: StickyNote, count: companyData.notes.length }
                           ].map(tab => (
                               <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex items-center pb-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === tab.id ? 'border-mcsystem-500 text-mcsystem-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}><tab.icon size={16} className={`mr-2 ${activeTab === tab.id ? 'text-mcsystem-500' : 'text-gray-400'}`} />{tab.label}{tab.count !== undefined && (<span className={`ml-2 text-xs py-0.5 px-1.5 rounded-full ${activeTab === tab.id ? 'bg-mcsystem-100 text-mcsystem-600' : 'bg-gray-100 text-gray-500'}`}>{tab.count}</span>)}</button>
                           ))}
                       </div>
                   </div>
                   
                   <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
                       {activeTab === 'OVERVIEW' && (
                           <div className="animate-in slide-in-from-left-4 duration-300 space-y-6">
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

                               {/* 2. COMPROMISSOS (REUNIÕES E TAREFAS) - Restaurado */}
                               <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                                   <div className="flex justify-between items-center mb-4">
                                       <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center"><Clock size={14} className="mr-2 text-indigo-500" /> Próximos Compromissos</h3>
                                       <button onClick={() => handleOpenTaskModal(undefined, TaskType.CALL)} className="text-[10px] text-indigo-500 font-bold hover:underline">+ Adicionar</button>
                                   </div>
                                   <div className="space-y-3">
                                       {companyData.tasks.filter(t => t.status !== 'Done').slice(0, 3).map(task => (
                                           <div key={task.id} onClick={() => handleOpenTaskModal(task)} className="bg-slate-50 p-3 rounded-lg border border-gray-100 hover:border-indigo-200 transition-colors cursor-pointer group">
                                               <div className="flex justify-between items-start">
                                                   <div className="flex items-center">
                                                       <div className={`p-1.5 rounded-md mr-3 ${task.type === TaskType.MEETING ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}`}>
                                                           {task.type === TaskType.MEETING ? <Video size={12} /> : <Clock size={12} />}
                                                       </div>
                                                       <div>
                                                           <p className="text-xs font-bold text-gray-800 line-clamp-1">{task.title}</p>
                                                           <p className="text-[10px] text-gray-500 mt-0.5">{new Date(task.dueDate).toLocaleDateString()} {task.type === TaskType.MEETING ? ' às ' + new Date(task.dueDate).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : ''}</p>
                                                       </div>
                                                   </div>
                                                   <ChevronRight size={14} className="text-gray-300 group-hover:text-indigo-400 transition-all" />
                                               </div>
                                           </div>
                                       ))}
                                       {companyData.tasks.filter(t => t.status !== 'Done').length === 0 && (
                                           <p className="text-xs text-gray-400 italic py-2 text-center">Sem tarefas pendentes.</p>
                                       )}
                                   </div>
                               </div>

                               {/* 3. NOTAS RECENTES - Restaurado */}
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
                               <div onClick={() => setActiveTab('DEALS')} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 cursor-pointer hover:shadow-md transition-shadow group relative">
                                   <div className="absolute top-5 right-5 text-gray-300 group-hover:text-mcsystem-500 transition-colors"><ChevronDown size={16} className="-rotate-90" /></div>
                                   <div className="flex justify-between items-center mb-3"><h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center group-hover:text-mcsystem-600 transition-colors"><DollarSign size={14} className="mr-2 text-mcsystem-500" /> Negociações Recentes</h3></div>
                                   <div className="space-y-3 pointer-events-none">{companyData.deals.slice(0,2).map(deal => (<div key={deal.id} className="bg-slate-50 rounded-lg p-3 border border-gray-100 border-l-4 border-l-mcsystem-500"><div className="flex justify-between items-start mb-1"><span className="text-xs font-bold text-gray-800 truncate">{deal.title}</span><span className="text-xs font-bold text-green-600">R$ {(deal.value || 0).toLocaleString('pt-BR')}</span></div><span className="text-[10px] text-gray-500">{deal.stage}</span></div>))}{companyData.deals.length === 0 && <p className="text-sm text-gray-400 italic">Nenhuma negociação.</p>}</div>
                               </div>
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

                       {activeTab === 'DEALS' && (
                           <div className="animate-in slide-in-from-right-4 duration-200">
                               <div className="flex justify-between items-center mb-4"><h3 className="text-lg font-bold text-gray-800 flex items-center"><DollarSign size={20} className="mr-2 text-mcsystem-500" /> Negociações</h3><button onClick={() => handleOpenDealModal()} className="text-sm bg-mcsystem-500 text-white px-3 py-1.5 rounded hover:bg-mcsystem-400 flex items-center"><Plus size={16} className="mr-1"/> Nova</button></div>
                                <div className="space-y-3">
                                    {companyData.deals.map(d => (
                                      <div key={d.id} className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 group">
                                        <div className="flex justify-between items-start">
                                          <div>
                                            <p className="text-sm font-bold text-gray-800">{d.title}</p>
                                            <p className="text-xs text-gray-500 mt-0.5">Estágio: <span className="font-medium text-mcsystem-600">{d.stage}</span></p>
                                            {d.responsible_users && d.responsible_users.length > 0 && (
                                              <div className="flex flex-wrap gap-1 mt-2">
                                                {d.responsible_users.slice(0, 2).map(userId => {
                                                  const user = allUsers.find(u => u.id === userId);
                                                  return user ? (
                                                    <div key={userId} className="flex items-center bg-mcsystem-50 text-mcsystem-700 px-2 py-0.5 rounded text-[10px]" title={user.name}>
                                                      <UserIcon size={10} className="mr-1" />
                                                      {user.name.split(' ')[0]}
                                                    </div>
                                                  ) : null;
                                                })}
                                                {d.responsible_users.length > 2 && (
                                                  <span className="text-[10px] text-gray-500">+{d.responsible_users.length - 2}</span>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                          <div className="text-right">
                                            <p className="font-bold text-green-600 text-sm">R$ {(d.value || 0).toLocaleString('pt-BR')}</p>
                                            <p className="text-[10px] text-gray-400">{d.probability}% Prob.</p>
                                          </div>
                                        </div>
                                        <div className="flex justify-end mt-2 opacity-0 group-hover:opacity-100 transition-opacity border-t border-gray-50 pt-2">
                                          <button onClick={() => handleOpenDealModal(d)} className="text-xs text-blue-500 hover:underline mr-3">Editar</button>
                                          <button onClick={() => handleDeleteDeal(d.id)} className="text-xs text-red-500 hover:underline">Excluir</button>
                                        </div>
                                      </div>
                                    ))}
                                    {companyData.deals.length === 0 && <div className="text-center py-8 text-gray-400">Nenhuma negociação ativa.</div>}
                                </div>
                           </div>
                       )}

                       {activeTab === 'TASKS' && (
                           <div className="animate-in slide-in-from-right-4 duration-200 space-y-8">
                               {/* Meetings Section */}
                               <div>
                                   <div className="flex justify-between items-center mb-4">
                                       <h3 className="text-sm font-bold text-gray-800 flex items-center uppercase tracking-wide">
                                           <Video size={16} className="mr-2 text-purple-500" /> Reuniões
                                       </h3>
                                       <button onClick={() => handleOpenTaskModal(undefined, TaskType.MEETING)} className="text-xs bg-purple-50 text-purple-600 border border-purple-200 px-3 py-1.5 rounded hover:bg-purple-100 flex items-center font-bold transition-colors">
                                           <Plus size={14} className="mr-1"/> Agendar
                                       </button>
                                   </div>
                                   <div className="space-y-3">
                                       {companyData.tasks.filter(t => t.type === TaskType.MEETING).map(t => (
                                           <div key={t.id} className="bg-white p-3 rounded-lg shadow-sm border border-gray-100 flex items-center justify-between group hover:border-purple-200 transition-colors">
                                               <div className="flex items-center">
                                                   <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-700 flex flex-col items-center justify-center border border-purple-100 mr-3">
                                                       <span className="text-[10px] font-bold uppercase">{new Date(t.dueDate).toLocaleString('default', { month: 'short' }).replace('.','')}</span>
                                                       <span className="text-sm font-bold leading-none">{new Date(t.dueDate).getDate()}</span>
                                                   </div>
                                                   <div>
                                                       <p className="text-sm font-bold text-gray-800">{t.title}</p>
                                                       <p className="text-xs text-gray-500 flex items-center mt-0.5">
                                                           <Clock size={10} className="mr-1"/> {t.dueDate.includes('T') ? new Date(t.dueDate).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Todo o dia'}
                                                           <span className="mx-2">•</span>
                                                           
                                                       </p>
                                                   </div>
                                               </div>
                                               <div className="flex opacity-0 group-hover:opacity-100 transition-opacity">
                                                   <button onClick={() => handleOpenTaskModal(t)} className="p-1.5 text-gray-400 hover:text-blue-500"><Pencil size={14}/></button>
                                                   <button onClick={() => handleDeleteTask(t.id)} className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 size={14}/></button>
                                               </div>
                                           </div>
                                       ))}
                                       {companyData.tasks.filter(t => t.type === TaskType.MEETING).length === 0 && <p className="text-xs text-gray-400 italic">Nenhuma reunião agendada.</p>}
                                   </div>
                               </div>

                               {/* Tasks Section */}
                               <div>
                                   <div className="flex justify-between items-center mb-4">
                                       <h3 className="text-sm font-bold text-gray-800 flex items-center uppercase tracking-wide">
                                           <CheckSquare size={16} className="mr-2 text-blue-500" /> Tarefas
                                       </h3>
                                       <button onClick={() => handleOpenTaskModal(undefined, TaskType.CALL)} className="text-xs bg-blue-50 text-blue-600 border border-blue-200 px-3 py-1.5 rounded hover:bg-blue-100 flex items-center font-bold transition-colors">
                                           <Plus size={14} className="mr-1"/> Nova Tarefa
                                       </button>
                                   </div>
                                   <div className="space-y-3">
                                       {companyData.tasks.filter(t => t.type !== TaskType.MEETING).map(t => (
                                           <div key={t.id} className="bg-white p-3 rounded-lg shadow-sm border border-gray-100 flex items-start group hover:border-blue-200 transition-colors">
                                               <div className={`mt-1 mr-3 w-2 h-2 rounded-full flex-shrink-0 ${t.status === 'Done' ? 'bg-green-500' : 'bg-orange-400'}`}></div>
                                               <div className="flex-1">
                                                   <p className={`text-sm font-bold text-gray-800 ${t.status === 'Done' ? 'line-through text-gray-400' : ''}`}>{t.title}</p>
                                                   <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                                                       <span className="bg-gray-100 px-1.5 py-0.5 rounded">{t.type}</span>
                                                       <span>{new Date(t.dueDate).toLocaleDateString()}</span>
                                                       <span></span>
                                                   </div>
                                               </div>
                                               <div className="flex opacity-0 group-hover:opacity-100 transition-opacity">
                                                   <button onClick={() => handleOpenTaskModal(t)} className="p-1.5 text-gray-400 hover:text-blue-500"><Pencil size={14}/></button>
                                                   <button onClick={() => handleDeleteTask(t.id)} className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 size={14}/></button>
                                               </div>
                                           </div>
                                       ))}
                                       {companyData.tasks.filter(t => t.type !== TaskType.MEETING).length === 0 && <p className="text-xs text-gray-400 italic">Nenhuma tarefa pendente.</p>}
                                   </div>
                               </div>
                           </div>
                       )}

                       {activeTab === 'CONTACTS' && (
                           <div className="animate-in slide-in-from-right-4 duration-200">
                               <div className="flex justify-between items-center mb-4"><h3 className="text-lg font-bold text-gray-800 flex items-center"><ContactIcon size={20} className="mr-2 text-indigo-500" /> Contatos ({companyData.contacts.length})</h3><button onClick={() => handleOpenContactModal()} className="text-sm bg-indigo-500 text-white px-3 py-1.5 rounded hover:bg-indigo-400 flex items-center"><Plus size={16} className="mr-1"/> Novo</button></div>
                               <div className="space-y-3">
                                   {companyData.contacts.length > 0 ? companyData.contacts.map(c => (
                                       <div key={c.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex items-center justify-between hover:shadow-md transition-shadow group">
                                           <div className="flex items-center flex-1 min-w-0">
                                               <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center text-sm font-bold mr-3 text-gray-500">{c.name.substring(0,1)}</div>
                                               <div className="flex-1 min-w-0">
                                                   <p className="text-sm font-bold text-gray-900 truncate">{c.name}</p>
                                                   <p className="text-xs text-gray-500 truncate">{c.role}</p>
                                                   <div className="flex items-center mt-1 space-x-3 text-xs text-gray-400">{c.email && <span className="flex items-center truncate"><Mail size={10} className="mr-1"/> {c.email}</span>}</div>
                                               </div>
                                           </div>
                                           <div className="flex flex-col space-y-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                                               <button onClick={() => handleOpenContactModal(c)} className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded"><Pencil size={14}/></button>
                                               <button onClick={() => handleDeleteContact(c.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"><Trash2 size={14}/></button>
                                           </div>
                                       </div>
                                   )) : <div className="text-center py-8 text-gray-400 italic">Nenhum contato vinculado.</div>}
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

       {isDealModalOpen && (
           <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
               <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
                   <div className="p-4 border-b flex justify-between items-center"><h3 className="font-bold">Negociação</h3><button onClick={() => setIsDealModalOpen(false)}><X size={20}/></button></div>
                    <form onSubmit={handleSaveDeal} className="p-4 space-y-3">
                        <input type="text" placeholder="Título da Oportunidade" className="w-full border p-2 rounded text-sm" value={dealForm.title} onChange={e => setDealForm({...dealForm, title: e.target.value})} />
                        <div className="grid grid-cols-2 gap-2">
                            <input type="number" placeholder="Valor" className="w-full border p-2 rounded text-sm" value={dealForm.value} onChange={e => setDealForm({...dealForm, value: Number(e.target.value)})} />
                            <input type="number" placeholder="Probabilidade (%)" className="w-full border p-2 rounded text-sm" value={dealForm.probability} onChange={e => setDealForm({...dealForm, probability: Number(e.target.value)})} />
                        </div>
                        <select className="w-full border p-2 rounded text-sm" value={dealForm.stage} onChange={e => setDealForm({...dealForm, stage: e.target.value as any})}>{Object.values(DealStage).map(s => <option key={s} value={s}>{s}</option>)}</select>
                        
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Responsáveis</label>
                          <div className="border border-gray-300 rounded p-2 max-h-32 overflow-y-auto space-y-1">
                            {allUsers.length === 0 ? (
                              <p className="text-xs text-gray-500">Nenhum usuário disponível</p>
                            ) : (
                              allUsers.map(user => (
                                <label key={user.id} className="flex items-center space-x-2 p-1 hover:bg-gray-50 rounded cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={(dealForm.responsible_users || []).includes(user.id)}
                                    onChange={(e) => {
                                      const currentResponsibles = dealForm.responsible_users || [];
                                      if (e.target.checked) {
                                        setDealForm({...dealForm, responsible_users: [...currentResponsibles, user.id]});
                                      } else {
                                        setDealForm({...dealForm, responsible_users: currentResponsibles.filter(id => id !== user.id)});
                                      }
                                    }}
                                    className="rounded border-gray-300 text-mcsystem-500 focus:ring-mcsystem-500"
                                  />
                                  <span className="text-xs text-gray-700">{user.name}</span>
                                </label>
                              ))
                            )}
                          </div>
                          <p className="text-[10px] text-gray-500 mt-1">
                            {(dealForm.responsible_users || []).length} responsável(is) selecionado(s)
                          </p>
                        </div>
                        
                        <button type="submit" className="w-full bg-mcsystem-500 text-white p-2 rounded text-sm font-bold">Salvar</button>
                    </form>
               </div>
           </div>
       )}

       {isTaskModalOpen && (
           <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
               <div className="bg-white rounded-xl shadow-xl w-full max-w-sm animate-in zoom-in-95 overflow-hidden">
                   <div className={`p-4 border-b flex justify-between items-center text-white ${activityType === 'MEETING' ? 'bg-purple-600' : 'bg-blue-600'}`}>
                       <h3 className="font-bold flex items-center">
                           {activityType === 'MEETING' ? <Video size={18} className="mr-2" /> : <CheckSquare size={18} className="mr-2" />}
                           {activityType === 'MEETING' ? 'Agendar Reunião' : 'Nova Tarefa'}
                       </h3>
                       <button onClick={() => setIsTaskModalOpen(false)} className="text-white/80 hover:text-white"><X size={20}/></button>
                   </div>
                   
                   {/* Toggle */}
                   <div className="flex bg-gray-100 p-1 mx-4 mt-4 rounded-lg">
                        <button 
                            type="button" 
                            onClick={() => { setActivityType('TASK'); setTaskForm(prev => ({...prev, type: TaskType.CALL})); }} 
                            className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${activityType === 'TASK' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}
                        >
                            Tarefa
                        </button>
                        <button 
                            type="button" 
                            onClick={() => { setActivityType('MEETING'); setTaskForm(prev => ({...prev, type: TaskType.MEETING})); }} 
                            className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${activityType === 'MEETING' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500'}`}
                        >
                            Reunião
                        </button>
                   </div>

                   <form onSubmit={handleSaveTask} className="p-4 space-y-3">
                       <input required type="text" placeholder={activityType === 'MEETING' ? "Assunto da Reunião" : "Título da Tarefa"} className="w-full border p-2 rounded text-sm outline-none focus:ring-1 focus:ring-mcsystem-500" value={taskForm.title} onChange={e => setTaskForm({...taskForm, title: e.target.value})} />
                       
                       {activityType === 'TASK' && (
                           <div className="grid grid-cols-2 gap-2">
                               <select className="w-full border p-2 rounded text-sm bg-white" value={taskForm.type} onChange={e => setTaskForm({...taskForm, type: e.target.value as any})}>
                                   <option value={TaskType.CALL}>Ligação</option>
                                   <option value={TaskType.EMAIL}>Email</option>
                                   <option value={TaskType.FOLLOW_UP}>Follow-up</option>
                               </select>
                               <input required type="date" className="w-full border p-2 rounded text-sm" value={taskForm.dueDate} onChange={e => setTaskForm({...taskForm, dueDate: e.target.value})} />
                           </div>
                       )}

                       {activityType === 'MEETING' && (
                           <input required type="datetime-local" className="w-full border p-2 rounded text-sm outline-none focus:ring-1 focus:ring-purple-500" value={taskForm.dueDate} onChange={e => setTaskForm({...taskForm, dueDate: e.target.value})} />
                       )}

                       {activityType === 'TASK' && (
                           <select className="w-full border p-2 rounded text-sm bg-white" value={taskForm.priority} onChange={e => setTaskForm({...taskForm, priority: e.target.value as any})}>
                               <option value="High">Alta Prioridade</option>
                               <option value="Medium">Média Prioridade</option>
                               <option value="Low">Baixa Prioridade</option>
                           </select>
                       )}

                       <select className="w-full border p-2 rounded text-sm bg-white"  onChange={e => setTaskForm({...taskForm})}>
                           <option value="">{activityType === 'MEETING' ? 'Responsável / Organizador' : 'Atribuir a...'}</option>
                           {allUsers?.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                       </select>

                       <button type="submit" className={`w-full text-white p-2 rounded text-sm font-bold mt-2 ${activityType === 'MEETING' ? 'bg-purple-600 hover:bg-purple-500' : 'bg-blue-500 hover:bg-blue-400'}`}>Salvar</button>
                   </form>
               </div>
           </div>
       )}

       {isContactModalOpen && (
           <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
               <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
                   <div className="p-4 border-b flex justify-between items-center"><h3 className="font-bold">Contato</h3><button onClick={() => setIsContactModalOpen(false)}><X size={20}/></button></div>
                   <form onSubmit={handleSaveContact} className="p-4 space-y-3">
                       <input type="text" placeholder="Nome Completo" className="w-full border p-2 rounded text-sm" value={contactForm.name} onChange={e => setContactForm({...contactForm, name: e.target.value})} />
                       <input type="text" placeholder="Cargo" className="w-full border p-2 rounded text-sm" value={contactForm.role} onChange={e => setContactForm({...contactForm, role: e.target.value})} />
                       <input type="email" placeholder="E-mail" className="w-full border p-2 rounded text-sm" value={contactForm.email} onChange={e => setContactForm({...contactForm, email: e.target.value})} />
                       <input type="text" placeholder="Telefone / Celular" className="w-full border p-2 rounded text-sm" value={contactForm.phone} onChange={e => setContactForm({...contactForm, phone: e.target.value})} />
                       <button type="submit" className="w-full bg-indigo-500 text-white p-2 rounded text-sm font-bold">Salvar</button>
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
                    <input type="text" className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-mcsystem-500 outline-none" 
                      value={formData.cnpj} onChange={e => setFormData({...formData, cnpj: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Localização</label>
                    <input type="text" className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-mcsystem-500 outline-none" 
                      value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} />
                  </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Segmento</label>
                <div className="flex items-center gap-2">
                    <select className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-mcsystem-500 outline-none bg-white"
                        value={formData.segment} onChange={e => setFormData({...formData, segment: e.target.value})}>
                        {segments.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                    </select>
                    <button 
                      type="button" 
                      onClick={() => setIsNewSegmentModalOpen(true)} 
                      className="p-2.5 bg-gray-100 hover:bg-gray-200 rounded text-gray-600 border border-gray-300"
                      title="Adicionar Novo Segmento"
                    >
                        <Plus size={16} />
                    </button>
                </div>
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

      {/* New Segment Modal */}
       {isNewSegmentModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[110] p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm">
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                <h3 className="font-bold text-gray-800">Novo Segmento</h3>
                <button onClick={() => setIsNewSegmentModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                  <X size={20} />
                </button>
            </div>
            <form onSubmit={handleSaveNewSegment} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Segmento</label>
                <input 
                    required 
                    autoFocus
                    type="text" 
                    value={newSegmentName}
                    onChange={e => setNewSegmentName(e.target.value)}
                    placeholder="Ex: E-commerce B2B"
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-mcsystem-500 outline-none"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button type="button" onClick={() => setIsNewSegmentModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Cancelar</button>
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
                    <select 
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-mcsystem-500 outline-none bg-white text-sm"
                        value={bulkEditValue}
                        onChange={e => setBulkEditValue(e.target.value)}
                    >
                        <option value="">Selecione um segmento...</option>
                        {segments.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                    </select>
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