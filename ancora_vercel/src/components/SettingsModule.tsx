
import React, { useState, useEffect } from 'react';
import { User, Tenant } from '../types';
import { Building, Save, HelpCircle, Users, Plus, X, Shield, Lock, Trash2, Edit } from 'lucide-react';

interface SettingsModuleProps {
  tenant: Tenant | null;
  users: User[];
  onAddUser: (user: User) => Promise<void>;
  onUpdateUser: (user: User) => Promise<void>;
  onDeleteUser: (userId: string) => Promise<void>;
  onUpdateTenant: (tenantData: Partial<Tenant>) => Promise<void>;
  onOpenHelp: (title: string, content: React.ReactNode) => void;
  currentUser: User;
}

const permissionableModules = [
  { id: 'dashboard', label: 'Visão Geral' },
  { id: 'deals', label: 'Negociações' },
  { id: 'finance', label: 'Gestão Financeira' },
  { id: 'companies', label: 'Clientes' },
  { id: 'appointments', label: 'Compromissos' },
  { id: 'alerts', label: 'Alertas' },
  { id: 'tutorials', label: 'Tutoriais' },
  { id: 'lists', label: 'Cadastros' },
  { id: 'analysis', label: 'Dashboard' },
  { id: 'database', label: 'Banco de Dados' },
];

