import React, { useState, useMemo, useEffect, useRef } from 'react';
import { FinancialRecord, TransactionType, TransactionStatus, ChartOfAccount, RevenueType, Bank, Company, User, FinancialRecordSplit } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, AreaChart, Area, Line, PieChart, Pie, ComposedChart, LineChart } from 'recharts';
import { ArrowUpCircle, ArrowDownCircle, AlertCircle, Bot, FileText, PieChart as PieIcon, DollarSign, Plus, X, Save, List, Hash, Tag, Search, Pencil, Trash2, Landmark, Tags, Grid3X3, CalendarRange, FileCheck, Filter, Upload, Download, ChevronDown, TrendingUp, Wallet, ArrowRightLeft, LayoutDashboard, ChevronRight, Eye, EyeOff, Calendar, ArrowUpRight, ArrowDownRight, Minus, Settings2, Check, Copy, RefreshCw, BarChart3, TrendingDown, Sparkles, CreditCard, Clock, CalendarClock, Lock, CheckSquare, Square, CheckCircle2, Calculator, Split, Building, Edit3, Table, BookTemplate, BookOpen, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { generateFinancialInsight } from '../services/geminiService';
import { supabase } from '../lib/supabaseClient';
import { CashEvolutionByBank } from './finance/CashEvolutionByBank';

interface FinanceDashboardProps {
  records: FinancialRecord[];
  setRecords: React.Dispatch<React.SetStateAction<FinancialRecord[]>>;
  revenueTypes: RevenueType[];
  setRevenueTypes: React.Dispatch<React.SetStateAction<RevenueType[]>>;
  banks: Bank[];
  setBanks: React.Dispatch<React.SetStateAction<Bank[]>>;
  chartOfAccounts: ChartOfAccount[];
  setChartOfAccounts: React.Dispatch<React.SetStateAction<ChartOfAccount[]>>;
  companies: Company[];
  setCompanies: React.Dispatch<React.SetStateAction<Company[]>>;
  currentUser: User;
}

type MainTab = 'DASHBOARD' | 'RECONCILIATION' | 'DRE' | 'CASHFLOW' | 'COA' | 'VALIDATION' | 'CASH_EVOLUTION';
type ReportViewMode = 'SUMMARY' | 'DETAILED';

interface PeriodConfig {
    year: number;
    months: number[]; // 1-12
}

// --- Internal Component: Searchable Select ---
const SearchableSelect = ({ options, value, onChange, placeholder, required }: { options: { value: string, label: string }[], value: string | undefined, onChange: (val: string) => void, placeholder?: string, required?: boolean }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const filtered = options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()));
    const selected = options.find((o) => o.value === value);

    return (
        <div className="relative" ref={wrapperRef}>
            <div 
                className={`w-full px-3 py-2.5 border rounded-lg bg-white flex justify-between items-center cursor-pointer transition-shadow ${required && !value ? 'border-red-300' : 'border-gray-200 focus-within:ring-2 focus-within:ring-mcsystem-500'}`}
                onClick={() => setIsOpen(!isOpen)}
            >
                <span className={`block truncate text-sm font-medium ${!selected ? 'text-gray-400' : 'text-gray-800'}`}>
                    {selected ? selected.label : placeholder || 'Selecione...'}
                </span>
                <ChevronDown size={16} className="text-gray-400 flex-shrink-0" />
            </div>
            
            {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100">
                    <div className="p-2 border-b border-gray-100 bg-gray-50">
                        <div className="relative">
                            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input 
                                autoFocus
                                type="text" 
                                className="w-full pl-8 pr-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:border-mcsystem-500 focus:ring-1 focus:ring-mcsystem-500" 
                                placeholder="Digite para buscar..." 
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="overflow-y-auto flex-1">
                        {filtered.length > 0 ? filtered.map((opt) => (
                            <div 
                                key={opt.value} 
                                onClick={() => { onChange(opt.value); setIsOpen(false); setSearch(''); }}
                                className={`px-3 py-2 text-xs cursor-pointer hover:bg-blue-50 border-l-2 border-transparent hover:border-mcsystem-500 ${opt.value === value ? 'bg-blue-50 text-mcsystem-700 font-bold border-mcsystem-500' : 'text-gray-600'}`}
                            >
                                {opt.label}
                            </div>
                        )) : <div className="p-3 text-xs text-gray-400 text-center">Nenhuma opção encontrada.</div>}
                    </div>
                </div>
            )}
        </div>
    )
}

