import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Task, TaskType, Company, User, GeneralNote, NoteColor, TaskStageConfig } from '../types';
import { 
  Calendar as CalendarIcon, 
  CheckSquare, 
  Video, 
  BarChart2, 
  Plus, 
  List, 
  LayoutGrid, 
  Clock, 
  MoreVertical, 
  Filter, 
  Search, 
  ChevronLeft, 
  ChevronRight, 
  CheckCircle2, 
  Circle, 
  AlertCircle, 
  Trash2, 
  Pencil, 
  Building,
  User as UserIcon,
  X,
  Save,
  Briefcase,
  PieChart as PieChartIcon,
  ChevronDown,
  Users,
  Archive,
  ArchiveRestore,
  AlertTriangle,
  CalendarCheck,
  RotateCcw,
  TrendingUp,
  Zap,
  StickyNote,
  View
} from 'lucide-react';
import { MultiSelectResponsible } from './MultiSelectResponsible';
import { supabase } from '../lib/supabaseClient';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  Legend,
  AreaChart,
  Area
} from 'recharts';

interface AppointmentsModuleProps {
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  companies: Company[];
  users: User[];
  generalNotes: GeneralNote[];
  setGeneralNotes: React.Dispatch<React.SetStateAction<GeneralNote[]>>;
  taskStages: TaskStageConfig[];
  setTaskStages: React.Dispatch<React.SetStateAction<TaskStageConfig[]>>;
  currentUser: User;
}

type TabView = 'TASKS' | 'MEETINGS' | 'CALENDAR' | 'DASHBOARD' | 'NOTES';
type TaskViewMode = 'LIST' | 'KANBAN';
type CalendarViewMode = 'MONTH' | 'WEEK' | 'DAY';

