import React, { useState, useMemo } from 'react';
import { 
  Users, Target, CheckSquare, Calendar, DollarSign, TrendingUp, TrendingDown, 
  Filter, Search, ChevronDown, BarChart3, PieChart, Award, Clock, Building,
  Phone, Mail, Briefcase, X, ArrowUpRight, ArrowDownRight, Check
} from 'lucide-react';
import { User, Deal, Company, Task, FinancialRecord, RevenueType, DealStageConfig } from '../types';

interface PerformanceModuleProps {
  users: User[];
  deals: Deal[];
  companies: Company[];
  tasks: Task[];
  financeRecords: FinancialRecord[];
  revenueTypes: RevenueType[];
  dealStages: DealStageConfig[];
}

interface ResponsibleMetrics {
  userId: string;
  userName: string;
  userEmail: string;
  userRole: string;
  // Clientes
  totalClients: number;
  activeClients: number;
  prospectClients: number;
  churnedClients: number;
  // Oportunidades
  totalDeals: number;
  openDeals: number;
  wonDeals: number;
  lostDeals: number;
  // Valores
  pipelineValue: number;
  wonValue: number;
  lostValue: number;
  avgDealValue: number;
  // Tarefas
  totalTasks: number;
  pendingTasks: number;
  completedTasks: number;
  overdueTasks: number;
  // Reuniões
  totalMeetings: number;
  completedMeetings: number;
  // Receitas
  topRevenueTypes: { name: string; value: number; count: number }[];
  // Taxa de conversão
  conversionRate: number;
}

