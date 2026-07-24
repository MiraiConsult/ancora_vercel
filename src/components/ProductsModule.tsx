import React, { useState, useMemo } from 'react';
import { Product, User } from '../types';
import { supabase } from '../lib/supabaseClient';
import { Package, Plus, Pencil, Trash2, X, Save, Search, DollarSign, Link2, CheckCircle2, Circle, Loader2 } from 'lucide-react';

interface ProductsModuleProps {
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  currentUser: User;
}

const emptyForm: Partial<Product> = { name: '', description: '', price: 0, active: true, asaas_id: '' };

export const ProductsModule: React.FC<ProductsModuleProps> = ({ products, setProducts, currentUser }) => {
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<Partial<Product>>(emptyForm);
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products
      .filter(p => !q || p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [products, search]);

  const formatBRL = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setIsModalOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({ ...p });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditing(null);
    setForm(emptyForm);
  };

  const handleSave = async () => {
    if (!form.name?.trim()) {
      alert('Informe o nome do produto.');
      return;
    }
    setSaving(true);

    const payload: Product = {
      id: editing?.id || `p${Date.now()}`,
      tenant_id: currentUser.tenant_id,
      name: form.name!.trim(),
      description: form.description?.trim() || '',
      price: Number(form.price) || 0,
      active: form.active ?? true,
      asaas_id: form.asaas_id?.trim() || undefined,
    };

    const { data, error } = await supabase.from('products').upsert(payload).select().single();

    if (error) {
      console.error('Erro ao salvar produto:', error);
      alert(`Erro ao salvar produto: ${error.message}`);
      setSaving(false);
      return;
    }

    const saved = (data as Product) || payload;
    setProducts(prev =>
      editing ? prev.map(p => (p.id === saved.id ? saved : p)) : [...prev, saved]
    );
    setSaving(false);
    closeModal();
  };

  const handleDelete = async (p: Product) => {
    if (!window.confirm(`Excluir o produto "${p.name}"? Esta ação é irreversível.`)) return;
    const { error } = await supabase.from('products').delete().eq('id', p.id);
    if (error) {
      console.error('Erro ao excluir produto:', error);
      alert(`Erro ao excluir produto: ${error.message}`);
      return;
    }
    setProducts(prev => prev.filter(x => x.id !== p.id));
  };

  const toggleActive = async (p: Product) => {
    const updated = { ...p, active: !p.active };
    setProducts(prev => prev.map(x => (x.id === p.id ? updated : x)));
    const { error } = await supabase.from('products').update({ active: updated.active }).eq('id', p.id);
    if (error) {
      console.error('Erro ao atualizar status:', error);
      setProducts(prev => prev.map(x => (x.id === p.id ? p : x))); // revert
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="bg-mcsystem-100 p-3 rounded-xl text-mcsystem-500">
            <Package size={28} />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-mcsystem-900">Produtos & Serviços</h2>
            <p className="text-gray-500 mt-1 text-sm max-w-xl">
              Cadastro do que você vende. Preparado para integração com o Asaas (cobranças e assinaturas).
            </p>
          </div>
        </div>
        <button
          onClick={openNew}
          className="px-5 py-3 bg-mcsystem-900 text-white rounded-xl font-semibold hover:bg-mcsystem-800 transition-all shadow-md flex items-center justify-center gap-2 flex-shrink-0"
        >
          <Plus size={18} /> Novo Produto
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar produto..."
          className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-200 focus:border-mcsystem-500 focus:ring-2 focus:ring-mcsystem-100 outline-none"
        />
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-16 text-center text-gray-400">
          <Package size={48} className="mx-auto mb-4 opacity-40" />
          <p className="font-medium">Nenhum produto cadastrado ainda.</p>
          <p className="text-sm mt-1">Clique em "Novo Produto" para começar.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-left uppercase text-xs tracking-wider">
                  <th className="px-6 py-4 font-semibold">Produto</th>
                  <th className="px-6 py-4 font-semibold">Preço</th>
                  <th className="px-6 py-4 font-semibold">Asaas</th>
                  <th className="px-6 py-4 font-semibold text-center">Status</th>
                  <th className="px-6 py-4 font-semibold text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-gray-800">{p.name}</div>
                      {p.description && <div className="text-gray-400 text-xs mt-0.5 max-w-md truncate">{p.description}</div>}
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-700">{formatBRL(p.price)}</td>
                    <td className="px-6 py-4">
                      {p.asaas_id ? (
                        <span className="inline-flex items-center gap-1 text-xs text-mcsystem-600 bg-mcsystem-50 px-2 py-1 rounded-md">
                          <Link2 size={12} /> {p.asaas_id}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => toggleActive(p)}
                        className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${
                          p.active ? 'text-green-700 bg-green-50 hover:bg-green-100' : 'text-gray-400 bg-gray-100 hover:bg-gray-200'
                        }`}
                      >
                        {p.active ? <CheckCircle2 size={13} /> : <Circle size={13} />}
                        {p.active ? 'Ativo' : 'Inativo'}
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(p)} className="p-2 text-gray-400 hover:text-mcsystem-600 hover:bg-mcsystem-50 rounded-lg transition-colors" title="Editar">
                          <Pencil size={16} />
                        </button>
                        <button onClick={() => handleDelete(p)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Excluir">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[200] p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg animate-in zoom-in-95 duration-300 overflow-hidden">
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex justify-between items-center">
              <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
                <Package size={20} className="text-mcsystem-500" />
                {editing ? 'Editar Produto' : 'Novo Produto'}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-200 transition-colors">
                <X size={22} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Nome *</label>
                <input
                  type="text"
                  value={form.name || ''}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 focus:border-mcsystem-500 focus:ring-2 focus:ring-mcsystem-100 outline-none"
                  placeholder="Ex: Consultoria Financeira Mensal"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Descrição</label>
                <textarea
                  value={form.description || ''}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 focus:border-mcsystem-500 focus:ring-2 focus:ring-mcsystem-100 outline-none resize-none"
                  placeholder="Detalhes do produto ou serviço"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Preço (R$)</label>
                  <div className="relative">
                    <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.price ?? 0}
                      onChange={e => setForm({ ...form, price: parseFloat(e.target.value) })}
                      className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-200 focus:border-mcsystem-500 focus:ring-2 focus:ring-mcsystem-100 outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">ID Asaas</label>
                  <input
                    type="text"
                    value={form.asaas_id || ''}
                    onChange={e => setForm({ ...form, asaas_id: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 focus:border-mcsystem-500 focus:ring-2 focus:ring-mcsystem-100 outline-none"
                    placeholder="(opcional)"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.active ?? true}
                  onChange={e => setForm({ ...form, active: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-mcsystem-600 focus:ring-mcsystem-500"
                />
                <span className="text-sm text-gray-700">Produto ativo</span>
              </label>
            </div>

            <div className="bg-gray-50 px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={closeModal} className="px-4 py-2.5 rounded-lg text-gray-600 font-medium hover:bg-gray-200 transition-colors">
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2.5 bg-mcsystem-900 text-white rounded-lg font-semibold hover:bg-mcsystem-800 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
