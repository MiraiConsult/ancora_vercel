import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Deal, DealStage, Company, Contact, Interaction, User, RevenueType, Task, FinancialRecord, GeneralNote, TaskType, TransactionType, TransactionStatus, NoteColor, ChartOfAccount, DealStageConfig } from '../types';
import { MoreHorizontal, Plus, DollarSign, Calendar, Bot, Thermometer, X, Save, User as UserIcon, Building, Phone, Mail, StickyNote, Pencil, ChevronDown, ChevronUp, MessageSquare, Clock, CheckCircle, Upload, Download, FileText, BarChart3, Layout, AlertTriangle, Users, History, Send, TrendingUp, CheckSquare, Trash2, Video, CheckCircle2, HelpCircle } from 'lucide-react';
import { analyzeDealRisks } from '../services/geminiService';
import { supabase } from '../lib/supabaseClient';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell, FunnelChart, Funnel, LabelList } from 'recharts';

interface ListItem {
  id: string;
  name: string;
}

interface KanbanBoardProps {
  deals: Deal[];
  setDeals: React.Dispatch<React.SetStateAction<Deal[]>>;
  companies: Company[];
  setCompanies: React.Dispatch<React.SetStateAction<Company[]>>;
  contacts?: Contact[];
  allUsers: User[];
  segments?: ListItem[];
  revenueTypes?: RevenueType[];
  setRevenueTypes: React.Dispatch<React.SetStateAction<RevenueType[]>>;
  chartOfAccounts?: ChartOfAccount[];
  onDealWon?: (deal: Deal, saleData: { value: number, rubricId: string, dueDate: string, description: string }) => void;
  tasks?: Task[];
  setTasks?: React.Dispatch<React.SetStateAction<Task[]>>;
  financeRecords?: FinancialRecord[];
  setFinanceRecords?: React.Dispatch<React.SetStateAction<FinancialRecord[]>>;
  generalNotes?: GeneralNote[];
  setGeneralNotes?: React.Dispatch<React.SetStateAction<GeneralNote[]>>;
  currentUser?: User;
  onOpenHelp: (title: string, content: React.ReactNode) => void;
  dealStages: DealStageConfig[];
  setDealStages: React.Dispatch<React.SetStateAction<DealStageConfig[]>>;
}

