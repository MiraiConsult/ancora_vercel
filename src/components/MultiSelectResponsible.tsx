// Componente de Seleção Múltipla de Responsáveis
// Cole este código em um novo arquivo: src/components/MultiSelectResponsible.tsx

import React, { useState, useRef, useEffect } from 'react';
import { User } from '../types';
import { Users, X, ChevronDown } from 'lucide-react';

interface MultiSelectResponsibleProps {
  users: User[];
  selectedIds: string[];
  onChange: (selectedIds: string[]) => void;
  placeholder?: string;
}

export const MultiSelectResponsible: React.FC<MultiSelectResponsibleProps> = ({
  users,
  selectedIds,
  onChange,
  placeholder = "Selecionar responsáveis"
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleUser = (userId: string) => {
    if (selectedIds.includes(userId)) {
      onChange(selectedIds.filter(id => id !== userId));
    } else {
      onChange([...selectedIds, userId]);
    }
  };

  const removeUser = (userId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(selectedIds.filter(id => id !== userId));
  };

  const selectAll = () => {
    onChange(users.map(u => u.id));
  };

  const clearAll = () => {
    onChange([]);
  };

  const selectedUsers = users.filter(u => selectedIds.includes(u.id));

  return (
    <div ref={dropdownRef} className="relative">
      {/* Botão Principal */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white hover:border-mcsystem-500 focus:ring-2 focus:ring-mcsystem-500 focus:border-mcsystem-500 transition-all flex items-center justify-between"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Users size={14} className="text-gray-400 flex-shrink-0" />
          {selectedIds.length === 0 ? (
            <span className="text-gray-400">{placeholder}</span>
          ) : selectedIds.length === users.length ? (
            <span className="text-gray-700 font-medium">Todos os responsáveis</span>
          ) : (
            <div className="flex items-center gap-1 flex-wrap">
              {selectedUsers.slice(0, 2).map(user => (
                <span
                  key={user.id}
                  className="inline-flex items-center gap-1 bg-mcsystem-100 text-mcsystem-700 px-2 py-0.5 rounded text-xs font-medium"
                >
                  {user.name}
                  <X
                    size={12}
                    className="cursor-pointer hover:text-mcsystem-900"
                    onClick={(e) => removeUser(user.id, e)}
                  />
                </span>
              ))}
              {selectedUsers.length > 2 && (
                <span className="text-xs text-gray-500 font-medium">
                  +{selectedUsers.length - 2} mais
                </span>
              )}
            </div>
          )}
        </div>
        <ChevronDown
          size={16}
          className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-2 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {/* Ações Rápidas */}
          <div className="flex items-center justify-between p-2 border-b border-gray-100">
            <button
              type="button"
              onClick={selectAll}
              className="text-xs text-mcsystem-600 hover:text-mcsystem-700 font-medium"
            >
              Selecionar todos
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="text-xs text-gray-500 hover:text-gray-700 font-medium"
            >
              Limpar
            </button>
          </div>

          {/* Lista de Usuários */}
          <div className="py-1">
            {users.map(user => {
              const isSelected = selectedIds.includes(user.id);
              return (
                <label
                  key={user.id}
                  className="flex items-center px-3 py-2 hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleUser(user.id)}
                    className="w-4 h-4 text-mcsystem-600 border-gray-300 rounded focus:ring-mcsystem-500"
                  />
                  <div className="ml-3 flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-mcsystem-100 text-mcsystem-700 flex items-center justify-center text-xs font-bold">
                      {user.avatar || user.name.substring(0, 2).toUpperCase()}
                    </div>
                    <span className="text-sm text-gray-700">{user.name}</span>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
