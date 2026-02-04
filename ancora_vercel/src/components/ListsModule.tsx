import React, { useState, useRef, useEffect } from 'react';
import { ListItem, RevenueType, Bank, User, Tag } from '../types';
import { List, Plus, Trash2, Save, X, Building, Wallet, Layers, Briefcase, Upload, Download, BookOpen, Trello, CheckSquare, MoveUp, MoveDown, Lock } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { STANDARD_SEGMENTS } from '../data/standardSegments';

// FIX: Redefined Stage interface to be compatible with DealStageConfig and TaskStageConfig.
// This resolves prop type mismatches with App.tsx and internal property access errors.
interface Stage {
  id: string;
  tenant_id: string;
  name: string;
  order: number;
  order_position?: number;
  is_fixed: boolean;
  color?: string;
  is_visible?: boolean;
}

interface ListsModuleProps {
  revenueTypes: RevenueType[];
  setRevenueTypes: React.Dispatch<React.SetStateAction<RevenueType[]>>;
  banks: Bank[];
  setBanks: React.Dispatch<React.SetStateAction<Bank[]>>;
  segments: ListItem[];
  setSegments: React.Dispatch<React.SetStateAction<ListItem[]>>;
  dealStages: Stage[];
  setDealStages: React.Dispatch<React.SetStateAction<Stage[]>>;
  taskStages: Stage[];
  setTaskStages: React.Dispatch<React.SetStateAction<Stage[]>>;
  tags: Tag[];
  setTags: React.Dispatch<React.SetStateAction<Tag[]>>;
  currentUser: User;
}

type ListType = 'REVENUE' | 'BANKS' | 'SEGMENTS' | 'DEAL_STAGES' | 'TASK_STAGES' | 'TAGS';

