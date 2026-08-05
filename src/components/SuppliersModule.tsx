import React, { useMemo, useState } from 'react';
import { Supplier } from '../types';
import { supabase } from '../lib/supabaseClient';
import { Plus, Search, Pencil, Trash2, Truck, KeyRound, Landmark, Mail, Phone } from 'lucide-react';
import { SupplierForm } from './SupplierForm';

interface SuppliersModuleProps {
  suppliers: Supplier[];
  setSuppliers: React.Dispatch<React.SetStateAction<Supplier[]>>;
}

const fmtDoc = (s: Supplier) => {
  const d = (s.document || '').replace(/\D/g, '');
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return d || null;
};

export const SuppliersModule: React.FC<SuppliersModuleProps> = ({ suppliers, setSuppliers }) => {
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Supplier | null | undefined>(undefined);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...suppliers]
      .filter(s => !q
        || s.name.toLowerCase().includes(q)
        || (s.document || '').includes(q.replace(/\D/g, ''))
        || (s.email || '').toLowerCase().includes(q)
        || (s.pix_key || '').toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [suppliers, search]);

  const remove = async (s: Supplier) => {
    if (!confirm(`Excluir o fornecedor "${s.name}"?\n\nAs despesas dele continuam no sistema, apenas sem o vínculo.`)) return;
    const prev = suppliers;
    setSuppliers(l => l.filter(x => x.id !== s.id));
    const { error } = await supabase.from('suppliers').delete().eq('id', s.id);
    if (error) {
      setSuppliers(prev);
      alert('Erro ao excluir: ' + error.message);
    }
  };

  const onSaved = (s: Supplier) => {
    setSuppliers(l => l.some(x => x.id === s.id) ? l.map(x => x.id === s.id ? s : x) : [...l, s]);
    setEditing(undefined);
  };

  // editing === undefined: lista. null: novo. objeto: edição.
  if (editing !== undefined) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200/80 p-6">
        <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Truck size={18} className="text-mcsystem-500" />
          {editing ? 'Editar fornecedor' : 'Novo fornecedor'}
        </h3>
        <SupplierForm supplier={editing} onSaved={onSaved} onCancel={() => setEditing(undefined)} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome, documento, e-mail ou chave PIX..."
            className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-200 outline-none focus:border-mcsystem-500 focus:ring-2 focus:ring-mcsystem-100"
          />
        </div>
        <button onClick={() => setEditing(null)}
          className="px-5 py-3 bg-mcsystem-900 text-white rounded-xl font-semibold hover:bg-mcsystem-800 flex items-center justify-center gap-2 whitespace-nowrap">
          <Plus size={18} /> Novo fornecedor
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200/80 overflow-hidden">
        {list.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <Truck size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">{search ? 'Nenhum fornecedor encontrado.' : 'Nenhum fornecedor cadastrado ainda.'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 uppercase text-[11px] tracking-wider">
                  <th className="px-6 py-3 text-left font-semibold">Fornecedor</th>
                  <th className="px-4 py-3 text-left font-semibold">Contato</th>
                  <th className="px-4 py-3 text-left font-semibold">Pagamento</th>
                  <th className="px-4 py-3 text-center font-semibold">Situação</th>
                  <th className="px-6 py-3 text-center font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {list.map(s => (
                  <tr key={s.id} className="hover:bg-gray-50/70">
                    <td className="px-6 py-3">
                      <div className="font-semibold text-gray-900">{s.name}</div>
                      {fmtDoc(s) && <div className="text-xs text-gray-400 mt-0.5">{s.doc_type || 'Doc'}: {fmtDoc(s)}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {s.email && <div className="flex items-center gap-1.5"><Mail size={11} /> {s.email}</div>}
                      {s.phone && <div className="flex items-center gap-1.5 mt-0.5"><Phone size={11} /> {s.phone}</div>}
                      {!s.email && !s.phone && <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {s.pix_key && (
                        <div className="flex items-center gap-1.5 text-gray-600">
                          <KeyRound size={11} className="text-mcsystem-500" />
                          <span className="font-mono truncate max-w-[200px]" title={s.pix_key}>{s.pix_key}</span>
                          <span className="text-gray-400">{s.pix_key_type}</span>
                        </div>
                      )}
                      {s.bank_code && (
                        <div className="flex items-center gap-1.5 text-gray-600 mt-0.5">
                          <Landmark size={11} className="text-gray-400" />
                          {s.bank_code} · Ag. {s.bank_agency} · C/C {s.bank_account}{s.bank_account_digit ? `-${s.bank_account_digit}` : ''}
                        </div>
                      )}
                      {!s.pix_key && !s.bank_code && <span className="text-gray-300">Sem dados de pagamento</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-[11px] font-semibold px-2 py-1 rounded-full ${
                        (s.status || 'Active') === 'Active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {(s.status || 'Active') === 'Active' ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => setEditing(s)} title="Editar"
                          className="p-2 text-gray-400 hover:text-mcsystem-600 hover:bg-mcsystem-50 rounded-lg"><Pencil size={16} /></button>
                        <button onClick={() => remove(s)} title="Excluir"
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
