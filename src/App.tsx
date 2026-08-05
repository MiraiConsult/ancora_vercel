import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { FinanceDashboard } from './components/FinanceDashboard';
import { CompaniesModule } from './components/CompaniesModule';
import { ProductsModule } from './components/ProductsModule';
import { BillingModule } from './components/BillingModule';
import { OverviewDashboard } from './components/OverviewDashboard';
import { ContractsModule } from './components/ContractsModule';
import { PayablesAgenda } from './components/PayablesAgenda';
import { RegistrationsModule } from './components/RegistrationsModule';
import { SuppliersModule } from './components/SuppliersModule';
import type { MainTab } from './components/FinanceDashboard';

// Páginas do menu que abrem o módulo financeiro numa aba específica
const FINANCE_TABS: Record<string, MainTab> = {
  finance: 'RECONCILIATION',
  entries: 'RECONCILIATION',
  dre: 'DRE',
  cashflow: 'CASHFLOW',
  'cash-evolution': 'CASH_EVOLUTION',
  coa: 'COA',
};

const PAGE_TITLES: Record<string, string> = {
  dashboard: 'Dashboard',
  entries: 'Lançamentos & Caixa',
  finance: 'Lançamentos & Caixa',
  billing: 'Cobranças',
  payables: 'Contas a Pagar',
  contracts: 'Contratos',
  reports: 'Relatórios',
  dre: 'DRE Gerencial',
  cashflow: 'Fluxo de Caixa',
  'cash-evolution': 'Evolução do Caixa',
  companies: 'Clientes',
  products: 'Produtos',
  coa: 'Plano de Contas',
  lists: 'Cadastros Auxiliares',
  registrations: 'Cadastros',
  alerts: 'Alertas',
  database: 'Exportar Dados',
  settings: 'Configurações',
};
import { LoginScreen } from './components/LoginScreen';
import { LandingPage } from './components/LandingPage';
import { SettingsModule } from './components/SettingsModule';
import { ReportsModule } from './components/ReportsModule';
import { ListsModule } from './components/ListsModule';
import { AlertsModule } from './components/AlertsModule';
import { DataExportModule } from './components/DataExportModule';
import { TenantSelector } from './components/TenantSelector';
import { AuthCallback } from './components/AuthCallback';
import { User, RevenueType, Bank, Company, FinancialRecord, Tenant, SystemNotification, ChartOfAccount, GeneralNote, Product, Subscription, Supplier } from './types';
import { ShieldAlert, Bell, Wifi, WifiOff, AlertTriangle, HelpCircle, X, Database, Building2 } from 'lucide-react';
import { supabase, supabaseUrl, supabaseKey } from './lib/supabaseClient'; // Import credentials
import { isAsaasEnabled } from './config';
import {
  MOCK_USERS,
  MOCK_REVENUE_TYPES,
  MOCK_BANKS,
  MOCK_NOTIFICATIONS,
  MOCK_CHART_OF_ACCOUNTS,
  MOCK_COMPANIES,
  MOCK_FINANCE
} from './constants';

interface HelpModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

const HelpModal: React.FC<HelpModalProps> = ({ title, onClose, children }) => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[200] p-4 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl animate-in zoom-in-95 duration-300 overflow-hidden flex flex-col max-h-[80vh]">
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex justify-between items-center flex-shrink-0">
                <h3 className="font-bold text-lg text-gray-800 flex items-center">
                    <HelpCircle size={20} className="mr-3 text-mcsystem-500" />
                    {title}
                </h3>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-200 transition-colors">
                    <X size={24} />
                </button>
            </div>
            <div className="overflow-y-auto p-8 bg-white">
                {children}
            </div>
        </div>
    </div>
);


