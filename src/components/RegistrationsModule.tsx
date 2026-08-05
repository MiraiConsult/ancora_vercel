import React, { useState } from 'react';
import { Users, Package, Tags, Building } from 'lucide-react';
import { User } from '../types';

export type RegistrationTab = 'CLIENTS' | 'PRODUCTS' | 'COA' | 'BANKS';

interface RegistrationsModuleProps {
  currentUser: User;
  /** Cada aba recebe o módulo já montado — este componente só decide qual aparece. */
  panels: Record<RegistrationTab, React.ReactNode>;
}

const TABS: { id: RegistrationTab; label: string; icon: React.ElementType; perm: string }[] = [
  { id: 'CLIENTS', label: 'Clientes', icon: Users, perm: 'companies' },
  { id: 'PRODUCTS', label: 'Produtos', icon: Package, perm: 'products' },
  { id: 'COA', label: 'Plano de Contas', icon: Tags, perm: 'finance' },
  { id: 'BANKS', label: 'Contas Bancárias', icon: Building, perm: 'lists' },
];

/**
 * Os quatro cadastros numa página só. Eram quatro itens de menu para telas que
 * o usuário percorre em sequência ao configurar o sistema.
 */
export const RegistrationsModule: React.FC<RegistrationsModuleProps> = ({ currentUser, panels }) => {
  const isAdmin = currentUser.role === 'admin';
  const visible = TABS.filter(t => isAdmin || currentUser.permissions?.[t.perm] === true);
  const [active, setActive] = useState<RegistrationTab>(visible[0]?.id || 'CLIENTS');

  if (visible.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-gray-500">
        Você não tem acesso a nenhum cadastro.
      </div>
    );
  }

  // Permissão revogada com a aba aberta: cai na primeira que ainda pode ver.
  const current = visible.some(t => t.id === active) ? active : visible[0].id;

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-200">
        <nav className="flex gap-1 -mb-px overflow-x-auto">
          {visible.map(t => {
            const Icon = t.icon;
            const on = t.id === current;
            return (
              <button
                key={t.id}
                onClick={() => setActive(t.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  on
                    ? 'border-mcsystem-500 text-mcsystem-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon size={16} className={on ? 'text-mcsystem-500' : 'text-gray-400'} />
                {t.label}
              </button>
            );
          })}
        </nav>
      </div>

      <div>{panels[current]}</div>
    </div>
  );
};
