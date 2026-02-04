

import React, { useState, useMemo } from 'react';
import { FinancialRecord, Bank, TransactionType, TransactionStatus } from '../../types';
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Landmark, Wallet } from 'lucide-react';

interface CashEvolutionByBankProps {
  records: FinancialRecord[];
  banks: Bank[];
}

// FIX: Moved parseDateUTC outside the component to make it accessible throughout the file.
// Helper to parse dates consistently as UTC to avoid timezone shifts in sorting and comparison
const parseDateUTC = (dateString: string | undefined): Date => {
  if (!dateString) return new Date(0); // Return epoch if undefined
  const [year, month, day] = dateString.split('T')[0].split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

export const CashEvolutionByBank: React.FC<CashEvolutionByBankProps> = ({ records, banks }) => {
  const [selectedBankId, setSelectedBankId] = useState<string>(banks[0]?.id || '');

  const { chartData, fullStatementData, selectedBank } = useMemo(() => {
    if (!selectedBankId || banks.length === 0) {
      return { chartData: [], fullStatementData: [], selectedBank: null };
    }

    const currentBank = banks.find(b => b.id === selectedBankId);
    if (!currentBank) {
      return { chartData: [], fullStatementData: [], selectedBank: null };
    }
    
    const bankTransactions = records
      .filter(r => r.bankId === selectedBankId)
      .sort((a, b) => parseDateUTC(a.dueDate).getTime() - parseDateUTC(b.dueDate).getTime());

    let projectedRunningBalance = currentBank.initialBalance || 0;
    const statementWithProjectedBalance = bankTransactions.map(t => {
      projectedRunningBalance += (t.type === TransactionType.INCOME ? t.amount : -t.amount);
      return { ...t, balance: projectedRunningBalance };
    });
    
    const firstTransactionDate = statementWithProjectedBalance.length > 0
        ? parseDateUTC(statementWithProjectedBalance[0].dueDate).getTime()
        : Date.now();
    
    const statementWithInitialBalance = [
      {
        id: 'initial_balance_record',
        dueDate: new Date(firstTransactionDate - 86400000).toISOString(), // One day before first tx
        description: 'Saldo Inicial',
        amount: currentBank.initialBalance || 0,
        type: TransactionType.INCOME, // Treat as income for display purposes
        status: TransactionStatus.PAID,
        balance: currentBank.initialBalance || 0,
      },
      ...statementWithProjectedBalance
    ];

    const today = new Date();
    today.setUTCHours(23, 59, 59, 999);
    
    let lastRealizedBalance = currentBank.initialBalance || 0;

    const finalChartData = statementWithInitialBalance.map(item => {
      const itemDate = parseDateUTC(item.dueDate);
      const isRealizedTransaction = item.status === TransactionStatus.PAID && itemDate <= today;
      
      if (isRealizedTransaction && item.id !== 'initial_balance_record') {
        // FIX: Replaced 't.amount' with 'item.amount' as 't' is not defined in this scope.
        lastRealizedBalance += (item.type === TransactionType.INCOME ? item.amount : -item.amount);
      }
      
      return {
        date: itemDate.toLocaleDateString('pt-BR', { timeZone: 'UTC', month: 'short', day: 'numeric' }),
        realized: isRealizedTransaction ? lastRealizedBalance : null,
        projected: item.balance,
      };
    });

    // Fill forward the realized balance for a continuous line in the chart
    for (let i = 1; i < finalChartData.length; i++) {
        if (finalChartData[i].realized === null) {
            finalChartData[i].realized = finalChartData[i - 1].realized;
        }
    }

    return { 
      chartData: finalChartData, 
      fullStatementData: statementWithInitialBalance,
      selectedBank: currentBank 
    };

  }, [records, banks, selectedBankId]);

  if (banks.length === 0) {
    return (
        <div className="animate-in fade-in duration-300 space-y-6 flex flex-col items-center justify-center h-full text-gray-500 bg-white p-8 rounded-lg">
            <Wallet size={48} className="opacity-30" />
            <h3 className="text-lg font-bold">Nenhuma Conta Bancária Cadastrada</h3>
            <p className="text-sm max-w-sm text-center">Para usar esta funcionalidade, primeiro adicione uma conta bancária.</p>
        </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-300 space-y-6 p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 p-4 bg-white rounded-lg border border-gray-100 shadow-sm">
        <h3 className="text-lg font-bold text-gray-800 flex items-center">
          <Landmark size={20} className="mr-3 text-mcsystem-500" />
          Extrato e Projeção de Caixa
        </h3>
        <div className="flex items-center gap-2">
          <label htmlFor="bank-select" className="text-sm font-medium text-gray-600">Conta:</label>
          <select
            id="bank-select"
            value={selectedBankId}
            onChange={e => setSelectedBankId(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-mcsystem-500 bg-white"
          >
            {banks.map(bank => (
              <option key={bank.id} value={bank.id}>{bank.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white p-4 sm:p-6 rounded-lg border border-gray-100 shadow-sm h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData}>
            <defs>
              <linearGradient id="colorProjected" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8884d8" stopOpacity={0.1}/>
                <stop offset="95%" stopColor="#8884d8" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
            <XAxis dataKey="date" tick={{fontSize: 10}} stroke="#9ca3af" />
            <YAxis tickFormatter={(value) => `R$${Number(value).toLocaleString('pt-BR', { notation: 'compact' })}`} tick={{fontSize: 10}} stroke="#9ca3af"/>
            <Tooltip
              formatter={(value: number, name: string) => [`R$ ${value.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`, name]}
              contentStyle={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '0.5rem' }}
              labelStyle={{ fontWeight: 'bold' }}
            />
            <Legend wrapperStyle={{fontSize: "12px"}}/>
            <Area type="monotone" dataKey="projected" name="Saldo Projetado" stroke="#a78bfa" fill="url(#colorProjected)" strokeWidth={2} strokeDasharray="5 5" />
            <Line type="monotone" dataKey="realized" name="Saldo Realizado" stroke="#10b981" strokeWidth={3} dot={false} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-lg border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead className="bg-gray-50/70 text-gray-500 uppercase text-xs">
              <tr>
                <th className="p-3 text-left font-semibold">Data Venc.</th>
                <th className="p-3 text-left font-semibold">Descrição</th>
                <th className="p-3 text-right font-semibold">Entrada (R$)</th>
                <th className="p-3 text-right font-semibold">Saída (R$)</th>
                <th className="p-3 text-right font-semibold">Saldo Acumulado (R$)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {fullStatementData.map(t => {
                const isFutureOrPending = parseDateUTC(t.dueDate) > new Date() && t.status !== TransactionStatus.PAID;
                return (
                  <tr key={t.id} className={`${isFutureOrPending ? 'italic text-gray-500' : 'text-gray-800'} ${t.id === 'initial_balance_record' ? 'bg-gray-50 font-bold' : 'hover:bg-gray-50/50'}`}>
                    <td className="p-3 whitespace-nowrap">{parseDateUTC(t.dueDate).toLocaleDateString('pt-BR', {timeZone: 'UTC'})}</td>
                    <td className="p-3">{t.description}</td>
                    <td className={`p-3 text-right font-medium ${t.type === TransactionType.INCOME ? 'text-green-600' : ''}`}>
                      {t.type === TransactionType.INCOME ? t.amount.toLocaleString('pt-BR', {minimumFractionDigits: 2}) : '-'}
                    </td>
                    <td className={`p-3 text-right font-medium ${t.type === TransactionType.EXPENSE ? 'text-red-600' : ''}`}>
                      {t.type === TransactionType.EXPENSE ? t.amount.toLocaleString('pt-BR', {minimumFractionDigits: 2}) : '-'}
                    </td>
                    <td className={`p-3 text-right font-bold ${t.balance < 0 ? 'text-red-700' : 'text-gray-900'}`}>{t.balance.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};