

import React from 'react';
import { LayoutDashboard, Users, PieChart, DollarSign, BarChart3, Contact, UserCog, LogOut, List, CalendarClock, Bell, HelpCircle, Database, ChevronsLeft, Award } from 'lucide-react';
import { User } from '../types';

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  currentUser: User;
  onLogout: () => void;
  unreadCount: number;
  isCollapsed: boolean;
  onToggle: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentPage, onNavigate, currentUser, onLogout, unreadCount, isCollapsed, onToggle }) => {
  const isAdmin = currentUser.role === 'admin';

  const menuItems = [
    { id: 'dashboard', label: 'Visão Geral', icon: LayoutDashboard, restricted: false },
    { id: 'deals', label: 'Negociações', icon: BarChart3, restricted: false },
    { id: 'finance', label: 'Gestão Financeira', icon: DollarSign, restricted: true },
    { id: 'companies', label: 'Clientes', icon: Users, restricted: false },
    { id: 'appointments', label: 'Compromissos', icon: CalendarClock, restricted: false },
    { id: 'alerts', label: 'Alertas', icon: Bell, restricted: false, badge: unreadCount > 0 ? unreadCount : 0 },
    { id: 'tutorials', label: 'Tutoriais', icon: HelpCircle, restricted: false },
    { id: 'lists', label: 'Cadastros', icon: List, restricted: true },
    { id: 'analysis', label: 'Dashboard', icon: PieChart, restricted: false },
    { id: 'performance', label: 'Performance', icon: Award, restricted: true },
    { id: 'database', label: 'Banco de Dados', icon: Database, restricted: true },
    { id: 'settings', label: 'Configurações', icon: UserCog, restricted: true },
  ];

  return (
    <div className={`bg-mcsystem-900 text-white h-screen fixed left-0 top-0 flex flex-col shadow-2xl z-50 transition-all duration-300 ease-in-out ${isCollapsed ? 'w-20' : 'w-64'}`}>
      
      <button
        onClick={onToggle}
        className="absolute top-6 -right-3 transform w-6 h-6 bg-white border-2 border-gray-200 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-mcsystem-500 z-[51] transition-all duration-300"
        title={isCollapsed ? "Expandir menu" : "Minimizar menu"}
      >
        <ChevronsLeft size={16} className={`transition-transform duration-300 ${isCollapsed ? 'rotate-180' : ''}`} />
      </button>

      <div className={`p-6 border-b border-mcsystem-800 flex flex-col items-center justify-center bg-mcsystem-900 relative overflow-hidden transition-all duration-300 ${isCollapsed ? 'py-6' : ''}`}>
        {/* Decorative element */}
        <div className="absolute -top-10 -right-10 w-24 h-24 bg-mcsystem-800 rounded-full opacity-50 blur-xl"></div>
        
        {/* Logo Area */}
        <div className="cursor-pointer flex items-center gap-3 mb-1 relative z-10 w-full" onClick={() => onNavigate('dashboard')}>
          <div className="h-9 w-9 bg-mcsystem-500 rounded-lg flex-shrink-0 shadow-lg shadow-mcsystem-500/30 flex items-center justify-center font-bold text-lg">⚓</div>
          {!isCollapsed && (
          <div className="transition-opacity duration-200">
             <h1 className="text-xl font-bold tracking-tight text-white leading-none">Ancóra</h1>
          </div>
          )}
        </div>
      </div>

      <nav className="flex-1 py-6 overflow-y-auto">
        <ul className="space-y-1 px-3">
          {menuItems.map((item) => {
            let hasPermission = false;
            if (isAdmin) {
                hasPermission = true;
            } else {
                // For collaborators, check permissions object if it exists.
                // If it doesn't exist, fall back to the default 'restricted' flag.
                if (currentUser.permissions) {
                    hasPermission = !!currentUser.permissions[item.id];
                } else {
                    hasPermission = !item.restricted;
                }
            }

            if (!hasPermission) return null;

            const Icon = item.icon;
            const isActive = currentPage === item.id;
            return (
              <li key={item.id} title={isCollapsed ? item.label : undefined}>
                <button
                  onClick={() => onNavigate(item.id)}
                  className={`w-full flex items-center px-4 py-3 rounded-lg transition-all duration-200 group ${isCollapsed ? 'justify-center' : 'justify-between'}
                    ${isActive
                      ? 'text-white bg-mcsystem-800 shadow-md border border-mcsystem-700'
                      : 'text-gray-400 hover:text-white hover:bg-mcsystem-800/50 border border-transparent'
                    }`}
                >
                  <div className="flex items-center">
                    <Icon size={18} className={`transition-colors ${isCollapsed ? '' : 'mr-3'} ${isActive ? 'text-mcsystem-500' : 'text-gray-500 group-hover:text-gray-300'}`} />
                    {!isCollapsed && <span className="text-sm font-medium tracking-wide">{item.label}</span>}
                  </div>
                  {!isCollapsed && item.badge && item.badge > 0 && (
                    <span className="bg-red-500 text-white text-[10px] font-bold rounded-full h-5 w-5 flex items-center justify-center shadow-sm">
                      {item.badge}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="p-4 border-t border-mcsystem-800 bg-mcsystem-900 mt-auto">
         <div className={`flex items-center rounded-lg bg-mcsystem-800/30 border border-mcsystem-800 backdrop-blur-sm transition-all duration-300 ${isCollapsed ? 'p-2 justify-center' : 'px-3 py-3'}`}>
            <div className={`h-9 w-9 bg-gradient-to-br from-mcsystem-500 to-blue-600 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-lg ring-2 ring-mcsystem-900 flex-shrink-0 ${isCollapsed ? '' : 'mr-3'}`}>
                {currentUser.avatar || 'US'}
            </div>
            {!isCollapsed && (
            <div className="overflow-hidden flex-1">
                <p className="text-sm font-semibold text-white truncate">{currentUser.name}</p>
                <p className="text-[10px] text-gray-400 truncate uppercase tracking-wider">{currentUser.role === 'admin' ? 'Administrador' : 'Colaborador'}</p>
            </div>
            )}
         </div>
        <button onClick={onLogout} title={isCollapsed ? "Sair do Sistema" : undefined} className={`flex items-center justify-center text-gray-400 hover:text-white hover:bg-red-500/10 hover:border-red-500/20 border border-transparent transition-all w-full text-xs font-medium mt-3 rounded-md uppercase tracking-wider ${isCollapsed ? 'h-9 w-9' : 'px-3 py-2'}`}>
          <LogOut size={14} className={isCollapsed ? '' : 'mr-2'} />
          {!isCollapsed && 'Sair do Sistema'}
        </button>
      </div>
    </div>
  );
};