export const FinanceDashboard: React.FC<FinanceDashboardProps> = ({ 
    records,
    setRecords,
    revenueTypes,
    setRevenueTypes,
    banks,
    setBanks,
    chartOfAccounts,
    setChartOfAccounts,
    companies,
    setCompanies,
    currentUser
}) => {
  const [activeTab, setActiveTab] = useState<MainTab>('RECONCILIATION');
  const [reportViewMode, setReportViewMode] = useState<ReportViewMode>('SUMMARY');
  
  // --- View Options & Advanced Filtering ---
  const [hideEmptyRows, setHideEmptyRows] = useState(true);
  const [includeProjections, setIncludeProjections] = useState(false);
  
  // Default: Current Year, All Months
  const currentYear = new Date().getFullYear();
  const [primaryPeriod, setPrimaryPeriod] = useState<PeriodConfig>({
      year: currentYear,
      months: [1,2,3,4,5,6,7,8,9,10,11,12]
  });
  
  // Default Compare: Previous Year, Same Months
  const [comparePeriod, setComparePeriod] = useState<PeriodConfig>({
      year: currentYear - 1,
      months: [1,2,3,4,5,6,7,8,9,10,11,12]
  });
  
  const [isCompareEnabled, setIsCompareEnabled] = useState(false);
  const [isPeriodMenuOpen, setIsPeriodMenuOpen] = useState(false);
  const periodMenuRef = useRef<HTMLDivElement>(null);

  const [insight, setInsight] = useState<string>('');
  const [loadingInsight, setLoadingInsight] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Import Menu State
  const [isImportMenuOpen, setIsImportMenuOpen] = useState(false);
  const importMenuRef = useRef<HTMLInputElement>(null);

  // Dashboard Date Filters
  const [dashboardFilterStartDate, setDashboardFilterStartDate] = useState<string>('');
  const [dashboardFilterEndDate, setDashboardFilterEndDate] = useState<string>('');

  // Reconciliation Filters & Bulk Selection
  const [reconFilterType, setReconFilterType] = useState<TransactionType | 'ALL'>('ALL');
  const [reconFilterStatus, setReconFilterStatus] = useState<TransactionStatus | 'ALL'>('ALL');
  const [reconFilterBank, setReconFilterBank] = useState<string>('ALL');
  const [reconSearch, setReconSearch] = useState('');
  const [selectedRecordIds, setSelectedRecordIds] = useState<Set<string>>(new Set());

  // Sorting State for Reconciliation
  type SortableKeys = keyof FinancialRecord | 'category' | 'bankName';
  const [sortConfig, setSortConfig] = useState<{ key: SortableKeys; direction: 'ascending' | 'descending' }>({ key: 'dueDate', direction: 'descending' });


  // Drill Down State
  const [isDrillDownOpen, setIsDrillDownOpen] = useState(false);
  const [drillDownRecords, setDrillDownRecords] = useState<FinancialRecord[]>([]);
  const [drillDownTitle, setDrillDownTitle] = useState('');

  // Modal State (Transactions)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [editChoiceModal, setEditChoiceModal] = useState<{ isOpen: boolean, record: FinancialRecord | null }>({ isOpen: false, record: null });
  
  // Transaction Form State
  const [newRecord, setNewRecord] = useState<Partial<FinancialRecord>>({
      description: '',
      amount: 0,
      type: TransactionType.EXPENSE,
      status: TransactionStatus.PENDING,
      dueDate: new Date().toISOString().split('T')[0],
      competenceDate: new Date().toISOString().slice(0, 7) + '-01',
      rubricId: '',
      revenueTypeId: '',
      bankId: '',
      companyId: ''
  });
  const [isRefund, setIsRefund] = useState(false);
  
  // New States for Installments/Payment Method
  const [installmentCount, setInstallmentCount] = useState<number>(1);
  const [competenceType, setCompetenceType] = useState<'FIXED' | 'RECURRING'>('FIXED');
  const [amountDistribution, setAmountDistribution] = useState<'TOTAL' | 'RECURRING'>('TOTAL');
  const [installmentsPreview, setInstallmentsPreview] = useState<Array<{ dueDate: string, competenceDate: string, amount: number }>>([]);

  // --- COA States ---
  const [isCOAModalOpen, setIsCOAModalOpen] = useState(false);
  const [coaFormType, setCoaFormType] = useState<'rubric' | 'group' | 'classification'>('classification');
  const [coaFormData, setCoaFormData] = useState<Partial<Record<'classificationName' | 'classificationCode' | 'groupName' | 'centerCode' | 'rubricName', string>>>({});
  const [selectedClassificationForCascading, setSelectedClassificationForCascading] = useState<string>('');

  const [editingRubricId, setEditingRubricId] = useState<string | null>(null);
  
  // COA Bulk & Import
  const [isBulkEditingCOA, setIsBulkEditingCOA] = useState(false);
  const [bulkCOAData, setBulkCOAData] = useState<ChartOfAccount[]>([]);
  const [selectedCOAIds, setSelectedCOAIds] = useState<Set<string>>(new Set());
  const coaFileInputRef = useRef<HTMLInputElement>(null);

  const isMockUser = currentUser.id.startsWith('u') && currentUser.id.length < 10;

  // --- Quick-add Modal States ---
  const [isNewRevenueTypeModalOpen, setIsNewRevenueTypeModalOpen] = useState(false);
  const [newRevenueTypeName, setNewRevenueTypeName] = useState('');

  const [isNewBankModalOpen, setIsNewBankModalOpen] = useState(false);
  const [newBankData, setNewBankData] = useState<Partial<Bank>>({ name: '', agency: '', account: '' });

  const [isNewCompanyModalOpen, setIsNewCompanyModalOpen] = useState(false);
  const [newCompanyData, setNewCompanyData] = useState<Partial<Company>>({ name: '', segment: '' });

  const [isNewRubricModalOpen, setIsNewRubricModalOpen] = useState(false);
  const [newRubricData, setNewRubricData] = useState({ centerCode: '', rubricName: '' });

  // State for the split revenue UI checkbox
  const [isSplittingRevenue, setIsSplittingRevenue] = useState(false);

  // --- Derived lists for Dropdowns ---
  const uniqueClassifications = useMemo(() => {
      const map = new Map<string, string>();
      chartOfAccounts.forEach(c => {
          if (!map.has(c.classificationCode)) {
              map.set(c.classificationCode, c.classificationName);
          }
      });
      return Array.from(map.entries()).map(([code, name]) => ({ code, name })).sort((a,b) => a.code.localeCompare(b.code, 'en', { numeric: true }));
  }, [chartOfAccounts]);

  const uniqueCenters = useMemo(() => {
      const map = new Map<string, { name: string, classificationCode: string }>();
      chartOfAccounts.forEach(c => {
          if (!map.has(c.centerCode)) {
              map.set(c.centerCode, { name: c.centerName, classificationCode: c.classificationCode });
          }
      });
      return Array.from(map.entries()).map(([code, data]) => ({ code, name: data.name, classificationCode: data.classificationCode })).sort((a,b) => a.code.localeCompare(b.code, 'en', { numeric: true }));
  }, [chartOfAccounts]);

  // Extract available years from records
  const availableYears = useMemo(() => {
      const years = new Set<number>();
      years.add(new Date().getFullYear()); // Always include current year
      years.add(new Date().getFullYear() - 1); // include prev
      records.forEach(r => {
          if (r.dueDate) years.add(new Date(r.dueDate).getFullYear());
          if (r.paymentDate) years.add(new Date(r.paymentDate).getFullYear());
      });
      return Array.from(years).sort((a, b) => b - a);
  }, [records]);

  const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

  const pendingValidationRecords = records.filter(r => r.needsValidation);

  // Effect to set the split checkbox state when modal opens
  useEffect(() => {
    if (isModalOpen) {
        const record = editingTransactionId ? records.find(r => r.id === editingTransactionId) : null;
        if (record && record.split_revenue && record.split_revenue.length > 0) {
            setIsSplittingRevenue(true);
        } else {
            setIsSplittingRevenue(false);
        }
    }
  }, [isModalOpen, editingTransactionId, records]);

  // Clear selections when filters change
  useEffect(() => {
      setSelectedRecordIds(new Set());
  }, [reconFilterType, reconFilterStatus, reconFilterBank, reconSearch, activeTab]);

  // Effect to auto-set Transaction Type based on Rubric
  useEffect(() => {
      if (newRecord.rubricId) {
          const rubric = chartOfAccounts.find(c => c.id === newRecord.rubricId);
          if (rubric) {
              const isIncome = rubric.classificationCode === '1';
              // Only override type if not already set correctly or if in editing mode
              if (!editingTransactionId) {
                  setNewRecord(prev => ({
                      ...prev,
                      type: isIncome ? TransactionType.INCOME : TransactionType.EXPENSE
                  }));
              }
          }
      }
  }, [newRecord.rubricId, chartOfAccounts, editingTransactionId]);

  // Effect to generate installments preview
  useEffect(() => {
    // Generate preview if count >= 1 and we are NOT editing
    if (installmentCount >= 1 && !editingTransactionId) {
        const inputAmount = newRecord.amount || 0;
        const count = installmentCount;
        
        let baseAmount = 0;
        let remainder = 0;

        if (amountDistribution === 'TOTAL') {
            // Logic: Split total amount across installments
            baseAmount = Math.floor((inputAmount / count) * 100) / 100;
            remainder = Math.round((inputAmount - (baseAmount * count)) * 100) / 100;
        } else {
            // Logic: Repeat amount for each installment (Recurring/Provision)
            baseAmount = inputAmount;
            remainder = 0;
        }
        
        // Use Competence Date as the seed for Start Date, or Today if not set.
        let startComp = new Date();
        if (newRecord.competenceDate) {
            // Competence is YYYY-MM-01, handle it correctly
            const [y, m] = newRecord.competenceDate.split('-').map(Number);
            startComp = new Date(y, m - 1, 1);
        }
        
        const newPreviews = [];
        for (let i = 0; i < count; i++) {
            let dueDateObj = new Date();
             if (newRecord.dueDate) {
                const [y,m,d] = newRecord.dueDate.split('-').map(Number);
                dueDateObj = new Date(y, m-1, d);
                dueDateObj.setMonth(dueDateObj.getMonth() + i);
            } else {
                dueDateObj = new Date(startComp);
                dueDateObj.setMonth(dueDateObj.getMonth() + 1 + i);
            }
            const dateStr = dueDateObj.toISOString().split('T')[0];

            let compDateObj;
            if (competenceType === 'RECURRING') {
                compDateObj = new Date(startComp.getFullYear(), startComp.getMonth() + i, 1);
            } else {
                compDateObj = new Date(startComp.getFullYear(), startComp.getMonth(), 1);
            }
            const compStr = compDateObj.toISOString().split('T')[0];

            const amount = (i === 0 && amountDistribution === 'TOTAL') ? baseAmount + remainder : baseAmount;
            newPreviews.push({ dueDate: dateStr, competenceDate: compStr, amount: Number(amount.toFixed(2)) });
        }
        setInstallmentsPreview(newPreviews);
    } 
  }, [installmentCount, newRecord.amount, newRecord.competenceDate, newRecord.dueDate, editingTransactionId, competenceType, amountDistribution]);

  // Click outside handler for Menus
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (importMenuRef.current && !importMenuRef.current.contains(event.target as Node)) {
        setIsImportMenuOpen(false);
      }
      if (periodMenuRef.current && !periodMenuRef.current.contains(event.target as Node)) {
        setIsPeriodMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [importMenuRef, periodMenuRef]);


  // === HANDLERS ===
  
  const requestSort = (key: SortableKeys) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
        direction = 'descending';
    }
    setSortConfig({ key, direction });
  };
  
  // --- Revenue Split Handlers ---
  const handleToggleSplit = (e: React.ChangeEvent<HTMLInputElement>) => {
    const isChecked = e.target.checked;
    setIsSplittingRevenue(isChecked);
    if (isChecked && (!newRecord.split_revenue || newRecord.split_revenue.length === 0)) {
        setNewRecord(prev => ({...prev, split_revenue: [{ revenue_type_id: '', amount: 0 }]}));
    } else if (!isChecked) {
        // Clear split data if unchecked to prevent accidental saving
        setNewRecord(prev => ({...prev, split_revenue: [] }));
    }
  };

  const handleSplitChange = (index: number, field: 'revenue_type_id' | 'amount', value: string | number) => {
      const updatedSplits = [...(newRecord.split_revenue || [])];
      const finalValue = field === 'amount' ? Number(value) : value;
      updatedSplits[index] = { ...updatedSplits[index], [field]: finalValue };
      setNewRecord(prev => ({ ...prev, split_revenue: updatedSplits }));
  };

  const addSplit = () => {
      setNewRecord(prev => ({
          ...prev,
          split_revenue: [...(prev.split_revenue || []), { revenue_type_id: '', amount: 0 }]
      }));
  };

  const removeSplit = (index: number) => {
      setNewRecord(prev => ({
          ...prev,
          split_revenue: (prev.split_revenue || []).filter((_, i) => i !== index)
      }));
  };
  
  // --- Quick-Add Handlers ---
  const handleSaveNewRevenueType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRevenueTypeName.trim()) return;

    const newType: RevenueType = { 
        id: `rt_${Date.now()}`, 
        tenant_id: currentUser.tenant_id, 
        name: newRevenueTypeName.trim() 
    };
    
    setRevenueTypes(prev => [...prev, newType]); // Optimistic update
    
    if (!isMockUser) {
        try {
            const { tenant_id, ...payloadForDb } = newType;
            const { error } = await supabase.from('revenue_types').insert(payloadForDb);
            if (error) throw error;
            
            // On success
            setNewRecord(prev => ({ ...prev, revenueTypeId: newType.id }));
            setIsNewRevenueTypeModalOpen(false);
            setNewRevenueTypeName('');
        } catch (error: any) {
            console.error("Error saving new revenue type:", error);
            alert("Erro ao salvar novo tipo de receita: " + error.message);
            setRevenueTypes(prev => prev.filter(rt => rt.id !== newType.id)); // Rollback
            return;
        }
    } else {
        // Mock user success
        setNewRecord(prev => ({ ...prev, revenueTypeId: newType.id }));
        setIsNewRevenueTypeModalOpen(false);
        setNewRevenueTypeName('');
    }
  };

  const handleSaveNewBank = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBankData.name?.trim()) return;
    
    const newBank: Bank = { 
        id: `b_${Date.now()}`, 
        tenant_id: currentUser.tenant_id, 
        name: newBankData.name.trim(),
        agency: newBankData.agency || '',
        account: newBankData.account || '',
        initialBalance: 0 // Default value as it's not in the form
    };
    
    setBanks(prev => [...prev, newBank]); // Optimistic update
    
    if (!isMockUser) {
        try {
            const { tenant_id, ...payloadForDb } = newBank;
            const { error } = await supabase.from('banks').insert(payloadForDb);
            if (error) throw error;
            
            // On success
            setNewRecord(prev => ({ ...prev, bankId: newBank.id }));
            setIsNewBankModalOpen(false);
            setNewBankData({ name: '', agency: '', account: '' });

        } catch (error: any) {
            console.error("Error saving new bank:", error);
            alert("Erro ao salvar novo banco: " + error.message);
            setBanks(prev => prev.filter(b => b.id !== newBank.id)); // Rollback
            return;
        }
    } else {
        // Mock user success
        setNewRecord(prev => ({ ...prev, bankId: newBank.id }));
        setIsNewBankModalOpen(false);
        setNewBankData({ name: '', agency: '', account: '' });
    }
  };
  
  const handleSaveNewCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompanyData.name?.trim()) return;

    // Create the full object with a client-side generated ID
    const newCompany: Company = {
      id: `c_${Date.now()}`,
      tenant_id: currentUser.tenant_id,
      name: newCompanyData.name.trim(),
      status: 'Prospect',
      segment: newCompanyData.segment || 'Pequeno',
      cnpj: '',
      location: '',
    };
    
    // Optimistic UI update
    setCompanies(prev => [...prev, newCompany]);
    
    if (!isMockUser) {
        try {
            // The trigger will handle tenant_id, but we need to provide the primary key 'id'
            const { tenant_id, ...payloadForDb } = newCompany;
            const { error } = await supabase.from('clients').insert(payloadForDb);
            if (error) throw error;
            
            // On success: update main form, close modal, reset local form
            setNewRecord(prev => ({...prev, companyId: newCompany.id}));
            setIsNewCompanyModalOpen(false);
            setNewCompanyData({ name: '', segment: '' });

        } catch (error: any) {
            console.error("Error saving new company:", error);
            alert("Erro ao salvar novo cliente: " + error.message);
            // Rollback optimistic update on failure
            setCompanies(prev => prev.filter(c => c.id !== newCompany.id));
            // Do not close modal, do not reset form, just return
            return;
        }
    } else {
        // Mock user logic (always succeeds)
        setNewRecord(prev => ({...prev, companyId: newCompany.id}));
        setIsNewCompanyModalOpen(false);
        setNewCompanyData({ name: '', segment: '' });
    }
  };
  
  const handleSaveNewRubric = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRubricData.centerCode || !newRubricData.rubricName) return;
  
    const center = uniqueCenters.find(c => c.code === newRubricData.centerCode);
    const classification = uniqueClassifications.find(c => c.code === center?.classificationCode);
    if (!center || !classification) return;
  
    const existingInCenter = chartOfAccounts.filter(c => c.centerCode === newRubricData.centerCode);
    let maxSuffix = 0;
    existingInCenter.forEach(c => {
        const parts = c.rubricCode.split('.');
        const suffix = parseInt(parts[parts.length - 1]);
        if (!isNaN(suffix) && suffix > maxSuffix) maxSuffix = suffix;
    });
    const nextCode = `${newRubricData.centerCode}.${maxSuffix + 1}`;
    const newId = `coa_${Date.now()}`;
    const entryToSave: ChartOfAccount = { 
        id: newId, 
        tenant_id: currentUser.tenant_id, 
        classificationCode: classification.code, 
        classificationName: classification.name, 
        centerCode: center.code, 
        centerName: center.name, 
        rubricCode: nextCode, 
        rubricName: newRubricData.rubricName.toUpperCase() 
    };
    
    setChartOfAccounts(prev => [...prev, entryToSave]);
    
    if (!isMockUser) {
        const { error } = await supabase.from('chart_of_accounts').insert(entryToSave);
        if (error) console.error("Error saving rubric:", error);
    }
    
    setNewRecord(prev => ({...prev, rubricId: entryToSave.id}));
    setIsNewRubricModalOpen(false);
    setNewRubricData({ centerCode: '', rubricName: '' });
  };

  const toggleMonth = (monthIndex: number, isCompare: boolean) => {
      const targetPeriod = isCompare ? comparePeriod : primaryPeriod;
      const setTarget = isCompare ? setComparePeriod : setPrimaryPeriod;
      
      const newMonths = targetPeriod.months.includes(monthIndex)
          ? targetPeriod.months.filter(m => m !== monthIndex)
          : [...targetPeriod.months, monthIndex].sort((a,b) => a - b);
      
      setTarget({ ...targetPeriod, months: newMonths });
  };

  const selectAllMonths = (isCompare: boolean) => {
      const setTarget = isCompare ? setComparePeriod : setPrimaryPeriod;
      const targetYear = isCompare ? comparePeriod.year : primaryPeriod.year;
      setTarget({ year: targetYear, months: [1,2,3,4,5,6,7,8,9,10,11,12] });
  };

  const clearMonths = (isCompare: boolean) => {
      const setTarget = isCompare ? setComparePeriod : setPrimaryPeriod;
      const targetYear = isCompare ? comparePeriod.year : primaryPeriod.year;
      setTarget({ year: targetYear, months: [] });
  };

  const copyPrimaryToCompare = () => {
      setComparePeriod({
          year: comparePeriod.year, // Keep selected year
          months: [...primaryPeriod.months] // Copy months
      });
  };

  // ... (Import Handlers Unchanged) ...
  const handleDownloadTemplate = () => {
    const BOM = "\uFEFF";
    const headers = ['Vencimento', 'Competencia', 'Descricao', 'Valor', 'Tipo', 'Categoria', 'Banco', 'Cliente', 'Tipo de Receita'];
    const row1 = ['20/12/2023', '12/2023', 'Venda de Consultoria', '2500,00', 'Receita', 'Serviços Prestados', 'Banco Itaú', 'Empresa Exemplo', 'Consultoria'];
    const row2 = ['22/12/2023', '12/2023', 'Conta de Luz', '350,50', 'Despesa', 'Energia Elétrica', 'Nubank', '', ''];
    const csvContent = BOM + [headers.join(';'), row1.join(';'), row2.join(';')].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'modelo_financeiro.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setIsImportMenuOpen(false);
  };

  const handleImportClick = () => { if (fileInputRef.current) fileInputRef.current.click(); setIsImportMenuOpen(false); };
  
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (isMockUser) {
        alert("A importação não está disponível para o usuário de demonstração.");
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
    }
    const file = event.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    
    reader.onload = async (e) => {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        if (!arrayBuffer) return;

        // Decode using windows-1252 for Excel compatibility
        const text = new TextDecoder('windows-1252').decode(arrayBuffer);
        if (!text) return;

        try {
            const lines = text.split(/\r?\n/);
const newRecords: FinancialRecord[] = [];
            const separator = lines[0].includes(";") ? ";" : ",";
            
            const headerRow = lines[0].toLowerCase();
            const headers = headerRow.split(separator).map(h => h.trim());

            const getIndex = (keys: string[]) => {
               for (const key of keys) {
                   const index = headers.indexOf(key);
                   if (index !== -1) return index;
               }
               return -1;
            }

            const dueDateIdx = getIndex(["vencimento"]);
            const competenceIdx = getIndex(["competencia", "competência"]);
            const descIdx = getIndex(["descricao", "descrição"]);
            const amountIdx = getIndex(["valor"]);
            const typeIdx = getIndex(["tipo"]);
            const categoryIdx = getIndex(["categoria"]);
            const bankIdx = getIndex(["banco"]);
            const clientIdx = getIndex(["cliente"]);
            const revenueTypeIdx = getIndex(["tipo de receita"]);
            

            const parseDate = (str: string) => {
                if (!str) return new Date().toISOString().split('T')[0];
                if (str.includes('/')) {
                    const parts = str.split('/');
                    if (parts.length === 3) {
                       const [day, month, year] = parts;
                       return `${year.padStart(4, '20')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                    }
                } else if (str.includes('-')) {
                    return str; // Already ISO-ish
                }
                return new Date().toISOString().split('T')[0];
            }
            const parseCompetence = (str: string, dueDate: string) => {
                if(!str) return dueDate;
                if(str.match(/^\d{2}\/\d{4}$/)) {
                    const [month, year] = str.split('/');
                    return `${year}-${month.padStart(2, '0')}-01`;
                }
                if(str.match(/^\d{4}-\d{2}$/)) {
                    return `${str}-01`;
                }
                return parseDate(str);
            }
            const parseAmount = (raw: string) => {
               if (!raw) return 0;
               let clean = raw.replace(/"/g, '').trim();
               if (clean.includes(',') && clean.includes('.')) { 
                   clean = clean.replace(/\./g, '').replace(',', '.'); 
               } else if (clean.includes(',')) { 
                   clean = clean.replace(',', '.'); 
               }
               const value = parseFloat(clean);
               return isNaN(value) ? 0 : value;
            }

            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                
                const cols = line.split(separator);
                if (cols.length < 3) continue;

                const recordId = `imp-${Date.now()}-${i}`;
                const dueDate = parseDate(cols[dueDateIdx]);
                const competenceStr = cols[competenceIdx]?.trim();
                let competenceDate = dueDate; // Default to due date
                if (competenceStr) {
                    const monthMap: { [key: string]: string } = {
                        'jan': '01', 'fev': '02', 'mar': '03', 'abr': '04', 'mai': '05', 'jun': '06',
                        'jul': '07', 'ago': '08', 'set': '09', 'out': '10', 'nov': '11', 'dez': '12'
                    };
                    const parts = competenceStr.split('/');
                    if (parts.length === 2) {
                        const [monthName, year] = parts;
                        const month = monthMap[monthName?.toLowerCase()];
                        if (month && year) {
                            competenceDate = `20${year}-${month}-01`;
                        }
                    }
                }
                const amount = parseAmount(cols[amountIdx]);
                const typeStr = cols[typeIdx]?.toLowerCase() || '';
                const type = (typeStr.includes('receita') || typeStr.includes('entrada')) ? TransactionType.INCOME : TransactionType.EXPENSE;
                const clientName = cols[clientIdx]?.trim();
                const foundCompany = companies.find(c => c.name.toLowerCase() === clientName?.toLowerCase());
                const revenueTypeName = cols[revenueTypeIdx]?.trim();
                let foundRevenueType = revenueTypes.find(r => r.name.toLowerCase() === revenueTypeName?.toLowerCase());

                if (!foundRevenueType && revenueTypeName) {
                    const { data: newRevenueType, error: newRevenueTypeError } = await supabase
                        .from('revenue_types')
                        .insert({ name: revenueTypeName, tenant_id: currentUser.tenant_id })
                        .select()
                        .single();

                    if (newRevenueTypeError) {
                        console.error('Error creating new revenue type:', newRevenueTypeError);
                    } else if (newRevenueType) {
                        foundRevenueType = newRevenueType;
                        setRevenueTypes(prev => [...prev, newRevenueType]);
                    }
                }



                const mainRecord: FinancialRecord = {
                    id: recordId,
                    tenant_id: currentUser.tenant_id,
                    description: cols[descIdx] || "Sem descrição",
                    amount: amount,
                    type,
                    status: TransactionStatus.PENDING,
                    dueDate,
                    competenceDate,
                    bankId: banks.find(b => b.name.toLowerCase().includes(cols[bankIdx]?.toLowerCase()))?.id,
                    rubricId: chartOfAccounts.find(c => c.rubricName.toUpperCase() === cols[categoryIdx]?.toUpperCase())?.id,
                    companyId: foundCompany?.id,
                    revenueTypeId: foundRevenueType?.id,
                    category: cols[categoryIdx] || '',
                };
                newRecords.push(mainRecord);
            }

            if (newRecords.length > 0) {
                const { error } = await supabase.from('financial_records').insert(newRecords);
                if (error) throw error;
                setRecords(prev => [...newRecords, ...prev]);
                alert(`${newRecords.length} transações importadas com sucesso!`);
            } else {
                alert("Nenhuma transação válida encontrada no arquivo.");
            }
        } catch (error: any) { 
            console.error("Erro na importação:", error); 
            alert(`Erro ao processar arquivo: ${error.message || 'Formato inválido'}`); 
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsArrayBuffer(file);
  };

  const handleSaveCOA = async (e: React.FormEvent) => {
    e.preventDefault();
    let entryToSave: ChartOfAccount | null = null;
    
    if (coaFormType === 'classification') {
        if (!coaFormData.classificationName) { alert("O nome da classificação é obrigatório."); return; }
        
        const classCodes = chartOfAccounts.map(c => parseInt(c.classificationCode)).filter(c => !isNaN(c));
        const maxClassCode = classCodes.length > 0 ? Math.max(...classCodes) : 0;
        const newClassCode = (maxClassCode + 1).toString();
        
        const groupName = coaFormData.groupName?.trim().toUpperCase() || 'GERAL';
        const rubricName = coaFormData.rubricName?.trim().toUpperCase() || `OUTRAS DE ${groupName}`;

        entryToSave = {
            id: `coa_${Date.now()}`, tenant_id: currentUser.tenant_id,
            classificationCode: newClassCode,
            classificationName: coaFormData.classificationName.toUpperCase(),
            centerCode: `${newClassCode}.1`,
            centerName: groupName,
            rubricCode: `${newClassCode}.1.1`,
            rubricName: rubricName
        };
    } else if (coaFormType === 'group') {
        if (!coaFormData.classificationCode || !coaFormData.groupName) { alert("Selecione a classificação e informe o nome do grupo."); return; }

        const classification = uniqueClassifications.find(c => c.code === coaFormData.classificationCode);
        if (!classification) return;

        const centersInClass = chartOfAccounts.filter(c => c.classificationCode === coaFormData.classificationCode);
        const centerSuffixes = centersInClass.map(c => parseInt(c.centerCode.split('.')[1]) || 0);
        const maxCenterSuffix = centerSuffixes.length > 0 ? Math.max(...centerSuffixes) : 0;
        const newCenterCode = `${coaFormData.classificationCode}.${maxCenterSuffix + 1}`;

        const groupName = coaFormData.groupName.toUpperCase();
        const rubricName = coaFormData.rubricName?.trim().toUpperCase() || `OUTRAS DE ${groupName}`;

        entryToSave = {
            id: `coa_${Date.now()}`, tenant_id: currentUser.tenant_id,
            classificationCode: classification.code,
            classificationName: classification.name,
            centerCode: newCenterCode,
            centerName: groupName,
            rubricCode: `${newCenterCode}.1`,
            rubricName: rubricName
        };
    } else { // rubric
        if (!coaFormData.centerCode || !coaFormData.rubricName) { alert("Selecione o grupo e informe o nome da rubrica."); return; }
        
        const center = uniqueCenters.find(c => c.code === coaFormData.centerCode);
        if (!center) return;
        const classification = uniqueClassifications.find(c => c.code === center.classificationCode);
        if (!classification) return;

        const existingInCenter = chartOfAccounts.filter(c => c.centerCode === coaFormData.centerCode);
        let maxSuffix = 0;
        existingInCenter.forEach(c => {
            const parts = c.rubricCode.split('.');
            if (parts.length === 3) {
                const suffix = parseInt(parts[2]); 
                if (!isNaN(suffix) && suffix > maxSuffix) maxSuffix = suffix;
            }
        });
        const newRubricCode = `${coaFormData.centerCode}.${maxSuffix + 1}`;

        entryToSave = {
            id: `coa_${Date.now()}`, tenant_id: currentUser.tenant_id,
            classificationCode: classification.code,
            classificationName: classification.name,
            centerCode: center.code,
            centerName: center.name,
            rubricCode: newRubricCode,
            rubricName: coaFormData.rubricName.toUpperCase()
        };
    }
    
    if (entryToSave) {
        if (!isMockUser) {
            const { error } = await supabase.from('chart_of_accounts').upsert(entryToSave);
            if (error) { console.error("Error saving COA:", error); alert(`Erro ao salvar: ${error.message}`); return; }
        }
        setChartOfAccounts(prev => [...prev, entryToSave!].sort((a,b) => a.rubricCode.localeCompare(b.rubricCode, 'en', { numeric: true })));
    }
    
    setIsCOAModalOpen(false);
    setCoaFormData({ classificationName: '', classificationCode: '', groupName: '', centerCode: '', rubricName: '' });
    setSelectedClassificationForCascading('');
  };

  const handleEditRubric = (e: React.MouseEvent, rubric: ChartOfAccount) => { e.preventDefault(); e.stopPropagation(); /* Logic to edit is now part of bulk edit or deletion. */ };
  const handleDeleteRubric = async (e: React.MouseEvent, id: string) => { e.preventDefault(); e.stopPropagation(); if (window.confirm('Tem certeza que deseja excluir esta rubrica?')) { setChartOfAccounts(prev => prev.filter(c => c.id !== id)); if (editingRubricId === id) { setEditingRubricId(null); } if (!isMockUser) { const { error } = await supabase.from('chart_of_accounts').delete().eq('id', id); if (error) console.error("Error deleting rubric:", error); } } };

  // --- COA Bulk & Import Handlers ---
  const handleImportCOAClick = () => {
      if (isMockUser) {
        alert("A importação não está disponível para o usuário de demonstração.");
        return;
      }
      if (coaFileInputRef.current) coaFileInputRef.current.click();
  };

  const handleDownloadCOATemplate = () => {
      const BOM = "\uFEFF";
      const headers = ['NomeClassificacao', 'NomeGrupo', 'NomeRubrica'];
      // CODES REMOVED FROM EXAMPLE ROWS AS REQUESTED
      const rows = [
          ['RECEITAS', 'VENDAS', 'VENDA PRODUTO A'],
          ['RECEITAS', 'VENDAS', 'VENDA SERVICO X'],
          ['DESPESAS', 'PESSOAL', 'SALARIOS'],
          ['DESPESAS', 'ADMINISTRATIVO', 'ALUGUEL']
      ];
      const csvContent = BOM + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'modelo_plano_de_contas.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const handleLoadStandardModel = async () => {
      if (chartOfAccounts.length > 0 && !window.confirm("Isso adicionará o modelo padrão às suas contas existentes. Deseja continuar?")) {
          return;
      }
      
      const standardModelTemplate = [
          { classificationCode: '1', classificationName: 'RECEITAS', centerCode: '1.1', centerName: 'VENDAS', rubricCode: '1.1.1', rubricName: 'VENDA DE PRODUTOS' },
          { classificationCode: '1', classificationName: 'RECEITAS', centerCode: '1.1', centerName: 'VENDAS', rubricCode: '1.1.2', rubricName: 'SERVIÇOS PRESTADOS' },
          { classificationCode: '2', classificationName: 'CUSTO VARIÁVEL', centerCode: '2.1', centerName: 'IMPOSTOS', rubricCode: '2.1.1', rubricName: 'SIMPLES NACIONAL' },
          { classificationCode: '2', classificationName: 'CUSTO VARIÁVEL', centerCode: '2.1', centerName: 'IMPOSTOS', rubricCode: '2.1.2', rubricName: 'ICMS' },
          { classificationCode: '3', classificationName: 'DESPESA FIXA', centerCode: '3.1', centerName: 'PESSOAL', rubricCode: '3.1.1', rubricName: 'SALÁRIOS' },
          { classificationCode: '3', classificationName: 'DESPESA FIXA', centerCode: '3.1', centerName: 'PESSOAL', rubricCode: '3.1.2', rubricName: 'PRÓ-LABORE' },
          { classificationCode: '3', classificationName: 'DESPESA FIXA', centerCode: '3.2', centerName: 'ADMINISTRATIVO', rubricCode: '3.2.1', rubricName: 'ALUGUEL' },
          { classificationCode: '3', classificationName: 'DESPESA FIXA', centerCode: '3.2', centerName: 'ADMINISTRATIVO', rubricCode: '3.2.2', rubricName: 'ENERGIA' },
          { classificationCode: '3', classificationName: 'DESPESA FIXA', centerCode: '3.2', centerName: 'ADMINISTRATIVO', rubricCode: '3.2.3', rubricName: 'INTERNET' },
          { classificationCode: '3', classificationName: 'DESPESA FIXA', centerCode: '3.3', centerName: 'MARKETING', rubricCode: '3.3.1', rubricName: 'ANÚNCIOS ONLINE' },
          { classificationCode: '4', classificationName: 'INVESTIMENTOS', centerCode: '4.1', centerName: 'EQUIPAMENTOS', rubricCode: '4.1.1', rubricName: 'COMPRA DE COMPUTADORES' }
      ];

      const standardModel: ChartOfAccount[] = standardModelTemplate.map(item => ({
        ...item,
        id: `coa_std_${item.rubricCode}`,
        tenant_id: currentUser.tenant_id,
      }));

      // Merge avoiding duplicates by rubricCode
      const currentCodes = new Set(chartOfAccounts.map(c => c.rubricCode));
      const toAdd = standardModel.filter(c => !currentCodes.has(c.rubricCode));
      
      if (toAdd.length === 0) {
          alert("Todas as contas do modelo padrão já existem.");
          return;
      }

      if (!isMockUser) {
          try {
              const { error } = await supabase.from('chart_of_accounts').insert(toAdd);
              if (error) throw error;
          } catch (error: any) {
              console.error("Erro ao carregar modelo:", error);
              alert("Erro ao salvar modelo padrão.");
              return; // Do not update state if DB call fails for real user
          }
      }

      setChartOfAccounts(prev => [...prev, ...toAdd]);
      alert(`${toAdd.length} contas adicionadas com sucesso!`);
  };

  const handleCOAFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
      if (isMockUser) {
        alert("A importação não está disponível para o usuário de demonstração.");
        if (coaFileInputRef.current) coaFileInputRef.current.value = '';
        return;
      }
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (e) => {
          const arrayBuffer = e.target?.result as ArrayBuffer;
          if (!arrayBuffer) return;

          // Decode using windows-1252 for Excel compatibility
          const text = new TextDecoder('windows-1252').decode(arrayBuffer);
          if (!text) return;

          try {
              const lines = text.split(/\r?\n/).slice(1); // slice(1) to skip header
              const separator = lines[0].includes(';') ? ';' : ',';
              const newCOA: ChartOfAccount[] = [];
              
              // Helper to track max suffixes for auto-generation
              const codeTracker: Record<string, number> = {};
              
              // Initialize tracker with existing codes
              chartOfAccounts.forEach(acc => {
                  const parts = acc.rubricCode.split('.');
                  const suffix = parseInt(parts[parts.length - 1]);
                  const center = acc.centerCode;
                  if (!isNaN(suffix)) {
                      codeTracker[center] = Math.max(codeTracker[center] || 0, suffix);
                  }
              });

              for (let i = 1; i < lines.length; i++) {
                  const line = lines[i].trim();
                  if (!line) continue;
                  const cols = line.split(separator).map(c => c.replace(/"/g, '').trim());
                  
                  // Handle Name-Only Import (3 columns)
                  if (cols.length === 3) {
                      const className = cols[0].toUpperCase();
                      const groupName = cols[1].toUpperCase();
                      const rubricName = cols[2].toUpperCase();

                      // 1. Determine Classification Code
                      const classCode = (className.includes('RECEITA') || className.includes('ENTRADA')) ? '1' : '3';
                      
                      // 2. Determine Group Code (Center Code)
                      let centerCode = '';
                      // Find existing group by name in the same classification
                      const existingGroup = chartOfAccounts.find(c => 
                          c.classificationCode === classCode && 
                          c.centerName.toUpperCase() === groupName
                      );

                      if (existingGroup) {
                          centerCode = existingGroup.centerCode;
                      } else {
                          // Generate new group code
                          // Find max group suffix for this classification
                          const groupSuffixes = chartOfAccounts
                              .filter(c => c.classificationCode === classCode)
                              .map(c => {
                                  const parts = c.centerCode.split('.');
                                  return parseInt(parts[parts.length - 1]) || 0;
                              });
                          const maxGroup = groupSuffixes.length > 0 ? Math.max(...groupSuffixes) : 0;
                          centerCode = `${classCode}.${maxGroup + 1}`;
                          
                          // Mock entry to prevent duplicate generation in same loop
                          chartOfAccounts.push({
                              id: 'temp', tenant_id: currentUser.tenant_id, classificationCode: classCode, classificationName: className,
                              centerCode, centerName: groupName, rubricCode: '', rubricName: ''
                          });
                      }

                      // 3. Generate Rubric Code
                      const currentMax = codeTracker[centerCode] || 0;
                      const nextSuffix = currentMax + 1;
                      codeTracker[centerCode] = nextSuffix;
                      const rubricCode = `${centerCode}.${nextSuffix}`;
                      const newId = `coa_imp_${Date.now()}_${i}`;

                      newCOA.push({
                          id: newId,
                          tenant_id: currentUser.tenant_id,
                          classificationCode: classCode,
                          classificationName: className,
                          centerCode: centerCode,
                          centerName: groupName,
                          rubricCode: rubricCode,
                          rubricName: rubricName
                      });
                  }
                  // Handle Legacy Import (6 columns)
                  else if (cols.length >= 6) {
                      const centerCode = cols[2];
                      let rubricCode = cols[4];
                      
                      // Auto-generate code if missing
                      if (!rubricCode && centerCode) {
                          const currentMax = codeTracker[centerCode] || 0;
                          const nextSuffix = currentMax + 1;
                          codeTracker[centerCode] = nextSuffix; // Update tracker
                          rubricCode = `${centerCode}.${nextSuffix}`;
                      } else if (rubricCode && centerCode) {
                          // If provided, ensure tracker is updated to avoid conflicts if mixed
                          const parts = rubricCode.split('.');
                          const suffix = parseInt(parts[parts.length - 1]);
                          if(!isNaN(suffix)) {
                              codeTracker[centerCode] = Math.max(codeTracker[centerCode] || 0, suffix);
                          }
                      }

                      if (rubricCode) {
                          const newId = `coa_imp_${Date.now()}_${i}`;
                          newCOA.push({
                              id: newId,
                              tenant_id: currentUser.tenant_id,
                              classificationCode: cols[0],
                              classificationName: cols[1],
                              centerCode: centerCode,
                              centerName: cols[3],
                              rubricCode: rubricCode,
                              rubricName: cols[5],
                          });
                      }
                  }
              }

              if (newCOA.length > 0) {
                  // Filter out temps created during simplified import
                  const validNewCOA = newCOA.filter(c => c.id !== 'temp');
                  const { error } = await supabase.from('chart_of_accounts').upsert(validNewCOA);
                  if (error) throw error;
                  
                  const existingIds = new Set(chartOfAccounts.filter(c=>c.id!=='temp').map(c => c.id));
                  const toAdd = validNewCOA.filter(c => !existingIds.has(c.id));
                  setChartOfAccounts(prev => {
                      // Update existing ones in state
                      const updated = prev.filter(c=>c.id!=='temp').map(p => {
                          const found = validNewCOA.find(n => n.id === p.id);
                          return found ? found : p;
                      });
                      return [...updated, ...toAdd];
                  });
                  alert(`${validNewCOA.length} contas processadas com sucesso!`);
              }
          } catch (error: any) {
              console.error("Erro importação COA:", error);
              alert(`Erro ao importar plano de contas: ${error.message}`);
          }
          if (coaFileInputRef.current) coaFileInputRef.current.value = '';
      };
      reader.readAsArrayBuffer(file);
  };

  const toggleBulkEditCOA = () => {
      if (isBulkEditingCOA) {
          setIsBulkEditingCOA(false);
          setBulkCOAData([]);
      } else {
          setBulkCOAData(JSON.parse(JSON.stringify(chartOfAccounts)));
          setIsBulkEditingCOA(true);
      }
  };

  const handleBulkChange = (index: number, field: keyof ChartOfAccount, value: string) => {
      const updated = [...bulkCOAData];
      updated[index] = { ...updated[index], [field]: value };
      setBulkCOAData(updated);
  };

  const saveBulkCOA = async () => {
      if (!isMockUser) {
        try {
            const { error } = await supabase.from('chart_of_accounts').upsert(bulkCOAData);
            if (error) throw error;
        } catch (error: any) {
            console.error("Erro salvar em massa:", error);
            alert("Erro ao salvar alterações.");
            return;
        }
      }
      setChartOfAccounts(bulkCOAData);
      setIsBulkEditingCOA(false);
      alert("Alterações em massa salvas com sucesso!");
  };

  const handleSelectAllCOA = () => {
      if (selectedCOAIds.size === chartOfAccounts.length) {
          setSelectedCOAIds(new Set());
      } else {
          setSelectedCOAIds(new Set(chartOfAccounts.map(c => c.id)));
      }
  };

  const handleSelectOneCOA = (id: string) => {
      const newSet = new Set(selectedCOAIds);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      setSelectedCOAIds(newSet);
  };

  const handleBulkDeleteCOA = async () => {
      if (selectedCOAIds.size === 0) return;
      if (!window.confirm(`Tem certeza que deseja excluir ${selectedCOAIds.size} rubricas?`)) return;

      const idsToDelete = Array.from(selectedCOAIds);
      setChartOfAccounts(prev => prev.filter(c => !selectedCOAIds.has(c.id)));
      setSelectedCOAIds(new Set());

      if (!isMockUser) {
        try {
            const { error } = await supabase.from('chart_of_accounts').delete().in('id', idsToDelete);
            if (error) throw error;
        } catch (error: any) {
            console.error("Erro ao excluir rubricas:", error);
            alert("Erro ao excluir.");
            // Revert optimistic update on failure
            setChartOfAccounts(prev => [...prev, ...chartOfAccounts.filter(c => idsToDelete.includes(c.id))]);
            return;
        }
      }
      alert("Rubricas excluídas com sucesso!");
  };

  // ... (Transaction Handlers Unchanged) ...
  const handleUpdateInstallmentPreview = (index: number, field: 'amount' | 'dueDate' | 'competenceDate', value: string) => {
      const updated = [...installmentsPreview];
      let newDate = value;
      if (field === 'competenceDate' && value) {
          newDate = `${value}-01`;
      }
      updated[index] = { 
          ...updated[index], 
          [field]: field === 'amount' ? Number(value) : newDate
      };
      setInstallmentsPreview(updated);
  };

  const handleSaveTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRecord.rubricId) { alert("Selecione uma Rubrica."); return; }
    
    const displayCategory = chartOfAccounts.find(c => c.id === newRecord.rubricId)?.rubricName || 'Geral';
    const baseDescription = newRecord.description || 'Nova Transação';
    const todayStr = new Date().toISOString().split('T')[0];

    // Prepare revenue split payload if applicable
    const splitPayload = (newRecord.type === TransactionType.INCOME && newRecord.split_revenue && newRecord.split_revenue.length > 0)
        ? newRecord.split_revenue.filter(s => s.revenue_type_id && s.amount > 0)
        : null;

    if (installmentCount > 1 && !editingTransactionId) {
        // --- CREATE INSTALLMENTS ---
        const seriesId = `s_${Date.now()}`;
        const recordsToCreate = installmentsPreview.map((inst, i) => {
            const finalStatus = inst.dueDate < todayStr ? TransactionStatus.OVERDUE : TransactionStatus.PENDING;
            
            // Prorate split revenue if it exists
            const proratedSplits = splitPayload ? splitPayload.map(split => ({
                ...split,
                amount: parseFloat(((split.amount / installmentCount)).toFixed(2))
            })) : null;

            const isExpenseInstallment = newRecord.type === TransactionType.EXPENSE;
            let installmentAmount = Math.abs(inst.amount);
            if (isExpenseInstallment) {
                // DESPESA: sem estorno = negativo, com estorno = positivo
                installmentAmount = isRefund ? installmentAmount : -installmentAmount;
            } else {
                // RECEITA: sem estorno = positivo, com estorno = negativo
                installmentAmount = isRefund ? -installmentAmount : installmentAmount;
            }
            return {
                id: `f${Date.now()}-${i}`,
                tenant_id: currentUser.tenant_id,
                description: `${baseDescription} (${i + 1}/${installmentCount})`,
                amount: installmentAmount,
                type: newRecord.type as TransactionType,
                status: finalStatus,
                dueDate: inst.dueDate,
                competenceDate: inst.competenceDate,
                category: displayCategory,
                rubricId: newRecord.rubricId,
                bankId: newRecord.bankId,
                companyId: newRecord.companyId,
                revenueTypeId: splitPayload ? undefined : newRecord.revenueTypeId,
                split_revenue: proratedSplits || undefined,
                seriesId: seriesId,
            } as FinancialRecord;
        });
        
        // Handle remainder for prorated splits on the first installment
        if (splitPayload && recordsToCreate.length > 0) {
            const totalOriginalSplit = splitPayload.reduce((sum, s) => sum + s.amount, 0);
            const totalProrated = recordsToCreate.reduce((sum, rec) => sum + (rec.split_revenue?.reduce((s, sp) => s + sp.amount, 0) || 0), 0);
            const remainder = totalOriginalSplit - totalProrated;
            if (recordsToCreate[0].split_revenue && remainder !== 0) {
                recordsToCreate[0].split_revenue[0].amount += remainder;
            }
        }

        setRecords(prev => [...recordsToCreate, ...prev]);
        if (!isMockUser) {
            try { await supabase.from('financial_records').insert(recordsToCreate); } 
            catch (error) { console.error("Error saving transaction installments:", error); alert(`Error saving transaction installments: ${JSON.stringify(error)}`); }
        }

    } else {
        // --- CREATE/UPDATE SINGLE RECORD ---
        const finalDueDate = installmentsPreview.length > 0 ? installmentsPreview[0].dueDate : (newRecord.dueDate || todayStr);
        const finalStatus = newRecord.status || (finalDueDate < todayStr ? TransactionStatus.OVERDUE : TransactionStatus.PENDING);
        
        const finalAmount = installmentsPreview.length > 0 ? installmentsPreview[0].amount : Number(newRecord.amount);
        const isExpense = newRecord.type === TransactionType.EXPENSE;
        let calculatedAmount = Math.abs(finalAmount);
        if (isExpense) {
            // DESPESA: sem estorno = negativo, com estorno = positivo
            calculatedAmount = isRefund ? calculatedAmount : -calculatedAmount;
        } else {
            // RECEITA: sem estorno = positivo, com estorno = negativo
            calculatedAmount = isRefund ? -calculatedAmount : calculatedAmount;
        }
        const transactionToSave: Partial<FinancialRecord> = {
            ...newRecord,
            description: baseDescription,
            amount: calculatedAmount,
            dueDate: finalDueDate,
            competenceDate: installmentsPreview.length > 0 ? installmentsPreview[0].competenceDate : newRecord.competenceDate,
            category: displayCategory,
            status: finalStatus,
            paymentDate: finalStatus === TransactionStatus.PAID ? (newRecord.paymentDate || finalDueDate) : undefined,
            revenueTypeId: splitPayload ? undefined : newRecord.revenueTypeId,
            split_revenue: splitPayload || undefined,
        };

        if (editingTransactionId) { 
            const original = records.find(rec => rec.id === editingTransactionId);
            if (!original) return;
            const finalRecord: FinancialRecord = { ...original, ...transactionToSave };

            setRecords(prev => prev.map(rec => rec.id === editingTransactionId ? finalRecord : rec));
            if (!isMockUser) {
                try { 
                    const result = await supabase.from('financial_records').update(finalRecord).eq('id', editingTransactionId);

                    if (result.error) {
                        console.error("Error updating transaction:", result.error);
                        alert(`Erro ao atualizar: ${result.error.message}`);
                    }
                } 
                catch (error) { console.error("Error updating transaction:", error); alert(`Error updating transaction: ${JSON.stringify(error)}`); }
            }
        } else {
            const finalRecord: FinancialRecord = { ...transactionToSave, id: `f${Date.now()}`, tenant_id: currentUser.tenant_id } as FinancialRecord;
            setRecords(prev => [finalRecord, ...prev]);
            if (!isMockUser) {
                try { await supabase.from('financial_records').insert(finalRecord); } 
                catch (error) { console.error("Error saving transaction:", error); alert(`Error saving transaction: ${JSON.stringify(error)}`); }
            }
        }
    }
    setIsModalOpen(false); resetTransactionForm();
  };

  const openSingleRecordEditor = (record: FinancialRecord) => {
    setEditingTransactionId(record.id);
    
    setNewRecord({
        ...record,
        split_revenue: record.split_revenue || [],
        // Ensure competenceDate is correctly formatted for the month input
        competenceDate: record.competenceDate ? record.competenceDate.slice(0, 7) + '-01' : undefined
    });

    setInstallmentCount(1);
    setInstallmentsPreview([{ dueDate: record.dueDate, competenceDate: record.competenceDate || record.dueDate, amount: record.amount }]);
    // Detectar se é estorno baseado no tipo + sinal
    const isExpenseRecord = record.type === TransactionType.EXPENSE;
    const isRefundRecord = isExpenseRecord ? (record.amount > 0) : (record.amount < 0);
    setIsRefund(isRefundRecord);
    setIsModalOpen(true);
  };
  
  const handleEditTransaction = (e: React.MouseEvent, record: FinancialRecord) => {
      e.preventDefault();
      e.stopPropagation();
      if (record.seriesId) {
          setEditChoiceModal({ isOpen: true, record: record });
      } else {
          openSingleRecordEditor(record);
      }
  };

  const handleEditSingleInstallment = () => {
    if (editChoiceModal.record) {
        openSingleRecordEditor(editChoiceModal.record);
    }
    setEditChoiceModal({ isOpen: false, record: null });
  };
  
  const handleEditSeries = async () => {
    const record = editChoiceModal.record;
    if (!record || !record.seriesId) return;

    const seriesRecords = records
        .filter(r => r.seriesId === record.seriesId)
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

    if (seriesRecords.length === 0) return;

    const paidCount = seriesRecords.filter(r => r.status === TransactionStatus.PAID).length;
    
    let confirmMessage = `Isso irá excluir TODAS as ${seriesRecords.length} parcelas desta série e permitirá que você crie um novo parcelamento do zero.`;
    if (paidCount > 0) {
        confirmMessage += `\n\nATENÇÃO: ${paidCount} parcela(s) já paga(s) serão removidas. Esta ação não pode ser desfeita.`;
    }
    confirmMessage += `\n\nDeseja continuar?`;

    if (window.confirm(confirmMessage)) {
        try {
            // STEP 1: Database operation first.
            if (!isMockUser) {
                const { error } = await supabase.from('financial_records').delete().eq('seriesId', record.seriesId);
                if (error) throw error;
            }

            // STEP 2: Database operation was successful, now update UI state.
            const baseDesc = (record.description || '').replace(/\s*\(\d+\/\d+\)$/, '');
            const totalAmount = seriesRecords.reduce((acc, r) => acc + r.amount, 0);
            const firstInstallment = seriesRecords[0];

            // This must be called to remove the old records from the UI.
            setRecords(prev => prev.filter(r => r.seriesId !== record.seriesId));
            
            // Prepare the new record form.
            setEditingTransactionId(null);
            setNewRecord({
                description: baseDesc,
                type: firstInstallment.type,
                rubricId: firstInstallment.rubricId,
                revenueTypeId: firstInstallment.revenueTypeId,
                bankId: firstInstallment.bankId,
                companyId: firstInstallment.companyId,
                category: firstInstallment.category,
                amount: totalAmount,
                dueDate: new Date().toISOString().split('T')[0],
                competenceDate: new Date().toISOString().slice(0, 7) + '-01',
                status: TransactionStatus.PENDING,
                paymentDate: undefined,
            });
            setInstallmentCount(seriesRecords.length);
            setAmountDistribution('TOTAL');
            
            // Open the main transaction modal.
            setIsModalOpen(true);
            // Close the choice modal.
            setEditChoiceModal({ isOpen: false, record: null });

        } catch (error: any) {
            console.error("Failed to process series edit:", error);
            alert(`Ocorreu um erro ao tentar recriar a série: ${error.message}. Nenhuma alteração foi feita.`);
            // Since we didn't change state before the error, no rollback is needed. Just close the choice modal.
            setEditChoiceModal({ isOpen: false, record: null });
        }
    }
};

  const handleDeleteTransaction = async (e: React.MouseEvent, id: string) => { e.preventDefault(); e.stopPropagation(); if (window.confirm('Excluir esta transação?')) { setRecords(prev => prev.filter(r => r.id !== id)); if (!isMockUser) { const { error } = await supabase.from('financial_records').delete().eq('id', id); if (error) alert("Erro ao excluir."); } } };
  const resetTransactionForm = () => { setNewRecord({ description: '', amount: 0, type: TransactionType.EXPENSE, status: TransactionStatus.PENDING, dueDate: new Date().toISOString().split('T')[0], competenceDate: new Date().toISOString().slice(0,7)+'-01', rubricId: '', revenueTypeId: '', bankId: '', companyId: '', split_revenue: [] }); setInstallmentCount(1); setCompetenceType('FIXED'); setAmountDistribution('TOTAL'); setInstallmentsPreview([]); setEditingTransactionId(null); setIsRefund(false); }
  const handleStatusChange = async (id: string, newStatus: TransactionStatus) => { const now = new Date().toISOString().split('T')[0]; const record = records.find(r => r.id === id); const updates: any = { status: newStatus }; if (record && newStatus === TransactionStatus.PAID && !record.paymentDate) { updates.paymentDate = now; } setRecords(prev => prev.map(r => { if (r.id === id) { return { ...r, ...updates }; } return r; })); if (!isMockUser) { await supabase.from('financial_records').update(updates).eq('id', id); } };

  // ... (Bulk actions unchanged) ...
  const handleSelectAll = (filteredRecords: FinancialRecord[]) => { if (selectedRecordIds.size === filteredRecords.length && filteredRecords.length > 0) { setSelectedRecordIds(new Set()); } else { setSelectedRecordIds(new Set(filteredRecords.map(r => r.id))); } };
  const handleSelectOne = (id: string) => { const newSet = new Set(selectedRecordIds); if (newSet.has(id)) newSet.delete(id); else newSet.add(id); setSelectedRecordIds(newSet); };
  const handleBulkDelete = async () => {
    if (!window.confirm(`Excluir ${selectedRecordIds.size} itens?`)) return;
    const idsToDelete = Array.from(selectedRecordIds);
    
    // Update UI immediately
    setRecords(prev => prev.filter(r => !selectedRecordIds.has(r.id)));
    setSelectedRecordIds(new Set());
    
    // Delete in batches of 500 (reduced from 1000 for better compatibility)
    if (!isMockUser) {
      try {
        const batchSize = 500;
        let deletedCount = 0;
        
        for (let i = 0; i < idsToDelete.length; i += batchSize) {
          const batch = idsToDelete.slice(i, i + batchSize);
          console.log(`Deleting batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(idsToDelete.length/batchSize)}: ${batch.length} records`);
          
          const { error, count } = await supabase
            .from('financial_records')
            .delete({ count: 'exact' })
            .in('id', batch);
          
          if (error) {
            console.error('Error deleting batch:', error);
            alert(`Erro ao excluir registros (lote ${Math.floor(i/batchSize) + 1}): ${error.message}\n\nDetalhes: ${JSON.stringify(error)}`);
            // Reload data to sync UI with database
            window.location.reload();
            return;
          }
          
          deletedCount += (count || batch.length);
        }
        
        console.log(`Successfully deleted ${deletedCount} records`);
        alert(`${deletedCount} registros excluídos com sucesso!`);
      } catch (err: any) {
        console.error('Unexpected error during bulk delete:', err);
        alert(`Erro inesperado: ${err.message}`);
        window.location.reload();
      }
    }
  };
  const handleBulkStatusChange = async (status: TransactionStatus) => {
    const idsToUpdate = Array.from(selectedRecordIds);
    const now = new Date().toISOString().split('T')[0];
    
    if (!isMockUser) {
      // Process in batches of 1000
      const batchSize = 1000;
      let allUpdatedData: any[] = [];
      
      for (let i = 0; i < idsToUpdate.length; i += batchSize) {
        const batch = idsToUpdate.slice(i, i + batchSize);
        const { data, error } = await supabase.from('financial_records').update({ status }).in('id', batch).select();
        
        if (error) {
          console.error("Error updating records:", error);
          alert("Erro ao atualizar os lançamentos. Tente novamente.");
          return;
        }
        
        if (data) {
          allUpdatedData = allUpdatedData.concat(data);
        }
      }
      
      setRecords(prev => prev.map(r => {
        const updatedRecord = allUpdatedData.find(d => d.id === r.id);
        return updatedRecord || r;
      }));
    } else {
      setRecords(prev => prev.map(r => {
        if (selectedRecordIds.has(r.id)) {
          const updatedPaymentDate = (status === TransactionStatus.PAID && !r.paymentDate) ? now : r.paymentDate;
          return { ...r, status: status, paymentDate: updatedPaymentDate } as FinancialRecord;
        }
        return r;
      }));
    }
    
    setSelectedRecordIds(new Set());
  };
  const handleBulkDuplicate = async () => {
    const recordsToDuplicate = records.filter(r => selectedRecordIds.has(r.id));
    const newRecords = recordsToDuplicate.map((r, i) => ({
      ...r,
      id: `dup-${Date.now()}-${i}`,
      description: `${r.description} (Cópia)`,
      status: TransactionStatus.PENDING,
      paymentDate: undefined
    }));
    
    setRecords(prev => [...newRecords, ...prev]);
    setSelectedRecordIds(new Set());
    
    if (!isMockUser) {
      // Insert in batches of 1000
      const batchSize = 1000;
      for (let i = 0; i < newRecords.length; i += batchSize) {
        const batch = newRecords.slice(i, i + batchSize);
        const { error } = await supabase.from('financial_records').insert(batch);
        if (error) {
          console.error('Error duplicating batch:', error);
          alert(`Erro ao duplicar registros: ${error.message}`);
          return;
        }
      }
    }
  };
  const handleBulkValidate = async () => {
    const ids = Array.from(selectedRecordIds);
    
    setRecords(prev => prev.map(r => ids.includes(r.id) ? { ...r, needsValidation: false } : r));
    setSelectedRecordIds(new Set());
    
    if (!isMockUser) {
      // Update in batches of 1000
      const batchSize = 1000;
      for (let i = 0; i < ids.length; i += batchSize) {
        const batch = ids.slice(i, i + batchSize);
        const { error } = await supabase.from('financial_records').update({ needsValidation: false }).in('id', batch);
        if (error) {
          console.error('Error validating batch:', error);
          alert(`Erro ao validar registros: ${error.message}`);
          return;
        }
      }
    }
  };

  // --- DRILL DOWN HANDLER (BUG FIX) ---
  const handleCellClick = (node: any, dateKey: string, mode: 'DRE' | 'CASHFLOW') => {
      if (!node || !node.values || node.values[dateKey] === 0) return;
  
      const recordsToDisplay = validRecords.filter(r => {
          let rDate = '';
          if (mode === 'DRE') {
              rDate = r.competenceDate || '';
          } else { // CASHFLOW
              if(includeProjections) rDate = r.dueDate;
              else if (r.status === TransactionStatus.PAID) rDate = r.paymentDate || r.dueDate;
              else return false;
          }
          if (!rDate || !rDate.startsWith(dateKey)) return false;

          if (node.type === 'ROOT') {
              if (node.code === 'INFLOW') return r.type === TransactionType.INCOME;
              if (node.code === 'OUTFLOW') return r.type === TransactionType.EXPENSE;
          } else if (node.type === 'CLASSIFICATION') {
              if (mode === 'DRE' && node.code === '1') {
                  return r.type === TransactionType.INCOME;
              }
              const rubric = chartOfAccounts.find(c => c.id === r.rubricId);
              return rubric && rubric.classificationCode === node.code;
          } else if (node.type === 'CENTER') {
              const rubric = chartOfAccounts.find(c => c.id === r.rubricId);
              return rubric && rubric.centerCode === node.code;
          } else if (node.type === 'RUBRIC') {
              if (mode === 'DRE' && r.type === TransactionType.INCOME) {
                  return r.revenueTypeId === node.code;
              }
              const rubric = chartOfAccounts.find(c => c.id === r.rubricId);
              return rubric && rubric.rubricCode === node.code;
          }
          return false;
      });
  
      setDrillDownRecords(recordsToDisplay);
      setDrillDownTitle(`${node.name} (${dateKey})`);
      setIsDrillDownOpen(true);
  };

  // --- Common Calculations ---
  const validRecords = records.filter(r => !r.needsValidation);
  
  // --- DASHBOARD CHARTS DATA ---
  const dashboardChartsData = useMemo(() => {
      const monthMap = new Map<string, { month: string, income: number, expense: number, balance: number }>();
      const categoryMap = new Map<string, number>();
      let totalIncome = 0; let totalExpense = 0; let totalPendingIncome = 0; let totalPendingExpense = 0;
      primaryPeriod.months.forEach(m => { const key = `${primaryPeriod.year}-${String(m).padStart(2, '0')}`; monthMap.set(key, { month: monthNames[m-1], income: 0, expense: 0, balance: 0 }); });
      let accumulatedBalance = 0;
      
      // Aplicar filtros de data do dashboard
      let filtered = validRecords.filter(r => { 
          const d = r.dueDate; 
          if (!d) return false; 
          const [y, m] = d.split('-'); 
          const year = parseInt(y); 
          const month = parseInt(m); 
          return year === primaryPeriod.year && primaryPeriod.months.includes(month); 
      });
      
      // Filtrar por data de início e fim
      if (dashboardFilterStartDate || dashboardFilterEndDate) {
          filtered = filtered.filter(r => {
              if (!r.dueDate) return false;
              const recordDate = new Date(r.dueDate).getTime();
              const startMatch = !dashboardFilterStartDate || recordDate >= new Date(dashboardFilterStartDate).getTime();
              const endMatch = !dashboardFilterEndDate || recordDate <= new Date(dashboardFilterEndDate + 'T23:59:59').getTime();
              return startMatch && endMatch;
          });
      }
      filtered.forEach(r => {
          const key = r.dueDate.slice(0, 7);
          if (r.status === TransactionStatus.PAID) {
              if (monthMap.has(key)) { const entry = monthMap.get(key)!; if (r.type === TransactionType.INCOME) entry.income += r.amount; else entry.expense += r.amount; entry.balance = entry.income - entry.expense; }
              if (r.type === TransactionType.INCOME) totalIncome += r.amount; else totalExpense += r.amount;
              if (r.type === TransactionType.EXPENSE) { const catName = r.category || 'Outros'; categoryMap.set(catName, (categoryMap.get(catName) || 0) + r.amount); }
          }
          if(r.status !== TransactionStatus.PAID) {
              if (r.type === TransactionType.INCOME) totalPendingIncome += r.amount; else totalPendingExpense += r.amount;
          }
      });
      const evolutionData = Array.from(monthMap.values()).map(d => { accumulatedBalance += d.balance; return { ...d, accBalance: accumulatedBalance }; });
      const categoryData = Array.from(categoryMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 6);
      const statusData = [ { name: 'Receitas', Pago: totalIncome, Pendente: totalPendingIncome }, { name: 'Despesas', Pago: totalExpense, Pendente: totalPendingExpense } ];
      return { evolutionData, categoryData, statusData, totalIncome, totalExpense, balance: totalIncome - totalExpense, totalPendingIncome, totalPendingExpense };
  }, [validRecords, primaryPeriod, dashboardFilterStartDate, dashboardFilterEndDate]);

  const buildHierarchy = (mode: 'DRE' | 'CASHFLOW') => {
      const primaryKeys = primaryPeriod.months.map(m => `${primaryPeriod.year}-${String(m).padStart(2, '0')}`);
      const compareKeys = isCompareEnabled ? comparePeriod.months.map(m => `${comparePeriod.year}-${String(m).padStart(2, '0')}`) : [];
      const hierarchy: any[] = []; const netResult: Record<string, number> = {}; const prevNetResult: Record<string, number> = {};
      
      const calculateValueForNode = (rubricIds: string[], keys: string[], isExpense: boolean) => { 
        const vals: Record<string, number> = {}; 
        keys.forEach(key => { 
            vals[key] = validRecords.filter(r => {
                if (mode === 'DRE') { // DRE always includes all statuses
                    // Use competence date first, then due date, then payment date as fallback
                    let rDate = r.competenceDate || r.dueDate || r.paymentDate || '';
                    if (!rDate) return false; // Skip records without any date
                    return rubricIds.includes(r.rubricId || '') && rDate.startsWith(key); 
                }
                
                // CASHFLOW logic
                // If includeProjections is OFF, only show PAID records
                if (!includeProjections && r.status !== TransactionStatus.PAID) return false;
                
                let rDate = '';
                if (includeProjections) {
                    // Show all records by due date when projections are enabled
                    rDate = r.dueDate || r.competenceDate || '';
                } else if (r.status === TransactionStatus.PAID) {
                    // For paid records, use payment date first, then due date, then competence date
                    rDate = r.paymentDate || r.dueDate || r.competenceDate || '';
                } else {
                    return false;
                }
                
                // Ensure we have a valid date and it matches the period
                if (!rDate) return false;
                return rubricIds.includes(r.rubricId || '') && rDate.startsWith(key); 
            }).reduce((acc, r) => acc + r.amount, 0);
        }); 
        return vals; 
      };
      
      const calculateValueForRevenueType = (revenueTypeId: string, keys: string[]) => {
          const vals: Record<string, number> = {};
          keys.forEach(key => {
              let totalForMonth = 0;

              const monthRecords = validRecords.filter(r => {
                  if (r.type !== TransactionType.INCOME) return false;
                  // DRE is competence based
                  const rDate = r.competenceDate || '';
                  return rDate.startsWith(key);
              });

              monthRecords.forEach(record => {
                  if (record.split_revenue && record.split_revenue.length > 0) {
                      // Case 1: Record has revenue splits. Sum amounts from splits matching the revenueTypeId.
                      const relevantSplitAmount = record.split_revenue
                          .filter(split => split.revenue_type_id === revenueTypeId)
                          .reduce((sum, split) => sum + split.amount, 0);
                      totalForMonth += relevantSplitAmount;
                  } else {
                      // Case 2: Record has no splits. Use original logic.
                      if (record.revenueTypeId === revenueTypeId) {
                          totalForMonth += record.amount;
                      }
                  }
              });

              vals[key] = totalForMonth;
          });
          return vals;
      };

      if (mode === 'CASHFLOW') {
        const inflowNode = { code: 'INFLOW', name: 'TOTAL ENTRADAS', type: 'ROOT', values: {}, prevValues: {}, children: [] as any[] };
        const outflowNode = { code: 'OUTFLOW', name: 'TOTAL SAÍDAS', type: 'ROOT', values: {}, prevValues: {}, children: [] as any[] };

        const inflowCenters = uniqueCenters.filter(c => c.classificationCode === '1').sort((a,b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
        const outflowCenters = uniqueCenters.filter(c => c.classificationCode !== '1').sort((a,b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
        
        inflowCenters.forEach(center => {
            const centerNode: any = { code: center.code, name: center.name, type: 'CENTER', values: {}, prevValues: {}, children: [] };
            
            const rubrics = chartOfAccounts.filter(c => c.centerCode === center.code).sort((a,b) => a.rubricCode.localeCompare(b.rubricCode, undefined, { numeric: true }));
            rubrics.forEach(rubric => {
                const rubricNode = { 
                    code: rubric.rubricCode, 
                    name: rubric.rubricName, 
                    type: 'RUBRIC', 
                    values: calculateValueForNode([rubric.id], primaryKeys, false),
                    prevValues: calculateValueForNode([rubric.id], compareKeys, false) 
                };
                centerNode.children.push(rubricNode);
            });
            
            primaryKeys.forEach(k => { centerNode.values[k] = centerNode.children.reduce((acc, child) => acc + (child.values[k] || 0), 0); });
            compareKeys.forEach(k => { centerNode.prevValues[k] = centerNode.children.reduce((acc, child) => acc + (child.prevValues[k] || 0), 0); });
            inflowNode.children.push(centerNode);
        });

        outflowCenters.forEach(center => {
            const centerNode: any = { code: center.code, name: center.name, type: 'CENTER', values: {}, prevValues: {}, children: [] };
            
            const rubrics = chartOfAccounts.filter(c => c.centerCode === center.code).sort((a,b) => a.rubricCode.localeCompare(b.rubricCode, undefined, { numeric: true }));
            rubrics.forEach(rubric => {
                const rubricNode = { 
                    code: rubric.rubricCode, 
                    name: rubric.rubricName, 
                    type: 'RUBRIC', 
                    values: calculateValueForNode([rubric.id], primaryKeys, true),
                    prevValues: calculateValueForNode([rubric.id], compareKeys, true) 
                };
                centerNode.children.push(rubricNode);
            });
            
            primaryKeys.forEach(k => { centerNode.values[k] = centerNode.children.reduce((acc, child) => acc + (child.values[k] || 0), 0); });
            compareKeys.forEach(k => { centerNode.prevValues[k] = centerNode.children.reduce((acc, child) => acc + (child.prevValues[k] || 0), 0); });
            outflowNode.children.push(centerNode);
        });

        primaryKeys.forEach(k => {
            inflowNode.values[k] = inflowNode.children.reduce((acc, child) => acc + (child.values[k] || 0), 0);
            outflowNode.values[k] = outflowNode.children.reduce((acc, child) => acc + (child.values[k] || 0), 0);
        });
        compareKeys.forEach(k => {
            inflowNode.prevValues[k] = inflowNode.children.reduce((acc, child) => acc + (child.prevValues[k] || 0), 0);
            outflowNode.prevValues[k] = outflowNode.children.reduce((acc, child) => acc + (child.prevValues[k] || 0), 0);
        });

        hierarchy.push(inflowNode, outflowNode);
      } else { // DRE
          let classifications = Array.from(new Set(chartOfAccounts.map(c => c.classificationCode))).sort(); if (!classifications.includes('1')) classifications = ['1', ...classifications].sort();
          classifications.forEach(clsCode => { 
              let clsName = chartOfAccounts.find(c => c.classificationCode === clsCode)?.classificationName; 
              if (clsCode === '1' && !clsName) clsName = 'RECEITA OPERACIONAL'; if (!clsName) clsName = `GRUPO ${clsCode}`; 
              const clsNode: any = { code: clsCode, name: clsName, type: 'CLASSIFICATION', values: {}, prevValues: {}, children: [] };
              const isExpense = clsCode !== '1';
              
              if (clsCode === '1') { // DRE Receitas are by Revenue Type
                  revenueTypes.forEach(rt => {
                      const rtNode = { code: rt.id, name: rt.name, type: 'RUBRIC', values: calculateValueForRevenueType(rt.id, primaryKeys), prevValues: calculateValueForRevenueType(rt.id, compareKeys) };
                      clsNode.children.push(rtNode);
                  });
              } else { // DRE Despesas are by COA hierarchy
                  const centers = Array.from(new Set(chartOfAccounts.filter(c => c.classificationCode === clsCode).map(c => c.centerCode))).sort(); 
                  centers.forEach(centerCode => { 
                      const centerName = chartOfAccounts.find(c => c.centerCode === centerCode)?.centerName || 'Geral'; 
                      const centerNode: any = { code: centerCode, name: centerName, type: 'CENTER', values: {}, prevValues: {}, children: [] };
                      const rubrics = chartOfAccounts.filter(c => c.centerCode === centerCode).sort((a,b) => a.rubricCode.localeCompare(b.rubricCode, undefined, { numeric: true }));
                      rubrics.forEach(rubric => { 
                          const rubricNode = { code: rubric.rubricCode, name: rubric.rubricName, type: 'RUBRIC', values: calculateValueForNode([rubric.id], primaryKeys, isExpense), prevValues: calculateValueForNode([rubric.id], compareKeys, isExpense) }; 
                          centerNode.children.push(rubricNode);
                      });
                      primaryKeys.forEach(k => { centerNode.values[k] = centerNode.children.reduce((acc, child) => acc + (child.values[k] || 0), 0); });
                      compareKeys.forEach(k => { centerNode.prevValues[k] = centerNode.children.reduce((acc, child) => acc + (child.prevValues[k] || 0), 0); });
                      clsNode.children.push(centerNode);
                  });
              }

              primaryKeys.forEach(k => { clsNode.values[k] = clsNode.children.reduce((acc, child) => acc + (child.values[k] || 0), 0); });
              compareKeys.forEach(k => { clsNode.prevValues[k] = clsNode.children.reduce((acc, child) => acc + (child.prevValues[k] || 0), 0); });
              hierarchy.push(clsNode);
          });
      }
      primaryKeys.forEach(k => { netResult[k] = hierarchy.reduce((acc, cls) => acc + (cls.values[k] || 0), 0); });
      compareKeys.forEach(k => { prevNetResult[k] = hierarchy.reduce((acc, cls) => acc + (cls.prevValues[k] || 0), 0); });
      return { hierarchy, primaryKeys, compareKeys, netResult, prevNetResult };
  };

  const handleGenerateInsight = async () => { setLoadingInsight(true); const result = await generateFinancialInsight(validRecords); setInsight(result); setLoadingInsight(false); };

  const renderTransactionTable = (customRecords?: FinancialRecord[], isValidationMode: boolean = false) => {
    const recordsToShow = customRecords || (isValidationMode ? pendingValidationRecords : validRecords);
    const allSelected = recordsToShow.length > 0 && selectedRecordIds.size === recordsToShow.length;
    return (
        <div className="space-y-4 animate-in fade-in">
           {isValidationMode && (
               <>
                   <div className="bg-yellow-50 border border-yellow-100 p-4 rounded-lg flex items-start mb-4"><AlertCircle className="text-yellow-600 mr-3 flex-shrink-0 mt-0.5" size={20} /><div><h4 className="font-bold text-yellow-800 text-sm">Atenção Necessária</h4><p className="text-sm text-yellow-700 mt-1">Estas transações foram importadas ou geradas automaticamente e precisam de categorização ou confirmação.</p></div></div>
                   {selectedRecordIds.size > 0 && (<div className="flex items-center justify-between bg-white p-3 rounded-lg border border-gray-100 shadow-sm animate-in slide-in-from-top-2"><div className="flex items-center space-x-3"><div className="bg-mcsystem-500 text-white px-3 py-1.5 rounded-md text-sm font-bold flex items-center shadow-sm"><CheckSquare size={16} className="mr-2"/> {selectedRecordIds.size} Selecionados</div><button onClick={() => setSelectedRecordIds(new Set())} className="text-gray-500 hover:text-gray-700 text-sm flex items-center"><X size={14} className="mr-1"/> Cancelar</button></div><div className="flex items-center space-x-2"><button onClick={handleBulkValidate} className="bg-green-100 text-green-700 hover:bg-green-200 px-3 py-1.5 rounded text-xs font-bold transition-colors flex items-center border border-green-200"><CheckCircle2 size={14} className="mr-1"/> Validar Todos</button><button onClick={handleBulkDelete} className="bg-red-50 text-red-600 hover:bg-red-100 px-3 py-1.5 rounded text-xs font-bold transition-colors flex items-center border border-red-200"><Trash2 size={14} className="mr-1"/> Excluir Todos</button></div></div>)}
               </>
           )}
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
                <table className="w-full text-left text-sm text-gray-600">
                    <thead className="bg-gray-50 text-gray-700 font-bold border-b border-gray-200 uppercase text-xs tracking-wider">
                        <tr>{isValidationMode && (<th className="p-4 w-10 text-center"><div onClick={() => handleSelectAll(recordsToShow)} className="cursor-pointer text-gray-400 hover:text-mcsystem-500 transition-colors">{allSelected ? <CheckSquare size={18} className="text-mcsystem-500" /> : <Square size={18} />}</div></th>)}<th className="p-4">Descrição</th><th className="p-4">Vencimento</th><th className="p-4">Valor</th><th className="p-4">Tipo</th><th className="p-4">Categoria / Rubrica</th><th className="p-4 text-center">Ações</th></tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {recordsToShow.map(r => {
                            const realValue = r.amount; const isPositiveFlow = realValue >= 0; const isSelected = selectedRecordIds.has(r.id);
                            return (
                            <tr key={r.id} className={`hover:bg-gray-50 group transition-colors ${isSelected ? 'bg-blue-50/50' : ''}`}>
                                {isValidationMode && (<td className="p-4 text-center"><div onClick={() => handleSelectOne(r.id)} className="cursor-pointer text-gray-300 hover:text-mcsystem-500 transition-colors">{isSelected ? <CheckSquare size={18} className="text-mcsystem-500" /> : <Square size={18} />}</div></td>)}
                                <td className="p-4 font-medium text-gray-800">{r.description}{r.companyId && (<div className="flex items-center mt-1 text-[10px] text-gray-500 font-normal"><Building size={10} className="mr-1" />{companies.find(c => c.id === r.companyId)?.name}</div>)}</td>
                                <td className="p-4">{new Date(r.dueDate).toLocaleDateString('pt-BR', {timeZone: 'UTC'})}</td>
                                <td className={`p-4 font-bold ${isPositiveFlow ? 'text-green-600' : 'text-red-500'}`}>{isPositiveFlow ? '+' : ''} R$ {(realValue || 0).toLocaleString('pt-BR')}</td>
                                <td className="p-4"><span className={`px-2 py-1 rounded text-xs font-bold ${r.type === TransactionType.INCOME ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{r.type}</span></td>
                                <td className="p-4">{r.rubricId ? (<span className="bg-blue-50 text-blue-700 px-2 py-1 rounded text-xs border border-blue-100">{chartOfAccounts.find(c => c.id === r.rubricId)?.rubricName || r.category}</span>) : (r.revenueTypeId ? (<span className="bg-emerald-50 text-emerald-700 px-2 py-1 rounded text-xs border border-emerald-100">{revenueTypes.find(rt => rt.id === r.revenueTypeId)?.name || 'Receita'}</span>) : (<span className="bg-yellow-100 text-yellow-700 px-2 py-1 rounded text-xs border border-yellow-200 flex items-center w-fit"><AlertCircle size={10} className="mr-1"/> Definir Categoria</span>))}</td>
                                <td className="p-4 text-center"><div className="flex justify-center space-x-2"><button onClick={(e) => handleEditTransaction(e, r)} className="flex items-center px-3 py-1 bg-mcsystem-500 text-white rounded text-xs hover:bg-mcsystem-600 transition-colors shadow-sm"><Pencil size={12} className="mr-1"/> {isValidationMode ? 'Validar' : 'Editar'}</button><button type="button" onClick={(e) => { e.stopPropagation(); handleDeleteTransaction(e, r.id); }} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors relative z-10"><Trash2 size={16} className="pointer-events-none"/></button></div></td>
                            </tr>
                        )})}
                        {recordsToShow.length === 0 && (<tr><td colSpan={isValidationMode ? 7 : 6} className="p-8 text-center text-gray-400">{isValidationMode ? 'Tudo certo! Nenhuma pendência.' : 'Nenhuma transação encontrada.'}</td></tr>)}
                    </tbody>
                </table>
            </div>
        </div>
    );
  };

  const renderUnifiedTransactions = () => {
      let filtered = validRecords.filter(r => {
          const matchesType = reconFilterType === 'ALL' || r.type === reconFilterType;
          const matchesStatus = reconFilterStatus === 'ALL' || r.status === reconFilterStatus;
          const matchesBank = reconFilterBank === 'ALL' || r.bankId === reconFilterBank;
          const matchesSearch = r.description.toLowerCase().includes(reconSearch.toLowerCase()) || (chartOfAccounts.find(c=>c.id===r.rubricId)?.rubricName || r.category ||'').toLowerCase().includes(reconSearch.toLowerCase()) || r.amount.toString().includes(reconSearch);
          return matchesType && matchesStatus && matchesSearch && matchesBank;
      });

      if (sortConfig.key) {
        filtered.sort((a, b) => {
            let aValue: any;
            let bValue: any;

            if (sortConfig.key === 'category') {
                aValue = chartOfAccounts.find(c => c.id === a.rubricId)?.rubricName || (a.revenueTypeId ? revenueTypes.find(rt => rt.id === a.revenueTypeId)?.name : a.category) || '';
                bValue = chartOfAccounts.find(c => c.id === b.rubricId)?.rubricName || (b.revenueTypeId ? revenueTypes.find(rt => rt.id === b.revenueTypeId)?.name : b.category) || '';
            } else if (sortConfig.key === 'bankName') {
                aValue = banks.find(bank => bank.id === a.bankId)?.name || '';
                bValue = banks.find(bank => bank.id === b.bankId)?.name || '';
            } else if (sortConfig.key === 'amount') {
                aValue = a.amount * (a.type === TransactionType.INCOME ? 1 : -1);
                bValue = b.amount * (b.type === TransactionType.INCOME ? 1 : -1);
            } else {
                aValue = a[sortConfig.key as keyof FinancialRecord];
                bValue = b[sortConfig.key as keyof FinancialRecord];
            }

            const valA = aValue;
            const valB = bValue;

            const isANull = valA === null || valA === undefined || valA === '';
            const isBNull = valB === null || valB === undefined || valB === '';
            if (isANull && isBNull) return 0;
            if (isANull) return 1;
            if (isBNull) return -1;
            
            let comparison = 0;
            if (typeof valA === 'number' && typeof valB === 'number') {
                comparison = valA - valB;
            } else if (sortConfig.key === 'dueDate' || sortConfig.key === 'competenceDate') {
                const dateA = new Date(valA).getTime();
                const dateB = new Date(valB).getTime();
                comparison = dateA - dateB;
            } else {
                comparison = String(valA).localeCompare(String(valB), 'pt-BR', { sensitivity: 'base' });
            }
            
            return sortConfig.direction === 'ascending' ? comparison : -comparison;
        });
      }

      const allSelected = filtered.length > 0 && selectedRecordIds.size === filtered.length;
      return (
          <div className="space-y-4 animate-in fade-in">
              <div className="flex flex-col md:flex-row justify-between gap-4 bg-white p-4 rounded-lg border border-gray-100 shadow-sm transition-all">{selectedRecordIds.size > 0 ? (<div className="flex items-center justify-between w-full animate-in slide-in-from-top-2"><div className="flex items-center space-x-4"><div className="bg-mcsystem-500 text-white px-3 py-1.5 rounded-md text-sm font-bold flex items-center shadow-sm"><CheckSquare size={16} className="mr-2"/> {selectedRecordIds.size} Selecionados</div><button onClick={() => setSelectedRecordIds(new Set())} className="text-gray-500 hover:text-gray-700 text-sm flex items-center"><X size={14} className="mr-1"/> Cancelar</button></div><div className="flex items-center space-x-2"><button onClick={() => handleBulkStatusChange(TransactionStatus.PAID)} className="bg-green-100 text-green-700 hover:bg-green-200 px-3 py-1.5 rounded text-xs font-bold transition-colors flex items-center"><CheckCircle2 size={14} className="mr-1"/> Marcar Pago</button><button onClick={() => handleBulkStatusChange(TransactionStatus.PENDING)} className="bg-yellow-100 text-yellow-700 hover:bg-yellow-200 px-3 py-1.5 rounded text-xs font-bold transition-colors flex items-center"><Clock size={14} className="mr-1"/> Marcar Pendente</button><div className="h-4 w-px bg-gray-300 mx-2"></div><button onClick={handleBulkDuplicate} className="text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded text-xs font-bold transition-colors flex items-center"><Copy size={14} className="mr-1"/> Duplicar</button><button onClick={handleBulkDelete} className="text-red-600 hover:bg-red-50 px-3 py-1.5 rounded text-xs font-bold transition-colors flex items-center"><Trash2 size={14} className="mr-1"/> Excluir</button></div></div>) : (<><div className="flex gap-4 items-center flex-1"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} /><input type="text" placeholder="Buscar lançamentos..." className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-mcsystem-500" value={reconSearch} onChange={e => setReconSearch(e.target.value)} /></div><select className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white" value={reconFilterType} onChange={e => setReconFilterType(e.target.value as any)}><option value="ALL">Todas Movimentações</option><option value={TransactionType.INCOME}>Receitas</option><option value={TransactionType.EXPENSE}>Despesas</option></select><select className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white" value={reconFilterBank} onChange={e => setReconFilterBank(e.target.value as any)}><option value="ALL">Todos os Bancos</option>{banks.map(b => (<option key={b.id} value={b.id}>{b.name}</option>))}</select><select className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white" value={reconFilterStatus} onChange={e => setReconFilterStatus(e.target.value as any)}><option value="ALL">Todos Status</option><option value={TransactionStatus.PAID}>Realizado / Pago</option><option value={TransactionStatus.PENDING}>Pendente</option><option value={TransactionStatus.OVERDUE}>Atrasado</option></select></div><button onClick={() => { resetTransactionForm(); setIsModalOpen(true); }} className="bg-mcsystem-500 hover:bg-mcsystem-400 text-white px-4 py-2 rounded-lg font-bold flex items-center shadow-sm whitespace-nowrap"><Plus size={18} className="mr-2" /> Novo Lançamento</button></>)}</div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
                  <table className="w-full text-left text-sm text-gray-600">
                      <thead className="bg-gray-50 text-gray-700 font-bold border-b border-gray-200 uppercase text-xs tracking-wider">
                          <tr>
                            <th className="p-4 w-10 text-center"><div onClick={() => handleSelectAll(filtered)} className="cursor-pointer text-gray-400 hover:text-mcsystem-500 transition-colors">{allSelected ? <CheckSquare size={18} className="text-mcsystem-500" /> : <Square size={18} />}</div></th>
                            <th className="p-4 cursor-pointer group hover:bg-gray-100" onClick={() => requestSort('category')}><div className="flex items-center gap-1.5">Categoria{sortConfig.key === 'category' ? (sortConfig.direction === 'ascending' ? <ArrowUp size={12} className="text-mcsystem-500"/> : <ArrowDown size={12} className="text-mcsystem-500"/>) : <ArrowUpDown size={12} className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity"/>}</div></th>
                            <th className="p-4 cursor-pointer group hover:bg-gray-100" onClick={() => requestSort('dueDate')}><div className="flex items-center gap-1.5">Vencimento{sortConfig.key === 'dueDate' ? (sortConfig.direction === 'ascending' ? <ArrowUp size={12} className="text-mcsystem-500"/> : <ArrowDown size={12} className="text-mcsystem-500"/>) : <ArrowUpDown size={12} className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity"/>}</div></th>
                            <th className="p-4 cursor-pointer group hover:bg-gray-100" onClick={() => requestSort('competenceDate')}><div className="flex items-center gap-1.5">Competência{sortConfig.key === 'competenceDate' ? (sortConfig.direction === 'ascending' ? <ArrowUp size={12} className="text-mcsystem-500"/> : <ArrowDown size={12} className="text-mcsystem-500"/>) : <ArrowUpDown size={12} className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity"/>}</div></th>
                            <th className="p-4 cursor-pointer group hover:bg-gray-100" onClick={() => requestSort('bankName')}><div className="flex items-center gap-1.5">Conta / Banco{sortConfig.key === 'bankName' ? (sortConfig.direction === 'ascending' ? <ArrowUp size={12} className="text-mcsystem-500"/> : <ArrowDown size={12} className="text-mcsystem-500"/>) : <ArrowUpDown size={12} className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity"/>}</div></th>
                            <th className="p-4 cursor-pointer group hover:bg-gray-100" onClick={() => requestSort('description')}><div className="flex items-center gap-1.5">Descrição{sortConfig.key === 'description' ? (sortConfig.direction === 'ascending' ? <ArrowUp size={12} className="text-mcsystem-500"/> : <ArrowDown size={12} className="text-mcsystem-500"/>) : <ArrowUpDown size={12} className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity"/>}</div></th>
                            <th className="p-4 cursor-pointer group hover:bg-gray-100" onClick={() => requestSort('status')}><div className="flex items-center gap-1.5">Status{sortConfig.key === 'status' ? (sortConfig.direction === 'ascending' ? <ArrowUp size={12} className="text-mcsystem-500"/> : <ArrowDown size={12} className="text-mcsystem-500"/>) : <ArrowUpDown size={12} className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity"/>}</div></th>
                            <th className="p-4 text-right cursor-pointer group hover:bg-gray-100" onClick={() => requestSort('amount')}><div className="flex items-center justify-end gap-1.5">Valor{sortConfig.key === 'amount' ? (sortConfig.direction === 'ascending' ? <ArrowUp size={12} className="text-mcsystem-500"/> : <ArrowDown size={12} className="text-mcsystem-500"/>) : <ArrowUpDown size={12} className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity"/>}</div></th>
                            <th className="p-4 text-center">Ações</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                          {filtered.map(r => {
                              const realValue = r.amount; const isPositiveFlow = realValue >= 0; const isSelected = selectedRecordIds.has(r.id);
                              const isExpenseType = r.type === TransactionType.EXPENSE;
                              const isRefundBadge = isExpenseType ? (realValue > 0) : (realValue < 0);
                              return (
                              <tr key={r.id} className={`group transition-colors ${isSelected ? 'bg-blue-50/50' : 'hover:bg-gray-50'}`}>
                                  <td className="p-4 text-center"><div onClick={() => handleSelectOne(r.id)} className="cursor-pointer text-gray-300 hover:text-mcsystem-500 transition-colors">{isSelected ? <CheckSquare size={18} className="text-mcsystem-500" /> : <Square size={18} />}</div></td>
                                  <td className="p-4"><span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs">{chartOfAccounts.find(c => c.id === r.rubricId)?.rubricName || (r.revenueTypeId ? revenueTypes.find(rt => rt.id === r.revenueTypeId)?.name : r.category)}</span></td>
                                  <td className="p-4">{new Date(r.dueDate).toLocaleDateString('pt-BR', {timeZone: 'UTC'})}</td>
                                  <td className="p-4 text-xs text-gray-500">{r.competenceDate ? new Date(r.competenceDate).toLocaleDateString('pt-BR', {month: '2-digit', year: 'numeric', timeZone: 'UTC'}) : '-'}</td>
                                  <td className="p-4 text-xs text-gray-500">{banks.find(b => b.id === r.bankId)?.name || '-'}</td>
                                  <td className="p-4 font-medium text-gray-800">{r.description}{r.companyId && (<div className="flex items-center mt-1 text-[10px] text-gray-500 font-normal"><Building size={10} className="mr-1" />{companies.find(c => c.id === r.companyId)?.name}</div>)}</td>
                                  <td className="p-4"><div className="relative group/status inline-block"><select value={r.status} onChange={(e) => handleStatusChange(r.id, e.target.value as TransactionStatus)} className={`appearance-none pl-3 pr-8 py-1.5 rounded-full text-xs font-bold border-0 cursor-pointer outline-none focus:ring-2 focus:ring-offset-1 transition-all ${r.status === TransactionStatus.PAID ? 'bg-green-100 text-green-700 focus:ring-green-500' : r.status === TransactionStatus.OVERDUE ? 'bg-red-100 text-red-700 focus:ring-red-500' : 'bg-yellow-100 text-yellow-700 focus:ring-yellow-500'}`}><option value={TransactionStatus.PENDING}>Pendente</option><option value={TransactionStatus.PAID}>Pago</option><option value={TransactionStatus.OVERDUE}>Atrasado</option></select><ChevronDown size={12} className={`absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none ${r.status === TransactionStatus.PAID ? 'text-green-700' : r.status === TransactionStatus.OVERDUE ? 'text-red-700' : 'text-yellow-700'}`} /></div></td>
                                  <td className="p-4 text-right"><div className="flex items-center justify-end gap-2"><span className={`font-bold ${isPositiveFlow ? 'text-green-600' : 'text-red-500'}`}>{isPositiveFlow ? '+' : ''} R$ {Math.abs(realValue || 0).toLocaleString('pt-BR')}</span>{isRefundBadge && <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded uppercase">Estorno</span>}</div></td>
                                  <td className="p-4 text-center"><div className="flex justify-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={(e) => handleEditTransaction(e, r)} className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded transition-colors"><Pencil size={16}/></button><button type="button" onClick={(e) => { e.stopPropagation(); handleDeleteTransaction(e, r.id); }} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors relative z-10"><Trash2 size={16} className="pointer-events-none" /></button></div></td>
                              </tr>
                          )})}
                          {filtered.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-gray-400">Nenhum lançamento encontrado com os filtros atuais.</td></tr>}
                      </tbody>
                  </table>
              </div>
          </div>
      );
  };

  const renderHierarchicalReport = (mode: 'DRE' | 'CASHFLOW') => {
      const { hierarchy, primaryKeys, compareKeys, netResult, prevNetResult } = buildHierarchy(mode);
      const calculateRowTotal = (values: Record<string, number>, keys: string[]) => keys.reduce((acc, m) => acc + (values[m] || 0), 0);
      const netTotal = primaryKeys.reduce((acc, m) => acc + (netResult[m] || 0), 0);
      const prevNetTotal = isCompareEnabled ? compareKeys.reduce((acc, m) => acc + (prevNetResult[m] || 0), 0) : 0;

      const renderCellWithComparison = (curr: number | undefined, prev: number | undefined, isExpense: boolean) => {
          const safeCurr = curr ?? 0;
          const safePrev = prev ?? 0;
          const valueClass = safeCurr < 0 ? 'text-red-600' : (safeCurr > 0 ? 'text-green-600' : 'text-gray-800'); 
          const displayValue = safeCurr !== 0 ? safeCurr.toLocaleString('pt-BR', {minimumFractionDigits: 0, maximumFractionDigits: 0}) : '-';

          if (!isCompareEnabled || safeCurr === 0) {
              return <span className={valueClass}>{displayValue}</span>;
          }

          const delta = safeCurr - safePrev;
          const percent = safePrev !== 0 ? (delta / Math.abs(safePrev)) * 100 : 0;
          let compareColorClass = 'text-gray-400';
          let Icon = Minus;
          if (delta > 0) { Icon = ArrowUpRight; compareColorClass = 'text-green-500'; } 
          else if (delta < 0) { Icon = ArrowDownRight; compareColorClass = 'text-red-500'; }

          return (
              <div className="flex flex-col items-end">
                  <span className={valueClass}>{displayValue}</span>
                  <div className={`text-[9px] flex items-center mt-0.5 font-medium ${compareColorClass} opacity-90`}>
                      <Icon size={8} className="mr-0.5" />
                      {Math.abs(percent).toFixed(0)}%
                      <span className="text-gray-400 ml-1 font-normal">({safePrev.toLocaleString('pt-BR', { notation: "compact" })})</span>
                  </div>
              </div>
          );
      };

      if (reportViewMode === 'SUMMARY') {
          if (mode === 'CASHFLOW') {
              const income = calculateRowTotal(hierarchy.find(h=>h.code==='INFLOW')?.values || {}, primaryKeys);
              const expense = calculateRowTotal(hierarchy.find(h=>h.code==='OUTFLOW')?.values || {}, primaryKeys);
              return (
                  <div className="bg-white rounded-lg shadow-sm border border-gray-100 max-w-4xl mx-auto p-8 animate-in fade-in">
                      <div className="flex justify-between items-center mb-6"><h3 className="text-xl font-bold text-gray-800">Resumo de Caixa ({primaryPeriod.year})</h3><button onClick={() => setReportViewMode('DETAILED')} className="text-sm text-mcsystem-500 hover:underline flex items-center"><List size={14} className="mr-1"/> Ver Detalhado (Matriz)</button></div>
                      <div className="grid grid-cols-3 gap-6 text-center"><div className="p-6 bg-green-50 rounded-xl border border-green-100"><p className="text-sm text-green-600 font-bold uppercase mb-2">Entradas (Selecionadas)</p><p className="text-2xl font-bold text-green-700">R$ {income.toLocaleString('pt-BR')}</p></div><div className="p-6 bg-red-50 rounded-xl border border-red-100"><p className="text-sm text-red-600 font-bold uppercase mb-2">Saídas (Selecionadas)</p><p className="text-2xl font-bold text-red-700">R$ {Math.abs(expense).toLocaleString('pt-BR')}</p></div><div className="p-6 bg-blue-50 rounded-xl border border-blue-100"><p className="text-sm text-blue-600 font-bold uppercase mb-2">Saldo do Período</p><p className="text-2xl font-bold text-blue-700">R$ {(income + expense).toLocaleString('pt-BR')}</p></div></div>
                  </div>
              );
          } else { // DRE SUMMARY
              return (
                  <div className="bg-white rounded-lg shadow-sm border border-gray-100 max-w-4xl mx-auto p-8 animate-in fade-in">
                      <div className="flex justify-between items-center mb-6"><h3 className="text-xl font-bold text-gray-800">DRE Gerencial ({primaryPeriod.year})</h3><button onClick={() => setReportViewMode('DETAILED')} className="text-sm text-mcsystem-500 hover:underline flex items-center"><List size={14} className="mr-1"/> Ver Detalhado (Matriz)</button></div>
                      <div className="space-y-1">{hierarchy.map(cls => { const ytdTotal = calculateRowTotal(cls.values, primaryKeys); const isPositive = ytdTotal >= 0; return (<div key={cls.code} className="flex justify-between py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50"><span className="font-semibold text-gray-700">{cls.name}</span><span className={`font-bold ${isPositive ? 'text-green-600' : 'text-red-500'}`}>R$ {ytdTotal.toLocaleString('pt-BR')}</span></div>); })}<div className="pt-4 mt-4 border-t border-gray-200"><div className="flex justify-between items-center bg-gray-50 p-4 rounded-lg"><span className="text-lg font-bold text-gray-900 uppercase">Resultado Acumulado</span><span className={`text-xl font-bold ${netTotal >= 0 ? 'text-green-700' : 'text-red-700'}`}>R$ {netTotal.toLocaleString('pt-BR')}</span></div></div></div>
                  </div>
              );
          }
      }

      const filterNodes = (nodes: any[]): any[] => { if (!hideEmptyRows) return nodes; return nodes.map(node => { if (node.children && node.children.length > 0) { const filteredChildren = filterNodes(node.children); const totalVal = primaryKeys.reduce((acc, m) => acc + Math.abs(node.values[m] || 0), 0); if (filteredChildren.length > 0 || totalVal > 0.01) { return { ...node, children: filteredChildren }; } return null; } else { const totalVal = primaryKeys.reduce((acc, m) => acc + Math.abs(node.values[m] || 0), 0); return totalVal > 0.01 ? node : null; } }).filter(Boolean); };
      const displayedHierarchy = filterNodes(hierarchy); const bottomLineLabel = mode === 'DRE' ? 'RESULTADO LÍQUIDO' : 'SALDO OPERACIONAL';

      return (
          <div className="space-y-4 animate-in fade-in">
              <div className="flex flex-col md:flex-row justify-between items-center gap-4"><h3 className="font-bold text-gray-800 text-lg">{mode === 'DRE' ? `DRE Matriz` : `Fluxo de Caixa`}</h3><div className="flex flex-wrap gap-2 items-center"><div className="relative" ref={periodMenuRef}><button onClick={() => setIsPeriodMenuOpen(!isPeriodMenuOpen)} className="px-3 py-2 text-sm border border-gray-200 bg-white rounded-lg font-medium flex items-center shadow-sm hover:bg-gray-50 text-gray-700"><Calendar size={16} className="mr-2 text-mcsystem-500" /> Configurar Período <ChevronDown size={14} className="ml-2 text-gray-400" /></button>{isPeriodMenuOpen && (<div className="absolute top-full right-0 mt-2 w-[400px] bg-white border border-gray-200 rounded-lg shadow-xl z-30 p-4 animate-in fade-in zoom-in-95"><div className="mb-4"><div className="flex justify-between items-center mb-2"><label className="text-xs font-bold text-gray-500 uppercase">Período Principal</label><select className="text-sm border border-gray-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-mcsystem-500" value={primaryPeriod.year} onChange={e => setPrimaryPeriod({...primaryPeriod, year: Number(e.target.value)})}>{availableYears.map(y => <option key={y} value={y}>{y}</option>)}</select></div><div className="grid grid-cols-6 gap-1 mb-2">{monthNames.map((m, i) => (<button key={i} onClick={() => toggleMonth(i + 1, false)} className={`text-[10px] font-bold py-1.5 rounded transition-colors ${primaryPeriod.months.includes(i + 1) ? 'bg-mcsystem-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>{m}</button>))}</div><div className="flex justify-between text-xs text-mcsystem-600"><button onClick={() => selectAllMonths(false)} className="hover:underline">Selecionar Todos</button><button onClick={() => clearMonths(false)} className="text-red-500 hover:underline">Limpar</button></div></div><div className="h-px bg-gray-200 my-4"></div><div className="flex items-center justify-between mb-3"><label className="flex items-center cursor-pointer"><input type="checkbox" checked={isCompareEnabled} onChange={() => setIsCompareEnabled(!isCompareEnabled)} className="sr-only peer"/><div className="relative w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-mcsystem-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-mcsystem-500"></div><span className="ms-2 text-sm font-medium text-gray-700">Comparar com outro período</span></label></div>{isCompareEnabled && (<div className="bg-gray-50 p-3 rounded-lg border border-gray-100 animate-in slide-in-from-top-2"><div className="flex justify-between items-center mb-2"><label className="text-xs font-bold text-gray-500 uppercase">Período Comparativo</label><select className="text-sm border border-gray-300 rounded px-2 py-1 bg-white focus:outline-none" value={comparePeriod.year} onChange={e => setComparePeriod({...comparePeriod, year: Number(e.target.value)})}>{availableYears.map(y => <option key={y} value={y}>{y}</option>)}</select></div><div className="grid grid-cols-6 gap-1 mb-2">{monthNames.map((m, i) => (<button key={i} onClick={() => toggleMonth(i + 1, true)} className={`text-[10px] font-bold py-1.5 rounded transition-colors ${comparePeriod.months.includes(i + 1) ? 'bg-purple-500 text-white' : 'bg-white border border-gray-200 text-gray-400 hover:bg-gray-100'}`}>{m}</button>))}</div><div className="flex justify-between text-xs"><button onClick={copyPrimaryToCompare} className="text-purple-600 hover:underline flex items-center"><Copy size={10} className="mr-1"/> Copiar Principal</button><div className="space-x-2"><button onClick={() => selectAllMonths(true)} className="text-purple-600 hover:underline">Todos</button><button onClick={() => clearMonths(true)} className="text-red-500 hover:underline">Limpar</button></div></div></div>)}</div>)}</div><div className="h-6 w-px bg-gray-300 mx-2 hidden md:block"></div><button onClick={() => setIncludeProjections(!includeProjections)} className={`px-3 py-2 text-sm border rounded-lg font-medium flex items-center transition-colors ${includeProjections ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{includeProjections ? <CheckSquare size={16} className="mr-2"/> : <Square size={16} className="mr-2"/>}{'Incluir Pendentes'}</button><button onClick={() => setHideEmptyRows(!hideEmptyRows)} className={`px-3 py-2 text-sm border rounded-lg font-medium flex items-center transition-colors ${!hideEmptyRows ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{hideEmptyRows ? <Eye size={16} className="mr-2"/> : <EyeOff size={16} className="mr-2"/>}{hideEmptyRows ? 'Mostrar Vazios' : 'Ocultar Vazios'}</button><button onClick={() => setReportViewMode('SUMMARY')} className="px-4 py-2 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 font-medium">Voltar</button><button className="px-4 py-2 text-sm bg-mcsystem-500 text-white rounded-lg flex items-center font-medium shadow-sm hover:bg-mcsystem-400"><Download size={14} className="mr-2"/> Excel</button></div></div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
                  <table className="w-full text-xs text-gray-600 whitespace-nowrap table-fixed min-w-[1400px]">
                      <thead className="bg-gray-100 text-gray-600 font-bold uppercase tracking-wider text-[10px]">
                          <tr><th className="p-3 text-left w-64 border-b border-r border-gray-200 sticky left-0 bg-gray-100 z-20">Item</th>{primaryKeys.map(mk => (<th key={mk} className="p-3 text-right border-b border-gray-200 w-24">{monthNames[parseInt(mk.split('-')[1]) - 1]}<span className="block text-[9px] text-gray-400 font-normal">{mk.split('-')[0]}</span></th>))}<th className="p-3 text-right border-b border-gray-200 w-28 bg-gray-200 text-gray-800 border-l border-gray-300">TOTAL</th></tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                          {displayedHierarchy.map((cls: any) => {
                              const clsTotal = calculateRowTotal(cls.values, primaryKeys);
                              const prevClsTotal = calculateRowTotal(cls.prevValues, compareKeys);
                              const isExpense = (mode === 'DRE' && cls.code !== '1') || (mode === 'CASHFLOW' && cls.code === 'OUTFLOW');
                              return (
                              <React.Fragment key={cls.code}>
                                  <tr className="bg-slate-50 border-b border-gray-200 font-bold text-gray-900 uppercase">
                                      <td className="p-3 border-r border-gray-200 sticky left-0 bg-slate-50 z-10">{cls.name}</td>
                                      {primaryKeys.map((mk, i) => (<td key={mk} onClick={() => handleCellClick(cls, mk, mode)} className="p-3 text-right cursor-pointer hover:bg-gray-200 transition-colors">{renderCellWithComparison(cls.values[mk], isCompareEnabled && compareKeys[i] ? cls.prevValues[compareKeys[i]] : 0, isExpense)}</td>))}
                                      <td className="p-3 text-right font-bold border-l border-gray-300 bg-gray-200">{renderCellWithComparison(clsTotal, prevClsTotal, isExpense)}</td>
                                  </tr>
                                  {cls.children.map((center: any) => {
                                      const centerTotal = calculateRowTotal(center.values, primaryKeys);
                                      const prevCenterTotal = calculateRowTotal(center.prevValues, compareKeys);
                                      const cIsExpense = isExpense;
                                      return (
                                      <React.Fragment key={center.code}>
                                          {center.type === 'CENTER' && (
                                              <tr className="font-semibold text-gray-800 bg-white hover:bg-gray-50 border-b border-gray-100">
                                                  <td className="p-3 pl-6 border-r border-gray-200 sticky left-0 bg-white z-10 flex items-center">{center.name}</td>
                                                  {primaryKeys.map((mk, i) => (<td key={mk} onClick={() => handleCellClick(center, mk, mode)} className="p-3 text-right cursor-pointer hover:bg-gray-100 transition-colors">{renderCellWithComparison(center.values[mk], isCompareEnabled && compareKeys[i] ? center.prevValues[compareKeys[i]] : 0, cIsExpense)}</td>))}
                                                  <td className="p-3 text-right font-bold border-l border-gray-200 bg-gray-50">{renderCellWithComparison(centerTotal, prevCenterTotal, cIsExpense)}</td>
                                              </tr>
                                          )}
                                          {(center.type === 'RUBRIC' ? [center] : center.children).map((rubric: any) => {
                                              const rubricTotal = calculateRowTotal(rubric.values, primaryKeys);
                                              const prevRubricTotal = calculateRowTotal(rubric.prevValues, compareKeys);
                                              const rIsExpense = cIsExpense;
                                              return (
                                              <tr key={rubric.code} className="text-gray-500 hover:bg-blue-50/20 text-[11px] border-b border-gray-50">
                                                  <td className={`p-2 border-r border-gray-100 sticky left-0 bg-white z-10 truncate ${center.type === 'RUBRIC' ? 'pl-6 font-medium text-gray-700' : 'pl-10'}`}>{rubric.name}</td>
                                                  {primaryKeys.map((mk, i) => (<td key={mk} onClick={() => handleCellClick(rubric, mk, mode)} className="p-2 text-right cursor-pointer hover:bg-blue-100/50 transition-colors">{renderCellWithComparison(rubric.values[mk], isCompareEnabled && compareKeys[i] ? rubric.prevValues[compareKeys[i]] : 0, rIsExpense)}</td>))}
                                                  <td className="p-2 text-right border-l border-gray-100 bg-gray-50/50">{renderCellWithComparison(rubricTotal, prevRubricTotal, rIsExpense)}</td>
                                              </tr>
                                          )})}
                                      </React.Fragment>
                                  )})}
                              </React.Fragment>
                          )})}
                          <tr className="bg-mcsystem-50 font-bold text-gray-900 border-t-2 border-mcsystem-100">
                              <td className="p-4 border-r border-mcsystem-100 sticky left-0 bg-mcsystem-50 z-10 uppercase">{bottomLineLabel}</td>
                              {primaryKeys.map((mk, i) => (<td key={mk} className="p-4 text-right">{renderCellWithComparison(netResult[mk], isCompareEnabled && compareKeys[i] ? prevNetResult[compareKeys[i]] : 0, netResult[mk] < 0)}</td>))}
                              <td className="p-4 text-right font-black border-l border-mcsystem-200 bg-mcsystem-100">{renderCellWithComparison(netTotal, prevNetTotal, netTotal < 0)}</td>
                          </tr>
                      </tbody>
                  </table>
              </div>
          </div>
      );
  };

  const renderCOA = () => (
      <div className="space-y-4 animate-in fade-in">
          <input type="file" ref={coaFileInputRef} onChange={handleCOAFileUpload} accept=".csv,.txt" className="hidden" />
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 flex flex-col md:flex-row justify-between items-center gap-4">
              <div className="flex items-center text-blue-800">
                  <Tags size={20} className="mr-2" />
                  <span className="font-bold text-sm">Gerenciamento de Rubricas</span>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                  
                  {selectedCOAIds.size > 0 ? (
                      <div className="flex items-center gap-2 animate-in slide-in-from-right-4 duration-300">
                          <span className="text-sm font-bold text-blue-800 bg-blue-100 px-3 py-1 rounded-full">{selectedCOAIds.size} selecionadas</span>
                          <button onClick={handleBulkDeleteCOA} className="bg-red-500 text-white px-3 py-1 rounded text-sm font-bold hover:bg-red-600 flex items-center shadow-sm">
                              <Trash2 size={14} className="mr-1"/> Excluir Selecionadas
                          </button>
                          <button onClick={() => setSelectedCOAIds(new Set())} className="text-gray-500 hover:text-gray-700 p-1"><X size={18}/></button>
                      </div>
                  ) : (
                      <>
                        <button onClick={handleLoadStandardModel} className="bg-indigo-600 text-white px-3 py-1 rounded text-sm font-bold hover:bg-indigo-500 flex items-center shadow-sm transition-transform hover:scale-105" title="Carregar plano de contas completo automaticamente">
                            <BookOpen size={14} className="mr-1"/> Carregar Padrão
                        </button>
                        <button onClick={handleDownloadCOATemplate} className="bg-white border border-blue-200 text-blue-600 px-3 py-1 rounded text-sm font-bold hover:bg-blue-50 flex items-center shadow-sm">
                            <Download size={14} className="mr-1"/> Baixar Modelo
                        </button>
                        <button onClick={handleImportCOAClick} className="bg-white border border-blue-200 text-blue-700 px-3 py-1 rounded text-sm font-bold hover:bg-blue-50 flex items-center shadow-sm">
                            <Upload size={14} className="mr-1"/> Importar
                        </button>
                        <button onClick={toggleBulkEditCOA} className={`px-3 py-1 rounded text-sm font-bold flex items-center shadow-sm transition-colors ${isBulkEditingCOA ? 'bg-orange-100 text-orange-700 border border-orange-200' : 'bg-white border border-blue-200 text-blue-700 hover:bg-blue-50'}`}>
                            {isBulkEditingCOA ? <X size={14} className="mr-1"/> : <Edit3 size={14} className="mr-1"/>}
                            {isBulkEditingCOA ? 'Cancelar Edição' : 'Edição em Massa'}
                        </button>
                         <div className="h-6 w-px bg-blue-200 mx-2 hidden md:block"></div>
                        <button onClick={() => { setCoaFormType('classification'); setCoaFormData({}); setIsCOAModalOpen(true); }} className="bg-blue-600 text-white px-3 py-1 rounded text-sm font-bold hover:bg-blue-500 flex items-center shadow-sm">
                            <Plus size={14} className="mr-1"/> Novo Item
                        </button>
                      </>
                  )}
                  
                  {isBulkEditingCOA && (
                      <button onClick={saveBulkCOA} className="bg-green-600 text-white px-3 py-1 rounded text-sm font-bold hover:bg-green-50 flex items-center shadow-sm">
                          <Save size={14} className="mr-1"/> Salvar Alterações
                      </button>
                  )}
              </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
              <table className="w-full text-left text-sm text-gray-600">
                  <thead className="bg-gray-50 text-gray-700 font-medium border-b border-gray-200">
                      <tr>
                          <th className="p-3 w-10 text-center">
                              <div onClick={handleSelectAllCOA} className="cursor-pointer text-gray-400 hover:text-mcsystem-500 transition-colors">
                                  {selectedCOAIds.size === chartOfAccounts.length && chartOfAccounts.length > 0 ? <CheckSquare size={18} className="text-mcsystem-500" /> : <Square size={18} />}
                              </div>
                          </th>
                          <th className="p-3">Classificação</th>
                          <th className="p-3">Grupo</th>
                          <th className="p-3">Rubrica</th>
                          {!isBulkEditingCOA && <th className="p-3 text-center">Ações</th>}
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                      {(isBulkEditingCOA ? bulkCOAData : chartOfAccounts).sort((a, b) => (a.classificationCode || '').localeCompare(b.classificationCode || '', undefined, { numeric: true }) || (a.centerCode || '').localeCompare(b.centerCode || '', undefined, { numeric: true }) || (a.rubricCode || '').localeCompare(b.rubricCode || '', undefined, { numeric: true })).map((account, idx) => (
                          <tr key={account.id} className={`hover:bg-gray-50 group ${editingRubricId === account.id ? 'bg-blue-50' : ''} ${selectedCOAIds.has(account.id) ? 'bg-blue-50/50' : ''}`}>
                              <td className="p-3 text-center">
                                  <div onClick={() => handleSelectOneCOA(account.id)} className="cursor-pointer text-gray-300 hover:text-mcsystem-500 transition-colors">
                                      {selectedCOAIds.has(account.id) ? <CheckSquare size={18} className="text-mcsystem-500" /> : <Square size={18} />}
                                  </div>
                              </td>
                              <td className="p-3">
                                  {isBulkEditingCOA ? (
                                      <input 
                                        value={account.classificationName} 
                                        onChange={(e) => handleBulkChange(idx, 'classificationName', e.target.value)}
                                        className="w-full border border-gray-200 rounded px-1 text-xs"
                                      />
                                  ) : account.classificationName}
                              </td>
                              <td className="p-3">
                                  {isBulkEditingCOA ? (
                                      <input 
                                        value={account.centerName} 
                                        onChange={(e) => handleBulkChange(idx, 'centerName', e.target.value)}
                                        className="w-full border border-gray-200 rounded px-1 text-xs"
                                      />
                                  ) : account.centerName}
                              </td>
                              <td className="p-3 font-bold text-gray-800">
                                  {isBulkEditingCOA ? (
                                      <input 
                                        value={account.rubricName} 
                                        onChange={(e) => handleBulkChange(idx, 'rubricName', e.target.value)}
                                        className="w-full border border-blue-300 rounded px-1 text-xs font-bold text-gray-800 focus:ring-1 focus:ring-blue-500 outline-none"
                                      />
                                  ) : account.rubricName}
                              </td>
                              {!isBulkEditingCOA && (
                                  <td className="p-3 text-center">
                                      <div className="flex justify-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                          <button onClick={(e) => handleEditRubric(e, account)} className="p-1 text-gray-400 hover:text-blue-500"><Pencil size={14}/></button>
                                          <button onClick={(e) => handleDeleteRubric(e, account.id)} className="p-1 text-gray-400 hover:text-red-500"><Trash2 size={14}/></button>
                                      </div>
                                  </td>
                              )}
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>
      </div>
  );

  return (
    <div className="space-y-6">
        <div className="flex flex-col xl:flex-row justify-between xl:items-center gap-4">
            <div className="flex bg-gray-100 p-1 rounded-lg overflow-x-auto max-w-full no-scrollbar shadow-inner">{[{ id: 'DASHBOARD', label: 'Visão Geral', icon: LayoutDashboard }, { id: 'RECONCILIATION', label: 'Conciliação', icon: ArrowRightLeft }, { id: 'DRE', label: 'DRE Gerencial', icon: FileText }, { id: 'CASHFLOW', label: 'Fluxo de Caixa', icon: TrendingUp }, { id: 'CASH_EVOLUTION', label: 'Evolução do Caixa', icon: Landmark }, { id: 'COA', label: 'Plano de Contas', icon: Tags }, { id: 'VALIDATION', label: 'Validação', icon: FileCheck, badge: pendingValidationRecords.length }].map(tab => (<button key={tab.id} onClick={() => { setActiveTab(tab.id as any); setReportViewMode('SUMMARY'); }} className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-white text-mcsystem-600 shadow-sm font-bold' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'}`}><tab.icon size={16} className={`mr-2 ${activeTab === tab.id ? 'text-mcsystem-500' : ''}`} />{tab.label}{tab.badge ? <span className="ml-2 bg-red-500 text-white text-[10px] px-1.5 rounded-full shadow-sm">{tab.badge}</span> : null}</button>))}</div>
            <div className="flex items-center gap-2"><input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".csv,.txt" className="hidden" /><div className="relative" ref={importMenuRef}><button onClick={() => setIsImportMenuOpen(!isImportMenuOpen)} className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-md text-sm font-medium flex items-center shadow-sm transition-colors"><Upload size={16} className="mr-2" /> Importar <ChevronDown size={14} className="ml-2 text-gray-400" /></button>{isImportMenuOpen && (<div className="absolute top-full right-0 mt-2 w-48 bg-white rounded-md shadow-lg border border-gray-100 z-10 py-1 animate-in fade-in zoom-in-95 duration-200"><button onClick={handleDownloadTemplate} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center"><Download size={14} className="mr-2 text-gray-400"/> Baixar Modelo</button><button onClick={handleImportClick} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center"><FileText size={14} className="mr-2 text-gray-400"/> Selecionar Arquivo</button></div>)}</div></div>
        </div>
        
        {activeTab === 'DASHBOARD' && (
            <div className="space-y-6 animate-in fade-in">
                {/* Filtros de Data */}
                <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
                    <div className="flex items-center gap-4 flex-wrap">
                        <div className="flex items-center gap-2">
                            <Calendar size={16} className="text-gray-400" />
                            <span className="text-sm font-bold text-gray-700">Período:</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <label className="text-xs text-gray-500 font-medium">De:</label>
                            <input
                                type="date"
                                value={dashboardFilterStartDate}
                                onChange={(e) => setDashboardFilterStartDate(e.target.value)}
                                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-mcsystem-500 focus:border-mcsystem-500"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <label className="text-xs text-gray-500 font-medium">Até:</label>
                            <input
                                type="date"
                                value={dashboardFilterEndDate}
                                onChange={(e) => setDashboardFilterEndDate(e.target.value)}
                                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-mcsystem-500 focus:border-mcsystem-500"
                            />
                        </div>
                        {(dashboardFilterStartDate || dashboardFilterEndDate) && (
                            <button
                                onClick={() => {
                                    setDashboardFilterStartDate('');
                                    setDashboardFilterEndDate('');
                                }}
                                className="text-xs text-gray-500 hover:text-red-500 font-medium flex items-center gap-1 transition-colors"
                            >
                                <X size={14} />
                                Limpar Filtros
                            </button>
                        )}
                    </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100"><p className="text-gray-500 text-xs font-bold uppercase tracking-wide">Receitas (Mês)</p><h3 className="text-2xl font-bold mt-2 text-green-600">R$ {(dashboardChartsData.totalIncome || 0).toLocaleString('pt-BR')}</h3><p className="text-xs text-green-600 mt-1 flex items-center"><TrendingUp size={12} className="mr-1" /> Entrada Bruta</p></div>
                    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100"><p className="text-gray-500 text-xs font-bold uppercase tracking-wide">Despesas (Mês)</p><h3 className="text-2xl font-bold mt-2 text-red-500">R$ {(dashboardChartsData.totalExpense || 0).toLocaleString('pt-BR')}</h3><p className="text-xs text-red-500 mt-1 flex items-center"><TrendingDown size={12} className="mr-1" /> Saída Total</p></div>
                    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100"><p className="text-gray-500 text-xs font-bold uppercase tracking-wide">Resultado (Mês)</p><h3 className={`text-2xl font-bold mt-2 ${dashboardChartsData.balance >= 0 ? 'text-blue-600' : 'text-red-600'}`}>R$ {(dashboardChartsData.balance || 0).toLocaleString('pt-BR')}</h3><p className="text-xs text-gray-400 mt-1 flex items-center"><Wallet size={12} className="mr-1" /> Saldo Operacional</p></div>
                    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 relative overflow-hidden"><div className="absolute right-0 top-0 p-4 opacity-5"><AlertCircle size={48} /></div><p className="text-gray-500 text-xs font-bold uppercase tracking-wide">Pendente (Mês)</p><div className="mt-2"><span className="block text-sm font-bold text-orange-500">R$ {(dashboardChartsData.totalPendingIncome || 0).toLocaleString('pt-BR')} <span className="text-[10px] font-normal text-gray-400">a receber</span></span><span className="block text-sm font-bold text-red-400">R$ {(dashboardChartsData.totalPendingExpense || 0).toLocaleString('pt-BR')} <span className="text-[10px] font-normal text-gray-400">a pagar</span></span></div></div>
                </div>
                <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100"><h3 className="font-bold text-gray-800 mb-6 flex items-center"><BarChart3 size={20} className="mr-2 text-mcsystem-500" /> Evolução do Fluxo de Caixa</h3><div className="h-80 w-full"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={dashboardChartsData.evolutionData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="month" axisLine={false} tickLine={false} /><YAxis yAxisId="left" orientation="left" stroke="#8884d8" /><YAxis yAxisId="right" orientation="right" stroke="#82ca9d" /><Tooltip formatter={(value: any) => `R$ ${(value || 0).toLocaleString('pt-BR')}`} /><Legend /><Bar yAxisId="left" dataKey="income" name="Receitas" fill="#10b981" barSize={20} radius={[4, 4, 0, 0]} /><Bar yAxisId="left" dataKey="expense" name="Despesas" fill="#ef4444" barSize={20} radius={[4, 4, 0, 0]} /><Line yAxisId="right" type="monotone" dataKey="accBalance" name="Saldo Acumulado" stroke="#3b82f6" strokeWidth={3} dot={{r: 4}} /></ComposedChart></ResponsiveContainer></div></div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100"><h3 className="font-bold text-gray-800 mb-4">Despesas por Categoria</h3><div className="h-64"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={dashboardChartsData.categoryData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">{dashboardChartsData.categoryData.map((entry, index) => (<Cell key={`cell-${index}`} fill={['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'][index % 6]} />))}</Pie><Tooltip formatter={(value: any) => `R$ ${(value || 0).toLocaleString('pt-BR')}`} /><Legend /></PieChart></ResponsiveContainer></div></div>
                    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100"><h3 className="font-bold text-gray-800 mb-4">Realizado vs Pendente</h3><div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={dashboardChartsData.statusData} layout="vertical"><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" /><YAxis dataKey="name" type="category" width={80} /><Tooltip formatter={(value: any) => `R$ ${(value || 0).toLocaleString('pt-BR')}`} /><Legend /><Bar dataKey="Pago" stackId="a" fill="#10b981" radius={[0, 4, 4, 0]} barSize={30} /><Bar dataKey="Pendente" stackId="a" fill="#f59e0b" radius={[0, 4, 4, 0]} barSize={30} /></BarChart></ResponsiveContainer></div></div>
                </div>
                <div className="bg-gradient-to-br from-mcsystem-900 to-blue-900 text-white p-6 rounded-lg shadow-lg relative overflow-hidden"><div className="absolute right-0 top-0 p-4 opacity-20"><Bot size={48} /></div><p className="text-blue-200 text-xs font-bold uppercase tracking-wide mb-2 flex items-center"><Bot size={14} className="mr-1" /> Análise IA</p><div className="h-20 overflow-y-auto text-sm text-blue-50 leading-relaxed scrollbar-hide">{loadingInsight ? (<span className="flex items-center"><span className="animate-spin mr-2">⏳</span> Analisando dados...</span>) : insight ? insight : (<button onClick={handleGenerateInsight} className="underline hover:text-white transition-colors text-left">Clique para gerar uma análise financeira inteligente baseada nos seus dados recentes.</button>)}</div></div>
            </div>
        )}

        {activeTab === 'RECONCILIATION' && renderUnifiedTransactions()}
        {activeTab === 'DRE' && renderHierarchicalReport('DRE')}
        {activeTab === 'CASHFLOW' && renderHierarchicalReport('CASHFLOW')}
        {activeTab === 'COA' && renderCOA()}
        {activeTab === 'VALIDATION' && renderTransactionTable(undefined, true)}
        {activeTab === 'CASH_EVOLUTION' && <CashEvolutionByBank records={records} banks={banks} />}

        {isDrillDownOpen && (<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[80] p-4 backdrop-blur-sm"><div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col animate-in zoom-in-95 duration-200"><div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex justify-between items-center rounded-t-xl"><h3 className="font-bold text-gray-800 flex items-center"><List size={18} className="mr-2 text-mcsystem-500" /> Detalhes: {drillDownTitle}</h3><button onClick={() => setIsDrillDownOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button></div><div className="flex-1 overflow-y-auto p-4 bg-gray-50/50">{renderTransactionTable(drillDownRecords)}</div></div></div>)}
        
        {editChoiceModal.isOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[110] p-4 backdrop-blur-sm">
                <div className="bg-white rounded-xl shadow-xl w-full max-w-sm animate-in zoom-in-95">
                    <div className="p-6 text-center">
                        <h3 className="font-bold text-lg text-gray-800">Editar Lançamento Parcelado</h3>
                        <p className="text-sm text-gray-500 mt-2">Esta transação faz parte de uma série. Como você deseja editá-la?</p>
                    </div>
                    <div className="p-6 bg-gray-50 space-y-3 rounded-b-xl">
                        <button onClick={handleEditSingleInstallment} className="w-full text-center p-4 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 font-semibold text-mcsystem-700">
                            Editar somente esta parcela
                        </button>
                        <button onClick={handleEditSeries} className="w-full text-center p-4 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 font-semibold text-mcsystem-700">
                            Editar a série inteira (recriar parcelas)
                        </button>
                        <button onClick={() => setEditChoiceModal({ isOpen: false, record: null })} className="w-full text-center mt-2 p-2 text-sm text-gray-500 hover:underline">
                            Cancelar
                        </button>
                    </div>
                </div>
            </div>
        )}
        
        {/* --- MODAIS PRINCIPAIS E AUXILIARES --- */}
        {isModalOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
                    {/* Header */}
                    <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 rounded-t-2xl">
                        <h3 className="font-bold text-lg text-gray-800 flex items-center">
                            <CreditCard size={20} className="mr-3 text-mcsystem-500"/>
                            {editingTransactionId ? 'Editar Lançamento' : 'Novo Lançamento'}
                        </h3>
                        <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-200 transition-colors"><X size={20}/></button>
                    </div>
                    
                    {/* Form */}
                    <form onSubmit={handleSaveTransaction} className="flex-1 flex flex-col overflow-hidden">
                        <div className="flex-1 p-6 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 overflow-y-auto">
                            {/* Left Column */}
                            <div className="space-y-6">
                                <div><label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Descrição</label><input required type="text" placeholder="Ex: Venda de Consultoria" value={newRecord.description} onChange={e => setNewRecord({...newRecord, description: e.target.value})} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-mcsystem-500 outline-none"/></div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div><label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Valor (R$)</label><input required type="number" step="0.01" placeholder="0,00" value={Math.abs(newRecord.amount || 0)} onChange={e => setNewRecord({...newRecord, amount: Number(e.target.value)})} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm"/></div>
                                    <div><label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Status</label><select value={newRecord.status} onChange={e => setNewRecord({...newRecord, status: e.target.value as any})} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-white"><option value={TransactionStatus.PENDING}>Pendente</option><option value={TransactionStatus.PAID}>Pago</option><option value={TransactionStatus.OVERDUE}>Atrasado</option></select></div>
                                </div>
                                <div className="flex items-center p-3 bg-amber-50 rounded-lg border border-amber-200">
                                    <input
                                        type="checkbox"
                                        id="refund-checkbox"
                                        checked={isRefund}
                                        onChange={e => setIsRefund(e.target.checked)}
                                        className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                                    />
                                    <label htmlFor="refund-checkbox" className="ml-3 block text-sm font-medium text-amber-800">
                                        ⚠️ Este é um estorno (inverter sinal)
                                    </label>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div><label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Vencimento</label><input required type="date" value={newRecord.dueDate} onChange={e => setNewRecord({...newRecord, dueDate: e.target.value})} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm"/></div>
                                    <div><label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Competência</label><input type="month" value={newRecord.competenceDate ? newRecord.competenceDate.slice(0, 7) : ''} onChange={e => setNewRecord({...newRecord, competenceDate: e.target.value ? `${e.target.value}-01` : ''})} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm"/></div>
                                </div>
                                <div><label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Cliente / Fornecedor (Opcional)</label><div className="flex gap-2 items-center"><SearchableSelect options={companies.map(c => ({ value: c.id, label: c.name }))} value={newRecord.companyId} onChange={val => setNewRecord({...newRecord, companyId: val})} placeholder="Vincular a um cliente..." /><button type="button" onClick={() => setIsNewCompanyModalOpen(true)} className="p-3 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 border border-gray-200" title="Novo Cliente"><Plus size={16}/></button></div></div>
                                <div><label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Conta / Banco</label><div className="flex gap-2 items-center"><SearchableSelect options={banks.map(b => ({ value: b.id, label: b.name }))} value={newRecord.bankId} onChange={val => setNewRecord({...newRecord, bankId: val})} placeholder="Selecionar conta..." /><button type="button" onClick={() => setIsNewBankModalOpen(true)} className="p-3 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 border border-gray-200" title="Nova Conta"><Plus size={16}/></button></div></div>
                            </div>
                            
                            {/* Right Column */}
                            <div className="space-y-6">
                                <div className="p-4 bg-gray-50/70 rounded-xl border border-gray-100">
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2.5">Categorização</label>
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2">
                                            <div className="p-1.5 rounded-md bg-white border"><Tag size={16} className="text-gray-400"/></div>
                                            <div className="flex-1"><SearchableSelect required options={chartOfAccounts.map(c => ({ value: c.id, label: `${c.rubricCode} - ${c.rubricName}`}))} value={newRecord.rubricId} onChange={val => setNewRecord({...newRecord, rubricId: val})} placeholder="Selecione a Rubrica (Plano de Contas)" /></div>
                                            <button type="button" onClick={() => setIsNewRubricModalOpen(true)} className="p-3 bg-white hover:bg-gray-100 rounded-lg border border-gray-200" title="Nova Rubrica"><Plus size={16}/></button>
                                        </div>
                                        {newRecord.type === TransactionType.INCOME && (
                                        <div className="flex items-center gap-2">
                                            <div className="p-1.5 rounded-md bg-white border"><List size={16} className="text-gray-400"/></div>
                                            <div className="flex-1"><SearchableSelect required options={revenueTypes.map(rt => ({ value: rt.id, label: rt.name }))} value={newRecord.revenueTypeId} onChange={val => setNewRecord({...newRecord, revenueTypeId: val})} placeholder="Selecione o Tipo de Receita" /></div>
                                            <button type="button" onClick={() => setIsNewRevenueTypeModalOpen(true)} className="p-3 bg-white hover:bg-gray-100 rounded-lg border border-gray-200" title="Novo Tipo de Receita"><Plus size={16}/></button>
                                        </div>
                                        )}
                                    </div>
                                </div>

                                {/* RESTORED SPLIT UI */}
                                {newRecord.type === TransactionType.INCOME && (
                                  <div className="p-4 bg-gray-50/70 rounded-xl border border-gray-100 space-y-3">
                                    <div className="flex items-center">
                                      <input
                                        type="checkbox"
                                        id="split-revenue-checkbox"
                                        checked={isSplittingRevenue}
                                        onChange={handleToggleSplit}
                                        className="h-4 w-4 rounded border-gray-300 text-mcsystem-600 focus:ring-mcsystem-500"
                                      />
                                      <label htmlFor="split-revenue-checkbox" className="ml-3 block text-sm font-medium text-gray-700">
                                        Dividir receita por tipo
                                      </label>
                                    </div>

                                    {isSplittingRevenue && (
                                      <div className="space-y-4 pt-2 animate-in fade-in duration-300">
                                        {newRecord.split_revenue?.map((split, index) => (
                                          <div key={index} className="flex items-center gap-2">
                                            <div className="flex-1">
                                              <SearchableSelect
                                                options={revenueTypes.map(rt => ({ value: rt.id, label: rt.name }))}
                                                value={split.revenue_type_id}
                                                onChange={val => handleSplitChange(index, 'revenue_type_id', val)}
                                                placeholder="Tipo de Receita"
                                              />
                                            </div>
                                            <div className="relative w-32">
                                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">R$</span>
                                              <input
                                                type="number"
                                                step="0.01"
                                                placeholder="0,00"
                                                value={split.amount}
                                                onChange={e => handleSplitChange(index, 'amount', e.target.value)}
                                                className="w-full pl-8 pr-2 py-2.5 border border-gray-200 rounded-lg text-sm text-right font-medium"
                                              />
                                            </div>
                                            <button
                                              type="button"
                                              onClick={() => removeSplit(index)}
                                              className="p-2.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                            >
                                              <Trash2 size={16} />
                                            </button>
                                          </div>
                                        ))}
                                        
                                        <button
                                          type="button"
                                          onClick={addSplit}
                                          className="w-full text-sm font-bold text-mcsystem-600 bg-mcsystem-50 border border-mcsystem-200 rounded-lg py-2 hover:bg-mcsystem-100 transition-colors flex items-center justify-center"
                                        >
                                          <Plus size={14} className="mr-2" /> Adicionar Divisão
                                        </button>

                                        <div className="pt-3 border-t border-gray-200 space-y-2 text-xs font-medium">
                                          <div className="flex justify-between">
                                            <span className="text-gray-500">Total do Lançamento:</span>
                                            <span className="text-gray-800 font-bold">R$ {(newRecord.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                          </div>
                                          <div className="flex justify-between">
                                            <span className="text-gray-500">Total Dividido:</span>
                                            <span className="text-gray-800 font-bold">R$ {(newRecord.split_revenue || []).reduce((sum, s) => sum + (Number(s.amount) || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                          </div>
                                          <div className={`flex justify-between p-2 rounded-md ${((newRecord.amount || 0) - (newRecord.split_revenue || []).reduce((sum, s) => sum + (Number(s.amount) || 0), 0)) !== 0 ? 'bg-red-50' : 'bg-green-50'}`}>
                                            <span className={`font-bold ${((newRecord.amount || 0) - (newRecord.split_revenue || []).reduce((sum, s) => sum + (Number(s.amount) || 0), 0)) !== 0 ? 'text-red-700' : 'text-green-700'}`}>Restante a dividir:</span>
                                            <span className={`font-black ${((newRecord.amount || 0) - (newRecord.split_revenue || []).reduce((sum, s) => sum + (Number(s.amount) || 0), 0)) !== 0 ? 'text-red-700' : 'text-green-700'}`}>R$ {((newRecord.amount || 0) - (newRecord.split_revenue || []).reduce((sum, s) => sum + (Number(s.amount) || 0), 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                                
                                <div className="p-4 bg-gray-50/70 rounded-xl border border-gray-100">
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2.5">Parcelamento / Recorrência</label>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div><label className="text-xs font-medium">Nº de Parcelas</label><input type="number" disabled={!!editingTransactionId} min="1" value={installmentCount} onChange={e => setInstallmentCount(Number(e.target.value))} className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"/></div>
                                        <div><label className="text-xs font-medium">Competência</label><select disabled={!!editingTransactionId} value={competenceType} onChange={e => setCompetenceType(e.target.value as any)} className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"><option value="FIXED">Fixa</option><option value="RECURRING">Recorrente</option></select></div>
                                        <div className="col-span-2"><label className="text-xs font-medium">Distribuição do Valor</label><select disabled={!!editingTransactionId} value={amountDistribution} onChange={e => setAmountDistribution(e.target.value as any)} className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"><option value="TOTAL">Dividir valor total nas parcelas</option><option value="RECURRING">Repetir valor em cada parcela</option></select></div>
                                    </div>
                                </div>
                                {installmentsPreview.length > 1 && !editingTransactionId && (
                                    <div className="p-4 bg-blue-50/30 rounded-xl border border-blue-100 text-xs">
                                        <h4 className="font-bold text-blue-800 mb-2">Prévia das Parcelas (Editável)</h4>
                                        {/* Headers */}
                                        <div className="grid grid-cols-12 gap-2 text-[10px] font-bold text-gray-500 px-1 pb-1 mb-1 border-b border-blue-100">
                                            <div className="col-span-1">#</div>
                                            <div className="col-span-4">Vencimento</div>
                                            <div className="col-span-3">Competência</div>
                                            <div className="col-span-4 text-right">Valor</div>
                                        </div>
                                        <div className="max-h-36 overflow-y-auto space-y-2 pr-2">
                                            {installmentsPreview.map((inst, i) => (
                                                <div key={i} className="grid grid-cols-12 gap-2 items-center text-xs">
                                                    <span className="col-span-1 text-center font-mono text-gray-500">{i + 1})</span>
                                                    <div className="col-span-4">
                                                        <input 
                                                            type="date"
                                                            value={inst.dueDate}
                                                            onChange={e => handleUpdateInstallmentPreview(i, 'dueDate', e.target.value)}
                                                            className="w-full border border-gray-200 rounded px-1.5 py-1 text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                                                        />
                                                    </div>
                                                    <div className="col-span-3">
                                                        <input 
                                                            type="month"
                                                            value={inst.competenceDate ? inst.competenceDate.slice(0, 7) : ''}
                                                            onChange={e => handleUpdateInstallmentPreview(i, 'competenceDate', e.target.value)}
                                                            className="w-full border border-gray-200 rounded px-1.5 py-1 text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                                                        />
                                                    </div>
                                                    <div className="col-span-4 relative">
                                                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">R$</span>
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            value={inst.amount}
                                                            onChange={e => handleUpdateInstallmentPreview(i, 'amount', e.target.value)}
                                                            className="w-full border border-gray-200 rounded pl-7 pr-1.5 py-1 text-xs text-right font-bold focus:ring-1 focus:ring-blue-500 outline-none"
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-6 border-t border-gray-100 flex justify-end gap-3 bg-gray-50/50 rounded-b-2xl">
                            <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2.5 text-gray-600 hover:bg-gray-200 rounded-lg text-sm font-bold">Cancelar</button>
                            <button type="submit" className="px-6 py-2.5 bg-mcsystem-900 text-white rounded-lg hover:bg-mcsystem-800 font-bold flex items-center shadow-lg transition-all transform hover:scale-105"><Save size={18} className="mr-2"/> Salvar Lançamento</button>
                        </div>
                    </form>
                </div>
            </div>
        )}

        {isNewRevenueTypeModalOpen && (<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[110]"><div className="bg-white rounded-xl shadow-lg w-full max-w-sm p-6"><h3 className="font-bold mb-4">Novo Tipo de Receita</h3><form onSubmit={handleSaveNewRevenueType}><input autoFocus value={newRevenueTypeName} onChange={e => setNewRevenueTypeName(e.target.value)} className="w-full border p-2 rounded mb-4" placeholder="Ex: Venda de Produto"/><div className="flex justify-end gap-2"><button type="button" onClick={() => setIsNewRevenueTypeModalOpen(false)}>Cancelar</button><button type="submit" className="bg-mcsystem-500 text-white px-4 py-2 rounded">Salvar</button></div></form></div></div>)}
        {isNewBankModalOpen && (<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[110]"><div className="bg-white rounded-xl shadow-lg w-full max-w-sm p-6"><h3 className="font-bold mb-4">Nova Conta Bancária</h3><form onSubmit={handleSaveNewBank} className="space-y-3"><input autoFocus value={newBankData.name} onChange={e => setNewBankData({...newBankData, name: e.target.value})} className="w-full border p-2 rounded" placeholder="Nome do Banco"/><div className="grid grid-cols-2 gap-2"><input value={newBankData.agency} onChange={e => setNewBankData({...newBankData, agency: e.target.value})} className="w-full border p-2 rounded" placeholder="Agência"/><input value={newBankData.account} onChange={e => setNewBankData({...newBankData, account: e.target.value})} className="w-full border p-2 rounded" placeholder="Conta"/></div><div className="flex justify-end gap-2 pt-2"><button type="button" onClick={() => setIsNewBankModalOpen(false)}>Cancelar</button><button type="submit" className="bg-mcsystem-500 text-white px-4 py-2 rounded">Salvar</button></div></form></div></div>)}
        {isNewCompanyModalOpen && (<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[110]"><div className="bg-white rounded-xl shadow-lg w-full max-w-sm p-6"><h3 className="font-bold mb-4">Novo Cliente/Fornecedor</h3><form onSubmit={handleSaveNewCompany} className="space-y-3"><input autoFocus value={newCompanyData.name} onChange={e => setNewCompanyData({...newCompanyData, name: e.target.value})} className="w-full border p-2 rounded" placeholder="Nome da Empresa"/><div className="flex justify-end gap-2 pt-2"><button type="button" onClick={() => setIsNewCompanyModalOpen(false)}>Cancelar</button><button type="submit" className="bg-mcsystem-500 text-white px-4 py-2 rounded">Salvar</button></div></form></div></div>)}
        {isNewRubricModalOpen && (<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[110]"><div className="bg-white rounded-xl shadow-lg w-full max-w-sm p-6"><h3 className="font-bold mb-4">Nova Rubrica (Plano de Contas)</h3><form onSubmit={handleSaveNewRubric} className="space-y-3"><select value={newRubricData.centerCode} onChange={e => setNewRubricData({...newRubricData, centerCode: e.target.value})} className="w-full border p-2 rounded bg-white"><option value="">Selecione o Grupo</option>{uniqueCenters.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}</select><input autoFocus value={newRubricData.rubricName} onChange={e => setNewRubricData({...newRubricData, rubricName: e.target.value})} className="w-full border p-2 rounded" placeholder="Nome da Rubrica"/><div className="flex justify-end gap-2 pt-2"><button type="button" onClick={() => setIsNewRubricModalOpen(false)}>Cancelar</button><button type="submit" className="bg-mcsystem-500 text-white px-4 py-2 rounded">Salvar</button></div></form></div></div>)}

        {isCOAModalOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[110] p-4 backdrop-blur-sm">
                <div className="bg-white rounded-xl shadow-xl w-full max-w-md animate-in zoom-in-95">
                    <div className="p-4 border-b flex justify-between items-center">
                        <h3 className="font-bold">Novo Item no Plano de Contas</h3>
                        <button onClick={() => { setIsCOAModalOpen(false); setCoaFormData({}); }}><X size={20}/></button>
                    </div>
                    <form onSubmit={handleSaveCOA} className="p-6 space-y-4">
                        <div className="flex bg-gray-100 p-1 rounded-lg">
                            <button type="button" onClick={() => { setCoaFormType('classification'); setCoaFormData({}); }} className={`flex-1 py-1 text-xs font-bold rounded ${coaFormType === 'classification' ? 'bg-white shadow' : ''}`}>Classificação</button>
                            <button type="button" onClick={() => { setCoaFormType('group'); setCoaFormData({}); }} className={`flex-1 py-1 text-xs font-bold rounded ${coaFormType === 'group' ? 'bg-white shadow' : ''}`}>Grupo</button>
                            <button type="button" onClick={() => { setCoaFormType('rubric'); setCoaFormData({}); setSelectedClassificationForCascading(''); }} className={`flex-1 py-1 text-xs font-bold rounded ${coaFormType === 'rubric' ? 'bg-white shadow' : ''}`}>Rubrica</button>
                        </div>
                        
                        {coaFormType === 'classification' && (
                            <div className="space-y-4 animate-in fade-in">
                                <div>
                                    <label className="text-sm font-medium text-gray-700">Nome da Nova Classificação</label>
                                    <input required value={coaFormData.classificationName || ''} onChange={e => setCoaFormData({ ...coaFormData, classificationName: e.target.value })} placeholder="Ex: INVESTIMENTOS" className="w-full border p-2 rounded mt-1"/>
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-700">Nome do Primeiro Grupo <span className="text-gray-400 font-normal">(Opcional)</span></label>
                                    <input value={coaFormData.groupName || ''} onChange={e => setCoaFormData({ ...coaFormData, groupName: e.target.value })} placeholder="Padrão: GERAL" className="w-full border p-2 rounded mt-1"/>
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-700">Nome da Primeira Rubrica <span className="text-gray-400 font-normal">(Opcional)</span></label>
                                    <input value={coaFormData.rubricName || ''} onChange={e => setCoaFormData({ ...coaFormData, rubricName: e.target.value })} placeholder="Padrão: OUTRAS DE..." className="w-full border p-2 rounded mt-1"/>
                                </div>
                            </div>
                        )}
                        {coaFormType === 'group' && (
                            <div className="space-y-4 animate-in fade-in">
                                <div>
                                    <label className="text-sm font-medium text-gray-700">Vincular à Classificação</label>
                                    <select required value={coaFormData.classificationCode || ''} onChange={e => setCoaFormData({ ...coaFormData, classificationCode: e.target.value })} className="w-full border p-2 rounded bg-white mt-1">
                                        <option value="">Selecione a Classificação-Mãe</option>
                                        {uniqueClassifications.map(c => <option key={c.code} value={c.code}>{c.code} - {c.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-700">Nome do Novo Grupo</label>
                                    <input required value={coaFormData.groupName || ''} onChange={e => setCoaFormData({ ...coaFormData, groupName: e.target.value })} placeholder="Ex: MARKETING" className="w-full border p-2 rounded mt-1"/>
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-700">Nome da Primeira Rubrica <span className="text-gray-400 font-normal">(Opcional)</span></label>
                                    <input value={coaFormData.rubricName || ''} onChange={e => setCoaFormData({ ...coaFormData, rubricName: e.target.value })} placeholder="Padrão: OUTRAS DE..." className="w-full border p-2 rounded mt-1"/>
                                </div>
                            </div>
                        )}
                        {coaFormType === 'rubric' && (
                            <div className="space-y-4 animate-in fade-in">
                                <div>
                                    <label className="text-sm font-medium text-gray-700">Classificação</label>
                                    <select required value={selectedClassificationForCascading} onChange={e => { setSelectedClassificationForCascading(e.target.value); setCoaFormData({ ...coaFormData, centerCode: '' }); }} className="w-full border p-2 rounded bg-white mt-1">
                                        <option value="">Selecione a Classificação</option>
                                        {uniqueClassifications.map(c => <option key={c.code} value={c.code}>{c.code} - {c.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-700">Grupo</label>
                                    <select required value={coaFormData.centerCode || ''} onChange={e => setCoaFormData({ ...coaFormData, centerCode: e.target.value })} className="w-full border p-2 rounded bg-white mt-1" disabled={!selectedClassificationForCascading}>
                                        <option value="">Selecione o Grupo</option>
                                        {uniqueCenters.filter(c => c.classificationCode === selectedClassificationForCascading).map(c => <option key={c.code} value={c.code}>{c.code} - {c.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-700">Nome da Nova Rubrica</label>
                                    <input required value={coaFormData.rubricName || ''} onChange={e => setCoaFormData({ ...coaFormData, rubricName: e.target.value })} placeholder="Ex: ANÚNCIOS ONLINE" className="w-full border p-2 rounded mt-1"/>
                                </div>
                            </div>
                        )}
                        
                        <div className="flex justify-end gap-2 pt-2">
                            <button type="button" onClick={() => setIsCOAModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Cancelar</button>
                            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded font-bold">Salvar Item</button>
                        </div>
                    </form>
                </div>
            </div>
        )}
    </div>
  );
};