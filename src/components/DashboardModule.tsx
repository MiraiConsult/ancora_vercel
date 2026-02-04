

import React, { useState, useMemo } from 'react';
import { Deal, Task, FinancialRecord, Company, TransactionType, TransactionStatus, DealStage } from '../types';
import { 
  TrendingUp, 
  DollarSign, 
  Target, 
  Calendar, 
  Clock, 
  CheckCircle2, 
  ArrowUpRight, 
  ArrowDownRight,
  Activity,
  Zap,
  ChevronRight,
  Filter,
  MoreHorizontal,
  Plus
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, ComposedChart, Line } from 'recharts';

interface DashboardModuleProps {
  deals: Deal[];
  tasks: Task[];
  financeRecords: FinancialRecord[];
  companies: Company[];
  onNavigate: (page: string) => void;
}

type TimeRange = 'THIS_MONTH' | 'LAST_MONTH' | 'THIS_YEAR';

export const DashboardModule: React.FC<DashboardModuleProps> = ({ deals, tasks, financeRecords, companies, onNavigate }) => {
  const [timeRange, setTimeRange] = useState<TimeRange>('THIS_MONTH');

  // --- DATA AGGREGATION ---
  const stats = useMemo(() => {
    const now = new Date();
    let startDate = new Date();
    let endDate = new Date();

    if (timeRange === 'THIS_MONTH') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    } else if (timeRange === 'LAST_MONTH') {
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0);
    } else if (timeRange === 'THIS_YEAR') {
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = new Date(now.getFullYear(), 11, 31);
    }

    const isInRange = (dateStr: string) => {
        const d = new Date(dateStr);
        return d >= startDate && d <= endDate;
    };

    // 1. Financeiro
    const filteredRecords = financeRecords.filter(r => isInRange(r.dueDate));
    const income = filteredRecords.filter(r => r.type === TransactionType.INCOME).reduce((acc, r) => acc + r.amount, 0);
    const expenses = filteredRecords.filter(r => r.type === TransactionType.EXPENSE).reduce((acc, r) => acc + r.amount, 0);
    const balance = income - expenses;
    
    // Paid vs Pending (Cashflow Health)
    const realizedIncome = filteredRecords.filter(r => r.type === TransactionType.INCOME && r.status === TransactionStatus.PAID).reduce((acc, r) => acc + r.amount, 0);

    // 2. Comercial
    // For deals, we check 'lastActivity' or creation date. Using lastActivity for recent relevance.
    const activeDeals = deals.filter(d => d.stage !== DealStage.CLOSED_WON && d.stage !== DealStage.CLOSED_LOST);
    const pipelineValue = activeDeals.reduce((acc, d) => acc + d.value, 0);
    
    const wonInPeriod = deals.filter(d => d.stage === DealStage.CLOSED_WON && isInRange(d.lastActivity));
    const wonValue = wonInPeriod.reduce((acc, d) => acc + d.value, 0);
    const wonCount = wonInPeriod.length;

    // 3. Agenda
    const todayStr = now.toISOString().split('T')[0];
    const overdueTasks = tasks.filter(t => t.status !== 'Done' && t.dueDate < todayStr).length;
    const tasksInPeriod = tasks.filter(t => isInRange(t.dueDate));
    const taskCompletionRate = tasksInPeriod.length > 0 
        ? Math.round((tasksInPeriod.filter(t => t.status === 'Done').length / tasksInPeriod.length) * 100) 
        : 0;

    return {
      income, expenses, balance, realizedIncome,
      pipelineValue, wonValue, wonCount,
      overdueTasks, taskCompletionRate,
      totalDeals: activeDeals.length
    };
  }, [deals, tasks, financeRecords, timeRange]);

  // --- CHART DATA (Mocked based on stats for visualization) ---
  const financialChartData = useMemo(() => {
      // Create a curve based on the current stats to look realistic
      const base = (stats.income || 0) / 4;
      return [
          { name: 'Sem 1', receitas: base * 0.8, despesas: (stats.expenses || 0) * 0.2 },
          { name: 'Sem 2', receitas: base * 1.2, despesas: (stats.expenses || 0) * 0.3 },
          { name: 'Sem 3', receitas: base * 0.9, despesas: (stats.expenses || 0) * 0.4 },
          { name: 'Sem 4', receitas: base * 1.1, despesas: (stats.expenses || 0) * 0.1 },
      ];
  }, [stats]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10">
      
      {/* 1. HEADER & CONTROLS */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-6">
        <div>
          <h2 className="text-3xl font-bold text-mcsystem-900 tracking-tight">Visão Geral</h2>
          <p className="text-gray-500 mt-1">Acompanhe os indicadores chave de performance da sua empresa.</p>
        </div>
        
        <div className="flex items-center bg-white p-1 rounded-xl border border-gray-200 shadow-sm">
            {(['THIS_MONTH', 'LAST_MONTH', 'THIS_YEAR'] as TimeRange[]).map((range) => (
                <button
                    key={range}
                    onClick={() => setTimeRange(range)}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                        timeRange === range 
                        ? 'bg-mcsystem-900 text-white shadow-md' 
                        : 'text-gray-500 hover:bg-gray-100'
                    }`}
                >
                    {range === 'THIS_MONTH' ? 'Este Mês' : range === 'LAST_MONTH' ? 'Mês Anterior' : 'Ano Atual'}
                </button>
            ))}
        </div>
      </div>

      {/* 2. MAIN KPI CARDS (Clickable for Navigation) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* FINANCEIRO CARD */}
        <div 
            onClick={() => onNavigate('finance')}
            className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer group relative overflow-hidden"
        >
            <div className="absolute right-0 top-0 w-24 h-24 bg-emerald-50 rounded-bl-[100px] -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
            
            <div className="relative z-10">
                <div className="flex justify-between items-start mb-4">
                    <div className="p-3 bg-emerald-100 text-emerald-700 rounded-xl">
                        <DollarSign size={24} />
                    </div>
                    <div className="flex items-center text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">
                        <ArrowUpRight size={14} className="mr-1" />
                        Resultado
                    </div>
                </div>
                
                <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">Saldo do Período</p>
                <h3 className={`text-3xl font-black mt-1 ${stats.balance >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                    R$ {(stats.balance || 0).toLocaleString('pt-BR')}
                </h3>
                
                <div className="mt-6 flex items-center justify-between text-xs border-t border-gray-50 pt-4">
                    <div className="flex flex-col">
                        <span className="text-gray-400 font-medium">Receitas</span>
                        <span className="text-emerald-600 font-bold">R$ {(stats.income || 0).toLocaleString('pt-BR')}</span>
                    </div>
                    <div className="h-8 w-px bg-gray-100"></div>
                    <div className="flex flex-col text-right">
                        <span className="text-gray-400 font-medium">Despesas</span>
                        <span className="text-red-500 font-bold">R$ {(stats.expenses || 0).toLocaleString('pt-BR')}</span>
                    </div>
                </div>
            </div>
        </div>

        {/* COMERCIAL CARD */}
        <div 
            onClick={() => onNavigate('deals')}
            className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer group relative overflow-hidden"
        >
            <div className="absolute right-0 top-0 w-24 h-24 bg-blue-50 rounded-bl-[100px] -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>

            <div className="relative z-10">
                <div className="flex justify-between items-start mb-4">
                    <div className="p-3 bg-blue-100 text-blue-700 rounded-xl">
                        <Target size={24} />
                    </div>
                    <div className="flex items-center text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-lg">
                        {stats.wonCount} Vendas
                    </div>
                </div>
                
                <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">Vendido no Período</p>
                <h3 className="text-3xl font-black text-gray-900 mt-1">
                    R$ {(stats.wonValue || 0).toLocaleString('pt-BR')}
                </h3>
                
                <div className="mt-6 flex items-center justify-between text-xs border-t border-gray-50 pt-4">
                    <div className="flex flex-col">
                        <span className="text-gray-400 font-medium">Pipeline Ativo</span>
                        <span className="text-mcsystem-600 font-bold">R$ {(stats.pipelineValue || 0).toLocaleString('pt-BR')}</span>
                    </div>
                    <div className="h-8 w-px bg-gray-100"></div>
                    <div className="flex flex-col text-right">
                        <span className="text-gray-400 font-medium">Em Negociação</span>
                        <span className="text-gray-800 font-bold">{stats.totalDeals} Deals</span>
                    </div>
                </div>
            </div>
        </div>

        {/* OPERACIONAL CARD */}
        <div 
            onClick={() => onNavigate('appointments')}
            className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer group relative overflow-hidden"
        >
            <div className="absolute right-0 top-0 w-24 h-24 bg-purple-50 rounded-bl-[100px] -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>

            <div className="relative z-10">
                <div className="flex justify-between items-start mb-4">
                    <div className="p-3 bg-purple-100 text-purple-700 rounded-xl">
                        <Activity size={24} />
                    </div>
                    <div className="flex items-center text-xs font-bold text-purple-600 bg-purple-50 px-2 py-1 rounded-lg">
                        {stats.taskCompletionRate}% Eficiência
                    </div>
                </div>
                
                <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">Tarefas em Atraso</p>
                <h3 className={`text-3xl font-black mt-1 ${stats.overdueTasks > 0 ? 'text-red-500' : 'text-gray-900'}`}>
                    {stats.overdueTasks}
                </h3>
                
                <div className="mt-6 pt-4 border-t border-gray-50">
                    <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                        <div 
                            className="bg-purple-500 h-full transition-all duration-1000" 
                            style={{ width: `${stats.taskCompletionRate}%` }}
                        ></div>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-2 text-right">Taxa de conclusão de tarefas do time</p>
                </div>
            </div>
        </div>
      </div>

      {/* 3. CHARTS & ACTIONS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Financial Evolution Chart */}
        <div className="lg:col-span-2 bg-white p-8 rounded-2xl border border-gray-100 shadow-sm">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h3 className="text-lg font-bold text-mcsystem-900">Fluxo Financeiro</h3>
                    <p className="text-sm text-gray-500">Comparativo de Receitas e Despesas (Semanal)</p>
                </div>
                <div className="flex gap-4">
                    <div className="flex items-center text-xs font-bold text-gray-500"><span className="w-3 h-3 bg-mcsystem-500 rounded-full mr-2"></span> Receitas</div>
                    <div className="flex items-center text-xs font-bold text-gray-500"><span className="w-3 h-3 bg-red-400 rounded-full mr-2"></span> Despesas</div>
                </div>
            </div>
            <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={financialChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                        <YAxis hide />
                        <Tooltip 
                            cursor={{ fill: '#f8fafc' }}
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                            formatter={(val: number) => `R$ ${(val || 0).toLocaleString('pt-BR')}`}
                        />
                        <Area type="monotone" dataKey="receitas" fill="url(#colorIncome)" stroke="#00A3E0" strokeWidth={3} fillOpacity={1} />
                        <Line type="monotone" dataKey="despesas" stroke="#ef4444" strokeWidth={3} dot={{r: 4, fill: '#ef4444'}} />
                        <defs>
                            <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#00A3E0" stopOpacity={0.2}/>
                                <stop offset="95%" stopColor="#00A3E0" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </div>

        {/* Quick Actions & Highlights */}
        <div className="space-y-6">
            <div className="bg-mcsystem-900 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 -mr-10 -mt-10 w-40 h-40 bg-mcsystem-500 rounded-full blur-3xl opacity-20"></div>
                <h3 className="text-lg font-bold mb-4 flex items-center relative z-10">
                    <Zap size={20} className="mr-2 text-yellow-400" /> Ações Rápidas
                </h3>
                <div className="space-y-3 relative z-10">
                    <button onClick={() => onNavigate('deals')} className="w-full bg-white/10 hover:bg-white/20 border border-white/10 text-left px-4 py-3 rounded-xl flex items-center justify-between transition-all group">
                        <span className="text-sm font-medium">Novo Negócio</span>
                        <ChevronRight size={16} className="text-gray-400 group-hover:text-white" />
                    </button>
                    <button onClick={() => onNavigate('finance')} className="w-full bg-white/10 hover:bg-white/20 border border-white/10 text-left px-4 py-3 rounded-xl flex items-center justify-between transition-all group">
                        <span className="text-sm font-medium">Lançar Despesa/Receita</span>
                        <ChevronRight size={16} className="text-gray-400 group-hover:text-white" />
                    </button>
                    <button onClick={() => onNavigate('companies')} className="w-full bg-white/10 hover:bg-white/20 border border-white/10 text-left px-4 py-3 rounded-xl flex items-center justify-between transition-all group">
                        <span className="text-sm font-medium">Cadastrar Cliente</span>
                        <ChevronRight size={16} className="text-gray-400 group-hover:text-white" />
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                <h3 className="text-sm font-bold text-gray-900 mb-4 uppercase tracking-wider flex items-center">
                    <Clock size={16} className="mr-2 text-mcsystem-500" /> Pendências Urgentes
                </h3>
                <div className="space-y-3">
                    {tasks.filter(t => t.status === 'Pending').slice(0, 3).map(task => (
                        <div key={task.id} className="flex items-start p-3 bg-gray-50 rounded-xl border border-gray-100">
                            <div className={`w-2 h-2 rounded-full mt-1.5 mr-3 flex-shrink-0 ${task.priority === 'High' ? 'bg-red-500' : 'bg-yellow-500'}`}></div>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-gray-800 truncate">{task.title}</p>
                                <p className="text-[10px] text-gray-500 mt-0.5">{new Date(task.dueDate).toLocaleDateString()}</p>
                            </div>
                        </div>
                    ))}
                    {tasks.filter(t => t.status === 'Pending').length === 0 && (
                        <p className="text-xs text-gray-400 italic text-center py-4">Tudo em dia!</p>
                    )}
                </div>
                <button onClick={() => onNavigate('appointments')} className="w-full mt-4 text-xs font-bold text-mcsystem-500 hover:text-mcsystem-600 text-center">
                    Ver Agenda Completa
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};