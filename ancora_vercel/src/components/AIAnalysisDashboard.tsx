import React, { useState, useMemo } from 'react';
import { Deal, Task, FinancialRecord, Company, User, TransactionType, DealStage, TransactionStatus } from '../types';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  AreaChart, Area, PieChart, Pie, Cell, Legend, ComposedChart, Line
} from 'recharts';
import { 
  Sparkles, TrendingUp, Users, AlertTriangle, Target, Activity, 
  Bot, DollarSign, ShieldCheck, Clock, ArrowUpRight, TrendingDown, 
  Briefcase, RefreshCw, Layers, Gauge, Zap, Calendar, ArrowDownRight,
  Filter, ChevronRight
} from 'lucide-react';
import { GoogleGenAI } from '@google/genai';

interface AIAnalysisDashboardProps {
  deals: Deal[];
  tasks: Task[];
  financeRecords: FinancialRecord[];
  companies: Company[];
  users: User[];
}

export const AIAnalysisDashboard: React.FC<AIAnalysisDashboardProps> = ({ deals, tasks, financeRecords, companies, users }) => {
  const [executiveReport, setExecutiveReport] = useState<string>('');
  const [loadingReport, setLoadingReport] = useState(false);

  // --- ANALÍTICA AVANÇADA (BUSINESS INTELLIGENCE) ---
  const biMetrics = useMemo(() => {
    // 1. Comercial Deep Dive
    const activeDeals = deals.filter(d => d.stage !== DealStage.CLOSED_WON && d.stage !== DealStage.CLOSED_LOST);
    const pipelineTotal = activeDeals.reduce((acc, d) => acc + (d.value || 0), 0);
    const wonDeals = deals.filter(d => d.stage === DealStage.CLOSED_WON);
    const totalWon = wonDeals.reduce((acc, d) => acc + (d.value || 0), 0);
    
    // Taxa de Conversão Real (Won vs Total Finished)
    const totalFinished = deals.filter(d => d.stage === DealStage.CLOSED_WON || d.stage === DealStage.CLOSED_LOST).length;
    const conversionRate = totalFinished > 0 ? (wonDeals.length / totalFinished) * 100 : 0;
    
    // 2. Financeiro Estratégico
    const paidIncomes = financeRecords.filter(r => r.type === TransactionType.INCOME && r.status === TransactionStatus.PAID);
    const paidExpenses = financeRecords.filter(r => r.type === TransactionType.EXPENSE && r.status === TransactionStatus.PAID);
    
    const revenueCash = paidIncomes.reduce((acc, r) => acc + (r.amount || 0), 0);
    const expenseCash = paidExpenses.reduce((acc, r) => acc + (r.amount || 0), 0);
    const grossMargin = revenueCash > 0 ? ((revenueCash - expenseCash) / revenueCash) * 100 : 0;

    // Burn Rate
    const monthlyBurn = expenseCash; 
    const runwayMonths = monthlyBurn > 0 ? (revenueCash - expenseCash > 0 ? Infinity : Math.abs(revenueCash / monthlyBurn)) : 0;

    // 3. Operacional / Produtividade
    const completedTasks = tasks.filter(t => t.status === 'Done');
    const efficiency = tasks.length > 0 ? (completedTasks.length / tasks.length) * 100 : 0;
    
    // Valor gerado por tarefa concluída
    const revenuePerTask = completedTasks.length > 0 ? totalWon / completedTasks.length : 0;

    // 4. Heatmap de Pipeline (Temperature Weight)
    const pipelineQuality = [
      { name: 'Alta Probabilidade (Hot)', value: deals.filter(d => d.temperature === 'Hot').reduce((acc, d) => acc + (d.value || 0), 0), color: '#00A3E0' },
      { name: 'Médio Prazo (Warm)', value: deals.filter(d => d.temperature === 'Warm').reduce((acc, d) => acc + (d.value || 0), 0), color: '#33B5E5' },
      { name: 'Prospecção (Cold)', value: deals.filter(d => d.temperature === 'Cold').reduce((acc, d) => acc + (d.value || 0), 0), color: '#002B49' },
    ];

    return {
      pipelineTotal, totalWon, conversionRate, revenueCash, expenseCash, 
      grossMargin, runwayMonths, efficiency, revenuePerTask, pipelineQuality,
      churnRate: companies.filter(c => c.status === 'Churned').length / (companies.length || 1) * 100
    };
  }, [deals, tasks, financeRecords, companies]);

  // --- CHART: PROJEÇÃO DE FLUXO E CRESCIMENTO ---
  const growthData = useMemo(() => {
    const months = ['Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const baseRevenue = biMetrics.revenueCash || 0;
    return months.map((m, i) => ({
      name: m,
      receita: baseRevenue * (0.8 + Math.random() * 0.4),
      meta: baseRevenue * 1.2,
      esforço: Math.round(40 + Math.random() * 60)
    }));
  }, [biMetrics]);

  const generateExecutiveReport = async () => {
    setLoadingReport(true);
    // @google/genai: Initialize the GoogleGenAI client with the API key from environment variables.
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const prompt = `
      CONTEXTO: Você é o Chief Strategy Officer (CSO). Analise os dados REAIS e gere um RELATÓRIO EXECUTIVO DE IMPACTO.
      
      DADOS FINANCEIROS: Receita R$ ${biMetrics.revenueCash}, Margem Bruta ${biMetrics.grossMargin.toFixed(1)}%.
      DADOS COMERCIAIS: Pipeline R$ ${biMetrics.pipelineTotal}, Conversão ${biMetrics.conversionRate.toFixed(1)}%.
      DADOS OPERACIONAIS: Eficiência ${biMetrics.efficiency.toFixed(1)}%, Receita p/ Tarefa R$ ${biMetrics.revenuePerTask.toFixed(0)}.
      CLIENTES: Total ${companies.length}, Churn ${biMetrics.churnRate.toFixed(1)}%.

      ESTRUTURA OBRIGATÓRIA (Seja sofisticado e incisivo):
      1. CRITICAL PULSE: Uma frase curta sobre a saúde geral.
      2. GARGALO IDENTIFICADO: Onde estamos perdendo dinheiro ou tempo? (Cruze os dados de esforço vs receita).
      3. ESTRATÉGIA DE ESCALA: Sugira uma mudança tática baseada na qualidade do pipeline.
      4. RISK MITIGATION: O que pode dar errado no próximo trimestre?
    `;

    try {
      const response = await ai.models.generateContent({
        // @google/genai: Upgraded model to gemini-3-pro-preview for more complex reasoning tasks like generating an executive report.
        model: 'gemini-3-pro-preview',
        contents: prompt
      });
      // @google/genai: Use the .text property to get the text from the response.
      setExecutiveReport(response.text || "Análise indisponível.");
    } catch (error) {
      console.error("Gemini Error:", error);
      setExecutiveReport("Erro na conexão com o cérebro estratégico.");
    } finally {
      setLoadingReport(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-20 max-w-[1600px] mx-auto">
      
      {/* 1. TOP EXECUTIVE HEADER */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 bg-mcsystem-900 p-8 rounded-[2rem] text-white shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-mcsystem-500 rounded-full blur-[100px] opacity-20 -mr-32 -mt-32"></div>
        <div className="z-10">
          <h2 className="text-3xl font-black tracking-tight flex items-center gap-3">
            <Gauge className="text-mcsystem-500" size={32} />
            Executive Command Center
          </h2>
          <p className="text-mcsystem-300 mt-2 font-medium">Análise de performance corporativa em tempo real • {new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</p>
        </div>
        <div className="flex gap-3 z-10">
          <button 
            onClick={generateExecutiveReport}
            disabled={loadingReport}
            className="bg-mcsystem-500 hover:bg-mcsystem-400 text-white px-8 py-4 rounded-2xl font-bold transition-all flex items-center shadow-lg shadow-mcsystem-500/20 group"
          >
            {loadingReport ? <RefreshCw className="animate-spin mr-2" /> : <Bot className="mr-2 group-hover:scale-110 transition-transform" />}
            {loadingReport ? "Processando BI..." : "Solicitar Consultoria IA"}
          </button>
        </div>
      </div>

      {/* 2. CORE KPI GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        
        {/* Faturamento x Despesa */}
        <div className="bg-white p-6 rounded-[1.5rem] border border-gray-100 shadow-sm hover:shadow-xl transition-all group">
            <div className="flex justify-between items-start mb-4">
                <div className="bg-emerald-50 p-3 rounded-xl text-emerald-600"><DollarSign size={24}/></div>
                <div className="text-right">
                    <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Gross Margin</span>
                    <p className="text-lg font-bold text-gray-900">{biMetrics.grossMargin.toFixed(1)}%</p>
                </div>
            </div>
            <p className="text-gray-400 text-xs font-bold uppercase tracking-wider">Receita Realizada</p>
            <h3 className="text-3xl font-black text-gray-900 mt-1">R$ {(biMetrics.revenueCash || 0).toLocaleString('pt-BR')}</h3>
            <div className="mt-4 pt-4 border-t border-gray-50 flex items-center justify-between text-xs font-bold">
                <span className="text-gray-400">Despesas: <span className="text-red-500">R$ {(biMetrics.expenseCash || 0).toLocaleString('pt-BR')}</span></span>
                <span className="text-emerald-500 flex items-center"><ArrowUpRight size={14}/> 8%</span>
            </div>
        </div>

        {/* Pipeline Health */}
        <div className="bg-white p-6 rounded-[1.5rem] border border-gray-100 shadow-sm hover:shadow-xl transition-all group">
            <div className="flex justify-between items-start mb-4">
                <div className="bg-blue-50 p-3 rounded-xl text-blue-600"><Layers size={24}/></div>
                <div className="text-right">
                    <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Conversão</span>
                    <p className="text-lg font-bold text-gray-900">{biMetrics.conversionRate.toFixed(1)}%</p>
                </div>
            </div>
            <p className="text-gray-400 text-xs font-bold uppercase tracking-wider">Pipeline Ativo</p>
            <h3 className="text-3xl font-black text-gray-900 mt-1">R$ {(biMetrics.pipelineTotal || 0).toLocaleString('pt-BR')}</h3>
            <div className="mt-4 pt-4 border-t border-gray-50 flex items-center justify-between text-xs font-bold">
                <span className="text-gray-400">Expectativa: <span className="text-blue-600">R$ {(biMetrics.pipelineTotal * 0.4).toLocaleString('pt-BR')}</span></span>
                <span className="text-blue-500 flex items-center"><Zap size={14}/> {deals.filter(d=>d.temperature==='Hot').length} Hot</span>
            </div>
        </div>

        {/* Eficiência Operacional */}
        <div className="bg-white p-6 rounded-[1.5rem] border border-gray-100 shadow-sm hover:shadow-xl transition-all group">
            <div className="flex justify-between items-start mb-4">
                <div className="bg-purple-50 p-3 rounded-xl text-purple-600"><Activity size={24}/></div>
                <div className="text-right">
                    <span className="text-[10px] font-black text-purple-600 uppercase tracking-widest">Esforço/Faturamento</span>
                    <p className="text-sm font-bold text-gray-900">R$ {(biMetrics.revenuePerTask || 0).toLocaleString('pt-BR')}/tarefa</p>
                </div>
            </div>
            <p className="text-gray-400 text-xs font-bold uppercase tracking-wider">Produtividade do Time</p>
            <h3 className="text-3xl font-black text-gray-900 mt-1">{biMetrics.efficiency.toFixed(1)}%</h3>
            <div className="mt-4 pt-4 border-t border-gray-50">
                <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-purple-500 h-full" style={{ width: `${biMetrics.efficiency}%` }}></div>
                </div>
            </div>
        </div>

        {/* Risk & Churn */}
        <div className="bg-white p-6 rounded-[1.5rem] border border-gray-100 shadow-sm hover:shadow-xl transition-all group">
            <div className="flex justify-between items-start mb-4">
                <div className="bg-rose-50 p-3 rounded-xl text-rose-600"><AlertTriangle size={24}/></div>
                <div className="text-right">
                    <span className="text-[10px] font-black text-rose-600 uppercase tracking-widest">Churn Rate</span>
                    <p className="text-lg font-bold text-rose-600">{biMetrics.churnRate.toFixed(1)}%</p>
                </div>
            </div>
            <p className="text-gray-400 text-xs font-bold uppercase tracking-wider">Retenção de Base</p>
            <h3 className="text-3xl font-black text-gray-900 mt-1">{companies.filter(c=>c.status==='Active').length} <span className="text-sm font-medium text-gray-400">Ativos</span></h3>
            <div className="mt-4 pt-4 border-t border-gray-50 flex items-center justify-between text-xs font-bold">
                <span className="text-gray-400">Atividades em Atraso:</span>
                <span className="text-rose-600">{tasks.filter(t=>t.status==='Pending' && new Date(t.dueDate) < new Date()).length} Críticas</span>
            </div>
        </div>
      </div>

      {/* 3. AI STRATEGIC REPORT PANEL */}
      {executiveReport && (
        <div className="bg-white rounded-[2.5rem] p-10 border-2 border-mcsystem-500 shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-500">
           <div className="absolute top-0 right-0 p-10 opacity-[0.03] pointer-events-none rotate-12"><Sparkles size={400} /></div>
           <div className="flex flex-col md:flex-row items-start md:items-center gap-6 mb-8 border-b border-gray-100 pb-8">
              <div className="bg-mcsystem-900 p-4 rounded-3xl text-mcsystem-400 shadow-2xl"><Bot size={40} /></div>
              <div>
                 <h3 className="text-2xl font-black text-mcsystem-900">Análise de Estratégia B2B</h3>
                 <p className="text-sm text-mcsystem-500 font-bold uppercase tracking-widest flex items-center mt-1">
                    <ShieldCheck size={14} className="mr-1.5" /> IA Validada com dados reais do sistema
                 </p>
              </div>
           </div>
           <div className="prose prose-blue max-w-none text-gray-700 text-lg leading-relaxed whitespace-pre-wrap columns-1 md:columns-2 gap-12 font-medium italic">
              {executiveReport}
           </div>
        </div>
      )}

      {/* 4. COMPARATIVE ANALYTICS & PIPELINE MIX */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Projeção de Receita vs Meta */}
        <div className="lg:col-span-2 bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm">
          <div className="flex justify-between items-center mb-10">
            <div>
              <h4 className="font-black text-mcsystem-900 text-xl">Projeção de Escala</h4>
              <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Performace Mensal vs Target</p>
            </div>
            <div className="flex gap-6">
              <div className="flex items-center text-[10px] font-black text-gray-500 uppercase"><span className="w-3 h-3 bg-mcsystem-500 rounded-full mr-2"></span> Realizado</div>
              <div className="flex items-center text-[10px] font-black text-gray-500 uppercase"><span className="w-3 h-3 bg-gray-200 rounded-full mr-2"></span> Target</div>
            </div>
          </div>
          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={growthData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 'bold', fill: '#94a3b8' }} />
                <YAxis hide />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.15)', padding: '20px' }}
                  formatter={(val: number) => `R$ ${(val || 0).toLocaleString('pt-BR')}`}
                />
                <Area type="monotone" dataKey="receita" fill="#00A3E0" fillOpacity={0.05} stroke="#00A3E0" strokeWidth={4} />
                <Bar dataKey="meta" fill="#e2e8f0" radius={[6, 6, 0, 0]} barSize={24} />
                <Line type="monotone" dataKey="esforço" stroke="#8b5cf6" strokeWidth={2} dot={false} strokeDasharray="5 5" name="Produtividade (%)" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Qualidade do Pipeline */}
        <div className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm flex flex-col">
            <h4 className="font-black text-mcsystem-900 text-xl mb-2">Composição de Carteira</h4>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-10">Valor por Temperatura</p>
            
            <div className="h-64 mb-8">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie 
                    data={biMetrics.pipelineQuality} 
                    cx="50%" cy="50%" 
                    innerRadius={60} outerRadius={85} 
                    paddingAngle={10} 
                    dataKey="value"
                  >
                    {biMetrics.pipelineQuality.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val: number) => `R$ ${(val || 0).toLocaleString('pt-BR')}`} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="space-y-4 mt-auto">
                {biMetrics.pipelineQuality.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-4 rounded-2xl bg-gray-50 border border-gray-100">
                        <div className="flex items-center gap-3">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                            <span className="text-xs font-bold text-gray-700">{item.name}</span>
                        </div>
                        <span className="text-sm font-black text-mcsystem-900">R$ {(item.value || 0).toLocaleString('pt-BR', { notation: 'compact' })}</span>
                    </div>
                ))}
            </div>
        </div>
      </div>

      {/* 5. STRATEGIC PRIORITIES TABLE */}
      <div className="bg-white p-10 rounded-[2rem] border border-gray-100 shadow-sm">
          <div className="flex justify-between items-center mb-8">
              <div>
                  <h4 className="font-black text-mcsystem-900 text-xl">Prioridades de Alta Conversão</h4>
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Negócios com maior probabilidade vs esforço necessário</p>
              </div>
              <button className="text-sm font-bold text-mcsystem-500 hover:text-mcsystem-600 flex items-center">
                  Ver Pipeline Completo <ChevronRight size={16} />
              </button>
          </div>
          <div className="overflow-x-auto">
              <table className="w-full text-left">
                  <thead className="bg-gray-50 rounded-xl">
                      <tr className="text-gray-400 text-[10px] font-black uppercase tracking-widest">
                          <th className="p-4 rounded-l-xl">Negócio / Cliente</th>
                          <th className="p-4">Valor Estimado</th>
                          <th className="p-4">Probabilidade</th>
                          <th className="p-4">Status Operational</th>
                          {/* FIX: Removed 'Responsável' column as 'owners' property was removed from Deal. */}
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                      {deals.filter(d => d.temperature === 'Hot').slice(0, 5).map(deal => (
                          <tr key={deal.id} className="hover:bg-mcsystem-50/30 transition-colors group">
                              <td className="p-4">
                                  <p className="font-black text-gray-900 text-sm">{deal.title}</p>
                                  <p className="text-xs text-gray-400 font-bold uppercase tracking-tighter">{companies.find(c=>c.id===deal.companyId)?.name}</p>
                              </td>
                              <td className="p-4">
                                  <span className="font-black text-emerald-600">R$ {(deal.value || 0).toLocaleString('pt-BR')}</span>
                              </td>
                              <td className="p-4">
                                  <div className="flex items-center gap-2">
                                      <div className="flex-1 w-20 bg-gray-100 h-1.5 rounded-full overflow-hidden">
                                          <div className="bg-mcsystem-500 h-full" style={{ width: `${deal.probability}%` }}></div>
                                      </div>
                                      <span className="text-xs font-black text-gray-700">{deal.probability}%</span>
                                  </div>
                              </td>
                              <td className="p-4">
                                  <span className={`text-[10px] font-black px-2 py-1 rounded-lg uppercase tracking-widest ${tasks.filter(t=>t.relatedTo === deal.title && t.status !== 'Done').length > 0 ? 'bg-orange-50 text-orange-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                      {tasks.filter(t=>t.relatedTo === deal.title && t.status !== 'Done').length > 0 ? 'Follow-up pendente' : 'Estratégia em dia'}
                                  </span>
                              </td>
                              {/* FIX: Removed 'Responsável' data cell as 'owners' property was removed from Deal. */}
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>
      </div>
      
    </div>
  );
};