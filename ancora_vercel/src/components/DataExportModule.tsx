

import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { Company, Contact, Deal, Task, FinancialRecord, ChartOfAccount, User } from '../types';
import { Database, Download, Users, BarChart3, Contact as ContactIcon, Calendar, DollarSign, Tags, UserCog, AlertTriangle, Loader2 } from 'lucide-react';

interface DataExportModuleProps {
  companies: Company[];
  contacts: Contact[];
  deals: Deal[];
  tasks: Task[];
  financeRecords: FinancialRecord[];
  chartOfAccounts: ChartOfAccount[];
  users: User[];
}

export const DataExportModule: React.FC<DataExportModuleProps> = ({
  companies,
  contacts,
  deals,
  tasks,
  financeRecords,
  chartOfAccounts,
  users,
}) => {
    const [selectedEntities, setSelectedEntities] = useState<Record<string, boolean>>({});
    const [isExporting, setIsExporting] = useState(false);

    const entitiesToExport = [
        {
            group: 'Dados de CRM',
            items: [
                { id: 'companies', label: 'Clientes', icon: Users, data: companies, count: companies.length },
                { id: 'contacts', label: 'Contatos', icon: ContactIcon, data: contacts, count: contacts.length },
                { id: 'deals', label: 'Negócios (Pipeline)', icon: BarChart3, data: deals, count: deals.length },
            ]
        },
        {
            group: 'Dados Financeiros',
            items: [
                { id: 'financeRecords', label: 'Lançamentos Financeiros', icon: DollarSign, data: financeRecords, count: financeRecords.length },
                { id: 'chartOfAccounts', label: 'Plano de Contas', icon: Tags, data: chartOfAccounts, count: chartOfAccounts.length },
            ]
        },
        {
            group: 'Dados Operacionais',
            items: [
                { id: 'tasks', label: 'Compromissos e Tarefas', icon: Calendar, data: tasks, count: tasks.length },
                { id: 'users', label: 'Usuários e Colaboradores', icon: UserCog, data: users, count: users.length },
            ]
        }
    ];

    const handleSelect = (id: string) => {
        setSelectedEntities(prev => ({
            ...prev,
            [id]: !prev[id]
        }));
    };

    const handleExport = () => {
        setIsExporting(true);

        // Create a new workbook
        const wb = XLSX.utils.book_new();

        entitiesToExport.forEach(group => {
            group.items.forEach(entity => {
                if (selectedEntities[entity.id] && entity.data.length > 0) {
                    // Sanitize nested objects/arrays for better CSV/XLSX compatibility
                    const sanitizedData = entity.data.map(item => {
                        const newItem: Record<string, any> = {};
                        for (const key in item) {
                            if (typeof item[key as keyof typeof item] === 'object' && item[key as keyof typeof item] !== null) {
                                newItem[key] = JSON.stringify(item[key as keyof typeof item]);
                            } else {
                                newItem[key] = item[key as keyof typeof item];
                            }
                        }
                        return newItem;
                    });

                    // Convert JSON data to a worksheet
                    const ws = XLSX.utils.json_to_sheet(sanitizedData);
                    
                    // Append the worksheet to the workbook with a sanitized name
                    const sheetName = entity.label.replace(/[^a-zA-Z0-9_]/g, '').substring(0, 31);
                    XLSX.utils.book_append_sheet(wb, ws, sheetName);
                }
            });
        });

        // Trigger the download of the XLSX file
        XLSX.writeFile(wb, "exportacao_mcsystem.xlsx");

        setTimeout(() => setIsExporting(false), 1000);
    };
    
    const isAnySelected = Object.values(selectedEntities).some(Boolean);

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 flex items-start gap-6">
                <div className="bg-mcsystem-100 p-4 rounded-xl text-mcsystem-500">
                    <Database size={32} />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-mcsystem-900">Exportação de Banco de Dados</h2>
                    <p className="text-gray-500 mt-1 max-w-2xl">Selecione os conjuntos de dados que deseja exportar. Um arquivo XLSX (Excel) consolidado será gerado para download. Cada conjunto de dados selecionado estará em uma aba separada.</p>
                </div>
            </div>

            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-r-lg text-yellow-800 text-sm flex items-center gap-4">
                <AlertTriangle className="flex-shrink-0 text-yellow-500" />
                <div>
                    <span className="font-bold">Atenção:</span> Os dados exportados podem conter informações sensíveis. Manuseie o arquivo com responsabilidade e em conformidade com as políticas de privacidade.
                </div>
            </div>

            <div className="space-y-6">
                {entitiesToExport.map(group => (
                    <div key={group.group} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                        <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">{group.group}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {group.items.map(entity => {
                                const Icon = entity.icon;
                                const isSelected = !!selectedEntities[entity.id];
                                return (
                                <label
                                    key={entity.id}
                                    className={`flex items-start p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 ${
                                        isSelected 
                                        ? 'bg-mcsystem-50 border-mcsystem-500 shadow-md' 
                                        : 'bg-white border-gray-100 hover:border-mcsystem-200 hover:bg-gray-50'
                                    }`}
                                >
                                    <input 
                                        type="checkbox" 
                                        className="h-5 w-5 rounded border-gray-300 text-mcsystem-600 focus:ring-mcsystem-500 mt-1 mr-4"
                                        checked={isSelected}
                                        onChange={() => handleSelect(entity.id)}
                                    />
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <Icon size={16} className={isSelected ? 'text-mcsystem-600' : 'text-gray-400'} />
                                            <span className="font-bold text-gray-800">{entity.label}</span>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-1">{entity.count} registros no banco</p>
                                    </div>
                                </label>
                            )})}
                        </div>
                    </div>
                ))}
            </div>

            <div className="mt-8 flex justify-center">
                <button
                    onClick={handleExport}
                    disabled={!isAnySelected || isExporting}
                    className="px-8 py-4 bg-mcsystem-900 text-white rounded-xl font-bold text-lg hover:bg-mcsystem-800 transition-all shadow-xl shadow-mcsystem-900/20 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                >
                    {isExporting ? (
                        <>
                            <Loader2 size={24} className="animate-spin mr-3" />
                            Exportando...
                        </>
                    ) : (
                        <>
                            <Download size={24} className="mr-3" />
                            Exportar Dados Selecionados
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};