export const KanbanBoard: React.FC<KanbanBoardProps> = ({ 
    deals, setDeals, companies, setCompanies, contacts = [], allUsers, segments = [], revenueTypes = [], setRevenueTypes, chartOfAccounts = [], onDealWon,
    tasks = [], setTasks, financeRecords = [], setFinanceRecords, generalNotes = [], setGeneralNotes, currentUser,
    onOpenHelp, dealStages, setDealStages
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showLost, setShowLost] = useState(false);
  
  // Filtros avançados
  const [filters, setFilters] = useState({
    responsible: '',
    revenueType: '',
    dateFrom: '',
    dateTo: '',
    temperature: '',
    clientName: '',
    segment: '',
    valueMin: 0,
    valueMax: 999999999,
  });
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');

  // Selected Deal for Side Panel (Detailed View)
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [activeDrawerTab, setActiveDrawerTab] = useState<'OVERVIEW' | 'ACTIVITIES' | 'FINANCE' | 'NOTES'>('OVERVIEW');
  
  // New Interaction State
  const [newInteraction, setNewInteraction] = useState<{type: 'Note' | 'Call' | 'Meeting' | 'Email', description: string}>({
      type: 'Note',
      description: ''
  });

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  // FIX: Removed 'owners' property as it does not exist in type 'Deal'.
  const [dealForm, setDealForm] = useState<Partial<Deal>>({
    title: '', value: 0, stage: DealStage.PROSPECTING, probability: 10, temperature: 'Cold', revenueTypeId: ''
  });
  const [ownerDropdownOpen, setOwnerDropdownOpen] = useState(false);

  // Won Modal State
  const [isWonModalOpen, setIsWonModalOpen] = useState(false);
  const [dealToWin, setDealToWin] = useState<Deal | null>(null);
  const [wonFormData, setWonFormData] = useState({
    value: 0,
    rubricId: '',
    dueDate: new Date().toISOString().split('T')[0],
    description: ''
  });

  // AI Analysis State
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [analyzingDealId, setAnalyzingDealId] = useState<string | null>(null);
  const [showAiModal, setShowAiModal] = useState(false);

  // New states for client creation modal
  const [isNewClientModalOpen, setIsNewClientModalOpen] = useState(false);
  const [newClientForm, setNewClientForm] = useState({
    name: '',
    cnpj: '',
    segment: 'Pequeno',
    status: 'Prospect' as 'Active' | 'Churned' | 'Prospect',
    location: '',
    responsible_users: [] as string[],
    contacts: [] as Array<{name: string, role: string, email: string, phone: string}>
  });
  
  // New states for revenue type creation modal
  const [isNewRevenueTypeModalOpen, setIsNewRevenueTypeModalOpen] = useState(false);
  const [newRevenueTypeName, setNewRevenueTypeName] = useState('');

  // --- DRAWER CREATION STATES ---
  
  // 1. Task Creation
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [activityType, setActivityType] = useState<'TASK' | 'MEETING'>('TASK');
  // FIX: Removed 'assignee' property as it does not exist in type 'Task'.
  const [taskForm, setTaskForm] = useState<Partial<Task>>({ 
      title: '', type: TaskType.CALL, dueDate: '', priority: 'Medium', relatedTo: '' 
  });

  // 2. Finance Creation
  const [isFinanceModalOpen, setIsFinanceModalOpen] = useState(false);
  const [financeForm, setFinanceForm] = useState<Partial<FinancialRecord>>({
      description: '', amount: 0, type: TransactionType.INCOME, status: TransactionStatus.PENDING, dueDate: '', category: 'Geral', bankId: ''
  });

  // 3. Note Creation
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [noteForm, setNoteForm] = useState<Partial<GeneralNote>>({
      title: '', content: '', category: 'Geral', color: 'yellow'
  });

  const isMockUser = currentUser?.id.startsWith('u') && currentUser.id.length < 10;

  const combinedStages = useMemo(() => {
    // Fallback to default stages if the `dealStages` prop is empty.
    // This handles cases where the DB table might not be populated for an existing user.
    const baseStages = (dealStages && dealStages.length > 0) ? dealStages : [
        { id: 'default-ds1', tenant_id: '', name: DealStage.PROSPECTING, order: 1, is_fixed: false, is_visible: true },
        { id: 'default-ds2', tenant_id: '', name: DealStage.QUALIFICATION, order: 2, is_fixed: false, is_visible: true },
        { id: 'default-ds3', tenant_id: '', name: DealStage.PROPOSAL, order: 3, is_fixed: false, is_visible: true },
        { id: 'default-ds4', tenant_id: '', name: DealStage.NEGOTIATION, order: 4, is_fixed: false, is_visible: true },
        { id: 'default-ds5', tenant_id: '', name: DealStage.CLOSED_WON, order: 5, is_fixed: true, is_visible: true },
        { id: 'default-ds6', tenant_id: '', name: DealStage.CLOSED_LOST, order: 6, is_fixed: true, is_visible: false },
    ];

    // Start with a sorted list of base stages. This ensures order and inclusion of empty stages.
    const sortedBaseStages = [...baseStages].sort((a, b) => a.order - b.order);
    const configuredStageNames = new Set(sortedBaseStages.map(s => s.name));
    
    // Find unique stages from the deals data that are not already in our base configuration.
    const dynamicStages: DealStageConfig[] = [];
    const dealStageNames = new Set(deals.map(d => d.stage));

    dealStageNames.forEach(stageName => {
        if (stageName && !configuredStageNames.has(stageName)) {
            dynamicStages.push({
                id: `dyn-${stageName}`,
                tenant_id: currentUser?.tenant_id || '',
                name: stageName,
                order: 999, // High order number to ensure they appear at the end
                is_fixed: false,
                is_visible: true,
            });
        }
    });
    
    // Combine the sorted base stages with any dynamically found stages.
    return [...sortedBaseStages, ...dynamicStages];
  }, [deals, dealStages, currentUser]);

  const visibleStages = useMemo(() => combinedStages.filter(s => s.is_visible), [combinedStages]);
  const stagesToRender = showLost ? combinedStages : visibleStages;

  const filteredDeals = useMemo(() => {
    return deals.filter(d => {
      // Filtro de busca por título
      const matchesSearch = d.title.toLowerCase().includes(searchTerm.toLowerCase());
      
      // Filtro de estágio (mostrar perdidos ou não)
      const matchesStage = showLost ? true : d.stage !== DealStage.CLOSED_LOST;
      
      // Filtro de responsável
      const matchesResponsible = !filters.responsible || 
        (d.responsible_users && d.responsible_users.includes(filters.responsible));
      
      // Filtro de tipo de receita
      const matchesRevenueType = !filters.revenueType || d.revenueTypeId === filters.revenueType;
      
      // Filtro de data de cadastro
      const dealDate = d.createdAt ? new Date(d.createdAt) : new Date();
      const matchesDateFrom = !filters.dateFrom || dealDate >= new Date(filters.dateFrom);
      const matchesDateTo = !filters.dateTo || dealDate <= new Date(filters.dateTo);
      
      // Filtro de temperatura
      const matchesTemperature = !filters.temperature || d.temperature === filters.temperature;
      
      // Filtro de nome do cliente
      const company = companies.find(c => c.id === d.companyId);
      const matchesClientName = !filters.clientName || 
        (company && company.name.toLowerCase().includes(filters.clientName.toLowerCase()));
      
      // Filtro de segmento
      const matchesSegment = !filters.segment || (company && company.segment === filters.segment);
      
      // Filtro de valor
      const dealValue = d.value || 0;
      const matchesValue = dealValue >= filters.valueMin && dealValue <= filters.valueMax;
      
      return matchesSearch && matchesStage && matchesResponsible && matchesRevenueType && 
             matchesDateFrom && matchesDateTo && matchesTemperature && matchesClientName && 
             matchesSegment && matchesValue;
    });
  }, [deals, searchTerm, showLost, filters, companies]);

  // --- Statistics ---
  const funnelData = useMemo(() => {
    return combinedStages
      .filter(s => !s.is_fixed) // Exclude Won/Lost from funnel viz
      .map(stage => ({
        name: stage.name,
        value: deals.filter(d => d.stage === stage.name).length,
        fill: '#8884d8'
    }));
  }, [deals, combinedStages]);

  const totalPipeline = deals.filter(d => d.stage !== DealStage.CLOSED_WON && d.stage !== DealStage.CLOSED_LOST)
    .reduce((acc, d) => acc + (d.value || 0), 0);

  // --- Handlers ---

  // New handler for saving a new client
  const handleSaveNewClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClientForm.name.trim() || !currentUser) return;

    const newCompany: Company = {
        id: `c${Date.now()}`,
        tenant_id: currentUser.tenant_id,
        name: newClientForm.name.trim(),
        cnpj: newClientForm.cnpj,
        segment: newClientForm.segment,
        status: newClientForm.status,
        location: newClientForm.location,
        responsible_users: newClientForm.responsible_users,
    };
    
    setCompanies(prev => [...prev, newCompany]);
    
    if (!isMockUser) {
        try {
            const { tenant_id, ...payloadForDb } = newCompany;
            const { error } = await supabase.from('clients').insert(payloadForDb);
            if (error) throw error;

            // Save contacts if any
            if (newClientForm.contacts.length > 0) {
                const contactsToInsert = newClientForm.contacts.map(c => ({
                    id: `cnt${Date.now()}-${Math.random()}`,
                    tenant_id: currentUser.tenant_id,
                    name: c.name,
                    role: c.role,
                    email: c.email,
                    phone: c.phone,
                    companyId: newCompany.id
                }));
                await supabase.from('contacts').insert(contactsToInsert);
            }

            // On success
            setDealForm(prev => ({ ...prev, companyId: newCompany.id }));
            setIsNewClientModalOpen(false);
            setNewClientForm({
                name: '',
                cnpj: '',
                segment: 'Pequeno',
                status: 'Prospect',
                location: '',
                responsible_users: [],
                contacts: []
            });

        } catch (error: any) {
            console.error("Error saving new client:", error);
            setCompanies(prev => prev.filter(c => c.id !== newCompany.id));
            alert("Erro ao salvar novo cliente: " + error.message);
            return;
        }
    } else {
      // Mock user success
      setDealForm(prev => ({ ...prev, companyId: newCompany.id }));
      setIsNewClientModalOpen(false);
      setNewClientForm({
          name: '',
          cnpj: '',
          segment: 'Pequeno',
          status: 'Prospect',
          location: '',
          responsible_users: [],
          contacts: []
      });
    }
  };
  
  const handleSaveNewRevenueType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRevenueTypeName.trim() || !currentUser) return;

    const newType: RevenueType = {
        id: `rt_${Date.now()}`,
        tenant_id: currentUser.tenant_id,
        name: newRevenueTypeName.trim()
    };
    
    setRevenueTypes(prev => [...prev, newType]);

    if (!isMockUser) {
        try {
            const { tenant_id, ...payloadForDb } = newType;
            const { error } = await supabase.from('revenue_types').insert(payloadForDb);
            if (error) throw error;

            // On success
            setDealForm(prev => ({ ...prev, revenueTypeId: newType.id }));
            setIsNewRevenueTypeModalOpen(false);
            setNewRevenueTypeName('');
        } catch(error: any) {
            console.error("Error saving new revenue type:", error);
            setRevenueTypes(prev => prev.filter(rt => rt.id !== newType.id));
            alert("Erro ao salvar novo tipo de receita: " + error.message);
            return;
        }
    } else {
        // Mock user success
        setDealForm(prev => ({ ...prev, revenueTypeId: newType.id }));
        setIsNewRevenueTypeModalOpen(false);
        setNewRevenueTypeName('');
    }
  };

  const handleHelpClick = () => {
    onOpenHelp("Guia Rápido: Pipeline de Vendas", (
      <ul className="space-y-4 text-sm text-gray-600 list-disc pl-5 leading-relaxed">
        <li>
          <strong>Movimentação de Cards:</strong> Arraste e solte os cards de negociação entre as colunas para atualizar o estágio do pipeline em tempo real.
        </li>
        <li>
          <strong>Detalhes da Negociação:</strong> Clique em qualquer card para abrir um painel lateral com a visão 360º, incluindo histórico, atividades, finanças e notas.
        </li>
        <li>
          <strong>Ações Rápidas:</strong> Dentro do painel de uma negociação, use os botões na aba "Atividades" para criar rapidamente novas tarefas ou agendar reuniões vinculadas ao negócio.
        </li>
        <li>
          <strong>Análise com IA:</strong> No card ou no painel, clique no ícone de robô (<Bot size={14} className="inline-block text-mcsystem-500" />) para receber uma análise de risco e sugestão de próximo passo.
        </li>
        <li>
          <strong>Novo Negócio:</strong> Utilize o botão "+ Novo Negócio" no canto superior direito para adicionar uma nova oportunidade ao seu pipeline.
        </li>
      </ul>
    ));
  };

  const handleDragStart = (e: React.DragEvent, dealId: string) => {
    e.dataTransfer.setData('dealId', dealId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, stageName: string) => {
    e.preventDefault();
    const dealId = e.dataTransfer.getData('dealId');
    const originalDeal = deals.find(d => d.id === dealId);

    if (originalDeal && originalDeal.stage !== stageName) {
      if (stageName === DealStage.CLOSED_WON) {
        // Abre o modal ao arrastar para "Fechado (Ganho)"
        const incomeRubrics = chartOfAccounts.filter(c => c.classificationCode === '1');
        setDealToWin(originalDeal);
        setWonFormData({
            value: originalDeal.value,
            rubricId: incomeRubrics[0]?.id || '', // Pré-seleciona a primeira rubrica de receita
            dueDate: new Date().toISOString().split('T')[0],
            description: `Venda: ${originalDeal.title}`
        });
        setIsWonModalOpen(true);
      } else {
        // Lógica padrão para outras colunas, agora com tratamento de erro.
        const updatedDeal = { ...originalDeal, stage: stageName, lastActivity: new Date().toISOString() };
        
        // Atualização Otimista
        setDeals(prev => prev.map(d => d.id === dealId ? updatedDeal : d));

        try {
            const { error } = await supabase
                .from('deals')
                .update({ stage: stageName, lastActivity: new Date().toISOString() })
                .eq('id', dealId);

            if (error) throw error;
        } catch(error: any) {
            console.error("Falha ao atualizar o estágio do negócio:", { code: error.code, message: error.message, details: error.details });
            // Reverte em caso de erro
            setDeals(prev => prev.map(d => d.id === dealId ? originalDeal : d));
            alert("Não foi possível atualizar o estágio do negócio. Verifique sua conexão e tente novamente.");
        }
      }
    }
  };

  const handleStageChange = async (dealId: string, newStage: string) => {
    const originalDeal = deals.find(d => d.id === dealId);
    if (!originalDeal) return;

    // Atualização Otimista
    const updatedDeal = { ...originalDeal, stage: newStage, lastActivity: new Date().toISOString() };
    setDeals(prev => prev.map(d => d.id === dealId ? updatedDeal : d));

    try {
      const { error } = await supabase
        .from('deals')
        .update({ stage: newStage, lastActivity: new Date().toISOString() })
        .eq('id', dealId);

      if (error) throw error;
    } catch(error: any) {
      console.error("Falha ao atualizar o estágio do negócio:", error);
      // Reverte em caso de erro
      setDeals(prev => prev.map(d => d.id === dealId ? originalDeal : d));
      alert("Não foi possível atualizar o estágio do negócio.");
    }
  };

  const handleSaveDeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
        alert("Sessão inválida. Por favor, faça o login novamente.");
        return;
    }

    if (editingDeal) {
        // --- UPDATE LOGIC ---
        const originalDeal = deals.find(d => d.id === editingDeal.id);
        if (!originalDeal) return;

        const updatedDealForUi: Deal = { ...originalDeal, ...dealForm };

        setDeals(prev => prev.map(d => (d.id === editingDeal.id ? updatedDealForUi : d)));
        if (selectedDeal && selectedDeal.id === editingDeal.id) {
            setSelectedDeal(updatedDealForUi);
        }
        setIsModalOpen(false);
        
        // Create a clean DTO, mapping camelCase to snake_case for revenueTypeId
        const { id, tenant_id, revenueTypeId, ...restOfDeal } = updatedDealForUi;
        const payloadForDb = {
            ...restOfDeal,
            revenue_type_id: revenueTypeId
        };
        
        try {
            const { error } = await supabase.from('deals').update(payloadForDb).eq('id', editingDeal.id);
            if (error) throw error;
        } catch (error: any) {
            console.error("[DEAL UPDATE FAILED] Supabase error:", { code: error.code, message: error.message, details: error.details });
            alert(`Falha ao salvar as alterações do negócio: ${error.message}`);
            // Revert optimistic update on failure
            setDeals(prev => prev.map(d => (d.id === editingDeal.id ? originalDeal : d)));
            if (selectedDeal && selectedDeal.id === editingDeal.id) {
                setSelectedDeal(originalDeal);
            }
        } finally {
            setDealForm({ title: '', value: 0, stage: DealStage.PROSPECTING, probability: 10, temperature: 'Cold', revenueTypeId: '' });
            setEditingDeal(null);
        }
    } else {
        // --- CREATE LOGIC ---
        const now = new Date().toISOString();
        const tempId = `temp-deal-${Date.now()}`;

        const tempDealForUi: Deal = {
            id: tempId,
            tenant_id: currentUser.tenant_id,
            lastActivity: now,
            history: [],
            ...dealForm,
            title: dealForm.title || "Novo Negócio",
            value: dealForm.value || 0,
            stage: dealForm.stage || (dealStages[0]?.name || DealStage.PROSPECTING),
            companyId: dealForm.companyId || '',
            probability: dealForm.probability || 10,
        };

        // Create a clean DTO for insert. Omits id/tenant_id and maps revenueTypeId.
        const { id, tenant_id, revenueTypeId, ...restOfDeal } = tempDealForUi;
        const payloadForDb = {
            ...restOfDeal,
            revenue_type_id: revenueTypeId,
        };
        
        setDeals(prev => [...prev, tempDealForUi]);
        setIsModalOpen(false);

        try {
            console.log("[INSERTING DEAL] Clean DTO to be sent:", payloadForDb);
            const { data, error } = await supabase.from('deals').insert(payloadForDb).select().single();
            
            if (error) throw error;
            
            if (data) {
                // Map the returned snake_case id back to camelCase for UI consistency
                const { revenue_type_id, ...restOfData } = data;
                const dealFromDb: Deal = {
                    ...restOfData,
                    revenueTypeId: revenue_type_id
                } as Deal;
                
                setDeals(prev => prev.map(d => (d.id === tempId ? dealFromDb : d)));
            } else {
                throw new Error("Não foi possível obter os dados do negócio salvo.");
            }
        } catch (error: any) {
            // Log detailed error as requested
            console.error("[DEAL INSERT FAILED] Supabase error:", { code: error.code, message: error.message, details: error.details });
            alert(`Falha ao criar o novo negócio: ${error.message}`);
            // Per user request, DO NOT remove the optimistically added deal from the UI on failure.
        } finally {
            setDealForm({ title: '', value: 0, stage: DealStage.PROSPECTING, probability: 10, temperature: 'Cold', revenueTypeId: '' });
            setEditingDeal(null);
        }
    }
};

  const handleDeleteDeal = async (id: string) => {
      if (window.confirm('Tem certeza que deseja excluir esta negociação?')) {
          setDeals(prev => prev.filter(d => d.id !== id));
          if (selectedDeal?.id === id) setSelectedDeal(null);
          if (editingDeal?.id === id) setIsModalOpen(false);
          
          const { error } = await supabase.from('deals').delete().eq('id', id);
          if (error) {
              console.error('Error deleting deal:', error);
              // alert('Erro ao excluir negociação.'); // Optional alert, silent fail usually better with optmistic update
          }
      }
  };

  // FIX: This function is no longer needed as the 'owners' property was removed from Deal.
  

  const handleAddInteraction = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedDeal || !newInteraction.description) return;

      const user = JSON.parse(localStorage.getItem('sb-ajdqvacuudavitiehopy-auth-token') || '{}')?.user;
      const userName = user?.user_metadata?.name || 'Usuário';

      const interaction: Interaction = {
          id: `int-${Date.now()}`,
          type: newInteraction.type,
          description: newInteraction.description,
          date: new Date().toISOString(),
          author: userName
      };

      const updatedHistory = [...(selectedDeal.history || []), interaction];
      const updatedDeal = { ...selectedDeal, history: updatedHistory, lastActivity: new Date().toISOString() };

      // Update State
      setDeals(prev => prev.map(d => d.id === selectedDeal.id ? updatedDeal : d));
      setSelectedDeal(updatedDeal);
      setNewInteraction({ type: 'Note', description: '' });

      // Persist
      await supabase.from('deals').update({ 
          history: updatedHistory, 
          lastActivity: new Date().toISOString() 
      }).eq('id', selectedDeal.id);
  };

  const handleAnalyzeRisk = async (e: React.MouseEvent, deal: Deal) => {
    e.stopPropagation();
    setAnalyzingDealId(deal.id);
    setShowAiModal(true);
    setAiAnalysis("Lendo histórico e analisando riscos com IA...");
    
    const company = companies.find(c => c.id === deal.companyId)?.name || 'Cliente';
    const analysis = await analyzeDealRisks(deal, company);
    setAiAnalysis(analysis);
    setAnalyzingDealId(null);
  };

  const confirmWin = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!dealToWin) return;
      
      if (!wonFormData.rubricId) {
          alert('Por favor, selecione a forma de pagamento (rubrica).');
          return;
      }
      
      // Update deal to CLOSED_WON
      const updatedDeal = { ...dealToWin, stage: DealStage.CLOSED_WON, lastActivity: new Date().toISOString() };
      setDeals(prev => prev.map(d => d.id === dealToWin.id ? updatedDeal : d));
      
      // Create financial record
      if (setFinanceRecords && currentUser) {
          const newFinanceRecord: FinancialRecord = {
              id: `fr${Date.now()}`,
              tenant_id: currentUser.tenant_id,
              description: wonFormData.description || `Venda: ${dealToWin.title}`,
              amount: wonFormData.value,
              type: TransactionType.INCOME,
              status: TransactionStatus.PENDING,
              dueDate: wonFormData.dueDate,
              competenceDate: wonFormData.dueDate,
              rubricId: wonFormData.rubricId,
              companyId: dealToWin.companyId,
              dealId: dealToWin.id,
              category: 'Receita de Vendas',
              bankId: '',
              needsValidation: true
          };
          
          setFinanceRecords(prev => [newFinanceRecord, ...prev]);
          
          // Save to database
          if (!isMockUser) {
              try {
                  await supabase.from('deals').update({ stage: DealStage.CLOSED_WON, lastActivity: new Date().toISOString() }).eq('id', dealToWin.id);
                  await supabase.from('financial_records').insert(newFinanceRecord);
              } catch (error) {
                  console.error('Error saving deal/finance record:', error);
              }
          }
      }
      
      // Call onDealWon if provided (for compatibility)
      if (onDealWon) {
          onDealWon(dealToWin, wonFormData);
      }
      
      setIsWonModalOpen(false);
      setDealToWin(null);
  };

  const getTemperatureColor = (temp?: string) => {
      switch(temp) {
          case 'Hot': return 'text-red-500';
          case 'Warm': return 'text-orange-500';
          case 'Cold': return 'text-blue-500';
          default: return 'text-gray-400';
      }
  };

  // --- QUICK CREATE HANDLERS ---
  const openTaskModal = () => {
      if (!selectedDeal) return;
      setActivityType('TASK');
      // FIX: Removed 'assignee' property as it does not exist in type 'Task'.
      setTaskForm({ 
          title: `Follow-up: ${selectedDeal.title}`, 
          dueDate: new Date().toISOString().split('T')[0], 
          type: TaskType.CALL, 
          priority: 'Medium',
          relatedTo: companies.find(c => c.id === selectedDeal.companyId)?.name || selectedDeal.title
      });
      setIsTaskModalOpen(true);
  };

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDeal || !setTasks || !currentUser) return;
  
    // SESSION GUARD: Ensure the user is properly authenticated before proceeding.
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      console.error("Authentication Error: No active session found.", sessionError);
      alert("Sua sessão expirou ou é inválida. Por favor, faça o login novamente para salvar a tarefa.");
      return;
    }
    console.log("[AUTH] Session verified for task creation.", session);
  
    const now = new Date().toISOString();
    const tempId = `temp-${Date.now()}`;
    
    // 1. Create a temporary object for the optimistic UI update. This object satisfies the full 'Task' type.
    const tempTaskForUi: Task = {
      id: tempId,
      tenant_id: currentUser.tenant_id, // For local state consistency, this is NOT sent to the DB.
      createdAt: now,
      title: taskForm.title || (activityType === 'MEETING' ? 'Nova Reunião' : 'Nova Atividade'),
      dueDate: taskForm.dueDate || now,
      type: activityType === 'MEETING' ? TaskType.MEETING : (taskForm.type || TaskType.CALL),
      status: 'Pending' as const,
      priority: (activityType === 'MEETING' ? 'High' : (taskForm.priority || 'Medium')) as 'High' | 'Medium' | 'Low',
      companyId: selectedDeal.companyId,
      relatedTo: companies.find(c => c.id === selectedDeal.companyId)?.name || selectedDeal.title,
    };
  
    // 2. Create a clean payload for the database, excluding fields managed by the backend (id, tenant_id, createdAt).
    const { id, tenant_id, createdAt, ...payloadForDb } = tempTaskForUi;
  
    // 3. Optimistically update the UI and close the modal.
    setTasks(prev => [...prev, tempTaskForUi]);
    setIsTaskModalOpen(false);
  
    // 4. Attempt to insert the clean payload into Supabase.
    try {
      console.log("[INSERTING TASK] Payload being sent:", payloadForDb);
      const { data, error } = await supabase.from('tasks').insert(payloadForDb).select().single();
      
      if (error) {
        throw error; // Propagate error to the catch block.
      }
  
      // 5. If successful, replace the temporary task with the real one from the DB.
      if (data) {
        setTasks(prev => prev.map(t => (t.id === tempId ? data as Task : t)));
      }
    } catch (error: any) {
      // On failure, log the detailed error and alert the user. The optimistic UI update is NOT reverted.
      console.error("[INSERT FAILED] Full Supabase error object:", error);
      const errorMessage = error.message || 'Ocorreu um erro desconhecido.';
      const errorDetails = error.details ? `Detalhes: ${error.details}` : '';
      alert(`A tarefa foi adicionada localmente, mas falhou ao salvar: ${errorMessage} ${errorDetails}`);
    }
  };

  const openFinanceModal = () => {
      if (!selectedDeal) return;
      setFinanceForm({ 
          description: `Venda: ${selectedDeal.title}`, 
          amount: selectedDeal.value, 
          type: TransactionType.INCOME, 
          status: TransactionStatus.PENDING, 
          dueDate: new Date().toISOString().split('T')[0], 
          category: 'Vendas' 
      });
      setIsFinanceModalOpen(true);
  };

  const handleSaveFinance = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedDeal || !setFinanceRecords) return;
      const newRecord: FinancialRecord = {
          id: `f${Date.now()}`,
          tenant_id: selectedDeal.tenant_id,
          description: financeForm.description || '',
          amount: Number(financeForm.amount),
          type: financeForm.type as TransactionType,
          status: financeForm.status as TransactionStatus,
          dueDate: financeForm.dueDate || new Date().toISOString(),
          dealId: selectedDeal.id,
          companyId: selectedDeal.companyId,
          category: financeForm.category || 'Geral',
          bankId: financeForm.bankId || '',
          needsValidation: true
      };
      setFinanceRecords(prev => [newRecord, ...prev]);
      await supabase.from('financial_records').insert(newRecord);
      setIsFinanceModalOpen(false);
  };

  const openNoteModal = () => {
      setNoteForm({ title: '', content: '', category: 'Geral', color: 'yellow' });
      setIsNoteModalOpen(true);
  };

  const handleSaveNote = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedDeal) return;
      if (!setGeneralNotes) {
          alert('Funcionalidade de notas não disponível');
          return;
      }
      const user = JSON.parse(localStorage.getItem('sb-ajdqvacuudavitiehopy-auth-token') || '{}')?.user;
      const newNote: GeneralNote = {
          id: `gn${Date.now()}`,
          tenant_id: selectedDeal.tenant_id,
          title: noteForm.title || '',
          content: noteForm.content || '',
          date: new Date().toISOString(),
          author: user?.user_metadata?.name || 'Admin',
          companyId: selectedDeal.companyId,
          companyName: companies.find(c => c.id === selectedDeal.companyId)?.name || '',
          color: (noteForm.color as NoteColor) || 'yellow',
          category: noteForm.category || 'Geral'
      };
      setGeneralNotes(prev => [newNote, ...prev]);
      await supabase.from('general_notes').insert(newNote);
      setIsNoteModalOpen(false);
  };

  const getRelatedTasks = (deal: Deal) => {
      return tasks.filter(t => t.companyId === deal.companyId || t.relatedTo === deal.title);
  };

  const getRelatedFinance = (deal: Deal) => {
      return financeRecords.filter(f => f.companyId === deal.companyId || f.dealId === deal.id);
  };

  const getRelatedNotes = (deal: Deal) => {
      return generalNotes.filter(n => n.companyId === selectedDeal.id);
  };

  return (
    <div className="h-full flex flex-col space-y-6 relative">
      {/* Header */}
      <div className="flex-shrink-0 flex flex-col md:flex-row justify-between items-end gap-4">
        <div>
            <h2 className="text-2xl font-bold text-gray-800">Pipeline de Vendas</h2>
            <div className="flex items-center text-sm text-gray-500 mt-1">
                <DollarSign size={14} className="mr-1 text-green-600"/> 
                Pipeline Ativo: <span className="font-bold text-green-700 ml-1">R$ {totalPipeline.toLocaleString('pt-BR')}</span>
            </div>
        </div>
        <div className="flex gap-3">
            <button onClick={handleHelpClick} className="p-2 bg-white text-gray-400 hover:text-mcsystem-500 hover:bg-mcsystem-50 rounded-lg border border-gray-200 transition-colors" title="Ajuda">
                <HelpCircle size={20} />
            </button>
            <button onClick={() => setShowLost(!showLost)} className={`px-3 py-2 rounded-lg text-sm border font-medium ${showLost ? 'bg-red-50 text-red-600 border-red-200' : 'bg-white text-gray-500 border-gray-200'}`}>
                {showLost ? 'Ocultar Perdidos' : 'Ver Perdidos'}
            </button>
            {/* FIX: Removed 'owners' property as it does not exist in type 'Deal'. */}
            <button onClick={() => { setEditingDeal(null); setDealForm({stage: (dealStages[0]?.name || DealStage.PROSPECTING), probability: 10, value: 0, title: '', revenueTypeId: ''}); setIsModalOpen(true); }} className="bg-mcsystem-500 hover:bg-mcsystem-400 text-white px-4 py-2 rounded-lg font-bold flex items-center shadow-sm transition-colors">
                <Plus size={18} className="mr-2"/> Novo Negócio
            </button>
        </div>
      </div>

      {/* Barra de Filtros e Toggle de Visualização */}
      <div className="flex-shrink-0 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div className="flex justify-between items-center mb-3">
          <button 
            onClick={() => setShowFilters(!showFilters)} 
            className="text-sm font-medium text-gray-700 hover:text-mcsystem-500 flex items-center"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            {showFilters ? 'Ocultar Filtros' : 'Mostrar Filtros'}
          </button>
          
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('kanban')}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                viewMode === 'kanban' ? 'bg-mcsystem-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Layout size={14} className="inline mr-1" /> Kanban
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                viewMode === 'list' ? 'bg-mcsystem-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <FileText size={14} className="inline mr-1" /> Lista
            </button>
          </div>
        </div>
        
        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-gray-100">
            {/* Filtro: Responsável */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Responsável</label>
              <select
                value={filters.responsible}
                onChange={e => setFilters({...filters, responsible: e.target.value})}
                className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:ring-1 focus:ring-mcsystem-500 outline-none"
              >
                <option value="">Todos</option>
                {allUsers.map(user => (
                  <option key={user.id} value={user.id}>{user.name}</option>
                ))}
              </select>
            </div>
            
            {/* Filtro: Tipo de Receita */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de Receita</label>
              <select
                value={filters.revenueType}
                onChange={e => setFilters({...filters, revenueType: e.target.value})}
                className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:ring-1 focus:ring-mcsystem-500 outline-none"
              >
                <option value="">Todos</option>
                {revenueTypes.map(rt => (
                  <option key={rt.id} value={rt.id}>{rt.name}</option>
                ))}
              </select>
            </div>
            
            {/* Filtro: Segmento */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Segmento</label>
              <select
                value={filters.segment}
                onChange={e => setFilters({...filters, segment: e.target.value})}
                className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:ring-1 focus:ring-mcsystem-500 outline-none"
              >
                <option value="">Todos</option>
                {segments.map(seg => (
                  <option key={seg.id} value={seg.name}>{seg.name}</option>
                ))}
              </select>
            </div>
            
            {/* Filtro: Buscar Cliente */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Buscar Cliente</label>
              <input
                type="text"
                value={filters.clientName}
                onChange={e => setFilters({...filters, clientName: e.target.value})}
                placeholder="Nome do cliente..."
                className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:ring-1 focus:ring-mcsystem-500 outline-none"
              />
            </div>
            
            {/* Filtro: Data de Cadastro (De) */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Data De</label>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={e => setFilters({...filters, dateFrom: e.target.value})}
                className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:ring-1 focus:ring-mcsystem-500 outline-none"
              />
            </div>
            
            {/* Filtro: Data de Cadastro (Até) */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Data Até</label>
              <input
                type="date"
                value={filters.dateTo}
                onChange={e => setFilters({...filters, dateTo: e.target.value})}
                className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:ring-1 focus:ring-mcsystem-500 outline-none"
              />
            </div>
            
            {/* Filtro: Temperatura */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Temperatura</label>
              <select
                value={filters.temperature}
                onChange={e => setFilters({...filters, temperature: e.target.value})}
                className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:ring-1 focus:ring-mcsystem-500 outline-none"
              >
                <option value="">Todos</option>
                <option value="Hot">🔥 Hot</option>
                <option value="Warm">🌤️ Warm</option>
                <option value="Cold">❄️ Cold</option>
              </select>
            </div>
            
            {/* Botão Limpar Filtros */}
            <div className="flex items-end">
              <button
                onClick={() => setFilters({
                  responsible: '',
                  revenueType: '',
                  dateFrom: '',
                  dateTo: '',
                  temperature: '',
                  clientName: '',
                  segment: '',
                  valueMin: 0,
                  valueMax: 999999999,
                })}
                className="w-full px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-sm font-medium transition-colors"
              >
                Limpar Filtros
              </button>
            </div>
          </div>
        )}
      </div>
      
      {/* Funnel Chart */}
      <div className="flex-shrink-0 bg-white p-4 rounded-xl shadow-sm border border-gray-100 h-48 flex flex-col">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Funil de Vendas</h3>
          <div className="flex-1 w-full">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={funnelData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{fontSize: 10}} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{fill: '#f3f4f6'}} />
                    <Bar dataKey="value" fill="#8884d8" radius={[4,4,0,0]} barSize={40}>
                        {funnelData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
          </div>
      </div>

      {/* Visualização: Kanban ou Lista */}
      {viewMode === 'kanban' ? (
        /* Kanban Board */
        <div className="flex-1 overflow-x-auto pb-4 min-h-0">
          <div className="flex gap-4 min-w-max h-full">
              {stagesToRender.map(stageConfig => (
                  <div 
                    key={stageConfig.id} 
                    className="w-80 flex flex-col bg-gray-100/50 rounded-xl border border-gray-200 h-full"
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, stageConfig.name)}
                  >
                      <div className={`p-3 border-b border-gray-200 flex justify-between items-center rounded-t-xl ${stageConfig.name === DealStage.CLOSED_WON ? 'bg-green-50' : 'bg-gray-50'}`}>
                          <h4 className={`font-bold text-sm uppercase tracking-wide ${stageConfig.name === DealStage.CLOSED_WON ? 'text-green-700' : 'text-gray-700'}`}>{stageConfig.name}</h4>
                          <span className="text-xs font-bold bg-white px-2 py-0.5 rounded-full text-gray-500 border border-gray-200">
                              {filteredDeals.filter(d => d.stage === stageConfig.name).length}
                          </span>
                      </div>
                      <div className="p-3 space-y-3 overflow-y-auto flex-1 scrollbar-hide">
                          {filteredDeals.filter(d => d.stage === stageConfig.name).map(deal => (
                              <div 
                                key={deal.id}
                                draggable
                                onDragStart={(e) => handleDragStart(e, deal.id)}
                                onClick={() => { setSelectedDeal(deal); setActiveDrawerTab('OVERVIEW'); }}
                                className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition-all group relative"
                              >
                                  <div className="flex justify-between items-start mb-2">
                                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter truncate max-w-[150px]">
                                          {companies.find(c => c.id === deal.companyId)?.name || 'Cliente'}
                                      </span>
                                      <Thermometer size={14} className={getTemperatureColor(deal.temperature)} />
                                  </div>
                                  <h5 className="font-bold text-gray-800 text-sm mb-1">{deal.title}</h5>
                                  <p className="text-green-600 font-bold text-sm mb-3">R$ {(deal.value || 0).toLocaleString('pt-BR')}</p>
                                  
                                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-50 text-xs text-gray-400">
                                      <div className="flex items-center" title="Probabilidade">
                                          <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden mr-2">
                                              <div className="h-full bg-blue-500" style={{width: `${deal.probability}%`}}></div>
                                          </div>
                                          {deal.probability}%
                                      </div>
                                      {/* FIX: Removed owner display as 'owners' property was removed from Deal. */}
                                  </div>

                                  <button 
                                    onClick={(e) => handleAnalyzeRisk(e, deal)}
                                    className="absolute top-2 right-2 p-1.5 bg-white/80 hover:bg-mcsystem-50 text-mcsystem-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm border border-mcsystem-100"
                                    title="Análise de Risco IA"
                                  >
                                      <Bot size={14} />
                                  </button>
                              </div>
                          ))}
                      </div>
                      <div className="p-3 bg-gray-50 border-t border-gray-200 rounded-b-xl text-center">
                          <p className="text-xs font-bold text-gray-500">
                              Total: R$ {filteredDeals.filter(d => d.stage === stageConfig.name).reduce((acc, d) => acc + (d.value || 0), 0).toLocaleString('pt-BR', { notation: 'compact' })}
                          </p>
                      </div>
                  </div>
              ))}
          </div>
        </div>
      ) : (
        /* Lista de Leads */
        <div className="flex-1 overflow-auto pb-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Cliente</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Título</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Valor</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Estágio</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Probabilidade</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Termômetro</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Responsáveis</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Tipo de Receita</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Data Cadastro</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredDeals.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-gray-500">
                      Nenhum lead encontrado com os filtros atuais.
                    </td>
                  </tr>
                ) : (
                  filteredDeals.map(deal => {
                    const company = companies.find(c => c.id === deal.companyId);
                    const revenueType = revenueTypes.find(rt => rt.id === deal.revenueTypeId);
                    const responsibleNames = deal.responsible_users
                      ? allUsers.filter(u => deal.responsible_users!.includes(u.id)).map(u => u.name.split(' ')[0])
                      : [];
                    
                    return (
                      <tr 
                        key={deal.id} 
                        className="hover:bg-gray-50 cursor-pointer transition-colors"
                        onClick={() => { setSelectedDeal(deal); setActiveDrawerTab('OVERVIEW'); }}
                      >
                        <td className="px-4 py-3 text-sm font-medium text-gray-800">
                          {company?.name || 'Cliente'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {deal.title}
                        </td>
                        <td className="px-4 py-3 text-sm font-bold text-green-600">
                          R$ {(deal.value || 0).toLocaleString('pt-BR')}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-blue-50 text-blue-700">
                            {deal.stage}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div className="flex items-center">
                            <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden mr-2">
                              <div className="h-full bg-blue-500" style={{width: `${deal.probability}%`}}></div>
                            </div>
                            <span className="text-xs font-medium text-gray-600">{deal.probability}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <Thermometer size={16} className={getTemperatureColor(deal.temperature)} />
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {responsibleNames.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {responsibleNames.slice(0, 2).map((name, idx) => (
                                <span key={idx} className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded bg-mcsystem-50 text-mcsystem-700">
                                  <UserIcon size={10} className="mr-1" /> {name}
                                </span>
                              ))}
                              {responsibleNames.length > 2 && (
                                <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded bg-gray-100 text-gray-600">
                                  +{responsibleNames.length - 2}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">Sem responsável</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {revenueType?.name || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {deal.createdAt ? new Date(deal.createdAt).toLocaleDateString('pt-BR') : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingDeal(deal);
                              setDealForm(deal);
                              setIsModalOpen(true);
                            }}
                            className="text-gray-400 hover:text-mcsystem-500 transition-colors"
                            title="Editar"
                          >
                            <Pencil size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* DEAL DETAILS SIDE PANEL (DRAWER) */}
      {selectedDeal && (
        <div className="fixed inset-0 overflow-hidden z-[60]">
            <div className="absolute inset-0 bg-gray-900 bg-opacity-30 backdrop-blur-sm transition-opacity" onClick={() => setSelectedDeal(null)}></div>
            <div className="fixed inset-y-0 right-0 max-w-full flex">
                <div className="w-screen max-w-md animate-in slide-in-from-right-10 duration-300">
                    <div className="h-full flex flex-col bg-white shadow-2xl overflow-y-scroll">
                        {/* Header */}
                        <div className="px-6 py-6 border-b border-gray-100 bg-gray-50">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900">{selectedDeal.title}</h2>
                                    <div className="flex items-center mt-1 text-sm text-gray-500">
                                        <Building size={14} className="mr-1" />
                                        {companies.find(c => c.id === selectedDeal.companyId)?.name || 'Cliente Desconhecido'}
                                    </div>
                                </div>
                                <button onClick={() => setSelectedDeal(null)} className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-200 transition-colors">
                                    <X size={24} />
                                </button>
                            </div>
                            {/* Tabs */}
                            <div className="flex mt-6 space-x-1 bg-gray-200 p-1 rounded-lg">
                                {[
                                    { id: 'OVERVIEW', label: 'Detalhes' },
                                    { id: 'ACTIVITIES', label: 'Atividades' },
                                    { id: 'FINANCE', label: 'Financeiro' },
                                    { id: 'NOTES', label: 'Notas' }
                                ].map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveDrawerTab(tab.id as any)}
                                        className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${activeDrawerTab === tab.id ? 'bg-white text-mcsystem-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Body */}
                        <div className="p-6 space-y-6 flex-1 overflow-y-auto">
                            
                            {activeDrawerTab === 'OVERVIEW' && (
                                <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                                    {/* Stats Grid */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="p-4 bg-green-50 rounded-xl border border-green-100">
                                            <p className="text-xs font-bold text-green-600 uppercase">Valor</p>
                                            <p className="text-2xl font-bold text-green-700">R$ {(selectedDeal.value || 0).toLocaleString('pt-BR')}</p>
                                        </div>
                                        <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                                            <p className="text-xs font-bold text-blue-600 uppercase">Probabilidade</p>
                                            <div className="flex items-center mt-1">
                                                <span className="text-2xl font-bold text-blue-700 mr-2">{selectedDeal.probability}%</span>
                                                <Thermometer size={20} className={getTemperatureColor(selectedDeal.temperature)} />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Description */}
                                    {selectedDeal.description && (
                                        <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                                            <p className="text-xs font-bold text-gray-400 uppercase mb-2">Descrição</p>
                                            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{selectedDeal.description}</p>
                                        </div>
                                    )}

                                    {/* History Timeline */}
                                    <div className="pt-4 border-t border-gray-100">
                                        <h4 className="font-bold text-gray-800 mb-4 flex items-center"><History size={16} className="mr-2 text-gray-400"/> Histórico de Interações</h4>
                                        <div className="bg-blue-50/50 p-3 rounded-lg border border-blue-100 mb-6">
                                            <form onSubmit={handleAddInteraction}>
                                                <div className="flex gap-2 mb-2">
                                                    <select 
                                                        className="bg-white border border-gray-200 text-xs rounded px-2 py-1 focus:ring-1 focus:ring-mcsystem-500 outline-none"
                                                        value={newInteraction.type}
                                                        onChange={e => setNewInteraction({...newInteraction, type: e.target.value as any})}
                                                    >
                                                        <option value="Note">Nota</option>
                                                        <option value="Call">Ligação</option>
                                                        <option value="Meeting">Reunião</option>
                                                        <option value="Email">E-mail</option>
                                                    </select>
                                                </div>
                                                <div className="flex gap-2">
                                                    <input 
                                                        type="text" 
                                                        placeholder="Adicionar nota rápida..." 
                                                        className="flex-1 text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-mcsystem-500 focus:border-transparent outline-none bg-white"
                                                        value={newInteraction.description}
                                                        onChange={e => setNewInteraction({...newInteraction, description: e.target.value})}
                                                    />
                                                    <button 
                                                        type="submit" 
                                                        disabled={!newInteraction.description}
                                                        className="bg-mcsystem-500 text-white p-2 rounded-lg hover:bg-mcsystem-400 disabled:opacity-50 transition-colors"
                                                    >
                                                        <Send size={16} />
                                                    </button>
                                                </div>
                                            </form>
                                        </div>

                                        {selectedDeal.history && selectedDeal.history.length > 0 && (
                                            <div className="space-y-6 relative pl-4 border-l-2 border-gray-100 ml-2">
                                                {[...selectedDeal.history].reverse().map((h, i) => (
                                                    <div key={i} className="relative">
                                                        <div className="absolute -left-[23px] top-1 w-3.5 h-3.5 bg-white rounded-full border-2 border-mcsystem-500"></div>
                                                        <p className="text-xs text-gray-400 mb-1 font-mono">{new Date(h.date).toLocaleDateString()} • {new Date(h.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                                                        <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                                                            <p className="text-sm font-medium text-gray-800">{h.description}</p>
                                                            <p className="text-[10px] text-gray-400 mt-2 uppercase font-bold flex items-center justify-between">
                                                                <span>{h.type}</span>
                                                                <span>{h.author}</span>
                                                            </p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {activeDrawerTab === 'ACTIVITIES' && (
                                <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
                                    <div className="flex justify-between items-center mb-2">
                                        <h3 className="font-bold text-gray-800 flex items-center"><CheckSquare size={18} className="mr-2 text-mcsystem-500"/> Atividades</h3>
                                        <button onClick={openTaskModal} className="text-xs bg-mcsystem-500 text-white px-3 py-1.5 rounded hover:bg-mcsystem-400 flex items-center font-bold transition-colors"><Plus size={12} className="mr-1"/> Nova</button>
                                    </div>
                                    
                                    {getRelatedTasks(selectedDeal).length > 0 ? getRelatedTasks(selectedDeal).map(t => (
                                        <div key={t.id} className="p-3 border border-gray-100 rounded-lg flex justify-between items-center bg-gray-50 hover:bg-white hover:shadow-sm transition-all">
                                            <div>
                                                <p className="text-sm font-bold text-gray-800 flex items-center">
                                                    {t.type === TaskType.MEETING && <Video size={12} className="mr-1 text-purple-500"/>}
                                                    {t.title}
                                                </p>
                                                <div className="flex items-center text-xs text-gray-500 mt-1">
                                                    <span>{t.type === TaskType.MEETING && t.dueDate.includes('T') ? new Date(t.dueDate).toLocaleString([], {year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'}) : new Date(t.dueDate).toLocaleDateString()}</span>
                                                    <span className="mx-2">•</span>
                                                    <span className={`font-medium ${t.status === 'Done' ? 'text-green-600' : 'text-orange-500'}`}>{t.status}</span>
                                                </div>
                                            </div>
                                            {t.type !== TaskType.MEETING && <span className={`text-[10px] px-2 py-1 rounded font-bold ${t.priority === 'High' ? 'bg-red-100 text-red-600' : 'bg-gray-200 text-gray-600'}`}>{t.priority}</span>}
                                        </div>
                                    )) : <div className="text-center py-8 text-gray-400 italic text-sm border-2 border-dashed border-gray-200 rounded-lg bg-gray-50/50">Nenhuma atividade pendente.</div>}
                                </div>
                            )}

                            {activeDrawerTab === 'FINANCE' && (
                                <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
                                    <div className="flex justify-between items-center mb-2">
                                        <h3 className="font-bold text-gray-800 flex items-center"><TrendingUp size={18} className="mr-2 text-green-600"/> Histórico Financeiro</h3>
                                        {/* FIX: Replaced 'accessLevel' with 'role' for admin check. */}
                                        {currentUser?.role === 'admin' && setFinanceRecords && (
                                            <button onClick={openFinanceModal} className="text-xs bg-green-600 text-white px-3 py-1.5 rounded hover:bg-green-500 flex items-center font-bold transition-colors"><Plus size={12} className="mr-1"/> Novo</button>
                                        )}
                                    </div>

                                    {getRelatedFinance(selectedDeal).length > 0 ? getRelatedFinance(selectedDeal).map(f => (
                                        <div key={f.id} className="p-3 border border-gray-100 rounded-lg flex justify-between items-center bg-white shadow-sm hover:shadow-md transition-all">
                                            <div>
                                                <p className="text-sm font-bold text-gray-800">{f.description}</p>
                                                <div className="flex items-center text-xs text-gray-500 mt-1">
                                                    <span>{new Date(f.dueDate).toLocaleDateString()}</span>
                                                    <span className="mx-2">•</span>
                                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${f.status === TransactionStatus.PAID ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{f.status}</span>
                                                </div>
                                            </div>
                                            <span className={`font-bold text-sm ${f.type === TransactionType.INCOME ? 'text-green-600' : 'text-red-500'}`}>{f.type === TransactionType.INCOME ? '+' : '-'} R$ {f.amount.toLocaleString('pt-BR')}</span>
                                        </div>
                                    )) : <div className="text-center py-8 text-gray-400 italic text-sm border-2 border-dashed border-gray-200 rounded-lg bg-gray-50/50">Nenhum registro financeiro.</div>}
                                </div>
                            )}

                            {activeDrawerTab === 'NOTES' && (
                                <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
                                    <div className="flex justify-between items-center mb-2">
                                        <h3 className="font-bold text-gray-800 flex items-center"><StickyNote size={18} className="mr-2 text-yellow-500"/> Notas do Cliente</h3>
                                        <button onClick={openNoteModal} className="text-xs bg-yellow-500 text-white px-3 py-1.5 rounded hover:bg-yellow-400 flex items-center font-bold transition-colors"><Plus size={12} className="mr-1"/> Nova</button>
                                    </div>

                                    {getRelatedNotes(selectedDeal).length > 0 ? getRelatedNotes(selectedDeal).map(n => (
                                        <div key={n.id} className="p-4 bg-yellow-50 border border-yellow-100 rounded-lg shadow-sm hover:shadow-md transition-all relative group">
                                            {n.title && <p className="font-bold text-sm mb-1 text-yellow-900">{n.title}</p>}
                                            <p className="text-xs text-yellow-800 whitespace-pre-wrap">{n.content}</p>
                                            <p className="text-[10px] text-yellow-600 mt-2 text-right border-t border-yellow-200/50 pt-2 flex justify-between items-center">
                                                <span className="font-bold">{n.author}</span>
                                                <span>{new Date(n.date).toLocaleDateString()}</span>
                                            </p>
                                        </div>
                                    )) : <div className="text-center py-8 text-gray-400 italic text-sm border-2 border-dashed border-gray-200 rounded-lg bg-gray-50/50">Nenhuma nota registrada.</div>}
                                </div>
                            )}

                        </div>

                        {/* Footer Actions */}
                        <div className="p-6 border-t border-gray-100 bg-gray-50 flex gap-3 sticky bottom-0 z-20">
                            <button onClick={() => { setEditingDeal(selectedDeal); setDealForm(selectedDeal); setIsModalOpen(true); }} className="flex-1 bg-mcsystem-500 text-white py-3 rounded-lg font-bold hover:bg-mcsystem-400 transition-colors shadow-sm flex items-center justify-center text-sm">
                                <Pencil size={16} className="mr-2" /> Editar
                            </button>
                            <button onClick={(e) => handleAnalyzeRisk(e, selectedDeal)} className="flex-1 bg-white border border-gray-200 text-gray-700 py-3 rounded-lg font-bold hover:bg-purple-50 hover:text-purple-600 hover:border-purple-200 transition-colors flex items-center justify-center text-sm shadow-sm">
                                <Bot size={16} className="mr-2" /> Análise IA
                            </button>
                            {selectedDeal.stage !== 'Perdido' && (
                                <button 
                                    onClick={() => {
                                        if (window.confirm('Marcar este deal como Perdido?')) {
                                            handleStageChange(selectedDeal.id, 'Perdido');
                                            setSelectedDeal(null);
                                        }
                                    }} 
                                    className="px-4 bg-white border border-gray-200 text-orange-600 py-3 rounded-lg font-bold hover:bg-orange-50 hover:border-orange-200 transition-colors flex items-center justify-center text-sm shadow-sm" 
                                    title="Marcar como Perdido"
                                >
                                    <X size={18} className="mr-1" /> Perdido
                                </button>
                            )}
                            <button onClick={() => handleDeleteDeal(selectedDeal.id)} className="px-4 bg-white border border-gray-200 text-red-500 py-3 rounded-lg font-bold hover:bg-red-50 hover:border-red-200 transition-colors flex items-center justify-center text-sm shadow-sm" title="Excluir">
                                <Trash2 size={18} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* --- MODALS FOR DRAWER --- */}
      
      {/* 1. TASK MODAL */}
      {isTaskModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
              <div className="bg-white rounded-lg shadow-xl w-full max-w-sm animate-in zoom-in-95 overflow-hidden">
                  <div className={`p-4 border-b flex justify-between items-center text-white ${activityType === 'MEETING' ? 'bg-purple-600' : 'bg-mcsystem-600'}`}>
                      <h3 className="font-bold text-lg flex items-center">
                          {activityType === 'MEETING' ? <Video size={18} className="mr-2" /> : <CheckSquare size={18} className="mr-2" />}
                          {activityType === 'MEETING' ? 'Agendar Reunião' : 'Nova Atividade'}
                      </h3>
                      <button onClick={() => setIsTaskModalOpen(false)} className="text-white/80 hover:text-white"><X size={20}/></button>
                  </div>
                  
                  {/* Toggle Type */}
                  <div className="flex bg-gray-100 p-1 mx-4 mt-4 rounded-lg">
                      <button 
                        type="button" 
                        onClick={() => { setActivityType('TASK'); setTaskForm(prev => ({...prev, type: TaskType.CALL})); }} 
                        className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${activityType === 'TASK' ? 'bg-white text-mcsystem-600 shadow-sm' : 'text-gray-500'}`}
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

                  <form onSubmit={handleSaveTask} className="p-4 space-y-4">
                      <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Título</label>
                          <input required type="text" placeholder={activityType === 'MEETING' ? "Ex: Reunião de Alinhamento" : "Ex: Ligar para cliente..."} className="w-full border p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-offset-1 focus:ring-mcsystem-500 outline-none" value={taskForm.title} onChange={e => setTaskForm({...taskForm, title: e.target.value})} />
                      </div>
                      
                      {activityType === 'TASK' && (
                          <div className="grid grid-cols-2 gap-3">
                              <div>
                                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Tipo</label>
                                  <select className="w-full border p-2.5 rounded-lg text-sm bg-white outline-none" value={taskForm.type} onChange={e => setTaskForm({...taskForm, type: e.target.value as any})}>
                                      <option value={TaskType.CALL}>Ligação</option>
                                      <option value={TaskType.EMAIL}>Email</option>
                                      <option value={TaskType.FOLLOW_UP}>Follow-up</option>
                                  </select>
                              </div>
                              <div>
                                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Vencimento</label>
                                  <input required type="date" className="w-full border p-2.5 rounded-lg text-sm outline-none" value={taskForm.dueDate} onChange={e => setTaskForm({...taskForm, dueDate: e.target.value})} />
                              </div>
                          </div>
                      )}

                      {activityType === 'MEETING' && (
                          <div>
                              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Data e Hora</label>
                              <input required type="datetime-local" className="w-full border p-2.5 rounded-lg text-sm outline-none focus:ring-2 focus:ring-purple-500" value={taskForm.dueDate} onChange={e => setTaskForm({...taskForm, dueDate: e.target.value})} />
                          </div>
                      )}

                      {activityType === 'TASK' && (
                          <div>
                              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Prioridade</label>
                              <select className="w-full border p-2.5 rounded-lg text-sm bg-white outline-none" value={taskForm.priority} onChange={e => setTaskForm({...taskForm, priority: e.target.value as any})}>
                                  <option value="High">Alta Prioridade</option>
                                  <option value="Medium">Média Prioridade</option>
                                  <option value="Low">Baixa Prioridade</option>
                              </select>
                          </div>
                      )}

                      {/* FIX: Removed 'assignee' selection as it does not exist in type 'Task'. */}

                      <button type="submit" className={`w-full text-white p-2.5 rounded-lg text-sm font-bold shadow-lg transition-all hover:scale-[1.02] mt-2 ${activityType === 'MEETING' ? 'bg-purple-600 hover:bg-purple-500 shadow-purple-200' : 'bg-mcsystem-500 hover:bg-mcsystem-400 shadow-mcsystem-200'}`}>
                          {activityType === 'MEETING' ? 'Agendar Reunião' : 'Salvar Tarefa'}
                      </button>
                  </form>
              </div>
          </div>
      )}

      {/* 2. FINANCE MODAL */}
      {isFinanceModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
              <div className="bg-white rounded-lg shadow-xl w-full max-w-sm animate-in zoom-in-95">
                  <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-lg"><h3 className="font-bold text-gray-800">Lançamento Financeiro</h3><button onClick={() => setIsFinanceModalOpen(false)}><X size={20} className="text-gray-400"/></button></div>
                  <form onSubmit={handleSaveFinance} className="p-4 space-y-3">
                      {/* FIX: Replaced finForm with financeForm and setFinForm with setFinanceForm */}
                      <div><label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Descrição</label><input type="text" placeholder="Ex: Pagamento... (Opcional)" className="w-full border p-2 rounded text-sm focus:ring-1 focus:ring-green-500 outline-none" value={financeForm.description} onChange={e => setFinanceForm({...financeForm, description: e.target.value})} /></div>
                      <div className="grid grid-cols-2 gap-2">
                          {/* FIX: Replaced finForm with financeForm and setFinForm with setFinanceForm */}
                          <div><label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Valor (R$)</label><input required type="number" step="0.01" placeholder="0,00" className="w-full border p-2 rounded text-sm" value={financeForm.amount} onChange={e => setFinanceForm({...financeForm, amount: Number(e.target.value)})} /></div>
                          {/* FIX: Replaced finForm with financeForm and setFinForm with setFinanceForm */}
                          <div><label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Vencimento</label><input required type="date" className="w-full border p-2 rounded text-sm" value={financeForm.dueDate} onChange={e => setFinanceForm({...financeForm, dueDate: e.target.value})} /></div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                          {/* FIX: Replaced finForm with financeForm and setFinForm with setFinanceForm */}
                          <div><label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Tipo</label><select className="w-full border p-2 rounded text-sm bg-white" value={financeForm.type} onChange={e => setFinanceForm({...financeForm, type: e.target.value as any})}><option value={TransactionType.INCOME}>Receita</option><option value={TransactionType.EXPENSE}>Despesa</option></select></div>
                          {/* FIX: Replaced finForm with financeForm and setFinForm with setFinanceForm */}
                          <div><label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Status</label><select className="w-full border p-2 rounded text-sm bg-white" value={financeForm.status} onChange={e => setFinanceForm({...financeForm, status: e.target.value as any})}><option value={TransactionStatus.PENDING}>Pendente</option><option value={TransactionStatus.PAID}>Pago</option></select></div>
                      </div>
                      <button type="submit" className="w-full bg-green-600 text-white p-2 rounded text-sm font-bold shadow-sm hover:bg-green-500 transition-colors mt-2">Registrar</button>
                  </form>
              </div>
          </div>
      )}

      {/* 3. NOTE MODAL */}
      {isNoteModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
              <div className="bg-white rounded-lg shadow-xl w-full max-w-sm animate-in zoom-in-95">
                  <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-lg"><h3 className="font-bold text-gray-800">Nova Nota</h3><button onClick={() => setIsNoteModalOpen(false)}><X size={20} className="text-gray-400"/></button></div>
                  <form onSubmit={handleSaveNote} className="p-4 space-y-3">
                      <div><label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Título</label><input type="text" placeholder="Título da nota..." className="w-full border p-2 rounded text-sm focus:ring-1 focus:ring-yellow-500 outline-none" value={noteForm.title} onChange={e => setNoteForm({...noteForm, title: e.target.value})} /></div>
                      <div><label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Categoria</label><select className="w-full border p-2 rounded text-sm bg-white" value={noteForm.category} onChange={e => setNoteForm({...noteForm, category: e.target.value})}><option value="Geral">Geral</option><option value="Reunião">Reunião</option><option value="Importante">Importante</option></select></div>
                      <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Cor</label>
                          <div className="flex gap-2">
                              {(['yellow', 'blue', 'green', 'red', 'purple', 'gray'] as NoteColor[]).map(c => (
                                  <div key={c} onClick={() => setNoteForm({...noteForm, color: c})} className={`w-6 h-6 rounded-full cursor-pointer border-2 ${noteForm.color === c ? 'border-gray-600 scale-110' : 'border-transparent'}`} style={{backgroundColor: c === 'yellow' ? '#fef08a' : c === 'blue' ? '#bfdbfe' : c === 'green' ? '#bbf7d0' : c === 'red' ? '#fecaca' : c === 'purple' ? '#e9d5ff' : '#e5e7eb'}}></div>
                              ))}
                          </div>
                      </div>
                      <div><label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Conteúdo</label><textarea required placeholder="Escreva a nota..." className="w-full border p-2 rounded text-sm h-24 focus:ring-1 focus:ring-yellow-500 outline-none" value={noteForm.content} onChange={e => setNoteForm({...noteForm, content: e.target.value})}></textarea></div>
                      <button type="submit" className="w-full bg-yellow-500 text-white p-2 rounded text-sm font-bold shadow-sm hover:bg-yellow-400 transition-colors mt-2">Salvar Nota</button>
                  </form>
              </div>
          </div>
      )}

      {/* New Client Modal - EXPANDED */}
      {isNewClientModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[110] p-4 overflow-y-auto">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl animate-in zoom-in-95 my-8">
                  <div className="p-4 border-b flex justify-between items-center bg-mcsystem-500 text-white rounded-t-xl">
                      <h3 className="font-bold text-lg flex items-center"><Building size={20} className="mr-2"/> Novo Cliente</h3>
                      <button onClick={() => setIsNewClientModalOpen(false)} className="text-white/80 hover:text-white"><X size={20}/></button>
                  </div>
                  <form onSubmit={handleSaveNewClient} className="p-6 space-y-6 max-h-[calc(100vh-200px)] overflow-y-auto">
                      {/* Informações Básicas */}
                      <div>
                          <h4 className="font-bold text-gray-800 mb-3 flex items-center border-b pb-2"><Building size={16} className="mr-2 text-mcsystem-500"/> Informações Básicas</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nome da Empresa *</label>
                                  <input 
                                      required 
                                      autoFocus
                                      type="text" 
                                      value={newClientForm.name}
                                      onChange={e => setNewClientForm({...newClientForm, name: e.target.value})}
                                      placeholder="Nome da Empresa"
                                      className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-mcsystem-500 outline-none text-sm"
                                  />
                              </div>
                              <div>
                                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">CNPJ</label>
                                  <input 
                                      type="text" 
                                      value={newClientForm.cnpj}
                                      onChange={e => setNewClientForm({...newClientForm, cnpj: e.target.value})}
                                      placeholder="00.000.000/0000-00"
                                      className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-mcsystem-500 outline-none text-sm"
                                  />
                              </div>
                              <div>
                                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Segmento</label>
                                  <select
                                      value={newClientForm.segment}
                                      onChange={e => setNewClientForm({...newClientForm, segment: e.target.value})}
                                      className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-mcsystem-500 outline-none text-sm bg-white"
                                  >
                                      <option value="Pequeno">Pequeno</option>
                                      <option value="Médio">Médio</option>
                                      <option value="Grande">Grande</option>
                                      <option value="Enterprise">Enterprise</option>
                                  </select>
                              </div>
                              <div>
                                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Status</label>
                                  <select
                                      value={newClientForm.status}
                                      onChange={e => setNewClientForm({...newClientForm, status: e.target.value as any})}
                                      className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-mcsystem-500 outline-none text-sm bg-white"
                                  >
                                      <option value="Prospect">Prospect</option>
                                      <option value="Active">Ativo</option>
                                      <option value="Churned">Churned</option>
                                  </select>
                              </div>
                              <div className="md:col-span-2">
                                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Localização</label>
                                  <input 
                                      type="text" 
                                      value={newClientForm.location}
                                      onChange={e => setNewClientForm({...newClientForm, location: e.target.value})}
                                      placeholder="Cidade, Estado"
                                      className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-mcsystem-500 outline-none text-sm"
                                  />
                              </div>
                          </div>
                      </div>

                      {/* Responsáveis */}
                      <div>
                          <h4 className="font-bold text-gray-800 mb-3 flex items-center border-b pb-2"><Users size={16} className="mr-2 text-mcsystem-500"/> Responsáveis</h4>
                          <div>
                              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Selecione os Responsáveis</label>
                              <div className="border border-gray-300 rounded p-3 max-h-32 overflow-y-auto bg-gray-50">
                                  {allUsers.map(user => (
                                      <label key={user.id} className="flex items-center space-x-2 py-1 hover:bg-white px-2 rounded cursor-pointer">
                                          <input 
                                              type="checkbox" 
                                              checked={newClientForm.responsible_users.includes(user.id)}
                                              onChange={e => {
                                                  if (e.target.checked) {
                                                      setNewClientForm({...newClientForm, responsible_users: [...newClientForm.responsible_users, user.id]});
                                                  } else {
                                                      setNewClientForm({...newClientForm, responsible_users: newClientForm.responsible_users.filter(id => id !== user.id)});
                                                  }
                                              }}
                                              className="rounded text-mcsystem-500 focus:ring-2 focus:ring-mcsystem-500"
                                          />
                                          <span className="text-sm text-gray-700">{user.name}</span>
                                      </label>
                                  ))}
                              </div>
                          </div>
                      </div>

                      {/* Contatos */}
                      <div>
                          <h4 className="font-bold text-gray-800 mb-3 flex items-center border-b pb-2"><UserIcon size={16} className="mr-2 text-mcsystem-500"/> Contatos</h4>
                          {newClientForm.contacts.map((contact, idx) => (
                              <div key={idx} className="border border-gray-200 rounded p-4 mb-3 bg-gray-50 relative">
                                  <button 
                                      type="button"
                                      onClick={() => setNewClientForm({...newClientForm, contacts: newClientForm.contacts.filter((_, i) => i !== idx)})}
                                      className="absolute top-2 right-2 text-red-500 hover:text-red-700"
                                  >
                                      <Trash2 size={16}/>
                                  </button>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                      <div>
                                          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nome</label>
                                          <input 
                                              type="text" 
                                              value={contact.name}
                                              onChange={e => {
                                                  const updated = [...newClientForm.contacts];
                                                  updated[idx].name = e.target.value;
                                                  setNewClientForm({...newClientForm, contacts: updated});
                                              }}
                                              placeholder="Nome do contato"
                                              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-mcsystem-500 outline-none"
                                          />
                                      </div>
                                      <div>
                                          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Cargo</label>
                                          <input 
                                              type="text" 
                                              value={contact.role}
                                              onChange={e => {
                                                  const updated = [...newClientForm.contacts];
                                                  updated[idx].role = e.target.value;
                                                  setNewClientForm({...newClientForm, contacts: updated});
                                              }}
                                              placeholder="Cargo"
                                              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-mcsystem-500 outline-none"
                                          />
                                      </div>
                                      <div>
                                          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Email</label>
                                          <input 
                                              type="email" 
                                              value={contact.email}
                                              onChange={e => {
                                                  const updated = [...newClientForm.contacts];
                                                  updated[idx].email = e.target.value;
                                                  setNewClientForm({...newClientForm, contacts: updated});
                                              }}
                                              placeholder="email@empresa.com"
                                              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-mcsystem-500 outline-none"
                                          />
                                      </div>
                                      <div>
                                          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Telefone</label>
                                          <input 
                                              type="tel" 
                                              value={contact.phone}
                                              onChange={e => {
                                                  const updated = [...newClientForm.contacts];
                                                  updated[idx].phone = e.target.value;
                                                  setNewClientForm({...newClientForm, contacts: updated});
                                              }}
                                              placeholder="(00) 00000-0000"
                                              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-mcsystem-500 outline-none"
                                          />
                                      </div>
                                  </div>
                              </div>
                          ))}
                          <button 
                              type="button"
                              onClick={() => setNewClientForm({...newClientForm, contacts: [...newClientForm.contacts, {name: '', role: '', email: '', phone: ''}]})}
                              className="w-full py-2 border-2 border-dashed border-gray-300 rounded text-gray-600 hover:border-mcsystem-500 hover:text-mcsystem-500 flex items-center justify-center text-sm font-medium transition-colors"
                          >
                              <Plus size={16} className="mr-2"/> Adicionar Contato
                          </button>
                      </div>

                      {/* Botões de Ação */}
                      <div className="flex justify-end space-x-3 pt-4 border-t">
                          <button type="button" onClick={() => setIsNewClientModalOpen(false)} className="px-6 py-2 text-gray-600 hover:bg-gray-100 rounded font-medium transition-colors">Cancelar</button>
                          <button type="submit" className="px-6 py-2 bg-mcsystem-500 text-white rounded hover:bg-mcsystem-400 flex items-center font-bold shadow-sm transition-colors">
                             <Save size={16} className="mr-2" /> Salvar Cliente
                          </button>
                      </div>
                  </form>
              </div>
          </div>
      )}
      
      {/* New Revenue Type Modal */}
      {isNewRevenueTypeModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[110] p-4">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-sm animate-in zoom-in-95">
                  <div className="p-4 border-b flex justify-between items-center">
                      <h3 className="font-bold text-gray-800">Novo Tipo de Receita</h3>
                      <button onClick={() => setIsNewRevenueTypeModalOpen(false)}><X size={20}/></button>
                  </div>
                  <form onSubmit={handleSaveNewRevenueType} className="p-6 space-y-4">
                      <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Tipo de Receita</label>
                          <input 
                              required 
                              autoFocus
                              type="text" 
                              value={newRevenueTypeName}
                              onChange={e => setNewRevenueTypeName(e.target.value)}
                              placeholder="Ex: Venda de Produto"
                              className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-mcsystem-500 outline-none"
                          />
                      </div>
                      <div className="flex justify-end space-x-2 pt-2">
                          <button type="button" onClick={() => setIsNewRevenueTypeModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Cancelar</button>
                          <button type="submit" className="px-4 py-2 bg-mcsystem-500 text-white rounded hover:bg-mcsystem-400 flex items-center">
                             <Save size={16} className="mr-2" /> Salvar
                          </button>
                      </div>
                  </form>
              </div>
          </div>
      )}

      {/* Deal Won Modal */}
      {isWonModalOpen && dealToWin && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[110] p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md animate-in zoom-in-95">
                <div className="p-6 border-b flex justify-between items-center bg-green-50 rounded-t-xl">
                    <div>
                        <h3 className="font-bold text-lg text-green-800">Confirmar Venda</h3>
                        <p className="text-sm text-green-600">{dealToWin.title}</p>
                    </div>
                    <button onClick={() => setIsWonModalOpen(false)}><X size={20} className="text-green-700"/></button>
                </div>
                <form onSubmit={confirmWin} className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Valor Final da Venda (R$)</label>
                        <input 
                            required 
                            type="number"
                            step="0.01"
                            value={wonFormData.value}
                            onChange={e => setWonFormData({...wonFormData, value: Number(e.target.value)})}
                            className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-mcsystem-500 outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Forma de Pagamento (Rubrica)</label>
                        <select
                            required
                            value={wonFormData.rubricId}
                            onChange={e => setWonFormData({...wonFormData, rubricId: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-mcsystem-500 outline-none bg-white"
                        >
                            <option value="">Selecione a rubrica...</option>
                            {chartOfAccounts?.filter(c => c.classificationCode === '1').map(c => (
                                <option key={c.id} value={c.id}>{c.rubricName}</option>
                            ))}
                        </select>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Data de Vencimento</label>
                        <input 
                            required 
                            type="date"
                            value={wonFormData.dueDate}
                            onChange={e => setWonFormData({...wonFormData, dueDate: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-mcsystem-500 outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Descrição da Venda (Parcelamento, etc.)</label>
                        <textarea
                            value={wonFormData.description}
                            onChange={e => setWonFormData({...wonFormData, description: e.target.value})}
                            placeholder="Ex: Pagamento em 3x, com 1ª parcela para 30 dias."
                            className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-mcsystem-500 outline-none min-h-[60px]"
                        ></textarea>
                    </div>
                    <div className="flex justify-end space-x-2 pt-4">
                        <button type="button" onClick={() => setIsWonModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Cancelar</button>
                        <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-500 flex items-center font-bold">
                           <CheckCircle size={16} className="mr-2" /> Confirmar e Gerar Financeiro
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}

      {/* Deal Modal (Main Edit) */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 overflow-visible">
                <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                    {/* FIX: Replaced editingId with editingDeal */}
                    <h3 className="font-bold text-gray-800">{editingDeal ? 'Editar Negociação' : 'Nova Oportunidade'}</h3>
                    <button onClick={() => setIsModalOpen(false)}><X size={20} className="text-gray-400 hover:text-gray-600"/></button>
                </div>
                <form onSubmit={handleSaveDeal} className="p-6 space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Título</label>
                        <input required type="text" className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-mcsystem-500 outline-none" value={dealForm.title} onChange={e => setDealForm({...dealForm, title: e.target.value})} />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Cliente</label>
                        <div className="flex items-center gap-2">
                            <select required className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-mcsystem-500 outline-none bg-white text-sm" value={dealForm.companyId} onChange={e => setDealForm({...dealForm, companyId: e.target.value})}>
                                <option value="">Selecione...</option>
                                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            <button type="button" onClick={() => setIsNewClientModalOpen(true)} className="p-2.5 bg-gray-100 hover:bg-gray-200 rounded text-gray-600 border border-gray-300" title="Adicionar Novo Cliente">
                                <Plus size={16} />
                            </button>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Valor Estimado</label>
                            <input type="number" className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-mcsystem-500 outline-none" value={dealForm.value} onChange={e => setDealForm({...dealForm, value: Number(e.target.value)})} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Tipo de Receita</label>
                            <div className="flex items-center gap-2">
                                <select required className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-mcsystem-500 outline-none bg-white text-sm" value={dealForm.revenueTypeId} onChange={e => setDealForm({...dealForm, revenueTypeId: e.target.value})}>
                                    <option value="">Selecione...</option>
                                    {revenueTypes?.map(rt => <option key={rt.id} value={rt.id}>{rt.name}</option>)}
                                </select>
                                <button type="button" onClick={() => setIsNewRevenueTypeModalOpen(true)} className="p-2.5 bg-gray-100 hover:bg-gray-200 rounded text-gray-600 border border-gray-300" title="Adicionar Novo Tipo de Receita">
                                    <Plus size={16} />
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    {/* FIX: Removed 'owners' selection as it does not exist in type 'Deal'. */}

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Estágio</label>
                            {/* FIX: Corrected invalid type assertion `as any()` to `as any`. */}
                            <select className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-mcsystem-500 outline-none bg-white text-sm" value={dealForm.stage} onChange={e => setDealForm({...dealForm, stage: e.target.value as any})}>
                                {dealStages.length === 0 && <option value="">Carregando...</option>}
                                {dealStages.filter(s => s.name !== 'Perdido').map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Temperatura</label>
                            <select className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-mcsystem-500 outline-none bg-white text-sm" value={dealForm.temperature} onChange={e => setDealForm({...dealForm, temperature: e.target.value as any})}>
                                <option value="Hot">Hot 🔥</option>
                                <option value="Warm">Warm 🌤️</option>
                                <option value="Cold">Cold ❄️</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Descrição</label>
                        <textarea className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-mcsystem-500 outline-none" rows={3} value={dealForm.description} onChange={e => setDealForm({...dealForm, description: e.target.value})}></textarea>
                    </div>
                    
                    <div className="pt-4 flex justify-between items-center border-t border-gray-100">
                        {/* FIX: Replaced editingId with editingDeal and handleDeleteClick with handleDeleteDeal */}
                        {editingDeal && (
                            <button type="button" onClick={() => handleDeleteDeal(editingDeal.id)} className="px-4 py-2 text-red-500 hover:bg-red-50 rounded font-medium text-sm flex items-center">
                                <Trash2 size={16} className="mr-2"/> Excluir
                            </button>
                        )}
                        <div className="flex gap-2 ml-auto">
                            {/* FIX: Replaced closeModal with an inline function to set isModalOpen to false */}
                            <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded font-medium text-sm">Cancelar</button>
                            <button type="submit" className="px-4 py-2 bg-mcsystem-500 text-white rounded font-bold shadow-sm hover:bg-mcsystem-400 transition-colors flex items-center"><Save size={16} className="mr-2"/> Salvar</button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
};