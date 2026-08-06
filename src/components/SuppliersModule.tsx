import React, { useMemo, useState } from 'react';
import { Supplier, FinancialRecord } from '../types';
import { supabase } from '../lib/supabaseClient';
import { Plus, Search, Pencil, Trash2, Truck, KeyRound, Landmark, Mail, Phone, Download, Loader2, CheckSquare, Square } from 'lucide-react';
import { SupplierForm } from './SupplierForm';

interface SuppliersModuleProps {
  suppliers: Supplier[];
  setSuppliers: React.Dispatch<React.SetStateAction<Supplier[]>>;
  records: FinancialRecord[];
  setRecords: React.Dispatch<React.SetStateAction<FinancialRecord[]>>;
}

/**
 * Tira da descrição da despesa o nome de quem recebeu. As despesas antigas nao
 * tem fornecedor nenhum vinculado: o nome so existe no texto livre, escrito de
 * varios jeitos ("Pix enviado para X", "X (pago por Diego)").
 */
const supplierNameFromDescription = (desc?: string): string | null => {
  let t = (desc || '').trim();
  if (!t) return null;
  t = t.replace(/^p(i|í)x\s+(enviado|recebido)\s+para\s+/i, '');
  // Código que o Asaas cola no fim: BLOCO MAIÚSCULO com números terminando em ASA.
  t = t.replace(/\s+[A-Z0-9]{12,}ASA\b/g, '');
  // Anotações entre parênteses ("(pago por Diego)", "(colaboradora PJ)").
  t = t.replace(/\s*\([^)]*\)\s*/g, ' ');
  t = t.replace(/\s{2,}/g, ' ').trim();
  if (t.length < 3) return null;
  if (/^sem descri/i.test(t)) return null;
  return t;
};

const fmtDoc = (s: Supplier) => {
  const d = (s.document || '').replace(/\D/g, '');
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return d || null;
};

export const SuppliersModule: React.FC<SuppliersModuleProps> = ({ suppliers, setSuppliers, records, setRecords }) => {
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Supplier | null | undefined>(undefined);
  const [importing, setImporting] = useState(false);

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
        <button onClick={() => setImporting(true)}
          className="px-4 py-3 bg-white border border-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 flex items-center justify-center gap-2 whitespace-nowrap">
          <Download size={18} /> Importar dos lançamentos
        </button>
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
                      <span className="inline-block text-[10px] font-bold uppercase tracking-wider text-mcsystem-600 mb-1">
                        {s.payment_method === 'BOLETO' ? 'Boleto' : s.payment_method === 'TED' ? 'Transferência' : 'PIX'}
                      </span>
                      {s.payment_method !== 'BOLETO' && s.pix_key && (
                        <div className="flex items-center gap-1.5 text-gray-600">
                          <KeyRound size={11} className="text-mcsystem-500" />
                          <span className="font-mono truncate max-w-[200px]" title={s.pix_key}>{s.pix_key}</span>
                          <span className="text-gray-400">{s.pix_key_type}</span>
                        </div>
                      )}
                      {s.payment_method !== 'BOLETO' && s.bank_code && (
                        <div className="flex items-center gap-1.5 text-gray-600 mt-0.5">
                          <Landmark size={11} className="text-gray-400" />
                          {s.bank_code} · Ag. {s.bank_agency} · C/C {s.bank_account}{s.bank_account_digit ? `-${s.bank_account_digit}` : ''}
                        </div>
                      )}
                      {s.payment_method === 'BOLETO' && <div className="text-gray-400">Linha digitável informada a cada conta</div>}
                      {s.payment_method !== 'BOLETO' && !s.pix_key && !s.bank_code && <span className="text-gray-300">Sem dados de pagamento</span>}
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

      {importing && (
        <ImportSuppliers
          suppliers={suppliers} records={records}
          onClose={() => setImporting(false)}
          onImported={(novos, vinculos) => {
            setSuppliers(l => [...l, ...novos]);
            if (vinculos.size) {
              setRecords(l => l.map(r => vinculos.has(r.id) ? { ...r, supplier_id: vinculos.get(r.id) } : r));
            }
            setImporting(false);
          }}
        />
      )}
    </div>
  );
};

/**
 * Cria fornecedores a partir das despesas já lançadas e amarra os lançamentos
 * ao fornecedor criado — assim o histórico deixa de ser texto solto.
 */
