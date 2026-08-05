import React, { useEffect, useRef, useState } from 'react';
import { Building2, Check, ChevronsUpDown, Loader2, Search } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { TenantOption } from '../types';

/**
 * Troca a empresa ativa. O RLS lê o tenant do JWT, então a troca só vale depois
 * que o token é reemitido — daí o refreshSession antes de recarregar. Sem isso a
 * tela mudaria de nome mas continuaria trazendo os dados da empresa anterior.
 */
export const CompanySwitcher: React.FC<{
  currentTenantId?: string;
  collapsed?: boolean;
}> = ({ currentTenantId, collapsed = false }) => {
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.rpc('my_tenants').then(({ data, error }) => {
      if (!error && data) setTenants(data as TenantOption[]);
    });
  }, [currentTenantId]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [open]);

  // Uma empresa só: o seletor viraria enfeite.
  if (tenants.length <= 1) return null;

  const current = tenants.find(t => t.id === currentTenantId);
  const shown = tenants.filter(t => t.name.toLowerCase().includes(q.trim().toLowerCase()));

  const pick = async (t: TenantOption) => {
    if (t.id === currentTenantId || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc('switch_tenant', { p_tenant_id: t.id });
      if (error) throw new Error(error.message);
      // Reemite o token com o novo tenant antes de recarregar os dados.
      const { error: refreshErr } = await supabase.auth.refreshSession();
      if (refreshErr) {
        alert('Empresa trocada, mas a sessão precisa ser renovada. Entre novamente.');
        await supabase.auth.signOut();
      }
      window.location.reload();
    } catch (e: any) {
      alert(`Não foi possível trocar de empresa: ${e.message}`);
      setBusy(false);
    }
  };

  return (
    <div className="relative" ref={boxRef}>
      <button
        onClick={() => setOpen(o => !o)}
        disabled={busy}
        title={collapsed ? (current?.name || 'Trocar empresa') : undefined}
        className={`w-full flex items-center gap-2 rounded-lg bg-mcsystem-800/40 border border-mcsystem-800 hover:bg-mcsystem-800 transition-colors disabled:opacity-60 ${
          collapsed ? 'justify-center p-2' : 'px-3 py-2'
        }`}
      >
        {busy
          ? <Loader2 size={16} className="animate-spin text-mcsystem-400 flex-shrink-0" />
          : <Building2 size={16} className="text-mcsystem-400 flex-shrink-0" />}
        {!collapsed && (
          <>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 leading-none">Empresa</p>
              <p className="text-sm font-semibold text-white truncate leading-tight mt-0.5">
                {current?.name || 'Selecionar'}
              </p>
            </div>
            <ChevronsUpDown size={14} className="text-gray-500 flex-shrink-0" />
          </>
        )}
      </button>

      {open && !busy && (
        <div className={`absolute z-[60] bottom-full mb-2 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden ${
          collapsed ? 'left-0 w-64' : 'left-0 right-0'
        }`}>
          {tenants.length > 6 && (
            <div className="p-2 border-b border-gray-100">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  autoFocus value={q} onChange={e => setQ(e.target.value)}
                  placeholder="Buscar empresa..."
                  className="w-full pl-8 pr-2 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:border-mcsystem-500"
                />
              </div>
            </div>
          )}
          <div className="max-h-72 overflow-y-auto py-1">
            {shown.map(t => {
              const on = t.id === currentTenantId;
              return (
                <button
                  key={t.id} onClick={() => pick(t)}
                  className={`w-full text-left px-3 py-2 flex items-center gap-2 text-sm hover:bg-gray-50 ${on ? 'bg-mcsystem-50' : ''}`}
                >
                  <Building2 size={15} className={on ? 'text-mcsystem-600' : 'text-gray-400'} />
                  <span className={`flex-1 truncate ${on ? 'font-semibold text-mcsystem-700' : 'text-gray-700'}`}>{t.name}</span>
                  {t.role === 'admin' && <span className="text-[10px] text-gray-400 uppercase">admin</span>}
                  {on && <Check size={14} className="text-mcsystem-600" />}
                </button>
              );
            })}
            {shown.length === 0 && <p className="px-3 py-4 text-xs text-gray-400 text-center">Nenhuma empresa encontrada.</p>}
          </div>
        </div>
      )}
    </div>
  );
};