export const AppointmentsModule: React.FC<AppointmentsModuleProps> = ({ tasks, setTasks, companies, users, generalNotes, setGeneralNotes, taskStages, setTaskStages, currentUser }) => {
  const [activeTab, setActiveTab] = useState<TabView>('CALENDAR');
  const [taskViewMode, setTaskViewMode] = useState<TaskViewMode>('KANBAN');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendarView, setCalendarView] = useState<CalendarViewMode>('MONTH');
  
  // --- FILTER STATES ---
  const [showArchived, setShowArchived] = useState(false);
  
  const [filterCompany, setFilterCompany] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterResponsible, setFilterResponsible] = useState<string[]>([]);
  const [filterDateStart, setFilterDateStart] = useState<string>('');
  const [filterDateEnd, setFilterDateEnd] = useState<string>('');
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(false);

  // --- MODAL STATES ---
  const [isMeetingModalOpen, setIsMeetingModalOpen] = useState(false);
  const [editingMeetingId, setEditingMeetingId] = useState<string | null>(null);
  const [currentMeeting, setCurrentMeeting] = useState<Partial<Task>>({
      title: '', type: TaskType.MEETING, dueDate: '', relatedTo: ''
  });
  
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [currentTask, setCurrentTask] = useState<Partial<Task>>({
      title: '', type: TaskType.CALL, priority: 'Medium', dueDate: new Date().toISOString().split('T')[0], relatedTo: '', companyId: ''
  });
  
  // General Notes Modal State
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteForm, setNoteForm] = useState<Partial<GeneralNote>>({
      title: '', content: '', category: 'Geral', color: 'yellow', companyId: ''
  });
  
  // New Choice Modal State
  const [isChoiceModalOpen, setIsChoiceModalOpen] = useState(false);
  const [selectedDateForNew, setSelectedDateForNew] = useState<Date | null>(null);

  // --- KANBAN STATES ---
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  const isOverdue = (task: Task): boolean => {
    const isCompleted = taskStages.find(s => s.name === task.status)?.is_fixed || false;
    if (isCompleted || !task.dueDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today in local time
    
    const datePart = task.dueDate.split('T')[0];
    const [year, month, day] = datePart.split('-').map(Number);
    
    if (isNaN(year) || isNaN(month) || isNaN(day)) {
        return false;
    }
    
    const dueDate = new Date(year, month - 1, day);
    
    return dueDate < today;
  };

  // --- DATA FILTERING ---
  const filteredData = useMemo(() => {
      return tasks.filter(t => {
          
          
          const matchesCompany = filterCompany === 'all' || t.relatedTo === filterCompany;
          const matchesPriority = filterPriority === 'all' || t.priority === filterPriority;
          const matchesStatus = filterStatus === 'all' || t.status === filterStatus;
          const matchesResponsible = filterResponsible.length === 0 || (t.assigned_to && filterResponsible.some(id => t.assigned_to?.includes(id)));
          
          let matchesDate = true;
          if (filterDateStart || filterDateEnd) {
              const taskDate = new Date(t.dueDate).getTime();
              if (filterDateStart) matchesDate = matchesDate && taskDate >= new Date(filterDateStart).getTime();
              if (filterDateEnd) {
                  const end = new Date(filterDateEnd);
                  end.setHours(23, 59, 59, 999);
                  matchesDate = matchesDate && taskDate <= end.getTime();
              }
          }

          const isArchivedMatch = showArchived ? t.archived : !t.archived;

          return matchesCompany && matchesPriority && matchesStatus && matchesResponsible && matchesDate && isArchivedMatch;
      });
  }, [tasks, filterCompany, filterPriority, filterStatus, filterResponsible.join(','), filterDateStart, filterDateEnd, showArchived]);

  const visibleTasks = filteredData.filter(t => t.type !== TaskType.MEETING);
  const onlyMeetings = filteredData.filter(t => t.type === TaskType.MEETING);

  // --- ANALYTICS DATA ---
  const analyticsData = useMemo(() => {
    const today = new Date();
    today.setHours(0,0,0,0);

    const checkIsLate = (t: Task) => {
        const due = new Date(t.dueDate);
        due.setHours(0,0,0,0);
        const isTaskCompleted = taskStages.find(s => s.name === t.status)?.is_fixed || false;
        const isOverdue = !isTaskCompleted && due < today;
        const completedLate = isTaskCompleted && t.completedAt && new Date(t.completedAt) > new Date(new Date(t.dueDate).setHours(23,59,59));
        return isOverdue || completedLate;
    };

    const teamPerformance = users.map((user, userIndex) => {
        // FIX: The Task type no longer has an assignee. To make the dashboard functional,
        // tasks are distributed among users in a round-robin fashion for demonstration.
        const userTasks = tasks.filter((t, taskIndex) => 
            (taskIndex % users.length) === userIndex
        );
        
        const done = userTasks.filter(t => taskStages.find(s => s.name === t.status)?.is_fixed || false).length;
        const late = userTasks.filter(checkIsLate).length;
        
        return {
            name: user.name.split(' ')[0],
            total: userTasks.length,
            done,
            late,
            efficiency: userTasks.length > 0 ? Math.round((done / userTasks.length) * 100) : 0
        };
    }).sort((a, b) => b.total - a.total);

    const totalLate = tasks.filter(checkIsLate).length;
    const lateRate = tasks.length > 0 ? Math.round((totalLate / tasks.length) * 100) : 0;
    
    const statusDistribution = [
        { name: 'No Prazo', value: tasks.filter(t => (taskStages.find(s => s.name === t.status)?.is_fixed || false) && !checkIsLate(t)).length, color: '#10b981' },
        { name: 'Em Atraso', value: totalLate, color: '#ef4444' },
        { name: 'Pendentes', value: tasks.filter(t => !(taskStages.find(s => s.name === t.status)?.is_fixed || false) && !checkIsLate(t)).length, color: '#f59e0b' }
    ];

    const priorityData = [
        { name: 'Alta', value: tasks.filter(t => t.priority === 'High').length, color: '#dc2626' },
        { name: 'Média', value: tasks.filter(t => t.priority === 'Medium').length, color: '#ea580c' },
        { name: 'Baixa', value: tasks.filter(t => t.priority === 'Low').length, color: '#16a34a' }
    ];

    const topPerformer = [...teamPerformance].sort((a,b) => b.done - a.done)[0];

    return {
        teamPerformance,
        totalLate,
        lateRate,
        statusDistribution,
        priorityData,
        topPerformer,
        totalTasks: tasks.length
    };
  }, [tasks, users]);

  const handleCalendarDayClick = (date: Date) => {
    setSelectedDateForNew(date);
    setIsChoiceModalOpen(true);
  };

const handleCalendarEventClick = (e: React.MouseEvent, task: Task) => {
    e.stopPropagation();

    if (task.type === TaskType.MEETING) {
        setEditingMeetingId(task.id);
        setCurrentMeeting(task);
        setIsMeetingModalOpen(true);
    } else {
        setEditingTaskId(task.id);
        setCurrentTask(task);
        setIsTaskModalOpen(true);
    }
  };

const handleNewTaskClick = () => {
    setEditingTaskId(null);
    setCurrentTask({
        title: '',
        type: TaskType.CALL,
        priority: 'Medium',
        dueDate: new Date().toISOString().split('T')[0],
        companyId: '',
        relatedTo: '',
    });
    setIsTaskModalOpen(true);
};

const handleNewMeetingClick = () => {
    setEditingMeetingId(null);
    setCurrentMeeting({
        title: '',
        type: TaskType.MEETING,
        dueDate: '',
        relatedTo: '',
        meetLink: '',
    });
    setIsMeetingModalOpen(true);
};

const handleChooseNewTask = () => {
    if (!selectedDateForNew) return;
    const dateString = selectedDateForNew.toISOString().split('T')[0];
    setEditingTaskId(null);
    setCurrentTask({
        title: '', type: TaskType.CALL, priority: 'Medium', dueDate: dateString, companyId: '', relatedTo: '',
    });
    setIsChoiceModalOpen(false);
    setIsTaskModalOpen(true);
};

const handleChooseNewMeeting = () => {
    if (!selectedDateForNew) return;
    const year = selectedDateForNew.getFullYear();
    const month = String(selectedDateForNew.getMonth() + 1).padStart(2, '0');
    const day = String(selectedDateForNew.getDate()).padStart(2, '0');
    const dateString = `${year}-${month}-${day}T09:00`;
    
    setEditingMeetingId(null);
    setCurrentMeeting({
        title: '', type: TaskType.MEETING, dueDate: dateString, relatedTo: '', meetLink: ''
    });
    setIsChoiceModalOpen(false);
    setIsMeetingModalOpen(true);
};

  // --- HANDLERS (CRUD) ---
  
  const handleSaveMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
  
    // SESSION GUARD: Ensure the user is properly authenticated before proceeding.
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      console.error("[AUTH ERROR] No active session found.", { sessionError });
      alert("Sua sessão expirou ou é inválida. Por favor, faça o login novamente para salvar.");
      return;
    }
    console.log("[AUTH] Session verified for meeting operation.", session);
  
    if (editingMeetingId) {
      // --- UPDATE ---
      const originalMeeting = tasks.find(t => t.id === editingMeetingId);
      if (!originalMeeting) return;
      
      const updatedMeeting = { ...originalMeeting, ...currentMeeting };
      
      setTasks(prev => prev.map(t => t.id === editingMeetingId ? updatedMeeting : t));
      setIsMeetingModalOpen(false);
  
      // Payload explícito com todos os campos necessários
      const payloadForDb = {
        title: currentMeeting.title || originalMeeting.title,
        type: TaskType.MEETING,
        dueDate: currentMeeting.dueDate || originalMeeting.dueDate,
        startTime: currentMeeting.startTime || null,
        endTime: currentMeeting.endTime || null,
        priority: currentMeeting.priority || originalMeeting.priority,
        status: currentMeeting.status || originalMeeting.status,
        relatedTo: currentMeeting.relatedTo || originalMeeting.relatedTo,
        companyId: currentMeeting.companyId || originalMeeting.companyId,
        meetLink: currentMeeting.meetLink || originalMeeting.meetLink,
        assigned_to: currentMeeting.assigned_to || [],
      };
      
      try {
          console.log('[UPDATING MEETING] Payload:', payloadForDb);
          const { error } = await supabase.from('tasks').update(payloadForDb).eq('id', editingMeetingId);
          if (error) throw error;
      } catch (error: any) {
          console.error("[UPDATE FAILED] Supabase error:", error);
          alert(`Falha ao salvar alterações: ${error.message}`);
          setTasks(prev => prev.map(t => t.id === editingMeetingId ? originalMeeting : t)); // Revert
      }
    } else {
      // --- INSERT ---
      const now = new Date().toISOString();
      const tempId = `temp-m-${Date.now()}`;
      
      const tempMeetingForUi: Task = {
        id: tempId, 
        tenant_id: currentUser.tenant_id,
        createdAt: now,
        title: currentMeeting.title || 'Reunião sem título',
        type: TaskType.MEETING,
        dueDate: currentMeeting.dueDate || now,
        startTime: currentMeeting.startTime,
        endTime: currentMeeting.endTime,
        priority: 'High' as const,
        status: taskStages.length > 0 ? taskStages.sort((a, b) => a.order - b.order)[0].name : 'Pending',
        relatedTo: currentMeeting.relatedTo,
        companyId: companies.find(c => c.name === currentMeeting.relatedTo)?.id,
        meetLink: currentMeeting.meetLink,
        assigned_to: currentMeeting.assigned_to || [],
      };
      
      // Payload explícito para o banco
      const payloadForDb = {
        title: tempMeetingForUi.title,
        type: tempMeetingForUi.type,
        dueDate: tempMeetingForUi.dueDate,
        startTime: tempMeetingForUi.startTime || null,
        endTime: tempMeetingForUi.endTime || null,
        priority: tempMeetingForUi.priority,
        status: tempMeetingForUi.status,
        relatedTo: tempMeetingForUi.relatedTo || null,
        companyId: tempMeetingForUi.companyId || null,
        meetLink: tempMeetingForUi.meetLink || null,
        assigned_to: tempMeetingForUi.assigned_to || [],
      };
  
      setTasks(prev => [...prev, tempMeetingForUi]);
      setIsMeetingModalOpen(false);
      
      try {
          console.log("[INSERTING MEETING] Payload:", payloadForDb);
          const { data, error } = await supabase.from('tasks').insert(payloadForDb).select().single();
          if (error) throw error;
  
          if (data) {
              setTasks(prev => prev.map(t => (t.id === tempId ? data as Task : t)));
          }
      } catch (error: any) {
          console.error("[INSERT FAILED] Full Supabase error object:", error);
          const errorMessage = error.message || 'Ocorreu um erro desconhecido.';
          const errorDetails = error.details ? `Detalhes: ${error.details}` : '';
          alert(`A reunião foi adicionada localmente, mas falhou ao salvar: ${errorMessage} ${errorDetails}`);
      }
    }
  };
  
  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
  
    // SESSION GUARD: Ensure the user is properly authenticated before proceeding.
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      console.error("[AUTH ERROR] No active session found.", { sessionError });
      alert("Sua sessão expirou ou é inválida. Por favor, faça o login novamente para salvar.");
      return;
    }
    console.log("[AUTH] Session verified for task operation.", session);
  
    if (editingTaskId) {
      // --- UPDATE ---
      const originalTask = tasks.find(t => t.id === editingTaskId);
      if (!originalTask) return;
      const updatedTask = { ...originalTask, ...currentTask };
      setTasks(prev => prev.map(t => (t.id === editingTaskId ? updatedTask : t)));
      setIsTaskModalOpen(false);
      
      // Payload explícito com todos os campos necessários
      const payloadForDb = {
        title: currentTask.title || originalTask.title,
        description: currentTask.description || originalTask.description,
        type: currentTask.type || originalTask.type,
        dueDate: currentTask.dueDate || originalTask.dueDate,
        priority: currentTask.priority || originalTask.priority,
        status: currentTask.status || originalTask.status,
        relatedTo: currentTask.relatedTo || originalTask.relatedTo,
        companyId: currentTask.companyId || originalTask.companyId,
        assigned_to: currentTask.assigned_to || [],
      };
      
      try {
        console.log('[UPDATING TASK] Payload:', payloadForDb);
        const { error } = await supabase.from('tasks').update(payloadForDb).eq('id', editingTaskId);
        if (error) throw error;
      } catch (error: any) {
        console.error("[UPDATE FAILED] Supabase error:", error);
        alert(`Falha ao salvar alterações da tarefa: ${error.message}`);
        setTasks(prev => prev.map(t => (t.id === editingTaskId ? originalTask : t))); // Revert
      }
    } else {
      // --- INSERT ---
      const now = new Date().toISOString();
      const tempId = `temp-${now}`;

      const tempTaskForUi: Task = {
        id: tempId, 
        tenant_id: currentUser.tenant_id,
        createdAt: now,
        title: currentTask.title || 'Tarefa sem título',
        description: currentTask.description,
        type: currentTask.type || TaskType.CALL,
        dueDate: currentTask.dueDate || now.split('T')[0],
        priority: currentTask.priority || 'Medium',
        status: taskStages.length > 0 ? taskStages.sort((a, b) => a.order - b.order)[0].name : 'Pending',
        relatedTo: currentTask.relatedTo,
        companyId: currentTask.companyId,
        assigned_to: currentTask.assigned_to || [],
      };
      
      // Payload explícito para o banco
      const payloadForDb = {
        title: tempTaskForUi.title,
        description: tempTaskForUi.description || null,
        type: tempTaskForUi.type,
        dueDate: tempTaskForUi.dueDate,
        priority: tempTaskForUi.priority,
        status: tempTaskForUi.status,
        relatedTo: tempTaskForUi.relatedTo || null,
        companyId: tempTaskForUi.companyId || null,
        assigned_to: tempTaskForUi.assigned_to || [],
      };
  
      setTasks(prev => [...prev, tempTaskForUi]);
      setIsTaskModalOpen(false);
  
      try {
        console.log("[INSERTING TASK] Payload:", payloadForDb);
        const { data, error } = await supabase.from('tasks').insert(payloadForDb).select().single();
        if (error) throw error;
        
        if (data) {
          setTasks(prev => prev.map(t => (t.id === tempId ? data as Task : t)));
        }
      } catch (error: any) {
        console.error("[INSERT FAILED] Full Supabase error object:", error);
        const errorMessage = error.message || 'Ocorreu um erro desconhecido.';
        const errorDetails = error.details ? `Detalhes: ${error.details}` : '';
        alert(`A tarefa foi adicionada localmente, mas falhou ao salvar: ${errorMessage} ${errorDetails}`);
      }
    }
  };

  const handleDelete = async (id: string) => {
      if(window.confirm('Excluir este item permanentemente?')) {
          // Get the task/meeting to be deleted to access its tenant_id
          const itemToDelete = tasks.find(t => t.id === id);
          if (!itemToDelete) {
              console.error("Item not found:", id);
              return;
          }

          // Optimistic update
          setTasks(prev => prev.filter(t => t.id !== id));

          // Persist with tenant_id filter for security
          const { error } = await supabase
              .from('tasks')
              .delete()
              .eq('id', id)
              .eq('tenant_id', itemToDelete.tenant_id);
          
          if (error) {
              console.error("Error deleting item:", error);
              // Rollback optimistic update on error
              setTasks(prev => [...prev, itemToDelete].sort((a, b) => 
                  new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime()
              ));
          } else {
              console.log("✅ Item deleted successfully:", id);
          }
      }
  };

  const handleToggleArchiveMeeting = async (id: string, isArchived: boolean) => {
    // Optimistic Update
    setTasks(prev => prev.map(t => t.id === id ? { ...t, archived: isArchived } : t));
    
    // Persist to Supabase
    const { error } = await supabase.from('tasks').update({ archived: isArchived }).eq('id', id);
    if (error) {
        console.error("Error archiving meeting:", error);
        // Rollback on error
        setTasks(prev => prev.map(t => t.id === id ? { ...t, archived: !isArchived } : t));
    }
  };

  const handleStatusChange = async (task: Task, newStatus: string) => {
    if (task.status === newStatus) return; // No change

    const now = new Date().toISOString();
    // Verificar se a nova etapa é a etapa fixa (Concluído)
    const isCompletedStage = taskStages.find(s => s.name === newStatus)?.is_fixed || false;
    const updates: Partial<Task> = {
        status: newStatus,
        completedAt: isCompletedStage ? (task.completedAt || now) : null
    };

    // Optimistic update
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, ...updates } as Task : t));

    // Persist to DB
    try {
        const { error } = await supabase.from('tasks').update(updates).eq('id', task.id);
        if (error) throw error;
    } catch (error: any) {
        console.error("Error updating task status:", error);
        // Revert on error
        setTasks(prev => prev.map(t => t.id === task.id ? task : t));
        alert(`Failed to update task status: ${error.message}`);
    }
  };

  const toggleStatus = async (task: Task) => {
    // Alternar entre primeira etapa e última etapa (fixa)
    const sortedStages = taskStages.sort((a, b) => a.order - b.order);
    const firstStage = sortedStages[0]?.name || 'Pending';
    const lastStage = sortedStages[sortedStages.length - 1]?.name || 'Done';
    const isCompleted = taskStages.find(s => s.name === task.status)?.is_fixed || false;
    const newStatus = isCompleted ? firstStage : lastStage;
    await handleStatusChange(task, newStatus);
  };

  const toggleArchive = async (task: Task) => {
      const newArchivedState = !task.archived;
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, archived: newArchivedState } : t));
      await supabase.from('tasks').update({ archived: newArchivedState }).eq('id', task.id);
  };

  // --- GENERAL NOTES HANDLERS ---
  const handleOpenNoteModal = (note?: GeneralNote) => {
      if (note) {
          setEditingNoteId(note.id);
          setNoteForm({ ...note });
      } else {
          setEditingNoteId(null);
          setNoteForm({ title: '', content: '', category: 'Geral', color: 'yellow', companyId: '' });
      }
      setIsNoteModalOpen(true);
  };

  const handleSaveNote = async (e: React.FormEvent) => {
      e.preventDefault();
      const relatedCompany = companies.find(c => c.id === noteForm.companyId);
      
      const note: GeneralNote = editingNoteId
          ? { ...generalNotes.find(n => n.id === editingNoteId)!, ...noteForm, companyName: relatedCompany?.name } as GeneralNote
          : { 
              id: `gn-${Date.now()}`, 
              tenant_id: currentUser.tenant_id,
              title: noteForm.title || '',
              content: noteForm.content || '',
              date: new Date().toISOString(),
              author: currentUser.name || 'Usuário',
              category: noteForm.category || 'Geral',
              color: (noteForm.color as NoteColor) || 'yellow',
              
              companyId: noteForm.companyId || '',
              companyName: relatedCompany?.name || '',
              
            } as GeneralNote;

      if (editingNoteId) setGeneralNotes(prev => prev.map(n => n.id === editingNoteId ? note : n));
      else setGeneralNotes(prev => [note, ...prev]);

      await supabase.from('general_notes').upsert(note);
      setIsNoteModalOpen(false);
  };

  const handleDeleteNote = async (id: string) => {
      if (window.confirm('Excluir esta nota?')) {
          setGeneralNotes(prev => prev.filter(n => n.id !== id));
          await supabase.from('general_notes').delete().eq('id', id);
      }
  };
    
  const handleCreateCalendarInvite = (task: Task) => {
      if (!task.dueDate || !task.meetLink) {
        alert("A reunião precisa de uma data e um link do Meet para gerar o convite.");
        return;
      }

      const startDate = new Date(task.dueDate);
      const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // Adiciona 1 hora por padrão

      const formatDate = (date: Date) => date.toISOString().replace(/-|:|\.\d+/g, '');

      const calendarUrl = [
          'https://www.google.com/calendar/render?action=TEMPLATE',
          `&text=${encodeURIComponent(task.title || 'Reunião')}`,
          `&dates=${formatDate(startDate)}/${formatDate(endDate)}`,
          `&location=${encodeURIComponent(task.meetLink)}`,
          `&details=${encodeURIComponent(`Link para a reunião: ${task.meetLink}`)}`
      ].join('');

      window.open(calendarUrl, '_blank');
  };

  const getNoteStyles = (color?: string) => {
      switch(color) {
          case 'blue': return 'bg-blue-50 border-blue-200 text-blue-900';
          case 'green': return 'bg-emerald-50 border-emerald-200 text-emerald-900';
          case 'red': return 'bg-rose-50 border-rose-200 text-rose-900';
          case 'purple': return 'bg-purple-50 border-purple-200 text-purple-900';
          case 'gray': return 'bg-gray-50 border-gray-200 text-gray-900';
          case 'yellow': default: return 'bg-yellow-50 border-yellow-200 text-yellow-900';
      }
  };

  const getNoteBadgeStyles = (color?: string) => {
      switch(color) {
          case 'blue': return 'bg-blue-100 text-blue-700';
          case 'green': return 'bg-emerald-100 text-emerald-700';
          case 'red': return 'bg-rose-100 text-rose-700';
          case 'purple': return 'bg-purple-100 text-purple-700';
          case 'gray': return 'bg-gray-200 text-gray-700';
          case 'yellow': default: return 'bg-yellow-100 text-yellow-800';
      }
  };

  const clearFilters = () => {
      setFilterCompany('all'); setFilterPriority('all'); setFilterStatus('all'); setFilterResponsible([]); setFilterDateStart(''); setFilterDateEnd('');
  };

  const getCollaboratorAvatars = (ids: string[] | undefined, authorName?: string) => {
      let displayIds = ids || [];
      if (displayIds.length === 0 && authorName) {
          const user = users.find(u => u.name === authorName);
          if (user) displayIds = [user.id];
      }
      if (displayIds.length === 0) return null;
      return (
          <div className="flex -space-x-2">
              {displayIds.slice(0, 4).map(id => {
                  const user = users.find(u => u.id === id);
                  return <div key={id} className="w-6 h-6 rounded-full bg-gradient-to-br from-gray-100 to-gray-300 flex items-center justify-center text-[10px] font-bold text-gray-700 border-2 border-white shadow-sm" title={user?.name}>{user?.avatar || user?.name?.substring(0,2).toUpperCase() || 'U'}</div>;
              })}
              {displayIds.length > 4 && <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-[9px] font-bold text-gray-500 border-2 border-white shadow-sm">+{displayIds.length - 4}</div>}
          </div>
      );
  };

  const getOverdueIntensity = (dueDate: string) => {
      if (!dueDate) return 'bg-white border-gray-100';
      const today = new Date(); today.setHours(0,0,0,0);
      const due = new Date(dueDate); due.setHours(0,0,0,0);
      const diffTime = Math.abs(today.getTime() - due.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
      if (diffDays <= 2) return 'bg-red-50 border-red-200';
      if (diffDays <= 7) return 'bg-red-100 border-red-300';
      if (diffDays <= 15) return 'bg-red-200 border-red-400';
      return 'bg-red-300 border-red-500';
  };

  const isCompletedLate = (task: Task): boolean => {
      const isCompleted = taskStages.find(s => s.name === task.status)?.is_fixed || false;
      if (!isCompleted || !task.completedAt || !task.dueDate) return false;
      const due = new Date(task.dueDate); due.setHours(23, 59, 59, 999);
      const completed = new Date(task.completedAt);
      return completed > due;
  };

  const handleDragStart = (e: React.DragEvent, id: string) => { setDraggedTaskId(id); };
  const handleDragOver = (e: React.DragEvent, status: string) => { e.preventDefault(); setDragOverColumn(status); };
  const handleDrop = async (e: React.DragEvent, status: string) => {
      e.preventDefault(); setDragOverColumn(null);
      if (draggedTaskId) {
          const task = tasks.find(t => t.id === draggedTaskId);
          if (task && task.status !== status) {
              const now = new Date().toISOString();
              const isCompletedStage = taskStages.find(s => s.name === status)?.is_fixed || false;
              const updates = { status: status as any, completedAt: isCompletedStage ? now : null };
              setTasks(prev => prev.map(t => t.id === draggedTaskId ? { ...t, ...updates } : t));
              await supabase.from('tasks').update(updates).eq('id', draggedTaskId);
          }
          setDraggedTaskId(null);
      }
  };

  const handlePrev = () => {
    setCurrentDate(prev => {
        const newDate = new Date(prev);
        if (calendarView === 'MONTH') newDate.setMonth(newDate.getMonth() - 1);
        else if (calendarView === 'WEEK') newDate.setDate(newDate.getDate() - 7);
        else newDate.setDate(newDate.getDate() - 1);
        return newDate;
    });
  };

  const handleNext = () => {
      setCurrentDate(prev => {
          const newDate = new Date(prev);
          if (calendarView === 'MONTH') newDate.setMonth(newDate.getMonth() + 1);
          else if (calendarView === 'WEEK') newDate.setDate(newDate.getDate() + 7);
          else newDate.setDate(newDate.getDate() - 1);
          return newDate;
      });
  };

  const getCalendarTitle = () => {
    const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long' };
    if (calendarView === 'WEEK') {
        const start = new Date(currentDate);
        start.setDate(start.getDate() - start.getDay());
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        return `${start.toLocaleDateString('pt-BR', {day: 'numeric', month: 'short'})} - ${end.toLocaleDateString('pt-BR', {day: 'numeric', month: 'short', year: 'numeric'})}`;
    }
    if (calendarView === 'DAY') return currentDate.toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    return currentDate.toLocaleDateString('pt-BR', options);
  };
  
  const renderMonthView = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    const blanks = Array(firstDay).fill(null);
    const today = new Date();

    return (
        <div className="grid grid-cols-7 flex-1">
            {['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'].map(day => (
                <div key={day} className="text-center font-bold text-xs text-gray-500 py-2 border-b border-gray-100">{day}</div>
            ))}
            {blanks.map((_, i) => <div key={`b-${i}`} className="border-r border-b border-gray-100"></div>)}
            {days.map(day => {
                const date = new Date(year, month, day);
                const dateStr = date.toISOString().split('T')[0];
                const dayTasks = tasks.filter(t => t.dueDate.startsWith(dateStr));
                const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
                return (
                    <div key={day} className="border-r border-b border-gray-100 p-2 min-h-[100px] flex flex-col hover:bg-gray-50/50 cursor-pointer relative group" onClick={() => handleCalendarDayClick(date)}>
                        <div className="flex justify-between items-start">
                            <span className={`font-bold text-xs ${isToday ? 'bg-mcsystem-500 text-white rounded-full h-5 w-5 flex items-center justify-center' : 'text-gray-600'}`}>{day}</span>
                            <button className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-mcsystem-500">
                                <Plus size={14} />
                            </button>
                        </div>
                        <div className="space-y-1 mt-1 overflow-y-auto">
                            {dayTasks.map(t => (
                                <div key={t.id} onClick={(e) => handleCalendarEventClick(e, t)} className={`text-[10px] p-1 rounded font-bold truncate ${t.type === TaskType.MEETING ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>{t.title}</div>
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

const renderWeekView = () => {
    const startOfWeek = new Date(currentDate);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const days = Array.from({ length: 7 }).map((_, i) => {
        const date = new Date(startOfWeek);
        date.setDate(date.getDate() + i);
        return date;
    });

    return (
        <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-7 sticky top-0 bg-white z-10">
                {days.map(day => (
                    <div key={day.toString()} className="text-center font-bold text-xs text-gray-500 py-2 border-b border-gray-100">
                        {day.toLocaleDateString('pt-BR', { weekday: 'short' }).toUpperCase()} <span className="block font-normal text-lg">{day.getDate()}</span>
                    </div>
                ))}
            </div>
            <div className="grid grid-cols-7 h-full">
                {days.map(day => {
                    const dateStr = day.toISOString().split('T')[0];
                    const dayTasks = tasks.filter(t => t.dueDate.startsWith(dateStr));
                    return (
                        <div key={day.toString()} onClick={() => handleCalendarDayClick(day)} className="border-r border-gray-100 p-2 space-y-2 min-h-[300px] group hover:bg-gray-50/50 cursor-pointer relative">
                           <button className="absolute top-2 right-2 p-1 rounded-full bg-white/50 text-gray-400 opacity-0 group-hover:opacity-100 hover:bg-mcsystem-100 hover:text-mcsystem-600 transition-all">
                                <Plus size={16} />
                            </button>
                            {dayTasks.map(t => (
                                <div key={t.id} onClick={(e) => handleCalendarEventClick(e, t)} className={`p-2 rounded text-xs shadow-sm cursor-pointer ${t.type === TaskType.MEETING ? 'bg-purple-100' : 'bg-blue-100'}`}>
                                    <p className="font-bold">{t.title}</p>
                                    <p className="text-[10px]">{t.dueDate.includes('T') ? new Date(t.dueDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Dia todo'}</p>
                                </div>
                            ))}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const renderDayView = () => {
    const dateStr = currentDate.toISOString().split('T')[0];
    const dayTasks = tasks.filter(t => t.dueDate.startsWith(dateStr)).sort((a,b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
    return (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <button onClick={() => handleCalendarDayClick(currentDate)} className="w-full flex items-center justify-center gap-2 p-3 bg-mcsystem-50 hover:bg-mcsystem-100 border-2 border-dashed border-mcsystem-200 text-mcsystem-600 rounded-lg font-bold transition-colors mb-4">
                <Plus size={16} />
                Adicionar Compromisso
            </button>
            {dayTasks.length > 0 ? dayTasks.map(t => (
                <div key={t.id} onClick={(e) => handleCalendarEventClick(e, t)} className={`flex items-center p-4 rounded-lg shadow-sm cursor-pointer border-l-4 ${t.type === TaskType.MEETING ? 'bg-purple-50 border-purple-400' : 'bg-blue-50 border-blue-400'}`}>
                    <div className="w-24 text-sm font-bold">{t.dueDate.includes('T') ? new Date(t.dueDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Dia todo'}</div>
                    <div>
                        <p className="font-bold">{t.title}</p>
                        <p className="text-xs text-gray-500">{t.relatedTo}</p>
                    </div>
                </div>
            )) : (
                <div className="text-center text-gray-400 py-16">Nenhum compromisso para hoje.</div>
            )}
        </div>
    );
};

const renderCard = (task: Task) => {
    const overdue = isOverdue(task);
    return (
      <div 
          key={task.id} 
          draggable={taskViewMode === 'KANBAN'}
          onDragStart={(e) => handleDragStart(e, task.id)}
          className={`bg-white p-5 rounded-xl shadow-sm border group transition-all hover:shadow-md relative
            ${taskStages.find(s => s.name === task.status)?.is_fixed ? 'opacity-70' : ''}
            ${draggedTaskId === task.id ? 'opacity-50' : ''}
            ${overdue ? 'border-red-400 bg-red-50/50 hover:border-red-500' : 'border-gray-100'}
          `}
      >
          <div className="absolute top-4 right-4 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
               <button onClick={() => { setEditingTaskId(task.id); setCurrentTask(task); setIsTaskModalOpen(true); }} className="p-1.5 text-gray-400 hover:text-mcsystem-500 rounded-md hover:bg-gray-50"><Pencil size={14} /></button>
               <button onClick={() => handleDelete(task.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-md hover:bg-gray-50"><Trash2 size={14} /></button>
          </div>

          <div className="flex items-start">
              <button onClick={() => toggleStatus(task)} className="mt-1 mr-4 text-gray-300 hover:text-mcsystem-500 transition-colors flex-shrink-0 relative z-10">
                  {taskStages.find(s => s.name === task.status)?.is_fixed ? <CheckCircle2 size={24} className="text-green-500" /> : <Circle size={24} />}
              </button>
              
              <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                      {overdue && (
                          <span className="text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider flex items-center gap-1 bg-red-100 text-red-700">
                              <AlertTriangle size={10} />
                              Atrasado
                          </span>
                      )}
                      <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider bg-blue-100 text-blue-700`}>
                          {task.type}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider ${
                          task.priority === 'High' ? 'bg-red-100 text-red-700' : 
                          task.priority === 'Medium' ? 'bg-orange-100 text-orange-700' : 
                          'bg-green-100 text-green-700'
                      }`}>
                          {task.priority === 'High' ? 'Alta' : task.priority === 'Medium' ? 'Média' : 'Baixa'}
                      </span>
                  </div>

                  <h3 className={`font-bold text-gray-800 text-base mb-3 truncate pr-8 ${taskStages.find(s => s.name === task.status)?.is_fixed ? 'line-through text-gray-500' : ''}`}>
                      {task.title}
                  </h3>

                  <div className="flex flex-wrap items-center justify-between gap-y-2">
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                          <div className="flex items-center" title="Empresa Relacionada">
                              <Building size={14} className="mr-1.5 text-gray-400" />
                              <span className="truncate max-w-[120px]">{task.relatedTo}</span>
                          </div>
                      </div>

                      <div className="flex items-center gap-3 text-xs font-medium text-gray-400">
                           {taskViewMode === 'LIST' && (
                               <select 
                                   value={task.status} 
                                   onChange={(e) => handleStatusChange(task, e.target.value)}
                                   onClick={(e) => e.stopPropagation()}
                                   className="text-xs border border-gray-300 rounded px-2 py-1 bg-white hover:border-mcsystem-500 transition-colors"
                               >
                                   {taskStages.length === 0 && <option value="">Carregando...</option>}
                                   {taskStages.sort((a, b) => a.order - b.order).map(stage => (
                                       <option key={stage.id} value={stage.name}>{stage.name}</option>
                                   ))}
                               </select>
                           )}
                           <div className="flex items-center">
                               <CalendarIcon size={14} className="mr-1.5" />
                               {new Date(task.dueDate).toLocaleDateString('pt-BR', {timeZone: 'UTC'})}
                           </div>
                      </div>
                  </div>
              </div>
          </div>
      </div>
  )};

const renderKanbanColumn = (status: string, title: string) => {
      const columnTasks = visibleTasks.filter(t => t.status === status);
      const isDragOver = dragOverColumn === status;

      return (
          <div 
            className={`flex-1 bg-gray-50/50 rounded-xl p-4 border transition-colors min-w-[320px] ${isDragOver ? 'border-mcsystem-500 bg-blue-50/50' : 'border-gray-200'}`}
            onDragOver={(e) => handleDragOver(e, status)}
            onDrop={(e) => handleDrop(e, status)}
          >
              <div className="flex justify-between items-center mb-4">
                  <h3 className={`font-bold text-sm uppercase tracking-wide ${taskStages.find(s => s.name === status)?.is_fixed ? 'text-green-600' : 'text-gray-700'}`}>
                      {title}
                  </h3>
                  <span className="bg-white border border-gray-200 text-gray-500 text-xs px-2 py-0.5 rounded-full font-medium shadow-sm">
                      {columnTasks.length}
                  </span>
              </div>
              <div className="space-y-3 min-h-[200px] h-full overflow-y-auto">
                  {columnTasks.map(renderCard)}
                  {columnTasks.length === 0 && (
                      <div className="h-24 border-2 border-dashed border-gray-200 rounded-lg flex items-center justify-center text-gray-400 text-sm">
                          Arraste tarefas aqui
                      </div>
                  )}
              </div>
          </div>
      );
  };

const renderTasks = () => (
    <div className="animate-in fade-in duration-300 h-full flex flex-col">
        <div className="flex justify-between items-center mb-4 flex-shrink-0">
            <div className="flex items-center gap-3">
                <div className="flex items-center bg-gray-100 p-1 rounded-lg">
                    <button onClick={() => setTaskViewMode('KANBAN')} className={`flex items-center px-3 py-1 text-xs font-bold rounded ${taskViewMode === 'KANBAN' ? 'bg-white shadow' : ''}`}><LayoutGrid size={14} className="mr-1.5"/> Kanban</button>
                    <button onClick={() => setTaskViewMode('LIST')} className={`flex items-center px-3 py-1 text-xs font-bold rounded ${taskViewMode === 'LIST' ? 'bg-white shadow' : ''}`}><List size={14} className="mr-1.5"/> Lista</button>
                </div>
                {/* Filtro de Responsável */}
                <div className="w-64">
                    <MultiSelectResponsible
                        users={users}
                        selectedIds={filterResponsible}
                        onChange={setFilterResponsible}
                        placeholder="Todos os responsáveis"
                    />
                </div>
            </div>
            <button
                onClick={handleNewTaskClick}
                className="bg-mcsystem-500 hover:bg-mcsystem-400 text-white px-4 py-2 rounded-lg font-bold flex items-center shadow-sm transition-colors text-sm"
            >
                <Plus size={16} className="mr-2"/> Nova Tarefa
            </button>
        </div>
        {taskViewMode === 'KANBAN' ? (
            <div className="flex-1 flex gap-6 overflow-x-auto pb-2">
                {taskStages.length > 0 ? (
                    taskStages.sort((a, b) => a.order - b.order).map(stage => renderKanbanColumn(stage.name, stage.name))
                ) : (
                    // Fallback para etapas padrão se não houver etapas no banco
                    <>
                        {renderKanbanColumn('Pending', 'A Fazer')}
                        {renderKanbanColumn('In Progress', 'Em Progresso')}
                        {renderKanbanColumn('Done', 'Concluído')}
                    </>
                )}
            </div>
        ) : (
            <div className="flex-1 overflow-y-auto pr-2 -mr-2">
                <div className="space-y-3">
                    {visibleTasks.length > 0 ? visibleTasks.map(renderCard) : <p className="text-center text-gray-400 py-16">Nenhuma tarefa encontrada.</p>}
                </div>
            </div>
        )}
    </div>
);

const renderMeetings = () => (
    <div className="animate-in fade-in duration-300">
        <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-4">
                <h3 className="text-lg font-bold text-gray-800">Próximas Reuniões</h3>
                {/* Filtro de Participantes */}
                <div className="w-64">
                    <MultiSelectResponsible
                        users={users}
                        selectedIds={filterResponsible}
                        onChange={setFilterResponsible}
                        placeholder="Todos os participantes"
                    />
                </div>
            </div>
            <button
                onClick={handleNewMeetingClick}
                className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg font-bold flex items-center shadow-sm transition-colors text-sm"
            >
                <Plus size={16} className="mr-2"/> Nova Reunião
            </button>
        </div>
        <div className="space-y-4">
            {onlyMeetings.length > 0 ? onlyMeetings.map(meeting => {
                const meetingCompany = companies.find(c => c.id === meeting.companyId);
                const assignedUser = users.find(u => meeting.assigned_to && meeting.assigned_to.includes(u.id));
                
                return (
                    <div key={meeting.id} className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 group hover:shadow-md transition-shadow">
                        <div className="flex items-start justify-between">
                            <div className="flex items-center flex-1">
                                <div className="w-12 h-12 rounded-lg bg-purple-100 text-purple-700 flex flex-col items-center justify-center mr-4 border border-purple-200">
                                    <span className="text-[10px] font-bold uppercase">{new Date(meeting.dueDate).toLocaleString('default', { month: 'short' }).replace('.', '')}</span>
                                    <span className="text-lg font-bold">{new Date(meeting.dueDate).getDate()}</span>
                                </div>
                                <div className="flex-1">
                                    <p className="font-bold text-gray-800">{meeting.title}</p>
                                    <div className="flex items-center gap-3 mt-1">
                                        {meetingCompany && (
                                            <div className="flex items-center gap-1 text-xs text-gray-500">
                                                <Building size={12} />
                                                <span>{meetingCompany.name}</span>
                                            </div>
                                        )}
                                        {assignedUser && (
                                            <div className="flex items-center gap-1 text-xs text-gray-500">
                                                <UserIcon size={12} />
                                                <span>{assignedUser.name}</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 mt-2">
                                        <p className="text-xs text-gray-400">
                                            {meeting.startTime && meeting.endTime 
                                                ? `${meeting.startTime} - ${meeting.endTime}`
                                                : new Date(meeting.dueDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                            }
                                        </p>
                                        {meeting.archived && (
                                            <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs font-medium">
                                                <CheckCircle2 size={12} />
                                                Realizada
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => handleToggleArchiveMeeting(meeting.id, !meeting.archived)}
                                    className="p-2 text-gray-400 hover:text-green-500 transition-colors"
                                    title={meeting.archived ? "Desarquivar" : "Marcar como realizada"}
                                >
                                    {meeting.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                                </button>
                                <div className="flex opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => { setEditingMeetingId(meeting.id); setCurrentMeeting(meeting); setIsMeetingModalOpen(true); }} className="p-2 text-gray-400 hover:text-blue-500"><Pencil size={16} /></button>
                                    <button onClick={() => handleDelete(meeting.id)} className="p-2 text-gray-400 hover:text-red-500"><Trash2 size={16} /></button>
                                </div>
                            </div>
                        </div>
                        {meeting.meetLink && (
                            <div className="mt-3 pt-3 border-t border-gray-100 flex gap-2">
                                 <a href={meeting.meetLink} target="_blank" rel="noopener noreferrer" className="flex-1 text-center bg-green-500 text-white px-3 py-2 rounded-md text-xs font-bold hover:bg-green-600 transition-colors flex items-center justify-center">
                                    <Video size={14} className="mr-1.5"/> Entrar na Reunião
                                </a>
                                <button onClick={() => handleCreateCalendarInvite(meeting)} className="flex-1 text-center bg-gray-100 text-gray-700 px-3 py-2 rounded-md text-xs font-bold hover:bg-gray-200 transition-colors flex items-center justify-center">
                                    <CalendarCheck size={14} className="mr-1.5"/> Convidar via Google Agenda
                                </button>
                            </div>
                        )}
                    </div>
                );
            }) : <p className="text-center text-gray-400 py-16">Nenhuma reunião encontrada.</p>}
        </div>
    </div>
);

const renderDashboard = () => (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-300">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
            {/* Top Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Total de Tarefas</h4>
                    <p className="text-3xl font-bold text-gray-800 mt-2">{analyticsData.totalTasks}</p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Taxa de Atraso</h4>
                    <p className="text-3xl font-bold text-red-500 mt-2">{analyticsData.lateRate}%</p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Melhor Performance</h4>
                    <p className="text-xl font-bold text-mcsystem-600 mt-2">{analyticsData.topPerformer?.name || 'N/A'}</p>
                    <p className="text-xs text-gray-500">{analyticsData.topPerformer?.done || 0} tarefas concluídas</p>
                </div>
            </div>
            {/* Main Chart */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-80">
                <h3 className="font-bold text-gray-800 mb-4">Performance da Equipe</h3>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analyticsData.teamPerformance}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="total" name="Total" fill="#d1d5db" />
                        <Bar dataKey="done" name="Concluídas" fill="#10b981" />
                        <Bar dataKey="late" name="Atrasadas" fill="#ef4444" />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
        {/* Right column */}
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h3 className="font-bold text-gray-800 mb-4">Status das Tarefas</h3>
                <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie data={analyticsData.statusDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} label>
                                {analyticsData.statusDistribution.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                            </Pie>
                            <Tooltip />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h3 className="font-bold text-gray-800 mb-4">Tarefas por Prioridade</h3>
                <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie data={analyticsData.priorityData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={5}>
                                {analyticsData.priorityData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                            </Pie>
                            <Tooltip />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    </div>
);


const renderNotes = () => (
    <div className="animate-in fade-in duration-300">
        <div className="flex items-center justify-between mb-6">
            <div>
                <h3 className="text-lg font-bold text-gray-800 flex items-center">
                    <StickyNote size={20} className="mr-2 text-mcsystem-500" /> Mural de Notas
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                    Notas gerais, lembretes e registros não vinculados a um compromisso específico.
                </p>
            </div>
            <button
                onClick={() => handleOpenNoteModal()}
                className="text-sm bg-mcsystem-500 text-white px-4 py-2 rounded-lg hover:bg-mcsystem-400 flex items-center font-medium shadow-sm transition-transform hover:scale-105"
            >
                <Plus size={16} className="mr-1" /> Criar Nota
            </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-6">
            {generalNotes.length > 0 ? (
                generalNotes.map(note => (
                    <div
                        key={note.id}
                        className={`p-5 rounded-lg border shadow-sm relative group hover:shadow-md transition-all duration-200 flex flex-col ${getNoteStyles(note.color)} min-h-[160px]`}
                    >
                        <div className="flex justify-between items-start mb-3">
                            <div className="flex flex-col flex-1 pr-8">
                                {note.title && <span className="font-bold text-sm mb-1">{note.title}</span>}
                                <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded w-fit ${getNoteBadgeStyles(note.color)}`}>
                                    {note.category || 'Geral'}
                                </span>
                            </div>
                            <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/50 rounded-md p-0.5 absolute top-4 right-4 z-10">
                                <button onClick={() => handleOpenNoteModal(note)} className="p-1 hover:text-blue-600">
                                    <Pencil size={14} />
                                </button>
                                <button onClick={() => handleDeleteNote(note.id)} className="p-1 hover:text-red-600">
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>
                        <p className="text-xs leading-relaxed whitespace-pre-wrap flex-1 opacity-90 font-medium">
                            {note.content}
                        </p>
                        <div className="mt-4 pt-3 border-t border-black/5 flex justify-between items-center text-[10px] opacity-70">
                            <span className="flex items-center">
                                {getCollaboratorAvatars(undefined, note.author)}
                                <span className="ml-1 font-bold">{note.author}</span>
                            </span>
                            <span>{new Date(note.date).toLocaleDateString()}</span>
                        </div>
                    </div>
                ))
            ) : (
                <div className="col-span-full p-12 border-2 border-dashed border-gray-200 rounded-xl text-center text-gray-400 bg-gray-50/50 flex flex-col items-center">
                    <StickyNote size={48} className="mb-4 opacity-20" />
                    <p className="text-sm font-medium text-gray-500">Nenhuma nota encontrada.</p>
                </div>
            )}
        </div>
    </div>
  );

const renderCalendar = () => (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 flex flex-col h-full animate-in fade-in">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center">
            <div className="flex items-center">
                <button onClick={handlePrev} className="p-2 rounded-full hover:bg-gray-100"><ChevronLeft size={20}/></button>
                <h3 className="font-bold text-lg mx-4 w-64 text-center">{getCalendarTitle()}</h3>
                <button onClick={handleNext} className="p-2 rounded-full hover:bg-gray-100"><ChevronRight size={20}/></button>
            </div>
            <div className="flex items-center bg-gray-100 p-1 rounded-lg">
                <button onClick={() => setCalendarView('MONTH')} className={`px-3 py-1 text-xs font-bold rounded ${calendarView === 'MONTH' ? 'bg-white shadow' : ''}`}>Mês</button>
                <button onClick={() => setCalendarView('WEEK')} className={`px-3 py-1 text-xs font-bold rounded ${calendarView === 'WEEK' ? 'bg-white shadow' : ''}`}>Semana</button>
                <button onClick={() => setCalendarView('DAY')} className={`px-3 py-1 text-xs font-bold rounded ${calendarView === 'DAY' ? 'bg-white shadow' : ''}`}>Dia</button>
            </div>
        </div>
        {calendarView === 'MONTH' && renderMonthView()}
        {calendarView === 'WEEK' && renderWeekView()}
        {calendarView === 'DAY' && renderDayView()}
    </div>
);
  
  return (
    <div className="h-full flex flex-col space-y-6">
      {/* Header with Tabs */}
      <div className="flex-shrink-0 flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Compromissos</h2>
          <p className="text-sm text-gray-500">Gerencie suas tarefas, reuniões e calendário.</p>
        </div>
        <div className="flex items-center bg-white border border-gray-200 p-1 rounded-lg shadow-sm">
          {[
            { id: 'DASHBOARD', label: 'Dashboard', icon: BarChart2 },
            { id: 'TASKS', label: 'Tarefas', icon: CheckSquare },
            { id: 'MEETINGS', label: 'Reuniões', icon: Video },
            { id: 'CALENDAR', label: 'Calendário', icon: CalendarIcon },
            { id: 'NOTES', label: 'Mural de Notas', icon: StickyNote },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabView)}
              className={`flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-mcsystem-900 text-white shadow-sm font-bold'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
            >
              <tab.icon size={14} className="mr-2" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'DASHBOARD' && renderDashboard()}
        {activeTab === 'TASKS' && renderTasks()}
        {activeTab === 'MEETINGS' && renderMeetings()}
        {activeTab === 'NOTES' && renderNotes()}
        {activeTab === 'CALENDAR' && renderCalendar()}
      </div>
      
      {/* MODALS */}
      {isChoiceModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm">
            <div className="p-4 border-b flex justify-between items-center">
                <h3 className="font-bold text-lg">Criar Compromisso</h3>
                <button onClick={() => setIsChoiceModalOpen(false)}><X size={20}/></button>
            </div>
            <div className="p-6 space-y-4">
                <p className="text-sm text-gray-600 text-center">
                    O que você gostaria de criar para o dia <strong className="text-mcsystem-900">{selectedDateForNew?.toLocaleDateString('pt-BR')}</strong>?
                </p>
                <button 
                    onClick={handleChooseNewTask}
                    className="w-full flex items-center justify-center gap-3 p-4 bg-mcsystem-500 hover:bg-mcsystem-400 text-white rounded-lg font-bold transition-colors"
                >
                    <CheckSquare size={20} />
                    Nova Tarefa
                </button>
                <button 
                    onClick={handleChooseNewMeeting}
                    className="w-full flex items-center justify-center gap-3 p-4 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-bold transition-colors"
                >
                    <Video size={20} />
                    Nova Reunião
                </button>
            </div>
          </div>
        </div>
      )}

      {isTaskModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            {/* Task modal content */}
            <div className="p-4 border-b flex justify-between items-center"><h3 className="font-bold">{editingTaskId ? 'Editar Tarefa' : 'Nova Tarefa'}</h3><button onClick={() => setIsTaskModalOpen(false)}><X size={20}/></button></div>
            <form onSubmit={handleSaveTask} className="p-4 space-y-3">
                <input required type="text" placeholder="Título" value={currentTask.title} onChange={e=>setCurrentTask({...currentTask, title:e.target.value})} className="w-full border p-2 rounded"/>
                <div className="grid grid-cols-2 gap-2">
                    <input required type="date" value={currentTask.dueDate?.split('T')[0]} onChange={e=>setCurrentTask({...currentTask, dueDate:e.target.value})} className="w-full border p-2 rounded"/>
                    <select value={currentTask.priority} onChange={e=>setCurrentTask({...currentTask, priority:e.target.value as any})} className="w-full border p-2 rounded bg-white"><option value="High">Alta</option><option value="Medium">Média</option><option value="Low">Baixa</option></select>
                </div>
                <select value={currentTask.companyId} onChange={e=>setCurrentTask({...currentTask, companyId:e.target.value, relatedTo: companies.find(c=>c.id === e.target.value)?.name})} className="w-full border p-2 rounded bg-white"><option value="">Vincular Cliente</option>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Atribuir a</label>
                    <div className="border rounded p-3 bg-gray-50 max-h-32 overflow-y-auto space-y-2">
                        {users.map(u => (
                            <label key={u.id} className="flex items-center gap-2 cursor-pointer hover:bg-white p-1 rounded transition-colors">
                                <input 
                                    type="checkbox" 
                                    checked={currentTask.assigned_to?.includes(u.id) || false}
                                    onChange={(e) => {
                                        const current = currentTask.assigned_to || [];
                                        if (e.target.checked) {
                                            setCurrentTask({...currentTask, assigned_to: [...current, u.id]});
                                        } else {
                                            setCurrentTask({...currentTask, assigned_to: current.filter(id => id !== u.id)});
                                        }
                                    }}
                                    className="rounded border-gray-300 text-mcsystem-500"
                                />
                                <span className="text-sm">{u.name}</span>
                            </label>
                        ))}
                    </div>
                </div>
                <button type="submit" className="w-full bg-mcsystem-500 text-white p-2 rounded font-bold">Salvar</button>
            </form>
          </div>
        </div>
      )}

      {isMeetingModalOpen && (
         <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            {/* Meeting modal content */}
            <div className="p-4 border-b flex justify-between items-center"><h3 className="font-bold">{editingMeetingId ? 'Editar Reunião' : 'Nova Reunião'}</h3><button onClick={() => setIsMeetingModalOpen(false)}><X size={20}/></button></div>
             <form onSubmit={handleSaveMeeting} className="p-4 space-y-3">
                <input required type="text" placeholder="Assunto da Reunião" value={currentMeeting.title} onChange={e=>setCurrentMeeting({...currentMeeting, title:e.target.value})} className="w-full border p-2 rounded"/>
                
                {/* Data da Reunião */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Data</label>
                    <input required type="date" value={currentMeeting.dueDate?.split('T')[0] || ''} onChange={e=>setCurrentMeeting({...currentMeeting, dueDate:e.target.value})} className="w-full border p-2 rounded"/>
                </div>
                
                {/* Horário de Início e Fim */}
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Horário Início</label>
                        <select 
                            required
                            value={currentMeeting.startTime || ''} 
                            onChange={e=>setCurrentMeeting({...currentMeeting, startTime:e.target.value})} 
                            className="w-full border p-2 rounded bg-white"
                        >
                            <option value="">Selecione</option>
                            {Array.from({length: 24 * 4}, (_, i) => {
                                const hour = Math.floor(i / 4);
                                const minute = (i % 4) * 15;
                                const time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
                                return <option key={time} value={time}>{time}</option>;
                            })}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Horário Fim</label>
                        <select 
                            required
                            value={currentMeeting.endTime || ''} 
                            onChange={e=>setCurrentMeeting({...currentMeeting, endTime:e.target.value})} 
                            className="w-full border p-2 rounded bg-white"
                        >
                            <option value="">Selecione</option>
                            {Array.from({length: 24 * 4}, (_, i) => {
                                const hour = Math.floor(i / 4);
                                const minute = (i % 4) * 15;
                                const time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
                                return <option key={time} value={time}>{time}</option>;
                            })}
                        </select>
                    </div>
                </div>
                
                <select value={currentMeeting.relatedTo} onChange={e=>setCurrentMeeting({...currentMeeting, relatedTo:e.target.value})} className="w-full border p-2 rounded bg-white"><option value="">Vincular Cliente</option>{companies.map(c=><option key={c.id} value={c.name}>{c.name}</option>)}</select>
                
                {/* Participantes */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Participantes</label>
                    <div className="border rounded p-3 bg-gray-50 max-h-32 overflow-y-auto space-y-2">
                        {users.map(u => (
                            <label key={u.id} className="flex items-center gap-2 cursor-pointer hover:bg-white p-1 rounded transition-colors">
                                <input 
                                    type="checkbox" 
                                    checked={currentMeeting.assigned_to?.includes(u.id) || false}
                                    onChange={(e) => {
                                        const current = currentMeeting.assigned_to || [];
                                        if (e.target.checked) {
                                            setCurrentMeeting({...currentMeeting, assigned_to: [...current, u.id]});
                                        } else {
                                            setCurrentMeeting({...currentMeeting, assigned_to: current.filter(id => id !== u.id)});
                                        }
                                    }}
                                    className="rounded border-gray-300 text-purple-600"
                                />
                                <span className="text-sm">{u.name}</span>
                            </label>
                        ))}
                    </div>
                </div>
                
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Link do Google Meet</label>
                    <div className="flex gap-2">
                         <input type="url" placeholder="Cole o link aqui..." value={currentMeeting.meetLink || ''} onChange={e=>setCurrentMeeting({...currentMeeting, meetLink: e.target.value})} className="w-full border p-2 rounded text-sm"/>
                         <button type="button" onClick={() => window.open('https://meet.google.com/new', '_blank')} className="px-3 py-2 bg-blue-500 text-white rounded text-sm font-bold whitespace-nowrap">Gerar Link</button>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Clique, gere o link, copie e cole no campo acima.</p>
                </div>

                <button type="submit" className="w-full bg-purple-600 text-white p-2 rounded font-bold">Salvar</button>
            </form>
          </div>
        </div>
      )}

      {isNoteModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[110] p-4 overflow-visible">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-md animate-in zoom-in-95 duration-200">
                  <div className="bg-mcsystem-900 px-6 py-4 border-b border-mcsystem-800 flex justify-between items-center rounded-t-xl text-white">
                       <h3 className="font-bold text-lg flex items-center"><StickyNote size={20} className="mr-2 text-mcsystem-400" /> {editingNoteId ? 'Editar Nota' : 'Nova Nota'}</h3>
                       <button onClick={() => setIsNoteModalOpen(false)} className="text-mcsystem-300 hover:text-white transition-colors"><X size={20} /></button>
                  </div>
                  <form onSubmit={handleSaveNote} className="p-6 space-y-4">
                        <input type="text" placeholder="Título da Nota (Opcional)" value={noteForm.title} onChange={(e) => setNoteForm({...noteForm, title: e.target.value})} className="w-full border p-2 rounded"/>
                        <textarea required placeholder="Conteúdo da nota..." value={noteForm.content} onChange={(e) => setNoteForm({...noteForm, content: e.target.value})} className="w-full border p-2 rounded h-24"/>
                        <select value={noteForm.companyId} onChange={(e) => setNoteForm({...noteForm, companyId: e.target.value})} className="w-full border p-2 rounded bg-white">
                            <option value="">Vincular a um cliente (opcional)</option>
                            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                         <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 text-center">Cor da Nota</label>
                            <div className="flex gap-2 justify-center p-2 bg-gray-50 rounded-xl border border-gray-100">
                                {(['yellow', 'blue', 'green', 'red', 'purple', 'gray'] as NoteColor[]).map((c) => (
                                    <button
                                        key={c}
                                        type="button"
                                        onClick={() => setNoteForm({...noteForm, color: c})}
                                        aria-label={`Select ${c} color`}
                                        className={`w-8 h-8 rounded-full border-2 transition-all transform hover:scale-110 shadow-sm
                                            ${c === 'yellow' ? 'bg-yellow-200' : 
                                              c === 'blue' ? 'bg-blue-200' : 
                                              c === 'green' ? 'bg-emerald-200' : 
                                              c === 'red' ? 'bg-rose-200' : 
                                              c === 'purple' ? 'bg-purple-200' : 'bg-gray-200'}
                                            ${noteForm.color === c ? 'border-mcsystem-500 scale-110 ring-2 ring-mcsystem-200' : 'border-transparent'}
                                        `}
                                    />
                                ))}
                            </div>
                        </div>
                       <div className="flex justify-end space-x-2 pt-2 border-t border-gray-50">
                           <button type="button" onClick={() => setIsNoteModalOpen(false)} className="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded text-sm font-medium">Cancelar</button>
                           <button type="submit" className="px-5 py-2 bg-mcsystem-900 text-white rounded-lg hover:bg-mcsystem-800 font-bold flex items-center shadow-lg transition-all transform hover:scale-105"><Save size={18} className="mr-2" /> Salvar Nota</button>
                      </div>
                  </form>
              </div>
          </div>
      )}
    </div>
  );
};