import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Building2, Loader2, Plus, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { User } from '../types';

interface Member { user_id: string; email: string; name: string; role: string }

/**
 * Quem acessa ESTA empresa. Um admin só administra a empresa ativa dele — para
 * liberar outra, precisa trocar para ela antes. É o que impede alguém de
 * conceder acesso a uma empresa que não administra.
 */
export const TenantAccessPanel: React.FC<{
  currentUser: User;
  tenantName?: string;
}> = ({ currentUser, tenantName }) => {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('collaborator');
  const [busy, setBusy] = useState(false);
  const [requireApproval, setRequireApproval] = useState(false);

  const toggleApproval = async (on: boolean) => {
    setRequireApproval(on);
    const { error } = await supabase.from('organization_settings')
      .update({ require_payment_approval: on }).eq('id', currentUser.tenant_id);
    if (error) {
      setRequireApproval(!on);
      alert('Não foi possível alterar: ' + error.message);
    }
  };

  const load = async () => {
    if (!currentUser.tenant_id) return;
    setLoading(true);
    const [acc, cfg] = await Promise.all([
      supabase.rpc('tenant_access_list', { p_tenant_id: currentUser.tenant_id }),
      supabase.from('organization_settings')
        .select('require_payment_approval').eq('id', currentUser.tenant_id).maybeSingle(),
    ]);
    if (acc.error) console.warn('tenant_access_list:', acc.error.message);
    setMembers((acc.data as Member[]) || []);
    setRequireApproval(!!cfg.data?.require_payment_approval);
    setLoading(false);
  };

  useEffect(() => { load(); }, [currentUser.tenant_id]);

  const grant = async () => {
    if (!email.trim()) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc('grant_tenant_access', {
        p_email: email.trim(), p_tenant_id: currentUser.tenant_id, p_role: role,
      });
      if (error) throw new Error(error.message);
      setEmail('');
      await load();
    } catch (e: any) {
      alert(`Não foi possível liberar o acesso: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (m: Member) => {
    if (!confirm(`Remover o acesso de ${m.name} a ${tenantName || 'esta empresa'}?\n\nOs dados dele nas outras empresas não mudam.`)) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc('revoke_tenant_access', {
        p_user_id: m.user_id, p_tenant_id: currentUser.tenant_id,
      });
      if (error) throw new Error(error.message);
      await load();
    } catch (e: any) {
      alert(`Não foi possível remover: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  if (currentUser.role !== 'admin') return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-200/80 overflow-hidden">
      <div className="px-6 py-5 border-b border-gray-100 flex items-start gap-3">
        <div className="bg-mcsystem-50 text-mcsystem-700 p-2.5 rounded-xl"><Building2 size={20} /></div>
        <div className="flex-1">
          <h3 className="font-bold text-gray-900">Acesso a esta empresa</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            Quem pode entrar em <b>{tenantName || 'esta empresa'}</b>. Uma pessoa com mais de uma
            empresa troca pelo seletor no rodapé do menu.
          </p>
        </div>
      </div>

      <div className="px-6 py-4 bg-gray-50/60 border-b border-gray-100 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[220px]">
          <label className="block text-xs font-medium text-gray-500 mb-1">E-mail de quem já usa o sistema</label>
          <input
            value={email} onChange={e => setEmail(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') grant(); }}
            placeholder="pessoa@empresa.com"
            className="w-full px-3 py-2.5 rounded-lg border border-gray-200 outline-none focus:border-mcsystem-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Papel</label>
          <select value={role} onChange={e => setRole(e.target.value)}
            className="px-3 py-2.5 rounded-lg border border-gray-200 bg-white outline-none focus:border-mcsystem-500">
            <option value="collaborator">Colaborador</option>
            <option value="admin">Administrador</option>
          </select>
        </div>
        <button onClick={grant} disabled={busy || !email.trim()}
          className="px-4 py-2.5 bg-mcsystem-900 text-white rounded-lg font-semibold hover:bg-mcsystem-800 flex items-center gap-2 disabled:opacity-50">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Liberar acesso
        </button>
      </div>

      {loading ? (
        <p className="px-6 py-8 text-center text-sm text-gray-400">Carregando...</p>
      ) : members.length === 0 ? (
        <p className="px-6 py-8 text-center text-sm text-gray-400">Ninguém liberado ainda.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {members.map(m => (
            <li key={m.user_id} className="px-6 py-3.5 flex items-center gap-3 hover:bg-gray-50/70">
              <div className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500 flex-shrink-0">
                {(m.name || m.email).slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 truncate">{m.name}</p>
                <p className="text-xs text-gray-400 truncate">{m.email}</p>
              </div>
              <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full flex items-center gap-1 ${
                m.role === 'admin' ? 'bg-mcsystem-50 text-mcsystem-700' : 'bg-gray-100 text-gray-600'
              }`}>
                {m.role === 'admin' && <ShieldCheck size={12} />}
                {m.role === 'admin' ? 'Administrador' : 'Colaborador'}
              </span>
              <button
                onClick={() => revoke(m)}
                disabled={busy || m.user_id === currentUser.id}
                title={m.user_id === currentUser.id ? 'Você não pode remover o próprio acesso' : 'Remover acesso a esta empresa'}
                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/60 flex items-start gap-3">
        <ShieldCheck size={18} className="text-gray-400 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-800">Exigir autorização para pagar</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Ligado, todo pagamento pelo Asaas fica parado em <b>Autorizações</b> até um administrador
            aprovar — o dinheiro não sai antes disso, e não é preciso entrar no Asaas para liberar.
          </p>
        </div>
        <label className="flex items-center gap-2 cursor-pointer flex-shrink-0">
          <input type="checkbox" checked={requireApproval} onChange={e => toggleApproval(e.target.checked)}
            className="rounded border-gray-300 text-mcsystem-600 focus:ring-mcsystem-500 h-4 w-4" />
          <span className="text-sm text-gray-700">{requireApproval ? 'Ligado' : 'Desligado'}</span>
        </label>
      </div>

      <p className="px-6 py-3 border-t border-gray-100 text-xs text-gray-400 flex items-start gap-2">
        <UserPlus size={13} className="mt-0.5 flex-shrink-0" />
        Só dá para liberar quem já tem login no sistema. Alguém de fora precisa antes ser
        cadastrado como colaborador, ali em cima.
      </p>
    </div>
  );
};
