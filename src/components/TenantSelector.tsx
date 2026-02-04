import React, { useState, useEffect } from 'react';
import { Building2, Search, X, LogOut } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

interface Tenant {
  id: string;
  name: string;
  created_at: string;
}

interface TenantSelectorProps {
  onSelectTenant: (tenantId: string, tenantName: string) => void;
  currentTenantId?: string;
}

export const TenantSelector: React.FC<TenantSelectorProps> = ({ onSelectTenant, currentTenantId }) => {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTenants();
  }, []);

  const loadTenants = async () => {
    try {
      // Buscar todas as empresas da organization_settings
      const { data: orgsData, error: orgsError } = await supabase
        .from('organization_settings')
        .select('id, name')
        .order('name');
      
      if (orgsError) throw orgsError;
      
      // Montar lista de tenants
      const tenantsWithNames = (orgsData || []).map(org => ({
        id: org.id,
        name: org.name || `Empresa ${org.id.slice(0, 8)}`,
        created_at: new Date().toISOString()
      }));
      
      setTenants(tenantsWithNames);
    } catch (error) {
      console.error('Erro ao carregar tenants:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredTenants = tenants.filter(t => 
    t.name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-mcsystem-600 to-mcsystem-800 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-mcsystem-500 to-mcsystem-600 p-6 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="bg-white/20 p-3 rounded-xl backdrop-blur-sm">
                <Building2 size={32} />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Seleção de Cliente</h1>
                <p className="text-mcsystem-100 text-sm mt-1">Escolha qual empresa você deseja acessar</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="bg-white/20 hover:bg-white/30 p-3 rounded-lg transition-colors flex items-center space-x-2"
              title="Sair do sistema"
            >
              <LogOut size={20} />
              <span className="text-sm font-medium">Sair</span>
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="p-6 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Buscar empresa..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-mcsystem-500 outline-none"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            )}
          </div>
        </div>

        {/* Tenant List */}
        <div className="p-6 max-h-96 overflow-y-auto">
          {loading ? (
            <div className="text-center py-8 text-gray-500">
              Carregando empresas...
            </div>
          ) : filteredTenants.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              Nenhuma empresa encontrada
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTenants.map((tenant) => (
                <button
                  key={tenant.id}
                  onClick={() => onSelectTenant(tenant.id, tenant.name)}
                  className={`w-full text-left p-4 rounded-lg border-2 transition-all hover:shadow-md ${
                    currentTenantId === tenant.id
                      ? 'border-mcsystem-500 bg-mcsystem-50'
                      : 'border-gray-200 hover:border-mcsystem-300'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <div className={`p-2 rounded-lg ${
                      currentTenantId === tenant.id
                        ? 'bg-mcsystem-500 text-white'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      <Building2 size={20} />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-800">{tenant.name}</h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        ID: {tenant.id.slice(0, 8)}...
                      </p>
                    </div>
                    {currentTenantId === tenant.id && (
                      <div className="bg-mcsystem-500 text-white px-2 py-1 rounded text-xs font-bold">
                        Atual
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};