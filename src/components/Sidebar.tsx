

import React from 'react';
import {
  UserCog, LogOut, Database, ChevronsLeft, Zap, X,
  LayoutDashboard, ArrowRightLeft, FileText, Tags, Boxes,
  FileBarChart,
} from 'lucide-react';
import { User } from '../types';
import { isAsaasEnabled } from '../config';
import { CompanySwitcher } from './CompanySwitcher';

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  currentUser: User;
  onLogout: () => void;
  pendingValidationCount?: number;
  isCollapsed: boolean;
  onToggle: () => void;
  /** Gaveta aberta no celular. Acima de lg o menu é fixo e isso não vale. */
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentPage, onNavigate, currentUser, onLogout, pendingValidationCount = 0, isCollapsed, onToggle, mobileOpen = false, onCloseMobile }) => {
  const isAdmin = currentUser.role === 'admin';
  // Recolhido é um estado de desktop. Na gaveta o menu é largo, então mostrar
  // só ícones ali deixaria uma faixa de 256px com o conteúdo de 80px.
  const collapsed = isCollapsed && !mobileOpen;

  // Menu agrupado — o sistema inteiro é financeiro, então a navegação é por
  // atividade (operação, relatórios, cadastros) em vez de um item "financeiro".
  const menuGroups: { section?: string; items: any[] }[] = [
    {
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, perm: 'dashboard' },
      ],
    },
    {
      section: 'Operação',
      items: [
        { id: 'entries', label: 'Lançamentos & Caixa', icon: ArrowRightLeft, perm: 'finance' },
        ...(isAsaasEnabled(currentUser.tenant_id) ? [{ id: 'billing', label: 'Cobranças', icon: Zap, perm: 'billing' }] : []),
      ],
    },
    {
      section: 'Relatórios',
      items: [
        { id: 'reports', label: 'Relatórios', icon: FileBarChart, perm: 'finance' },
        { id: 'systems', label: 'Sistemas', icon: Boxes, perm: 'finance' },
        { id: 'dre', label: 'DRE Gerencial', icon: FileText, perm: 'finance' },
      ],
    },
    {
      section: 'Cadastros',
      items: [
        // Clientes, Produtos, Plano de Contas e Contas Bancárias moram numa
        // página só, em abas — eram quatro itens de menu para telas que o
        // usuário percorre em sequência.
        { id: 'registrations', label: 'Cadastros', icon: Tags, perms: ['companies', 'products', 'lists', 'finance'] },
      ],
    },
    {
      section: 'Sistema',
      items: [
        { id: 'database', label: 'Exportar Dados', icon: Database, perm: 'database' },
        { id: 'settings', label: 'Configurações', icon: UserCog, perm: 'settings', adminOnly: true },
      ],
    },
  ];

  const canSee = (item: any) => {
    if (isAdmin) return true;
    if (item.adminOnly) return false;
    // Item que agrupa várias telas aparece com qualquer uma das permissões.
    if (item.perms) return item.perms.some((p: string) => currentUser.permissions?.[p] === true);
    return currentUser.permissions?.[item.perm] === true;
  };

  return (
    <div className={`bg-mcsystem-900 text-white h-screen fixed left-0 top-0 flex flex-col z-50 transition-all duration-300 ease-in-out
      ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0
      ${collapsed ? 'lg:w-20 w-64' : 'w-64'}`}>
      
      <button
        onClick={onToggle}
        className="hidden lg:flex absolute top-7 -right-3 transform w-6 h-6 bg-white border border-[rgba(11,20,11,0.12)] rounded-full items-center justify-center text-mirai-muted hover:text-mirai-ink z-[51] transition-all duration-300"
        title={collapsed ? "Expandir menu" : "Minimizar menu"}
      >
        <ChevronsLeft size={16} className={`transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`} />
      </button>

      <div className={`p-6 flex flex-col items-center justify-center bg-mcsystem-900 relative transition-all duration-300 ${collapsed ? 'py-6' : ''}`}>

        {/* Logo Area */}
        <button onClick={onCloseMobile} className="lg:hidden absolute top-4 right-4 z-20 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-mcsystem-800" title="Fechar menu">
          <X size={18} />
        </button>
        <div className="cursor-pointer flex items-center gap-3 mb-1 relative z-10 w-full" onClick={() => onNavigate('dashboard')}>
          <div className="h-10 w-10 bg-mirai-lime text-mirai-ink rounded-xl flex-shrink-0 flex items-center justify-center font-display font-bold text-lg">M</div>
          {!collapsed && (
          <div className="transition-opacity duration-200 min-w-0">
             <h1 className="font-display text-lg font-semibold tracking-tight text-white leading-none">Mirai <span className="text-mirai-lime">Finance</span></h1>
             <p className="text-[11px] text-[#9aa89c] mt-1 tracking-wide">MirAI Consult</p>
          </div>
          )}
        </div>
      </div>

      <nav className="flex-1 py-5 overflow-y-auto">
        {menuGroups.map((group, gi) => {
          const visible = group.items.filter(canSee);
          if (visible.length === 0) return null;
          return (
            <div key={gi} className={gi > 0 ? 'mt-5' : ''}>
              {group.section && !collapsed && (
                <p className="px-6 mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8a978c]">{group.section}</p>
              )}
              {group.section && collapsed && <div className="mx-4 mb-2 h-px bg-mcsystem-800" />}
              <ul className="space-y-1 px-3">
                {visible.map(item => {
                  const Icon = item.icon;
                  const isActive = currentPage === item.id;
                  return (
                    <li key={item.id} title={collapsed ? item.label : undefined}>
                      <button
                        onClick={() => onNavigate(item.id)}
                        className={`w-full flex items-center px-4 h-11 rounded-xl transition-all duration-200 group ${collapsed ? 'justify-center' : 'justify-between'}
                          ${isActive
                            ? 'bg-mirai-lime text-mirai-ink font-semibold'
                            : 'text-[#d3ddd4] hover:text-white hover:bg-mcsystem-800'
                          }`}
                      >
                        <div className="flex items-center min-w-0">
                          <Icon size={18} className={`transition-colors flex-shrink-0 ${collapsed ? '' : 'mr-3'} ${isActive ? 'text-mirai-ink' : 'text-[#8a978c] group-hover:text-white'}`} />
                          {!collapsed && <span className="text-sm truncate">{item.label}</span>}
                        </div>
                        {!collapsed && item.badge > 0 && (
                          <span className="bg-red-500 text-white text-[10px] font-bold rounded-full h-5 min-w-[20px] px-1 flex items-center justify-center shadow-sm flex-shrink-0">
                            {item.badge}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="p-4 bg-mcsystem-900 mt-auto">
         <div className="mb-3">
           <CompanySwitcher currentTenantId={currentUser.tenant_id} collapsed={collapsed} />
         </div>
         <div className={`flex items-center rounded-2xl bg-white/5 transition-all duration-300 ${collapsed ? 'p-2 justify-center' : 'px-3 py-3'}`}>
            <div className={`h-9 w-9 bg-[#2a3a2b] rounded-full flex items-center justify-center text-xs font-semibold text-mirai-lime flex-shrink-0 ${collapsed ? '' : 'mr-3'}`}>
                {currentUser.avatar || 'US'}
            </div>
            {!collapsed && (
            <div className="overflow-hidden flex-1">
                <p className="text-sm font-semibold text-white truncate">{currentUser.name}</p>
                <p className="text-[11px] text-[#9aa89c] truncate">{currentUser.role === 'admin' ? 'Administrador' : 'Colaborador'}</p>
            </div>
            )}
         </div>
        <button onClick={onLogout} title={collapsed ? "Sair do Sistema" : undefined} className={`flex items-center justify-center text-[#9aa89c] hover:text-white hover:bg-white/5 transition-all w-full text-xs font-medium mt-3 rounded-xl ${collapsed ? 'h-9 w-9' : 'px-3 py-2'}`}>
          <LogOut size={14} className={collapsed ? '' : 'mr-2'} />
          {!collapsed && 'Sair do Sistema'}
        </button>
      </div>
    </div>
  );
};