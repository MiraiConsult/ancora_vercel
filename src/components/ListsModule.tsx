import React, { useState, useRef } from 'react';
import { RevenueType, Bank, User, Product } from '../types';
import { Plus, Trash2, Save, X, Building, Upload, Download, Package } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { ProductsModule } from './ProductsModule';

interface ListsModuleProps {
  revenueTypes: RevenueType[];
  setRevenueTypes: React.Dispatch<React.SetStateAction<RevenueType[]>>;
  banks: Bank[];
  setBanks: React.Dispatch<React.SetStateAction<Bank[]>>;
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  currentUser: User;
}

type ListType = 'PRODUCTS' | 'BANKS';

export const ListsModule: React.FC<ListsModuleProps> = ({
    revenueTypes, setRevenueTypes,
    banks, setBanks,
    products, setProducts,
    currentUser
}) => {
  const [activeList, setActiveList] = useState<ListType>('PRODUCTS');
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

  const fileInputRef = useRef<HTMLInputElement>(null);

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setItemName('');
    setBankData({ name: '', agency: '', account: '', initialBalance: 0 });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (activeList === 'BANKS') {
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
        // REVENUE
        if (editingId) {
            const itemToUpdate = revenueTypes.find(i => i.id === editingId);
            if (!itemToUpdate) return;
            const updatedItem = { ...itemToUpdate, name: itemName };
            setRevenueTypes(prev => prev.map(i => i.id === editingId ? updatedItem : i));
            await supabase.from('revenue_types').upsert({ id: updatedItem.id, name: updatedItem.name });
        } else {
            const newItem = { id: `l${Date.now()}`, name: itemName };
            setRevenueTypes(prev => [...prev, { ...newItem, tenant_id: currentUser.tenant_id } as RevenueType]);
            await supabase.from('revenue_types').upsert(newItem);
        }
    }

    closeModal();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Excluir item?')) return;

    if (activeList === 'BANKS') {
        setBanks(prev => prev.filter(b => b.id !== id));
        await supabase.from('banks').delete().eq('id', id);
    } else {
        setRevenueTypes(prev => prev.filter(i => i.id !== id));
        await supabase.from('revenue_types').delete().eq('id', id);
    }
  };

  const openNewModal = () => {
      setEditingId(null);
      setItemName('');
      setBankData({ name: '', agency: '', account: '', initialBalance: 0 });
      setIsModalOpen(true);
  };

  const openEditModal = (item: any) => {
      setEditingId(item.id);
      if (activeList === 'BANKS') {
          setBankData(item);
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
    const BOM = "﻿";
    let headers: string[];
    let rows: string[][];
    let filename: string;

    switch (activeList) {
      case 'BANKS':
        headers = ['Nome', 'Agencia', 'Conta', 'SaldoInicial'];
        rows = [['Banco Exemplo', '0001', '12345-6', '1000,50']];
        filename = 'modelo_bancos.csv';
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
          // REVENUE
          const existingNames = new Set(revenueTypes.map(i => i.name.toLowerCase()));

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
            setRevenueTypes(prev => [...prev, ...itemsToInsert.map(item => ({...item, tenant_id: currentUser.tenant_id}))]);
            await supabase.from('revenue_types').upsert(itemsToInsert);
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

  return (
    <div className="space-y-6">
      <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".csv" className="hidden" />
      <h2 className="text-2xl font-bold text-gray-800">Listas e Cadastros Auxiliares</h2>

      <div className="flex flex-col lg:flex-row gap-6">
            {/* Sidebar Tabs */}
            <div className="lg:w-64 flex flex-col space-y-2">
                <button onClick={() => setActiveList('PRODUCTS')} className={`p-3 rounded-lg text-left flex items-center font-medium ${activeList === 'PRODUCTS' ? 'bg-mcsystem-500 text-white shadow-md' : 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-200'}`}>
                    <Package size={18} className="mr-3" /> Produtos
                </button>
                <button onClick={() => setActiveList('BANKS')} className={`p-3 rounded-lg text-left flex items-center font-medium ${activeList === 'BANKS' ? 'bg-mcsystem-500 text-white shadow-md' : 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-200'}`}>
                    <Building size={18} className="mr-3" /> Contas Bancárias
                </button>
            </div>

            {/* Content Area */}
            {activeList === 'PRODUCTS' ? (
              <div className="flex-1 min-w-0">
                <ProductsModule products={products} setProducts={setProducts} currentUser={currentUser} />
              </div>
            ) : (
            <div className="flex-1 bg-white rounded-lg shadow-sm border border-gray-100 p-6">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-bold text-gray-800">Contas Bancárias</h3>
                    <div className="flex items-center gap-2">
                        <button onClick={handleDownloadTemplate} className="text-sm bg-white border border-gray-200 text-gray-600 px-3 py-1.5 rounded-md hover:bg-gray-50 flex items-center shadow-sm">
                            <Download size={14} className="mr-1.5"/> Modelo
                        </button>
                        <button onClick={handleImportClick} className="text-sm bg-white border border-gray-200 text-gray-600 px-3 py-1.5 rounded-md hover:bg-gray-50 flex items-center shadow-sm">
                            <Upload size={14} className="mr-1.5"/> Importar
                        </button>
                        <button onClick={openNewModal} className="text-sm bg-gray-900 text-white px-3 py-1.5 rounded-md hover:bg-gray-800 flex items-center shadow-sm">
                            <Plus size={16} className="mr-1"/> Novo Item
                        </button>
                    </div>
                </div>

                <div className="space-y-2">
                    {banks.map(bank => (
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
                    ))}
                </div>
            </div>
            )}
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
                        {activeList === 'BANKS' ? (
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