export const ListsModule: React.FC<ListsModuleProps> = ({ 
    revenueTypes, setRevenueTypes, 
    banks, setBanks,
    segments, setSegments,
    dealStages: dealStagesFromApp,
    setDealStages: setDealStagesInApp,
    taskStages: taskStagesFromApp,
    setTaskStages: setTaskStagesInApp,
    tags, setTags,
    currentUser
}) => {
  const [activeList, setActiveList] = useState<ListType>('SEGMENTS');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Generic Name Input
  const [itemName, setItemName] = useState('');
  
  // Specific Bank Data Input
  const [bankData, setBankData] = useState<Partial<Bank>>({
      name: '',
      agency: '',
      account: '',
      initialBalance: 0
  });

  // Stage Data - dealStages e taskStages vêm do App.tsx via props
  const [stageData, setStageData] = useState<Partial<Stage>>({
      name: '',
      color: '#3B82F6'
  });

  // Tag Data
  const [tagData, setTagData] = useState<Partial<Tag>>({
      name: '',
      color: '#3B82F6'
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load tags from database
  useEffect(() => {
    if (activeList === 'TAGS') {
      loadTags();
    }
  }, [activeList, currentUser.tenant_id]);

  const loadTags = async () => {
    const { data, error } = await supabase
      .from('tags')
      .select('*')
      .eq('tenant_id', currentUser.tenant_id)
      .order('name');
    
    if (error) {
      console.error('❌ Error loading tags:', error);
      return;
    }
    
    setTags(data || []);
  };

  // Load stages from database
  useEffect(() => {
    if (activeList === 'DEAL_STAGES' || activeList === 'TASK_STAGES') {
      loadStages();
    }
  }, [activeList, currentUser.tenant_id]);

  const loadStages = async () => {
    const tableName = activeList === 'DEAL_STAGES' ? 'deal_stages' : 'task_stages';
    console.log('🔍 LoadStages called:', { tableName, tenant_id: currentUser.tenant_id });
    
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .eq('tenant_id', currentUser.tenant_id)
      .order('order_position');
    
    console.log('📊 LoadStages result:', { data, error });
    
    if (error) {
      console.error('❌ Error loading stages:', error);
      return;
    }

    if (activeList === 'DEAL_STAGES') {
      // Mapear para o formato esperado pelo App.tsx (DealStageConfig)
      const mappedStages = (data || []).map((stage: any) => ({
        ...stage,
        order: stage.order_position,
        is_visible: stage.name !== 'Perdido'
      }));
      console.log('✅ Setting dealStages:', mappedStages);
      setDealStagesInApp(mappedStages as any);
    } else {
      // Mapear para o formato esperado pelo App.tsx (TaskStageConfig)
      const mappedStages = (data || []).map((stage: any) => ({
        ...stage,
        order: stage.order_position
      }));
      console.log('✅ Setting taskStages:', mappedStages);
      setTaskStagesInApp(mappedStages as any);
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setItemName('');
    setBankData({ name: '', agency: '', account: '', initialBalance: 0 });
    setStageData({ name: '', color: '#3B82F6' });
    setTagData({ name: '', color: '#3B82F6' });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (activeList === 'DEAL_STAGES' || activeList === 'TASK_STAGES') {
      const tableName = activeList === 'DEAL_STAGES' ? 'deal_stages' : 'task_stages';
      // Converter dealStagesFromApp de volta para Stage[]
      const dealStagesAsStage = dealStagesFromApp.map(s => ({
        id: s.id,
        tenant_id: s.tenant_id,
        name: s.name,
        // FIX: Use optional chaining for order_position as it might not exist.
        order_position: s.order_position || 0,
        is_fixed: s.is_fixed,
        color: s.color || '#3B82F6'
      }));
      const currentStages = activeList === 'DEAL_STAGES' ? dealStagesAsStage : taskStagesFromApp;

      if (editingId) {
        // Update existing stage
        const stageToUpdate = currentStages.find(s => s.id === editingId);
        if (!stageToUpdate) return;
        
        const updatedStage = { ...stageToUpdate, name: stageData.name!, color: stageData.color! };
        await supabase.from(tableName).update({ name: updatedStage.name, color: updatedStage.color }).eq('id', editingId);
        await loadStages(); // Recarregar para atualizar o App.tsx
      } else {
        // Create new stage (insert before fixed stages)
        const maxCustomPosition = Math.max(...currentStages.filter(s => !s.is_fixed).map(s => s.order_position), 0);
        const newPosition = maxCustomPosition + 1;
        
        // Shift fixed stages positions
        const fixedStages = currentStages.filter(s => s.is_fixed);
        for (const fixed of fixedStages) {
          await supabase.from(tableName).update({ order_position: fixed.order_position + 1 }).eq('id', fixed.id);
        }

        const newStage: Omit<Stage, 'id' | 'order'> = {
          tenant_id: currentUser.tenant_id,
          name: stageData.name!,
          order_position: newPosition,
          is_fixed: false,
          color: stageData.color!
        };
        
        const { data, error } = await supabase.from(tableName).insert(newStage).select().single();
        if (data) {
          await loadStages(); // Reload to get correct order
        }
      }
    } else if (activeList === 'TAGS') {
        // Handle Tags
        if (editingId) {
            const tagToUpdate = tags.find(t => t.id === editingId);
            if (!tagToUpdate) return;
            const updatedTag = { ...tagToUpdate, name: tagData.name!, color: tagData.color! };
            setTags(prev => prev.map(t => t.id === editingId ? updatedTag : t));
            await supabase.from('tags').update({ name: updatedTag.name, color: updatedTag.color }).eq('id', editingId);
        } else {
            const newTag: Omit<Tag, 'id'> = {
                tenant_id: currentUser.tenant_id,
                name: tagData.name!,
                color: tagData.color!
            };
            const { data, error } = await supabase.from('tags').insert(newTag).select().single();
            if (data) {
                setTags(prev => [...prev, data]);
            }
        }
    } else if (activeList === 'BANKS') {
        const bank: Omit<Bank, 'tenant_id'> = editingId
            ? { ...banks.find(b => b.id === editingId)!, ...bankData } as Bank
            : { id: `b${Date.now()}`, ...bankData } as Omit<Bank, 'tenant_id'>;
        
        if (editingId) {
            if (!banks.find(b => b.id === editingId)) return;
            setBanks(prev => prev.map(b => b.id === editingId ? { ...bank, tenant_id: currentUser.tenant_id } as Bank : b));
        } else {
            setBanks(prev => [...prev, { ...bank, tenant_id: currentUser.tenant_id } as Bank]);
        }
        
        await supabase.from('banks').upsert(bank);
    } else {
        const tableName = activeList === 'SEGMENTS' ? 'segments' : 'revenue_types';
        const setter = activeList === 'SEGMENTS' ? setSegments : setRevenueTypes;
        const currentItems = activeList === 'SEGMENTS' ? segments : revenueTypes;

        if (editingId) {
            const itemToUpdate = currentItems.find(i => i.id === editingId);
            if (!itemToUpdate) return;
            const updatedItem = { ...itemToUpdate, name: itemName };
            (setter as React.Dispatch<React.SetStateAction<any[]>>)(prev => prev.map(i => i.id === editingId ? updatedItem : i));
            await supabase.from(tableName).upsert({ id: updatedItem.id, name: updatedItem.name });
        } else {
            const newItem: Omit<ListItem, 'tenant_id'> = { id: `l${Date.now()}`, name: itemName };
            (setter as React.Dispatch<React.SetStateAction<any[]>>)(prev => [...prev, { ...newItem, tenant_id: currentUser.tenant_id }]);
            await supabase.from(tableName).upsert(newItem);
        }
    }
    
    closeModal();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Excluir item?')) return;
    
    if (activeList === 'DEAL_STAGES' || activeList === 'TASK_STAGES') {
      const tableName = activeList === 'DEAL_STAGES' ? 'deal_stages' : 'task_stages';
      // Converter dealStagesFromApp de volta para Stage[]
      const dealStagesAsStage = dealStagesFromApp.map(s => ({
        id: s.id,
        tenant_id: s.tenant_id,
        name: s.name,
        order_position: s.order || s.order_position || 0,
        is_fixed: s.is_fixed,
        color: s.color || '#3B82F6'
      }));
      const currentStages = activeList === 'DEAL_STAGES' ? dealStagesAsStage : taskStagesFromApp;
      const stageToDelete = currentStages.find(s => s.id === id);
      
      if (stageToDelete?.is_fixed) {
        alert('Não é possível excluir etapas fixas!');
        return;
      }

      await supabase.from(tableName).delete().eq('id', id);
      await loadStages();
    } else if (activeList === 'TAGS') {
        setTags(prev => prev.filter(t => t.id !== id));
        await supabase.from('tags').delete().eq('id', id);
    } else if (activeList === 'BANKS') {
        setBanks(prev => prev.filter(b => b.id !== id));
        await supabase.from('banks').delete().eq('id', id);
    } else {
        const tableName = activeList === 'SEGMENTS' ? 'segments' : 'revenue_types';
        const setter = activeList === 'SEGMENTS' ? setSegments : setRevenueTypes;
        
        setter(prev => prev.filter(i => i.id !== id));
        await supabase.from(tableName).delete().eq('id', id);
    }
  };

  const handleMoveStage = async (id: string, direction: 'up' | 'down') => {
    const tableName = activeList === 'DEAL_STAGES' ? 'deal_stages' : 'task_stages';
    // Converter dealStagesFromApp de volta para Stage[]
    const dealStagesAsStage = dealStagesFromApp.map(s => ({
      id: s.id,
      tenant_id: s.tenant_id,
      name: s.name,
      order_position: s.order || s.order_position || 0,
      is_fixed: s.is_fixed,
      color: s.color || '#3B82F6'
    }));
    const currentStages = activeList === 'DEAL_STAGES' ? dealStagesAsStage : taskStagesFromApp;
    
    const currentIndex = currentStages.findIndex(s => s.id === id);
    if (currentIndex === -1) return;
    
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= currentStages.length) return;
    
    const currentStage = currentStages[currentIndex];
    const targetStage = currentStages[targetIndex];
    
    // Don't allow moving past fixed stages
    if (currentStage.is_fixed || targetStage.is_fixed) {
      alert('Não é possível reordenar etapas fixas!');
      return;
    }

    // Swap positions - usar uma posição temporária para evitar conflitos
    const tempPosition = -999;
    await supabase.from(tableName).update({ order_position: tempPosition }).eq('id', currentStage.id);
    await supabase.from(tableName).update({ order_position: currentStage.order_position }).eq('id', targetStage.id);
    await supabase.from(tableName).update({ order_position: targetStage.order_position }).eq('id', currentStage.id);
    
    await loadStages();
  };

  const openNewModal = () => {
      setEditingId(null);
      setItemName('');
      setBankData({ name: '', agency: '', account: '', initialBalance: 0 });
      setStageData({ name: '', color: '#3B82F6' });
      setTagData({ name: '', color: '#3B82F6' });
      setIsModalOpen(true);
  };

  const openEditModal = (item: any) => {
      setEditingId(item.id);
      if (activeList === 'BANKS') {
          setBankData(item);
      } else if (activeList === 'DEAL_STAGES' || activeList === 'TASK_STAGES') {
          setStageData({ name: item.name, color: item.color });
      } else if (activeList === 'TAGS') {
          setTagData({ name: item.name, color: item.color });
      } else {
          setItemName(item.name);
      }
      setIsModalOpen(true);
  };

  const handleImportClick = () => {
    if (fileInputRef.current) {
        fileInputRef.current.click();
    }
  };

  const handleDownloadTemplate = () => {
    const BOM = "\uFEFF";
    let headers: string[];
    let rows: string[][];
    let filename: string;

    switch (activeList) {
      case 'BANKS':
        headers = ['Nome', 'Agencia', 'Conta', 'SaldoInicial'];
        rows = [['Banco Exemplo', '0001', '12345-6', '1000,50']];
        filename = 'modelo_bancos.csv';
        break;
      case 'SEGMENTS':
        headers = ['Nome'];
        rows = [['Enterprise']];
        filename = 'modelo_segmentos.csv';
        break;
      case 'REVENUE':
        headers = ['Nome'];
        rows = [['Venda de Produto']];
        filename = 'modelo_tipos_receita.csv';
        break;
      default:
        return;
    }

    const csvContent = BOM + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const arrayBuffer = e.target?.result as ArrayBuffer;
      if (!arrayBuffer) return;

      const text = new TextDecoder('windows-1252').decode(arrayBuffer);
      if (!text) return;

      try {
        const lines = text.split(/\r?\n/).slice(1);
        let itemsToInsert: any[] = [];
        let ignoredCount = 0;

        if (activeList === 'BANKS') {
          const existingNames = new Set(banks.map(b => b.name.toLowerCase()));
          itemsToInsert = lines.map((line, i) => {
            const cols = line.split(';').map(c => c.trim());
            if (cols.length < 1 || !cols[0]) return null;
            const name = cols[0];
            if (existingNames.has(name.toLowerCase())) {
              ignoredCount++;
              return null;
            }

            let balance = 0;
            if (cols[3]) {
                balance = parseFloat(cols[3].replace(',', '.'));
                if (isNaN(balance)) balance = 0;
            }

            return {
              id: `b-imp-${Date.now()}-${i}`,
              name: name,
              agency: cols[1] || '',
              account: cols[2] || '',
              initialBalance: balance,
            };
          }).filter(Boolean);

          if (itemsToInsert.length > 0) {
            setBanks(prev => [...prev, ...itemsToInsert.map(item => ({...item, tenant_id: currentUser.tenant_id}))]);
            await supabase.from('banks').upsert(itemsToInsert);
          }
        } else {
          const tableName = activeList === 'SEGMENTS' ? 'segments' : 'revenue_types';
          const setter = activeList === 'SEGMENTS' ? setSegments : setRevenueTypes;
          const currentItems = activeList === 'SEGMENTS' ? segments : revenueTypes;
          const existingNames = new Set(currentItems.map(i => i.name.toLowerCase()));

          itemsToInsert = lines.map((line, i) => {
            const name = line.split(';')[0].trim();
            if (!name || existingNames.has(name.toLowerCase())) {
              if(name) ignoredCount++;
              return null;
            }
            return {
              id: `l-imp-${Date.now()}-${i}`,
              name: name,
            };
          }).filter(Boolean);

          if (itemsToInsert.length > 0) {
            setter(prev => [...prev, ...itemsToInsert.map(item => ({...item, tenant_id: currentUser.tenant_id}))]);
            await supabase.from(tableName).upsert(itemsToInsert);
          }
        }
        
        alert(`${itemsToInsert.length} novos itens importados com sucesso! ${ignoredCount > 0 ? `(${ignoredCount} itens duplicados foram ignorados.)` : ''}`);

      } catch (error: any) {
        alert(`Erro ao importar arquivo: ${error.message}`);
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleLoadStandardList = async () => {
    let standardItems: string[] = [];
    let currentItems: ListItem[] = [];
    let setter: React.Dispatch<React.SetStateAction<any[]>>;
    let tableName: string = '';
    let listName: string = '';

    if (activeList === 'SEGMENTS') {
      standardItems = STANDARD_SEGMENTS;
      currentItems = segments;
      setter = setSegments;
      tableName = 'segments';
      listName = 'segmentos';
    } else {
      return;
    }

    const existingNames = new Set(currentItems.map(i => i.name.toLowerCase()));
    const toAdd = standardItems
      .filter(name => !existingNames.has(name.toLowerCase()))
      .map((name, i) => ({
        id: `std-${Date.now()}-${i}`,
        name: name,
        tenant_id: currentUser.tenant_id
      }));

    if (toAdd.length === 0) {
      alert(`Todos os ${listName} padrão já foram adicionados.`);
      return;
    }

    setter(prev => [...prev, ...toAdd]);

    const { error } = await supabase.from(tableName).upsert(toAdd.map(({ id, name }) => ({ id, name })));

    if (error) {
      console.error(`Error loading standard ${listName}:`, error);
      setter(currentItems);
      alert(`Erro ao salvar os ${listName} padrão.`);
    } else {
      alert(`${toAdd.length} ${listName} padrão foram adicionados com sucesso!`);
    }
  };

  // Converter dealStagesFromApp para Stage[] para renderização
  const dealStagesAsStage = dealStagesFromApp.map(s => ({
    id: s.id,
    tenant_id: s.tenant_id,
    name: s.name,
    order: s.order,
    order_position: s.order_position || 0,
    is_fixed: s.is_fixed,
    color: s.color || '#3B82F6'
  }));
  
  // Converter taskStagesFromApp para Stage[] para renderização
  const taskStagesAsStage = taskStagesFromApp.map(s => ({
    id: s.id,
    tenant_id: s.tenant_id,
    name: s.name,
    order: s.order,
    order_position: s.order_position || 0,
    is_fixed: s.is_fixed,
    color: s.color || '#10B981'
  }));
  
  const currentStages = activeList === 'DEAL_STAGES' ? dealStagesAsStage : taskStagesAsStage;

  return (
    <div className="space-y-6">
      <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".csv" className="hidden" />
      <h2 className="text-2xl font-bold text-gray-800">Listas e Cadastros Auxiliares</h2>
      
      <div className="flex flex-col lg:flex-row gap-6">
            {/* Sidebar Tabs */}
            <div className="lg:w-64 flex flex-col space-y-2">
                <button onClick={() => setActiveList('SEGMENTS')} className={`p-3 rounded-lg text-left flex items-center font-medium ${activeList === 'SEGMENTS' ? 'bg-mcsystem-500 text-white shadow-md' : 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-200'}`}>
                    <Layers size={18} className="mr-3" /> Segmentos de Clientes
                </button>
                <button onClick={() => setActiveList('REVENUE')} className={`p-3 rounded-lg text-left flex items-center font-medium ${activeList === 'REVENUE' ? 'bg-mcsystem-500 text-white shadow-md' : 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-200'}`}>
                    <Wallet size={18} className="mr-3" /> Tipos de Receita
                </button>
                <button onClick={() => setActiveList('BANKS')} className={`p-3 rounded-lg text-left flex items-center font-medium ${activeList === 'BANKS' ? 'bg-mcsystem-500 text-white shadow-md' : 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-200'}`}>
                    <Building size={18} className="mr-3" /> Contas Bancárias
                </button>
                <button onClick={() => setActiveList('DEAL_STAGES')} className={`p-3 rounded-lg text-left flex items-center font-medium ${activeList === 'DEAL_STAGES' ? 'bg-mcsystem-500 text-white shadow-md' : 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-200'}`}>
                    <Trello size={18} className="mr-3" /> Etapas do Kanban Comercial
                </button>
                <button onClick={() => setActiveList('TASK_STAGES')} className={`p-3 rounded-lg text-left flex items-center font-medium ${activeList === 'TASK_STAGES' ? 'bg-mcsystem-500 text-white shadow-md' : 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-200'}`}>
                    <CheckSquare size={18} className="mr-3" /> Etapas do Kanban de Tarefas
                </button>
                <button onClick={() => setActiveList('TAGS')} className={`p-3 rounded-lg text-left flex items-center font-medium ${activeList === 'TAGS' ? 'bg-mcsystem-500 text-white shadow-md' : 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-200'}`}>
                    <Layers size={18} className="mr-3" /> Tags de Compromissos
                </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 bg-white rounded-lg shadow-sm border border-gray-100 p-6">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-bold text-gray-800">
                        {activeList === 'SEGMENTS' && 'Segmentação de Clientes'}
                        {activeList === 'REVENUE' && 'Formas de Recebimento'}
                        {activeList === 'BANKS' && 'Contas Bancárias'}
                        {activeList === 'DEAL_STAGES' && 'Etapas do Kanban Comercial'}
                        {activeList === 'TASK_STAGES' && 'Etapas do Kanban de Tarefas'}
                        {activeList === 'TAGS' && 'Tags de Compromissos'}
                    </h3>
                    <div className="flex items-center gap-2">
                        {(activeList !== 'DEAL_STAGES' && activeList !== 'TASK_STAGES' && activeList !== 'TAGS') && (
                          <>
                            <button onClick={handleDownloadTemplate} className="text-sm bg-white border border-gray-200 text-gray-600 px-3 py-1.5 rounded-md hover:bg-gray-50 flex items-center shadow-sm">
                                <Download size={14} className="mr-1.5"/> Modelo
                            </button>
                            <button onClick={handleImportClick} className="text-sm bg-white border border-gray-200 text-gray-600 px-3 py-1.5 rounded-md hover:bg-gray-50 flex items-center shadow-sm">
                                <Upload size={14} className="mr-1.5"/> Importar
                            </button>
                          </>
                        )}
                        {(activeList === 'SEGMENTS') && (
                            <button 
                                onClick={handleLoadStandardList} 
                                className="text-sm bg-indigo-50 text-indigo-700 border border-indigo-200 px-3 py-1.5 rounded-md hover:bg-indigo-100 flex items-center shadow-sm font-bold"
                            >
                                <BookOpen size={14} className="mr-1.5"/> Carregar Padrões
                            </button>
                        )}
                        <button onClick={openNewModal} className="text-sm bg-gray-900 text-white px-3 py-1.5 rounded-md hover:bg-gray-800 flex items-center shadow-sm">
                            <Plus size={16} className="mr-1"/> Novo Item
                        </button>
                    </div>
                </div>

                {(activeList === 'DEAL_STAGES' || activeList === 'TASK_STAGES') && (
                  <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                    <strong>Importante:</strong> Etapas marcadas com <Lock size={14} className="inline"/> são fixas e não podem ser excluídas ou reordenadas.
                    {activeList === 'DEAL_STAGES' && ' "Fechado" é integrado com o financeiro e "Perdido" tem função especial no Kanban.'}
                    {activeList === 'TASK_STAGES' && ' "Concluído" é usado para métricas de conclusão.'}
                  </div>
                )}

                <div className="space-y-2">
                    {(activeList === 'DEAL_STAGES' || activeList === 'TASK_STAGES') ? (
                        currentStages.length === 0 ? (
                            <div className="text-center py-8 text-gray-500">
                                <p>Carregando etapas...</p>
                            </div>
                        ) : (
                        currentStages.map((stage, index) => (
                            <div key={stage.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
                                <div className="flex items-center gap-3">
                                    <div className="w-6 h-6 rounded" style={{ backgroundColor: stage.color }}></div>
                                    <div>
                                        <p className="font-bold text-gray-800 flex items-center gap-2">
                                            {stage.name}
                                            {stage.is_fixed && <Lock size={14} className="text-gray-400"/>}
                                        </p>
                                        <p className="text-xs text-gray-500">Posição: {stage.order_position}</p>
                                    </div>
                                </div>
                                <div className="flex items-center space-x-2">
                                    {!stage.is_fixed && index > 0 && !currentStages[index - 1].is_fixed && (
                                        <button onClick={() => handleMoveStage(stage.id, 'up')} className="text-gray-400 hover:text-blue-500 p-1">
                                            <MoveUp size={16}/>
                                        </button>
                                    )}
                                    {!stage.is_fixed && index < currentStages.length - 1 && !currentStages[index + 1].is_fixed && (
                                        <button onClick={() => handleMoveStage(stage.id, 'down')} className="text-gray-400 hover:text-blue-500 p-1">
                                            <MoveDown size={16}/>
                                        </button>
                                    )}
                                    {!stage.is_fixed && (
                                        <>
                                            <button onClick={() => openEditModal(stage)} className="text-xs text-gray-500 hover:text-blue-600 font-bold">EDITAR</button>
                                            <button onClick={() => handleDelete(stage.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={16}/></button>
                                        </>
                                    )}
                                    {stage.is_fixed && (
                                        <span className="text-xs text-gray-400 italic">Fixo</span>
                                    )}
                                </div>
                            </div>
                        ))
                        )
                    ) : activeList === 'TAGS' ? (
                        tags.length === 0 ? (
                            <div className="text-center py-8 text-gray-500">
                                <p>Nenhuma tag cadastrada. Clique em "Novo Item" para criar.</p>
                            </div>
                        ) : (
                        tags.map(tag => (
                            <div key={tag.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
                                <div className="flex items-center gap-3">
                                    <div className="w-6 h-6 rounded" style={{ backgroundColor: tag.color }}></div>
                                    <p className="font-bold text-gray-800">{tag.name}</p>
                                </div>
                                <div className="flex space-x-2">
                                    <button onClick={() => openEditModal(tag)} className="text-xs text-gray-500 hover:text-blue-600 font-bold">EDITAR</button>
                                    <button onClick={() => handleDelete(tag.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={16}/></button>
                                </div>
                            </div>
                        ))
                        )
                    ) : activeList === 'BANKS' ? (
                        banks.map(bank => (
                            <div key={bank.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
                                <div>
                                    <p className="font-bold text-gray-800">{bank.name}</p>
                                    <p className="text-xs text-gray-500">Ag: {bank.agency} / CC: {bank.account}</p>
                                    <p className="text-xs text-green-600 font-medium">Saldo Inicial: R$ {bank.initialBalance?.toLocaleString('pt-BR')}</p>
                                </div>
                                <div className="flex space-x-2">
                                    <button onClick={() => openEditModal(bank)} className="text-gray-400 hover:text-blue-500 p-1">Editar</button>
                                    <button onClick={() => handleDelete(bank.id)} className="text-gray-400 hover:text-red-500 p-1"><Trash2 size={16}/></button>
                                </div>
                            </div>
                        ))
                    ) : (
                        (activeList === 'SEGMENTS' ? segments : revenueTypes).map(item => (
                            <div key={item.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
                                <p className="font-medium text-gray-800">{item.name}</p>
                                <div className="flex space-x-2">
                                    <button onClick={() => openEditModal(item)} className="text-xs text-gray-500 hover:text-blue-600 font-bold">EDITAR</button>
                                    <button onClick={() => handleDelete(item.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={16}/></button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>

        {/* Modal */}
        {isModalOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
                <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                    <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                        <h3 className="font-bold text-gray-800">{editingId ? 'Editar Item' : 'Novo Item'}</h3>
                        <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                            <X size={20} />
                        </button>
                    </div>
                    <form onSubmit={handleSave} className="p-6 space-y-4">
                        {(activeList === 'DEAL_STAGES' || activeList === 'TASK_STAGES') ? (
                            <>
                                <input 
                                    required 
                                    type="text" 
                                    placeholder="Nome da Etapa" 
                                    value={stageData.name} 
                                    onChange={e => setStageData({...stageData, name: e.target.value})} 
                                    className="w-full border p-2 rounded"
                                />
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Cor da Etapa</label>
                                    <input 
                                        type="color" 
                                        value={stageData.color} 
                                        onChange={e => setStageData({...stageData, color: e.target.value})} 
                                        className="w-full h-10 border p-1 rounded"
                                    />
                                </div>
                            </>
                        ) : activeList === 'TAGS' ? (
                            <>
                                <input 
                                    required 
                                    type="text" 
                                    placeholder="Nome da Tag" 
                                    value={tagData.name} 
                                    onChange={e => setTagData({...tagData, name: e.target.value})} 
                                    className="w-full border p-2 rounded"
                                />
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Cor da Tag</label>
                                    <input 
                                        type="color" 
                                        value={tagData.color} 
                                        onChange={e => setTagData({...tagData, color: e.target.value})} 
                                        className="w-full h-10 border p-1 rounded"
                                    />
                                </div>
                            </>
                        ) : activeList === 'BANKS' ? (
                            <>
                                <input required type="text" placeholder="Nome do Banco" value={bankData.name} onChange={e => setBankData({...bankData, name: e.target.value})} className="w-full border p-2 rounded"/>
                                <input type="text" placeholder="Agência" value={bankData.agency} onChange={e => setBankData({...bankData, agency: e.target.value})} className="w-full border p-2 rounded"/>
                                <input type="text" placeholder="Conta" value={bankData.account} onChange={e => setBankData({...bankData, account: e.target.value})} className="w-full border p-2 rounded"/>
                                <input type="number" step="0.01" placeholder="Saldo Inicial" value={bankData.initialBalance} onChange={e => setBankData({...bankData, initialBalance: parseFloat(e.target.value)})} className="w-full border p-2 rounded"/>
                            </>
                        ) : (
                            <input required type="text" placeholder="Nome do Item" value={itemName} onChange={e => setItemName(e.target.value)} className="w-full border p-2 rounded"/>
                        )}
                        <button type="submit" className="w-full bg-gray-900 text-white p-2 rounded font-bold hover:bg-gray-800">
                            <Save size={16} className="inline mr-2"/> Salvar
                        </button>
                    </form>
                </div>
            </div>
        )}
    </div>
  );
};