const ImportSuppliers: React.FC<{
  suppliers: Supplier[];
  records: FinancialRecord[];
  onClose: () => void;
  onImported: (novos: Supplier[], vinculos: Map<string, string>) => void;
}> = ({ suppliers, records, onClose, onImported }) => {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const candidatos = useMemo(() => {
    const existentes = new Set(suppliers.map(s => s.name.trim().toLowerCase()));
    const m = new Map<string, { name: string; ids: string[]; total: number }>();
    for (const r of records) {
      if (r.amount >= 0 || r.supplier_id) continue;
      const nome = supplierNameFromDescription(r.description);
      if (!nome) continue;
      const k = nome.toLowerCase();
      if (existentes.has(k)) continue;
      if (!m.has(k)) m.set(k, { name: nome, ids: [], total: 0 });
      const c = m.get(k)!;
      c.ids.push(r.id);
      c.total += Math.abs(r.amount || 0);
    }
    return [...m.values()].sort((a, b) => b.ids.length - a.ids.length || b.total - a.total);
  }, [records, suppliers]);

  const toggle = (name: string) => {
    setPicked(p => {
      const n = new Set(p);
      n.has(name) ? n.delete(name) : n.add(name);
      return n;
    });
  };
  const todos = picked.size === candidatos.length && candidatos.length > 0;

  const importar = async () => {
    const alvos = candidatos.filter(c => picked.has(c.name));
    if (!alvos.length) return;
    setBusy(true);
    try {
      const agora = Date.now();
      const novos: Supplier[] = alvos.map((c, i) => ({
        id: `sp${agora}${i}`,
        name: c.name,
        payment_method: 'PIX',
        status: 'Active',
      } as Supplier));

      const { data, error } = await supabase.from('suppliers').insert(novos).select();
      if (error) throw new Error(error.message);
      const criados = (data as Supplier[]) || novos;

      // Amarra as despesas de cada nome ao fornecedor recém-criado.
      const vinculos = new Map<string, string>();
      for (let i = 0; i < alvos.length; i++) {
        const sid = criados[i]?.id || novos[i].id;
        const ids = alvos[i].ids;
        alvos[i].ids.forEach(rid => vinculos.set(rid, sid));
        for (let j = 0; j < ids.length; j += 200) {
          await supabase.from('financial_records')
            .update({ supplier_id: sid }).in('id', ids.slice(j, j + 200));
        }
      }
      onImported(criados, vinculos);
      alert(`${criados.length} fornecedor(es) criado(s) e ${vinculos.size} lançamento(s) vinculado(s).\n\nAbra cada um para informar a chave PIX ou a conta.`);
    } catch (e: any) {
      alert(`Erro ao importar: ${e.message}`);
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[210] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              <Download size={18} className="text-mcsystem-500" /> Importar dos lançamentos
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Nomes tirados da descrição das despesas que ainda não têm fornecedor.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        {candidatos.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-gray-400">
            Nada a importar — todas as despesas já têm fornecedor, ou as descrições não trazem um nome reconhecível.
          </p>
        ) : (
          <>
            <div className="px-6 py-2.5 border-b border-gray-100 flex items-center justify-between bg-gray-50/60">
              <button
                onClick={() => setPicked(todos ? new Set() : new Set(candidatos.map(c => c.name)))}
                className="text-sm text-mcsystem-700 font-medium flex items-center gap-2"
              >
                {todos ? <CheckSquare size={16} /> : <Square size={16} />}
                {todos ? 'Desmarcar todos' : `Selecionar todos (${candidatos.length})`}
              </button>
              <span className="text-xs text-gray-400">{picked.size} selecionado(s)</span>
            </div>
            <ul className="flex-1 overflow-y-auto divide-y divide-gray-100">
              {candidatos.map(c => {
                const on = picked.has(c.name);
                return (
                  <li key={c.name}>
                    <button onClick={() => toggle(c.name)}
                      className={`w-full text-left px-6 py-3 flex items-center gap-3 hover:bg-gray-50 ${on ? 'bg-mcsystem-50/60' : ''}`}>
                      {on ? <CheckSquare size={17} className="text-mcsystem-600 flex-shrink-0" />
                          : <Square size={17} className="text-gray-300 flex-shrink-0" />}
                      <span className="flex-1 font-medium text-gray-800 truncate">{c.name}</span>
                      <span className="text-xs text-gray-400 whitespace-nowrap">
                        {c.ids.length} lanç. · {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(c.total)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        <div className="bg-gray-50 px-6 py-4 border-t border-gray-100 flex justify-end gap-3 flex-shrink-0">
          <button onClick={onClose} disabled={busy}
            className="px-4 py-2.5 rounded-lg text-gray-600 font-medium hover:bg-gray-200 disabled:opacity-50">Cancelar</button>
          <button onClick={importar} disabled={busy || picked.size === 0}
            className="px-5 py-2.5 bg-mcsystem-900 text-white rounded-lg font-semibold hover:bg-mcsystem-800 flex items-center gap-2 disabled:opacity-50">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            Importar {picked.size > 0 ? picked.size : ''}
          </button>
        </div>
      </div>
    </div>
  );
};
