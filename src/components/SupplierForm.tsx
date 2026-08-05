import React, { useState } from 'react';
import { Supplier } from '../types';
import { supabase } from '../lib/supabaseClient';
import { Loader2, Save, X, Truck, KeyRound, Barcode, Landmark } from 'lucide-react';

const PAY_METHODS: { key: 'PIX' | 'BOLETO' | 'TED'; label: string; icon: React.ElementType }[] = [
  { key: 'PIX', label: 'PIX', icon: KeyRound },
  { key: 'BOLETO', label: 'Boleto', icon: Barcode },
  { key: 'TED', label: 'Transferência', icon: Landmark },
];

const digits = (s?: string) => (s || '').replace(/\D/g, '');

/** Tipo da chave PIX pelo formato — evita o usuário ter que classificar. */
export const guessPixType = (key: string): Supplier['pix_key_type'] => {
  const k = (key || '').trim();
  const d = digits(k);
  if (k.includes('@')) return 'EMAIL';
  if (d.length === 11 && !k.startsWith('+')) return 'CPF';
  if (d.length === 14) return 'CNPJ';
  if (d.length >= 12 || k.startsWith('+')) return 'PHONE';
  return 'EVP';
};

const field = 'w-full px-3 py-2.5 rounded-lg border border-gray-200 outline-none focus:border-mcsystem-500 focus:ring-2 focus:ring-mcsystem-100';
const label = 'block text-sm font-medium text-gray-600 mb-1';

/**
 * Cadastro de fornecedor — usado na aba de Cadastros e também de dentro do
 * Contas a Pagar, quando o fornecedor ainda não existe.
 */