export const PerformanceModule: React.FC<PerformanceModuleProps> = ({
  users,
  deals,
  companies,
  tasks,
  financeRecords,
  revenueTypes,
  dealStages
}) => {
  // Filtros
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>(['all']); // Seleção múltipla
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'cards' | 'table' | 'comparison'>('cards');
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  
  // Modal de detalhes
  const [selectedResponsible, setSelectedResponsible] = useState<ResponsibleMetrics | null>(null);
  const [detailTab, setDetailTab] = useState<'clients' | 'deals' | 'tasks' | 'revenue'>('clients');

  // Filtrar por data
  const filterByDate = (dateStr: string | undefined) => {
    if (!dateStr) return true;
    if (!dateFrom && !dateTo) return true;
    const date = new Date(dateStr);
    if (dateFrom && date < new Date(dateFrom)) return false;
    if (dateTo && date > new Date(dateTo)) return false;
    return true;
  };

  // Toggle seleção de usuário
  const toggleUserSelection = (userId: string) => {
    if (userId === 'all') {
      setSelectedUserIds(['all']);
    } else {
      const newSelection = selectedUserIds.includes('all')
        ? [userId]
        : selectedUserIds.includes(userId)
          ? selectedUserIds.filter(id => id !== userId)
          : [...selectedUserIds, userId];
      
      setSelectedUserIds(newSelection.length === 0 ? ['all'] : newSelection);
    }
  };

  // Calcular métricas por responsável
  const responsibleMetrics = useMemo(() => {
    const metrics: ResponsibleMetrics[] = [];
    
    // Filtrar apenas colaboradores e admins (não super admins)
    const activeUsers = users.filter(u => !u.is_super_admin);
    
    activeUsers.forEach(user => {
      // Clientes do responsável
      const userCompanies = companies.filter(c => 
        c.responsible_users?.includes(user.id)
      );
      
      // Deals do responsável (filtrados por data)
      const userDeals = deals.filter(d => 
        d.responsible_users?.includes(user.id) && filterByDate(d.createdAt)
      );
      
      // Tarefas do responsável (filtradas por data)
      const userTasks = tasks.filter(t => 
        t.assigned_to?.includes(user.id) && filterByDate(t.createdAt)
      );
      
      // Calcular valores
      const wonStage = dealStages.find(s => s.name === 'Fechado (Ganho)');
      const lostStage = dealStages.find(s => s.name === 'Perdido');
      
      const wonDeals = userDeals.filter(d => d.stage === wonStage?.id);
      const lostDeals = userDeals.filter(d => d.stage === lostStage?.id);
      const openDeals = userDeals.filter(d => d.stage !== wonStage?.id && d.stage !== lostStage?.id);
      
      const pipelineValue = openDeals.reduce((sum, d) => sum + (d.value || 0), 0);
      const wonValue = wonDeals.reduce((sum, d) => sum + (d.value || 0), 0);
      const lostValue = lostDeals.reduce((sum, d) => sum + (d.value || 0), 0);
      
      // Tarefas
      const completedTasks = userTasks.filter(t => t.status === 'completed');
      const pendingTasks = userTasks.filter(t => t.status === 'pending');
      const overdueTasks = userTasks.filter(t => 
        t.status !== 'completed' && t.dueDate && new Date(t.dueDate) < new Date()
      );
      
      // Reuniões (tarefas do tipo meeting)
      const meetings = userTasks.filter(t => t.type === 'meeting');
      const completedMeetings = meetings.filter(t => t.status === 'completed');
      
      // Top tipos de receita
      const revenueMap = new Map<string, { value: number; count: number }>();
      wonDeals.forEach(deal => {
        if (deal.revenueTypeId) {
          const existing = revenueMap.get(deal.revenueTypeId) || { value: 0, count: 0 };
          revenueMap.set(deal.revenueTypeId, {
            value: existing.value + (deal.value || 0),
            count: existing.count + 1
          });
        }
      });
      
      const topRevenueTypes = Array.from(revenueMap.entries())
        .map(([id, data]) => ({
          name: revenueTypes.find(rt => rt.id === id)?.name || id,
          value: data.value,
          count: data.count
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 3);
      
      // Taxa de conversão
      const conversionRate = userDeals.length > 0 
        ? (wonDeals.length / userDeals.length) * 100 
        : 0;
      
      metrics.push({
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        userRole: user.role,
        totalClients: userCompanies.length,
        activeClients: userCompanies.filter(c => c.status === 'Active').length,
        prospectClients: userCompanies.filter(c => c.status === 'Prospect').length,
        churnedClients: userCompanies.filter(c => c.status === 'Churned').length,
        totalDeals: userDeals.length,
        openDeals: openDeals.length,
        wonDeals: wonDeals.length,
        lostDeals: lostDeals.length,
        pipelineValue,
        wonValue,
        lostValue,
        avgDealValue: wonDeals.length > 0 ? wonValue / wonDeals.length : 0,
        totalTasks: userTasks.length,
        pendingTasks: pendingTasks.length,
        completedTasks: completedTasks.length,
        overdueTasks: overdueTasks.length,
        totalMeetings: meetings.length,
        completedMeetings: completedMeetings.length,
        topRevenueTypes,
        conversionRate
      });
    });
    
    return metrics;
  }, [users, companies, deals, tasks, revenueTypes, dealStages, dateFrom, dateTo]);

  // Filtrar métricas
  const filteredMetrics = useMemo(() => {
    let filtered = responsibleMetrics;
    
    // Filtro de usuário (seleção múltipla)
    if (!selectedUserIds.includes('all')) {
      filtered = filtered.filter(m => selectedUserIds.includes(m.userId));
    }
    
    // Filtro de busca
    if (searchTerm) {
      filtered = filtered.filter(m => 
        m.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.userEmail.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    return filtered.sort((a, b) => b.wonValue - a.wonValue);
  }, [responsibleMetrics, selectedUserIds, searchTerm]);

  // Totais gerais
  const totals = useMemo(() => ({
    totalClients: filteredMetrics.reduce((sum, m) => sum + m.totalClients, 0),
    pipelineValue: filteredMetrics.reduce((sum, m) => sum + m.pipelineValue, 0),
    wonValue: filteredMetrics.reduce((sum, m) => sum + m.wonValue, 0),
    lostValue: filteredMetrics.reduce((sum, m) => sum + m.lostValue, 0),
  }), [filteredMetrics]);

  // Dados para gráficos de comparação
  const comparisonData = useMemo(() => {
    if (selectedUserIds.includes('all') || selectedUserIds.length === 0) {
      return filteredMetrics.slice(0, 5); // Top 5 se "todos" estiver selecionado
    }
    return filteredMetrics.filter(m => selectedUserIds.includes(m.userId));
  }, [filteredMetrics, selectedUserIds]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2
    }).format(value);
  };

  const formatPercent = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  // Renderizar gráfico de comparação
  const renderComparisonChart = (
    data: ResponsibleMetrics[],
    metric: keyof ResponsibleMetrics,
    title: string,
    color: string,
    isCurrency: boolean = false
  ) => {
    const maxValue = Math.max(...data.map(d => Number(d[metric]) || 0));
    
    return (
      <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
        <h4 className="font-semibold text-gray-800 mb-4">{title}</h4>
        <div className="space-y-3">
          {data.map(user => {
            const value = Number(user[metric]) || 0;
            const percentage = maxValue > 0 ? (value / maxValue) * 100 : 0;
            
            return (
              <div key={user.userId}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-medium text-gray-700">{user.userName}</span>
                  <span className="text-sm font-bold text-gray-900">
                    {isCurrency ? formatCurrency(value) : value}
                  </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div
                    className={`${color} h-2 rounded-full transition-all duration-500`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
          <Award className="text-mcsystem-500" size={28} />
          Performance de Responsáveis
        </h1>
        <p className="text-gray-600 mt-1">Acompanhe as métricas e resultados de cada colaborador</p>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Busca */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Buscar responsável..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-mcsystem-500"
            />
          </div>

          {/* Seleção múltipla de responsáveis */}
          <div className="relative">
            <button
              onClick={() => setShowUserDropdown(!showUserDropdown)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <span className="text-sm text-gray-700">
                {selectedUserIds.includes('all') 
                  ? 'Todos os responsáveis' 
                  : `${selectedUserIds.length} selecionado(s)`}
              </span>
              <ChevronDown size={18} className="text-gray-400" />
            </button>
            
            {showUserDropdown && (
              <div className="absolute z-50 mt-2 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                <div
                  onClick={() => toggleUserSelection('all')}
                  className="px-4 py-2 hover:bg-gray-50 cursor-pointer flex items-center justify-between"
                >
                  <span className="text-sm text-gray-700">Todos</span>
                  {selectedUserIds.includes('all') && <Check size={16} className="text-mcsystem-500" />}
                </div>
                {users.filter(u => !u.is_super_admin).map(user => (
                  <div
                    key={user.id}
                    onClick={() => toggleUserSelection(user.id)}
                    className="px-4 py-2 hover:bg-gray-50 cursor-pointer flex items-center justify-between"
                  >
                    <span className="text-sm text-gray-700">{user.name}</span>
                    {selectedUserIds.includes(user.id) && <Check size={16} className="text-mcsystem-500" />}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Data início */}
          <div>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-mcsystem-500"
            />
          </div>

          {/* Data fim */}
          <div>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-mcsystem-500"
            />
          </div>
        </div>

        {/* Toggle de visualização */}
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => setViewMode('cards')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              viewMode === 'cards'
                ? 'bg-mcsystem-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Cards
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              viewMode === 'table'
                ? 'bg-mcsystem-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Tabela
          </button>
          <button
            onClick={() => setViewMode('comparison')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              viewMode === 'comparison'
                ? 'bg-mcsystem-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <BarChart3 size={16} className="inline mr-2" />
            Comparação
          </button>
        </div>
      </div>

      {/* Cards de resumo geral */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total de Clientes</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{totals.totalClients}</p>
            </div>
            <Users className="text-blue-500" size={32} />
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Pipeline</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(totals.pipelineValue)}</p>
            </div>
            <Target className="text-yellow-500" size={32} />
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Vendido</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{formatCurrency(totals.wonValue)}</p>
            </div>
            <TrendingUp className="text-green-500" size={32} />
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Perdido</p>
              <p className="text-2xl font-bold text-red-600 mt-1">{formatCurrency(totals.lostValue)}</p>
            </div>
            <TrendingDown className="text-red-500" size={32} />
          </div>
        </div>
      </div>

      {/* Modo de Comparação */}
      {viewMode === 'comparison' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {renderComparisonChart(comparisonData, 'wonValue', 'Valor Vendido', 'bg-green-500', true)}
          {renderComparisonChart(comparisonData, 'pipelineValue', 'Valor em Pipeline', 'bg-yellow-500', true)}
          {renderComparisonChart(comparisonData, 'totalClients', 'Total de Clientes', 'bg-blue-500')}
          {renderComparisonChart(comparisonData, 'wonDeals', 'Oportunidades Ganhas', 'bg-emerald-500')}
          {renderComparisonChart(comparisonData, 'conversionRate', 'Taxa de Conversão (%)', 'bg-purple-500')}
          {renderComparisonChart(comparisonData, 'completedTasks', 'Tarefas Concluídas', 'bg-indigo-500')}
        </div>
      )}

      {/* Lista de responsáveis (Cards) */}
      {viewMode === 'cards' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredMetrics.map(metric => (
            <div
              key={metric.userId}
              onClick={() => setSelectedResponsible(metric)}
              className="bg-white rounded-lg p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow cursor-pointer"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="h-12 w-12 bg-mcsystem-500 rounded-full flex items-center justify-center text-white font-bold">
                  {metric.userName.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{metric.userName}</h3>
                  <p className="text-xs text-gray-500">{metric.userEmail}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-xs text-gray-600">Clientes</p>
                  <p className="text-lg font-bold text-gray-900">{metric.totalClients}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-600">Oportunidades</p>
                  <p className="text-lg font-bold text-gray-900">{metric.totalDeals}</p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Pipeline</span>
                  <span className="text-sm font-semibold text-yellow-600">{formatCurrency(metric.pipelineValue)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Vendido</span>
                  <span className="text-sm font-semibold text-green-600">{formatCurrency(metric.wonValue)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Conversão</span>
                  <span className="text-sm font-semibold text-purple-600">{formatPercent(metric.conversionRate)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lista de responsáveis (Tabela) */}
      {viewMode === 'table' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Responsável</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Clientes</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Oportunidades</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pipeline</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vendido</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Conversão</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tarefas</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredMetrics.map(metric => (
                  <tr
                    key={metric.userId}
                    onClick={() => setSelectedResponsible(metric)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-mcsystem-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
                          {metric.userName.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-900">{metric.userName}</div>
                          <div className="text-xs text-gray-500">{metric.userEmail}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{metric.totalClients}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {metric.totalDeals} ({metric.wonDeals}W / {metric.lostDeals}L)
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-yellow-600">{formatCurrency(metric.pipelineValue)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-green-600">{formatCurrency(metric.wonValue)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-purple-600">{formatPercent(metric.conversionRate)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {metric.completedTasks}/{metric.totalTasks}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de detalhes */}
      {selectedResponsible && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header do modal */}
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 bg-mcsystem-500 rounded-full flex items-center justify-center text-white font-bold">
                  {selectedResponsible.userName.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-bold text-lg text-gray-900">{selectedResponsible.userName}</h3>
                  <p className="text-sm text-gray-500">{selectedResponsible.userEmail}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedResponsible(null)}
                className="text-gray-400 hover:text-gray-600 p-2 rounded-full hover:bg-gray-100"
              >
                <X size={20} />
              </button>
            </div>

            {/* Tabs */}
            <div className="px-6 py-3 border-b border-gray-200 flex gap-4">
              {(['clients', 'deals', 'tasks', 'revenue'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setDetailTab(tab)}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                    detailTab === tab
                      ? 'bg-mcsystem-500 text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {tab === 'clients' && 'Clientes'}
                  {tab === 'deals' && 'Oportunidades'}
                  {tab === 'tasks' && 'Tarefas'}
                  {tab === 'revenue' && 'Receitas'}
                </button>
              ))}
            </div>

            {/* Conteúdo do modal */}
            <div className="flex-1 overflow-y-auto p-6">
              {detailTab === 'clients' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className="bg-blue-50 rounded-lg p-4">
                      <p className="text-sm text-blue-600 font-medium">Total</p>
                      <p className="text-2xl font-bold text-blue-900">{selectedResponsible.totalClients}</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-4">
                      <p className="text-sm text-green-600 font-medium">Ativos</p>
                      <p className="text-2xl font-bold text-green-900">{selectedResponsible.activeClients}</p>
                    </div>
                    <div className="bg-yellow-50 rounded-lg p-4">
                      <p className="text-sm text-yellow-600 font-medium">Prospects</p>
                      <p className="text-2xl font-bold text-yellow-900">{selectedResponsible.prospectClients}</p>
                    </div>
                  </div>
                  
                  {companies
                    .filter(c => c.responsible_users?.includes(selectedResponsible.userId))
                    .map(company => (
                      <div key={company.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-semibold text-gray-900">{company.name}</h4>
                            <p className="text-sm text-gray-500">{company.segment}</p>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                            company.status === 'Active' ? 'bg-green-100 text-green-800' :
                            company.status === 'Prospect' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {company.status === 'Active' ? 'Ativo' :
                             company.status === 'Prospect' ? 'Prospect' : 'Churned'}
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              )}

              {detailTab === 'deals' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-4 gap-4 mb-6">
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-sm text-gray-600 font-medium">Total</p>
                      <p className="text-2xl font-bold text-gray-900">{selectedResponsible.totalDeals}</p>
                    </div>
                    <div className="bg-yellow-50 rounded-lg p-4">
                      <p className="text-sm text-yellow-600 font-medium">Abertas</p>
                      <p className="text-2xl font-bold text-yellow-900">{selectedResponsible.openDeals}</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-4">
                      <p className="text-sm text-green-600 font-medium">Ganhas</p>
                      <p className="text-2xl font-bold text-green-900">{selectedResponsible.wonDeals}</p>
                    </div>
                    <div className="bg-red-50 rounded-lg p-4">
                      <p className="text-sm text-red-600 font-medium">Perdidas</p>
                      <p className="text-2xl font-bold text-red-900">{selectedResponsible.lostDeals}</p>
                    </div>
                  </div>
                  
                  {deals
                    .filter(d => d.responsible_users?.includes(selectedResponsible.userId) && filterByDate(d.createdAt))
                    .map(deal => {
                      const stage = dealStages.find(s => s.id === deal.stage);
                      return (
                        <div key={deal.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
                          <div className="flex justify-between items-start">
                            <div>
                              <h4 className="font-semibold text-gray-900">{deal.title}</h4>
                              <p className="text-sm text-gray-500">{companies.find(c => c.id === deal.companyId)?.name}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold text-gray-900">{formatCurrency(deal.value || 0)}</p>
                              <span className="text-xs text-gray-500">{stage?.name}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}

              {detailTab === 'tasks' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-4 gap-4 mb-6">
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-sm text-gray-600 font-medium">Total</p>
                      <p className="text-2xl font-bold text-gray-900">{selectedResponsible.totalTasks}</p>
                    </div>
                    <div className="bg-yellow-50 rounded-lg p-4">
                      <p className="text-sm text-yellow-600 font-medium">Pendentes</p>
                      <p className="text-2xl font-bold text-yellow-900">{selectedResponsible.pendingTasks}</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-4">
                      <p className="text-sm text-green-600 font-medium">Concluídas</p>
                      <p className="text-2xl font-bold text-green-900">{selectedResponsible.completedTasks}</p>
                    </div>
                    <div className="bg-red-50 rounded-lg p-4">
                      <p className="text-sm text-red-600 font-medium">Atrasadas</p>
                      <p className="text-2xl font-bold text-red-900">{selectedResponsible.overdueTasks}</p>
                    </div>
                  </div>
                  
                  <div className="bg-blue-50 rounded-lg p-4 mb-4">
                    <p className="text-sm text-blue-600 font-medium">Reuniões</p>
                    <p className="text-2xl font-bold text-blue-900">
                      {selectedResponsible.completedMeetings} / {selectedResponsible.totalMeetings}
                    </p>
                  </div>
                </div>
              )}

              {detailTab === 'revenue' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-green-50 rounded-lg p-4">
                      <p className="text-sm text-green-600 font-medium">Total Vendido</p>
                      <p className="text-2xl font-bold text-green-900">{formatCurrency(selectedResponsible.wonValue)}</p>
                    </div>
                    <div className="bg-blue-50 rounded-lg p-4">
                      <p className="text-sm text-blue-600 font-medium">Ticket Médio</p>
                      <p className="text-2xl font-bold text-blue-900">{formatCurrency(selectedResponsible.avgDealValue)}</p>
                    </div>
                  </div>
                  
                  <h4 className="font-semibold text-gray-900 mb-3">Top Tipos de Receita</h4>
                  <div className="space-y-3">
                    {selectedResponsible.topRevenueTypes.map((rt, idx) => (
                      <div key={idx} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex justify-between items-center mb-2">
                          <h5 className="font-medium text-gray-900">{rt.name}</h5>
                          <span className="text-sm font-semibold text-green-600">{formatCurrency(rt.value)}</span>
                        </div>
                        <p className="text-sm text-gray-500">{rt.count} oportunidade(s) ganha(s)</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};