const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<'pending' | 'connected' | 'error' | 'missing_tables'>('pending');
  const [showLoginScreen, setShowLoginScreen] = useState(false);

  // Super Admin Impersonation
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [showTenantSelector, setShowTenantSelector] = useState(false);
  const [impersonatedTenantId, setImpersonatedTenantId] = useState<string | null>(null);
  const [impersonatedTenantName, setImpersonatedTenantName] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [currentTenant, setCurrentTenant] = useState<Tenant | null>({
      id: 'default',
      name: 'Ancóra Demo',
      plan: 'Premium',
      description: 'Plataforma de gestão financeira.'
  });

  // Help Modal State
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [helpContent, setHelpContent] = useState<{ title: string; content: React.ReactNode }>({ title: '', content: null });

  const [companies, setCompanies] = useState<Company[]>([]);
  const [financeRecords, setFinanceRecords] = useState<FinancialRecord[]>([]);
  const [generalNotes, setGeneralNotes] = useState<GeneralNote[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);

  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [revenueTypes, setRevenueTypes] = useState<RevenueType[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [chartOfAccounts, setChartOfAccounts] = useState<ChartOfAccount[]>([]);

  useEffect(() => {
    // Safety timeout: If Supabase hangs, force stop loading after 8 seconds
    const safetyTimer = setTimeout(() => {
        if (loading) {
            console.warn("Loading timeout reached. Forcing UI render.");
            setLoading(false);
        }
    }, 8000);

    checkSupabaseConnection();
    supabase.auth.getSession().then(({ data: { session } }) => {
      handleAuthSession(session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      handleAuthSession(session);
    });
    return () => {
        clearTimeout(safetyTimer);
        subscription.unsubscribe();
    };
  }, []);

  const toggleSidebar = () => {
    setIsSidebarCollapsed(prev => !prev);
  };

  const openHelp = (title: string, content: React.ReactNode) => {
    setHelpContent({ title, content });
    setIsHelpModalOpen(true);
  };

  const checkSupabaseConnection = async () => {
    try {
        const { error } = await supabase.from('financial_records').select('count', { count: 'exact', head: true });
        if (error && error.code === '42P01') setConnectionStatus('missing_tables');
        else if (error && (error.code === 'PGRST301' || error.message?.includes('fetch') || error.message?.includes('network'))) setConnectionStatus('error');
        else setConnectionStatus('connected');
    } catch (err) { setConnectionStatus('error'); }
  };

  const handleLogout = () => {
    console.log("[LOGOUT] Clearing application state.");
    setUser(null);
    setShowLoginScreen(false);

    // Clear all application data
    setCompanies([]);
    setFinanceRecords([]);
    setProducts([]);
    setSubscriptions([]);
    setNotifications([]);
    setAllUsers([]);
    setChartOfAccounts([]);
    setGeneralNotes([]);
  }

  const handleAuthSession = async (session: any) => {
    console.log("Auth State Change Detected. Processing session...");

    if (session?.user) {
      console.log(`[AUTH] Session ACTIVE. User ID: ${session.user.id}`);

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (error || !profile) {
        console.error("Error fetching profile, logging out.", error?.message || error);
        await signOut();
        setLoading(false);
        return;
      }

      const appUser: User = {
        id: session.user.id,
        tenant_id: session.user.app_metadata?.tenant_id,
        email: session.user.email!,
        name: profile.name,
        role: profile.role,
        avatar: profile.avatar,
        permissions: profile.permissions || {},
        is_super_admin: profile.is_super_admin || false
      };

      console.log('[AUTH] Authenticated User set in App state:', appUser);
      setUser(appUser);
      setIsSuperAdmin(appUser.is_super_admin || false);
      setShowLoginScreen(false); // Fechar tela de login para usuários reais

      // Se é super admin e não tem tenant impersonado, mostrar seletor
      if (appUser.is_super_admin && !impersonatedTenantId) {
        setShowTenantSelector(true);
        setLoading(false);
        return;
      }

      await fetchAppData(appUser);

    } else {
      console.log("[AUTH EVENT] Session INACTIVE. User is logged out.");
      handleLogout();
    }
    setLoading(false);
  };

  const fetchAppData = async (currentUser?: User, impersonatedTenant?: string | null) => {
    try {
      const effectiveUser = currentUser || user;
      if (!effectiveUser) {
        setLoading(false);
        return;
      }

      const isMockUser = effectiveUser.id.startsWith('u');

      // Se é super admin, usar tenant impersonado ao invés do tenant próprio
      // Priorizar parâmetro impersonatedTenant se fornecido
      const effectiveTenantId = impersonatedTenant !== undefined
        ? impersonatedTenant
        : (effectiveUser.is_super_admin && impersonatedTenantId)
          ? impersonatedTenantId
          : effectiveUser.tenant_id;

      console.log('[FETCH] effectiveTenantId:', effectiveTenantId, '| impersonatedTenant param:', impersonatedTenant, '| impersonatedTenantId state:', impersonatedTenantId);

      if (isMockUser) {
        setCompanies(MOCK_COMPANIES);
        setFinanceRecords(MOCK_FINANCE);
        setProducts([]);
        setSubscriptions([]);
        setBanks(MOCK_BANKS);
        setRevenueTypes(MOCK_REVENUE_TYPES);
        setNotifications(MOCK_NOTIFICATIONS);
        setAllUsers(MOCK_USERS);
        setChartOfAccounts(MOCK_CHART_OF_ACCOUNTS);
        setGeneralNotes([]);
        setCurrentTenant({
          id: 'default',
          name: 'Ancóra Demo',
          plan: 'Premium',
          website: 'https://mcsystem.com.br/',
          email: 'contato@mcsystem.com',
          description: 'Plataforma de gestão financeira.'
        });
        setLoading(false);
        return;
      }

      // Helper to fetch ALL records with automatic pagination (no limits)
      const queryWithTenant = async (table: string, orderBy?: string) => {
        let allData: any[] = [];
        let from = 0;
        const pageSize = 1000;
        let hasMore = true;

        while (hasMore) {
          let query = supabase.from(table).select('*', { count: 'exact' });
          if (effectiveTenantId) {
            query = query.eq('tenant_id', effectiveTenantId);
          }
          if (orderBy) {
            query = query.order(orderBy);
          }
          query = query.range(from, from + pageSize - 1);

          const { data, error, count } = await query;

          if (error) {
            console.error(`Error fetching ${table}:`, error);
            return { data: allData, error };
          }

          if (data && data.length > 0) {
            allData = allData.concat(data);
            from += pageSize;

            // Check if we've fetched all records
            if (count !== null && allData.length >= count) {
              hasMore = false;
            } else if (data.length < pageSize) {
              hasMore = false;
            }
          } else {
            hasMore = false;
          }
        }

        return { data: allData, error: null };
      };

      const responses = await Promise.all([
        queryWithTenant('clients'),
        queryWithTenant('financial_records'),
        queryWithTenant('banks'),
        queryWithTenant('revenue_types'),
        queryWithTenant('notifications'),
        queryWithTenant('profiles'),
        queryWithTenant('chart_of_accounts'),
        effectiveTenantId
          ? supabase.from('organization_settings').select('*').eq('id', effectiveTenantId).single()
          : supabase.from('organization_settings').select('*').eq('tenant_id', effectiveTenantId),
        queryWithTenant('general_notes'),
        queryWithTenant('products'),
        queryWithTenant('subscriptions'),
        queryWithTenant('suppliers'),
      ]);

      const [
          companiesRes, financeRes, banksRes, revenueTypesRes,
          notificationsRes, profilesRes, coaRes, orgRes,
          generalNotesRes, productsRes, subscriptionsRes, suppliersRes
      ] = responses;

      const checkError = (res: any, name: string) => {
          if (res.error) console.warn(`Error fetching ${name}:`, res.error);
          return res.data || [];
      }

      setCompanies(checkError(companiesRes, 'clients'));
      setFinanceRecords(checkError(financeRes, 'financial_records'));
      setBanks(checkError(banksRes, 'banks'));
      setRevenueTypes(checkError(revenueTypesRes, 'revenue_types'));
      setNotifications(checkError(notificationsRes, 'notifications'));
      setAllUsers(checkError(profilesRes, 'profiles'));
      setChartOfAccounts(checkError(coaRes, 'chart_of_accounts'));
      setGeneralNotes(checkError(generalNotesRes, 'general_notes'));
      setProducts(checkError(productsRes, 'products'));
      setSubscriptions(checkError(subscriptionsRes, 'subscriptions'));
      setSuppliers(checkError(suppliersRes, 'suppliers'));

      // Para super admin, orgRes.data é um objeto (single), não array
      if (orgRes.data) {
        const tenantData = Array.isArray(orgRes.data) ? orgRes.data[0] : orgRes.data;
        if (tenantData) {
          setCurrentTenant(tenantData);
        }
      } else if (effectiveTenantId) {
         const newTenant: Tenant = {
            id: effectiveTenantId,
            name: effectiveUser.name,
            plan: 'Premium',
            email: effectiveUser.email
         };
         await supabase.from('organization_settings').upsert(newTenant);
         setCurrentTenant(newTenant);
      }

    } catch (error) {
      console.error("Critical error in fetchAppData:", error);
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();

    // Explicitly call the logout handler to ensure immediate UI update
    // and state cleanup, making the logout process more robust.
    handleLogout();

    if (error && !error.message.includes('Auth session missing!')) {
        console.error("Error signing out:", error);
    }
  };

  const handleLogin = async (loggedInUser: User) => {
      console.log('[LOGIN] Processing login for user:', loggedInUser.email);
      setUser(loggedInUser);
      setShowLoginScreen(false); // Fechar tela de login

      // Se é usuário mock, usar dados mock
      if (loggedInUser.id.startsWith('u')) {
          await fetchAppData(loggedInUser);
          return;
      }

      // Para usuários reais, verificar se é super admin
      if (loggedInUser.is_super_admin && !impersonatedTenantId) {
          setIsSuperAdmin(true);
          setShowTenantSelector(true);
          return;
      }

      // Para usuários normais, buscar dados
      setLoading(true);
      await fetchAppData(loggedInUser);
      setLoading(false);
  };

  const handleUpdateTenant = async (tenantData: Partial<Tenant>) => {
      const updatedTenant = { ...currentTenant, ...tenantData, id: currentTenant?.id || 'default' } as Tenant;
      setCurrentTenant(updatedTenant);
      const { error } = await supabase.from('organization_settings').upsert(updatedTenant);
      // Sem isso uma falha (ex: logo grande demais) passava despercebida.
      if (error) alert('Erro ao salvar as informações da empresa: ' + error.message);
  };

const handleAddUser = async (newUser: User) => {
  if (!user || user.role !== 'admin') {
    alert("Sessão de administrador inválida. Por favor, faça o login novamente.");
    return;
  }

  try {
    const generatePassword = () => {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
      let pwd = '';
      for (let i = 0; i < 12; i++) {
        pwd += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return pwd;
    };

    const tempPassword = newUser.password || generatePassword();
    const permissions = newUser.role === 'collaborator' ? (newUser.permissions || {}) : {};

    const { data, error } = await supabase.rpc('invite_user', {
      user_email: newUser.email,
      user_name: newUser.name,
      user_password: tempPassword,
      user_permissions: permissions,
      user_role: newUser.role || 'collaborator'
    });

    if (error) {
      throw new Error(error.message);
    }

    const newUserProfile: User = {
      id: data.user_id,
      tenant_id: user.tenant_id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      permissions,
      avatar: newUser.name.substring(0, 2).toUpperCase()
    };

    setAllUsers(prev => [...prev, newUserProfile]);

    alert(`Colaborador cadastrado com sucesso!\n\nEmail: ${newUser.email}\nSenha temporária: ${tempPassword}\n\nAnote essa senha e envie ao usuário.`);

  } catch (error: any) {
    console.error("Error creating user:", error);
    alert(`Erro ao criar usuário: ${error.message || 'Verifique os dados e tente novamente.'}`);
  }
};

  const handleUpdateUser = async (userToUpdate: User) => {
    const { password, tenant_id, id, ...updateData } = userToUpdate;

    if (updateData.role === 'admin') {
      updateData.permissions = {};
    }

    const { data, error } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating user:', error);
      alert(`Erro ao atualizar colaborador: ${error.message}`);
      return;
    }

    if (data) {
      setAllUsers(prev => prev.map(u => u.id === id ? { ...u, ...data } : u));
      alert('Colaborador atualizado com sucesso!');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm("Tem certeza que deseja excluir este colaborador? Esta ação é irreversível.")) {
        return;
    }
    const { error } = await supabase.rpc('delete_user_in_tenant', {
      user_id_to_delete: userId
    });
    if (error) {
      console.error('Error deleting user:', error);
      alert(`Erro ao excluir colaborador: ${error.message}`);
      return;
    }
    setAllUsers(prev => prev.filter(u => u.id !== userId));
    alert('Colaborador excluído com sucesso.');
  };

  if (loading) return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-50">
          <div className="flex flex-col items-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-mcsystem-500 mb-4"></div>
              <p className="text-gray-500 font-medium">Carregando Ancóra...</p>
              <p className="text-xs text-gray-400 mt-2">Se demorar, verificaremos a conexão automaticamente.</p>
          </div>
      </div>
  );

  if (!user) {
      if (showLoginScreen) return <LoginScreen onLogin={handleLogin} onBack={() => setShowLoginScreen(false)} connectionStatus={connectionStatus} />;
      else return <LandingPage onLoginClick={() => setShowLoginScreen(true)} />;
  }

  const isAdmin = user.role === 'admin';
  const unreadNotifications = notifications.filter(n => !n.read).length;

  const renderContent = () => {
    // Função auxiliar para verificar permissões
    const hasPermission = (moduleId: string): boolean => {
      // Admin sempre tem acesso
      if (user.role === 'admin') return true;

      // Colaborador precisa ter a permissão específica
      return user.permissions?.[moduleId] === true;
    };

    switch (currentPage) {
      case 'dashboard':
        return hasPermission('dashboard') ? (
          <OverviewDashboard
            records={financeRecords}
            products={products}
            companies={companies}
            subscriptions={subscriptions}
            currentUser={user}
            onNavigate={setCurrentPage}
          />
        ) : <AccessDenied />;

      case 'finance':
      case 'entries':
      case 'dre':
      case 'cashflow':
      case 'cash-evolution':
      case 'coa':
        return hasPermission('finance') ? (
          <FinanceDashboard
            key={currentPage}
            initialTab={FINANCE_TABS[currentPage] || 'RECONCILIATION'}
            hideTabs
            records={financeRecords}
            setRecords={setFinanceRecords}
            revenueTypes={revenueTypes}
            setRevenueTypes={setRevenueTypes}
            banks={banks}
            setBanks={setBanks}
            chartOfAccounts={chartOfAccounts}
            setChartOfAccounts={setChartOfAccounts}
            companies={companies}
            setCompanies={setCompanies}
            products={products}
            currentUser={user}
          />
        ) : <AccessDenied />;

      case 'reports':
        return hasPermission('finance') ? (
          <ReportsModule records={financeRecords} companies={companies} products={products} chartOfAccounts={chartOfAccounts} />
        ) : <AccessDenied />;

      case 'companies':
        return hasPermission('companies') ? (
          <CompaniesModule
            companies={companies}
            setCompanies={setCompanies}
            financeRecords={financeRecords}
            setFinanceRecords={setFinanceRecords}
            generalNotes={generalNotes}
            setGeneralNotes={setGeneralNotes}
            revenueTypes={revenueTypes}
            banks={banks}
            allUsers={allUsers}
            currentUser={user}
            products={products}
            subscriptions={subscriptions}
            onOpenHelp={openHelp}
          />
        ) : <AccessDenied />;

      case 'products':
        return hasPermission('products') ? (
          <ProductsModule
            products={products}
            setProducts={setProducts}
            currentUser={user}
          />
        ) : <AccessDenied />;

      // Os quatro cadastros numa página só, em abas.
      case 'registrations':
        return (
          <RegistrationsModule
            currentUser={user}
            panels={{
              CLIENTS: hasPermission('companies') ? (
                <CompaniesModule
                  companies={companies}
                  setCompanies={setCompanies}
                  financeRecords={financeRecords}
                  setFinanceRecords={setFinanceRecords}
                  generalNotes={generalNotes}
                  setGeneralNotes={setGeneralNotes}
                  revenueTypes={revenueTypes}
                  banks={banks}
                  allUsers={allUsers}
                  currentUser={user}
                  products={products}
                  subscriptions={subscriptions}
                  onOpenHelp={openHelp}
                />
              ) : <AccessDenied />,
              SUPPLIERS: hasPermission('companies')
                ? <SuppliersModule suppliers={suppliers} setSuppliers={setSuppliers} />
                : <AccessDenied />,
              PRODUCTS: hasPermission('products')
                ? <ProductsModule products={products} setProducts={setProducts} currentUser={user} />
                : <AccessDenied />,
              COA: hasPermission('finance') ? (
                <FinanceDashboard
                  key="coa"
                  initialTab="COA"
                  hideTabs
                  records={financeRecords}
                  setRecords={setFinanceRecords}
                  revenueTypes={revenueTypes}
                  setRevenueTypes={setRevenueTypes}
                  banks={banks}
                  setBanks={setBanks}
                  chartOfAccounts={chartOfAccounts}
                  setChartOfAccounts={setChartOfAccounts}
                  companies={companies}
                  setCompanies={setCompanies}
                  products={products}
                  currentUser={user}
                />
              ) : <AccessDenied />,
              BANKS: hasPermission('lists') ? (
                <ListsModule
                  hideTabs
                  initialList="BANKS"
                  revenueTypes={revenueTypes}
                  setRevenueTypes={setRevenueTypes}
                  banks={banks}
                  setBanks={setBanks}
                  products={products}
                  setProducts={setProducts}
                  currentUser={user}
                />
              ) : <AccessDenied />,
            }}
          />
        );

      case 'payables':
        return hasPermission('finance') ? (
          <PayablesAgenda
            suppliers={suppliers}
            setSuppliers={setSuppliers}
            records={financeRecords}
            setRecords={setFinanceRecords}
            companies={companies}
            chartOfAccounts={chartOfAccounts}
            banks={banks}
            currentUser={user}
          />
        ) : <AccessDenied />;

      case 'contracts':
        return hasPermission('contracts') ? (
          <ContractsModule
            companies={companies}
            products={products}
            tenant={currentTenant}
            currentUser={user}
          />
        ) : <AccessDenied />;

      case 'billing':
        return (hasPermission('billing') && isAsaasEnabled(user.tenant_id)) ? (
          <BillingModule
            companies={companies}
            setCompanies={setCompanies}
            products={products}
            financeRecords={financeRecords}
            setFinanceRecords={setFinanceRecords}
            subscriptions={subscriptions}
            setSubscriptions={setSubscriptions}
            revenueTypes={revenueTypes}
            currentUser={user}
            onRefresh={() => fetchAppData(user)}
          />
        ) : <AccessDenied />;

      case 'settings':
        return isAdmin ? (
          <SettingsModule
            tenant={currentTenant}
            users={allUsers}
            onAddUser={handleAddUser}
            onUpdateUser={handleUpdateUser}
            onDeleteUser={handleDeleteUser}
            onUpdateTenant={handleUpdateTenant}
            onOpenHelp={openHelp}
            currentUser={user}
          />
        ) : <AccessDenied />;

      case 'alerts':
        return hasPermission('alerts') ? (
          <AlertsModule
            notifications={notifications}
            setNotifications={setNotifications}
            users={allUsers}
            currentUser={user}
          />
        ) : <AccessDenied />;

      case 'lists':
        return hasPermission('lists') ? (
          <ListsModule
            revenueTypes={revenueTypes}
            setRevenueTypes={setRevenueTypes}
            banks={banks}
            setBanks={setBanks}
            products={products}
            setProducts={setProducts}
            currentUser={user}
          />
        ) : <AccessDenied />;

      case 'database':
        return hasPermission('database') ? (
          <DataExportModule
            companies={companies}
            financeRecords={financeRecords}
            chartOfAccounts={chartOfAccounts}
            users={allUsers}
          />
        ) : <AccessDenied />;

      default:
        return <div>Página não encontrada</div>;
    }
  };

  const handleSelectTenant = async (tenantId: string, tenantName: string) => {
    console.log('[SELECT TENANT] Selected:', tenantName, '| ID:', tenantId);
    setImpersonatedTenantId(tenantId);
    setImpersonatedTenantName(tenantName);
    setShowTenantSelector(false);
    setLoading(true);
    await fetchAppData(user!, tenantId);  // ✅ Passa tenantId diretamente
    setLoading(false);
  };

  const handleExitImpersonation = () => {
    setImpersonatedTenantId(null);
    setImpersonatedTenantName(null);
    setShowTenantSelector(true);
  };

  // Roteamento para página de callback de autenticação
  if (window.location.pathname === '/auth/callback') {
    return <AuthCallback supabase={supabase} />;
  }

  // Se é super admin e deve mostrar seletor de tenant
  if (isSuperAdmin && showTenantSelector) {
    return <TenantSelector onSelectTenant={handleSelectTenant} currentTenantId={impersonatedTenantId || undefined} />;
  }

  return (
    <>
      <div className="flex min-h-screen bg-slate-50 font-sans">
        {/* Banner de Impersonação */}
        {isSuperAdmin && impersonatedTenantName && (
          <div className="fixed top-0 left-0 right-0 bg-gradient-to-r from-orange-500 to-red-500 text-white px-6 py-3 z-[100] shadow-lg">
            <div className="flex items-center justify-between max-w-7xl mx-auto">
              <div className="flex items-center space-x-3">
                <Building2 size={20} />
                <span className="font-semibold">
                  Você está acessando como: <span className="font-bold">{impersonatedTenantName}</span>
                </span>
              </div>
              <button
                onClick={handleExitImpersonation}
                className="bg-white/20 hover:bg-white/30 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2"
              >
                <X size={16} />
                <span>Voltar para Seleção</span>
              </button>
            </div>
          </div>
        )}

        <Sidebar
          currentPage={currentPage}
          onNavigate={setCurrentPage}
          currentUser={user}
          onLogout={signOut}
          unreadCount={unreadNotifications}
          pendingValidationCount={financeRecords.filter(r => r.needsValidation).length}
          overduePayablesCount={financeRecords.filter(r => r.amount < 0 && (r.status as string) !== 'Pago' && r.dueDate && r.dueDate < new Date().toISOString().slice(0, 10)).length}
          isCollapsed={isSidebarCollapsed}
          onToggle={toggleSidebar}
        />
        <main className={`flex-1 p-8 flex flex-col transition-all duration-300 ${isSidebarCollapsed ? 'ml-20' : 'ml-64'} ${isSuperAdmin && impersonatedTenantName ? 'mt-14' : ''} min-w-0`}>
           <header className="flex-shrink-0 flex justify-between items-center mb-8">
              <h1 className="text-xl font-semibold text-gray-800 capitalize">{PAGE_TITLES[currentPage] || currentPage}</h1>
              <div className="flex items-center space-x-4">
                  <div onClick={() => setCurrentPage('alerts')} className="relative cursor-pointer hover:bg-gray-100 p-2 rounded-full transition-colors">
                       {unreadNotifications > 0 && <span className="absolute top-1 right-1 h-2.5 w-2.5 bg-red-500 rounded-full border-2 border-white animate-ping"></span>}
                       <Bell size={20} className="text-gray-500" />
                  </div>
                  <div className={`hidden md:flex items-center space-x-2 px-3 py-1 rounded-full border shadow-sm ${connectionStatus === 'connected' ? 'bg-white border-gray-200' : connectionStatus === 'missing_tables' ? 'bg-yellow-50 border-yellow-200' : 'bg-red-50 border-red-200'}`} title="Status da Conexão">
                      {connectionStatus === 'connected' && <Wifi size={14} className="text-green-500" />}
                      {connectionStatus === 'missing_tables' && <AlertTriangle size={14} className="text-yellow-500" />}
                      {connectionStatus === 'error' && <WifiOff size={14} className="text-red-500" />}
                      <Database size={14} className="text-gray-400"/>
                      <span className={`text-xs font-medium ${connectionStatus === 'connected' ? 'text-gray-500' : connectionStatus === 'missing_tables' ? 'text-yellow-700' : 'text-red-700'}`}>{connectionStatus === 'connected' ? 'Sistema Online' : connectionStatus === 'missing_tables' ? 'Configuração Pendente' : 'Desconectado'}</span>
                  </div>
                  <div className="text-right hidden md:block"><p className="text-sm font-bold text-gray-800">{user.name}</p><p className="text-xs text-gray-500">{user.email}</p></div>
                  <div className="h-10 w-10 bg-mcsystem-500 rounded-full flex items-center justify-center text-white font-bold shadow-md">{user.avatar || user.name.substring(0,2).toUpperCase()}</div>
              </div>
           </header>
           <div className="flex-1 relative min-h-0">
             {renderContent()}
           </div>
        </main>
      </div>

      {isHelpModalOpen && (
        <HelpModal title={helpContent.title} onClose={() => setIsHelpModalOpen(false)}>
            {helpContent.content}
        </HelpModal>
      )}
    </>
  );
};

const AccessDenied = () => (
    <div className="h-full flex flex-col items-center justify-center text-gray-500">
        <ShieldAlert size={64} className="text-red-500 mb-4" />
        <h2 className="text-2xl font-bold text-gray-800">Acesso Negado</h2>
        <p className="mt-2">Você não tem permissão para acessar este módulo.</p>
    </div>
);

export default App;