export const SupplierForm: React.FC<{
  supplier?: Supplier | null;
  onSaved: (s: Supplier) => void;
  onCancel: () => void;
  compact?: boolean;
}> = ({ supplier, onSaved, onCancel, compact = false }) => {
  const [f, setF] = useState<Supplier>(() => supplier || {
    id: '', name: '', doc_type: 'CNPJ', payment_method: 'PIX', bank_account_type: 'CONTA_CORRENTE', status: 'Active',
  } as Supplier);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<Supplier>) => setF({ ...f, ...patch });

  const save = async () => {
    if (!f.name?.trim()) return alert('Informe o nome do fornecedor.');
    const method = f.payment_method || 'PIX';
    if (method === 'PIX' && !f.pix_key?.trim()) {
      return alert('Informe a chave PIX, ou troque a forma de pagamento.');
    }
    if (method === 'TED' && !(f.bank_code && f.bank_agency && f.bank_account)) {
      return alert('Informe banco, agência e conta, ou troque a forma de pagamento.');
    }
    setSaving(true);
    try {
      const row: Supplier = {
        ...f,
        name: f.name.trim(),
        document: digits(f.document) || undefined,
        pix_key_type: f.pix_key ? (f.pix_key_type || guessPixType(f.pix_key)) : undefined,
      };
      if (supplier?.id) {
        const { tenant_id, created_at, id, ...patch } = row as any;
        const { error } = await supabase.from('suppliers').update(patch).eq('id', supplier.id);
        if (error) throw new Error(error.message);
        onSaved({ ...row, id: supplier.id });
      } else {
        const novo = { ...row, id: `sp${Date.now()}` };
        const { data, error } = await supabase.from('suppliers').insert(novo).select().single();
        if (error) throw new Error(error.message);
        onSaved((data as Supplier) || novo);
      }
    } catch (e: any) {
      alert(`Erro ao salvar fornecedor: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-2">
          <label className={label}>Nome / Razão social *</label>
          <input autoFocus value={f.name || ''} onChange={e => set({ name: e.target.value })} className={field} />
        </div>
        <div>
          <label className={label}>Situação</label>
          <select value={f.status || 'Active'} onChange={e => set({ status: e.target.value })} className={field}>
            <option value="Active">Ativo</option>
            <option value="Inactive">Inativo</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className={label}>Tipo de documento</label>
          <select value={f.doc_type || 'CNPJ'} onChange={e => set({ doc_type: e.target.value as any })} className={field}>
            <option value="CNPJ">CNPJ</option>
            <option value="CPF">CPF</option>
          </select>
        </div>
        <div>
          <label className={label}>{f.doc_type === 'CPF' ? 'CPF' : 'CNPJ'}</label>
          <input value={f.document || ''} onChange={e => set({ document: e.target.value })} className={field} />
        </div>
        <div>
          <label className={label}>Telefone</label>
          <input value={f.phone || ''} onChange={e => set({ phone: e.target.value })} placeholder="(51) 99999-9999" className={field} />
        </div>
      </div>

      <div>
        <label className={label}>E-mail</label>
        <input type="email" value={f.email || ''} onChange={e => set({ email: e.target.value })} className={field} />
      </div>

      <div className="border-t border-gray-100 pt-4">
        <p className="text-sm font-semibold text-gray-700 mb-3">Forma de pagamento</p>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {PAY_METHODS.map(m => {
            const Icon = m.icon;
            const on = (f.payment_method || 'PIX') === m.key;
            return (
              <button key={m.key} type="button" onClick={() => set({ payment_method: m.key })}
                className={`px-3 py-2.5 rounded-lg border text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                  on ? 'bg-mcsystem-50 border-mcsystem-300 text-mcsystem-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}>
                <Icon size={15} />{m.label}
              </button>
            );
          })}
        </div>

        {(f.payment_method || 'PIX') === 'PIX' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className={label}>Chave PIX *</label>
              <input value={f.pix_key || ''} onChange={e => set({ pix_key: e.target.value, pix_key_type: undefined })}
                placeholder="CPF, CNPJ, e-mail, telefone ou aleatória" className={field} />
            </div>
            <div>
              <label className={label}>Tipo da chave</label>
              <select value={f.pix_key_type || (f.pix_key ? guessPixType(f.pix_key) : '')}
                onChange={e => set({ pix_key_type: e.target.value as any })} className={field}>
                <option value="">—</option>
                {['CPF', 'CNPJ', 'EMAIL', 'PHONE', 'EVP'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
        )}

        {f.payment_method === 'BOLETO' && (
          <p className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
            Boleto não tem dado fixo para guardar — a linha digitável muda a cada conta.
            Na hora de pagar, o sistema já abre no boleto e pede o código daquela conta.
          </p>
        )}

        {f.payment_method === 'TED' && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div>
                <label className={label}>Banco *</label>
                <input value={f.bank_code || ''} onChange={e => set({ bank_code: e.target.value })} placeholder="237" className={field} />
              </div>
              <div>
                <label className={label}>Agência *</label>
                <input value={f.bank_agency || ''} onChange={e => set({ bank_agency: e.target.value })} className={field} />
              </div>
              <div>
                <label className={label}>Conta *</label>
                <input value={f.bank_account || ''} onChange={e => set({ bank_account: e.target.value })} className={field} />
              </div>
              <div>
                <label className={label}>Dígito</label>
                <input value={f.bank_account_digit || ''} onChange={e => set({ bank_account_digit: e.target.value })} className={field} />
              </div>
              <div>
                <label className={label}>Tipo</label>
                <select value={f.bank_account_type || 'CONTA_CORRENTE'} onChange={e => set({ bank_account_type: e.target.value })} className={field}>
                  <option value="CONTA_CORRENTE">Corrente</option>
                  <option value="CONTA_POUPANCA">Poupança</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              <div>
                <label className={label}>Titular da conta</label>
                <input value={f.bank_owner_name || ''} onChange={e => set({ bank_owner_name: e.target.value })}
                  placeholder="Em branco, usa o nome do fornecedor" className={field} />
              </div>
              <div>
                <label className={label}>CPF/CNPJ do titular</label>
                <input value={f.bank_owner_document || ''} onChange={e => set({ bank_owner_document: e.target.value })}
                  placeholder="Em branco, usa o documento acima" className={field} />
              </div>
            </div>
          </>
        )}
      </div>

      {!compact && (
        <div className="border-t border-gray-100 pt-4">
          <p className="text-sm font-semibold text-gray-700 mb-3">Endereço</p>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <div>
              <label className={label}>CEP</label>
              <input value={f.zip || ''} onChange={e => set({ zip: e.target.value })} className={field} />
            </div>
            <div className="md:col-span-3">
              <label className={label}>Logradouro</label>
              <input value={f.address || ''} onChange={e => set({ address: e.target.value })} className={field} />
            </div>
            <div>
              <label className={label}>Número</label>
              <input value={f.address_number || ''} onChange={e => set({ address_number: e.target.value })} className={field} />
            </div>
            <div>
              <label className={label}>Compl.</label>
              <input value={f.complement || ''} onChange={e => set({ complement: e.target.value })} className={field} />
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
            <div>
              <label className={label}>Bairro</label>
              <input value={f.district || ''} onChange={e => set({ district: e.target.value })} className={field} />
            </div>
            <div>
              <label className={label}>Cidade</label>
              <input value={f.city || ''} onChange={e => set({ city: e.target.value })} className={field} />
            </div>
            <div>
              <label className={label}>UF</label>
              <input value={f.state || ''} onChange={e => set({ state: e.target.value })} maxLength={2} className={field} />
            </div>
          </div>
          <div className="mt-3">
            <label className={label}>Observações</label>
            <textarea value={f.notes || ''} onChange={e => set({ notes: e.target.value })} rows={2} className={`${field} resize-none`} />
          </div>
        </div>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <button onClick={onCancel} disabled={saving}
          className="px-4 py-2.5 rounded-lg text-gray-600 font-medium hover:bg-gray-100 disabled:opacity-50">Cancelar</button>
        <button onClick={save} disabled={saving}
          className="px-5 py-2.5 bg-mcsystem-900 text-white rounded-lg font-semibold hover:bg-mcsystem-800 flex items-center gap-2 disabled:opacity-50">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {supplier?.id ? 'Salvar' : 'Cadastrar fornecedor'}
        </button>
      </div>
    </div>
  );
};

/** O formulário dentro de um modal — usado quando se cadastra na hora de pagar. */
export const SupplierModal: React.FC<{
  supplier?: Supplier | null;
  onSaved: (s: Supplier) => void;
  onClose: () => void;
  compact?: boolean;
}> = ({ supplier, onSaved, onClose, compact }) => (
  <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[210] flex items-center justify-center p-4">
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="bg-mcsystem-50 text-mcsystem-700 p-2 rounded-lg"><Truck size={18} /></div>
          <h3 className="font-bold text-gray-900">{supplier?.id ? 'Editar fornecedor' : 'Novo fornecedor'}</h3>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
      </div>
      <div className="p-6 overflow-y-auto">
        <SupplierForm supplier={supplier} onSaved={onSaved} onCancel={onClose} compact={compact} />
      </div>
    </div>
  </div>
);