export const SettingsModule: React.FC<SettingsModuleProps> = ({ tenant, users, onAddUser, onUpdateUser, onDeleteUser, onUpdateTenant, onOpenHelp, currentUser }) => {
  const [tenantData, setTenantData] = useState<Partial<Tenant>>({});
  const [isSaving, setIsSaving] = useState(false);
  
  // State for Manage User Modal
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<Partial<User>>({ name: '', email: '', password: '', role: 'collaborator', permissions: {} });
  const [isProcessingUser, setIsProcessingUser] = useState(false);

  useEffect(() => {
    if (tenant) {
      setTenantData(tenant);
    }
  }, [tenant]);

  const handleHelpClick = () => {
    onOpenHelp("Guia Rápido: Configurações", (
      <ul className="space-y-4 text-sm text-gray-600 list-disc pl-5 leading-relaxed">
        <li>
          <strong>Informações da Empresa:</strong> Nesta seção, você pode atualizar os dados cadastrais da sua empresa, como nome e site. Essas informações são usadas em relatórios e outras partes do sistema.
        </li>
        <li>
          <strong>Colaboradores e Acessos:</strong> Aqui você gerencia os usuários que têm acesso ao sistema. Clique em "Adicionar Colaborador" para convidar novos membros para sua equipe.
        </li>
        <li>
          <strong>Níveis de Acesso:</strong> Existem dois níveis: 'Administrador' (acesso total) e 'Colaborador', onde você pode definir permissões específicas para cada módulo do sistema.
        </li>
      </ul>
    ));
  };

  const handleTenantSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    await onUpdateTenant(tenantData);
    setIsSaving(false);
  };

  const handleTenantChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setTenantData({ ...tenantData, [e.target.name]: e.target.value });
  };
  
  const openUserModal = (user: User | null) => {
      if (user) {
          setEditingUser(user);
          setUserData({ ...user, permissions: user.permissions || {} });
      } else {
          setEditingUser(null);
          setUserData({ name: '', email: '', password: '', role: 'collaborator', permissions: {} });
      }
      setIsUserModalOpen(true);
  };

  const handleUserChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const { name, value } = e.target;
      setUserData(prev => ({ ...prev, [name]: value }));
  };

  const handlePermissionChange = (moduleId: string) => {
    setUserData(prev => {
        const currentPermissions = prev.permissions || {};
        return {
            ...prev,
            permissions: {
                ...currentPermissions,
                [moduleId]: !currentPermissions[moduleId],
            }
        };
    });
  };

  const handleUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessingUser(true);
    if (editingUser) {
        await onUpdateUser(userData as User);
    } else {
        await onAddUser(userData as User);
    }
    setIsProcessingUser(false);
    setIsUserModalOpen(false);
  };


  return (
    <div className="space-y-8 pb-10">
      <div className="flex justify-between items-start">
        <div>
            <h2 className="text-2xl font-bold text-gray-800">Configurações Gerais</h2>
            <p className="text-gray-500 mt-1">Gerencie as informações da sua empresa e colaboradores.</p>
        </div>
        <button onClick={handleHelpClick} className="p-2 bg-white text-gray-400 hover:text-mcsystem-500 hover:bg-mcsystem-50 rounded-md border border-gray-200 transition-colors" title="Ajuda">
            <HelpCircle size={20} />
        </button>
      </div>

      {/* Company Info Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100">
        <div className="p-6 border-b border-gray-200">
            <h3 className="font-bold text-gray-800 text-lg flex items-center">
                <Building size={20} className="mr-2 text-mcsystem-500" />
                Informações da Empresa
            </h3>
        </div>
        <form onSubmit={handleTenantSave} className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nome da Empresa</label>
                    <input name="name" value={tenantData.name || ''} onChange={handleTenantChange} type="text" className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-mcsystem-500 outline-none" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
                    <input name="website" value={tenantData.website || ''} onChange={handleTenantChange} type="url" className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-mcsystem-500 outline-none" placeholder="https://..." />
                </div>
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">E-mail de Contato</label>
                    <input name="email" value={tenantData.email || ''} onChange={handleTenantChange} type="email" className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-mcsystem-500 outline-none" />
                </div>
            </div>
             <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                <textarea name="description" value={tenantData.description || ''} onChange={handleTenantChange} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-mcsystem-500 outline-none"></textarea>
            </div>
            <div className="flex justify-end pt-2">
                <button type="submit" disabled={isSaving} className="px-4 py-2 bg-mcsystem-500 text-white rounded hover:bg-mcsystem-400 flex items-center disabled:opacity-50 transition-colors shadow-sm">
                    <Save size={16} className="mr-2" /> 
                    {isSaving ? 'Salvando...' : 'Salvar Alterações'}
                </button>
            </div>
        </form>
      </div>

      {/* Collaborators Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100">
        <div className="p-6 border-b border-gray-200 flex justify-between items-center">
            <h3 className="font-bold text-gray-800 text-lg flex items-center">
                <Users size={20} className="mr-2 text-mcsystem-500" />
                Colaboradores e Acessos
            </h3>
            <button onClick={() => openUserModal(null)} className="px-4 py-2 bg-mcsystem-900 text-white rounded-lg hover:bg-mcsystem-800 flex items-center text-sm font-bold shadow-sm transition-colors">
                <Plus size={16} className="mr-2" /> Adicionar Colaborador
            </button>
        </div>
        <div className="divide-y divide-gray-100">
          {users.map(user => (
            <div key={user.id} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center">
                  <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center text-sm font-bold mr-3 text-gray-500 flex-shrink-0">
                    {user.avatar || user.name.substring(0,2).toUpperCase()}
                  </div>
                  <div>
                      <p className="font-bold text-gray-800">{user.name}</p>
                      <p className="text-sm text-gray-500">{user.email}</p>
                  </div>
              </div>
              <div className="flex items-center gap-4 justify-end">
                  <span className={`px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ${user.role === 'admin' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'}`}>
                      <Shield size={12} /> {user.role === 'admin' ? 'Administrador' : 'Colaborador'}
                  </span>
                  <button onClick={() => openUserModal(user)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"><Edit size={16}/></button>
                  <button onClick={() => onDeleteUser(user.id)} disabled={user.id === currentUser.id} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"><Trash2 size={16}/></button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* User Management Modal */}
      {isUserModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-md animate-in zoom-in-95 duration-200">
                  <div className="p-6 border-b border-gray-200 flex justify-between items-center">
                      <h3 className="font-bold text-gray-800 text-lg">{editingUser ? 'Editar Colaborador' : 'Adicionar Colaborador'}</h3>
                      <button onClick={() => setIsUserModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                  </div>
                  <form onSubmit={handleUserSubmit} className="p-6 space-y-4">
                      <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo</label>
                          <input name="name" required value={userData.name} onChange={handleUserChange} type="text" className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-mcsystem-500 outline-none" />
                      </div>
                      <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                          <input name="email" required value={userData.email} onChange={handleUserChange} type="email" className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-mcsystem-500 outline-none" />
                      </div>
                      {!editingUser && (
                          <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Senha Provisória</label>
                              <input name="password" required value={userData.password} onChange={handleUserChange} type="password" className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-mcsystem-500 outline-none" />
                          </div>
                      )}
                      <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Nível de Acesso</label>
                          <select name="role" value={userData.role} onChange={handleUserChange} className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-mcsystem-500 outline-none bg-white">
                              <option value="collaborator">Colaborador</option>
                              <option value="admin">Administrador</option>
                          </select>
                      </div>
                      
                      {userData.role === 'collaborator' && (
                          <div className="animate-in fade-in duration-300">
                              <label className="block text-sm font-medium text-gray-700 mb-2">Permissões de Acesso às Telas</label>
                              <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg border border-gray-200">
                                  {permissionableModules.map(module => (
                                      <label key={module.id} className="flex items-center space-x-3 cursor-pointer">
                                          <input
                                              type="checkbox"
                                              checked={!!userData.permissions?.[module.id]}
                                              onChange={() => handlePermissionChange(module.id)}
                                              className="h-4 w-4 rounded border-gray-300 text-mcsystem-600 focus:ring-mcsystem-500"
                                          />
                                          <span className="text-sm text-gray-700 font-medium">{module.label}</span>
                                      </label>
                                  ))}
                              </div>
                          </div>
                      )}

                      <div className="flex justify-end space-x-2 pt-4">
                          <button type="button" onClick={() => setIsUserModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Cancelar</button>
                          <button type="submit" disabled={isProcessingUser} className="px-4 py-2 bg-mcsystem-500 text-white rounded hover:bg-mcsystem-400 flex items-center disabled:opacity-50">
                              <Save size={16} className="mr-2" />
                              {isProcessingUser ? 'Salvando...' : 'Salvar'}
                          </button>
                      </div>
                  </form>
              </div>
          </div>
      )}
    </div>
  );
};
