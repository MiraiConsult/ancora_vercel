
import React, { useState } from 'react';
import { Task, TaskType, Company, User } from '../types';
import { Calendar as CalendarIcon, Clock, CheckCircle2, Circle, AlertCircle, Bot, Plus, User as UserIcon, Building, LayoutList, LayoutGrid, Pencil, Trash2, Filter, AlertTriangle } from 'lucide-react';
import { prioritizeTasksAI } from '../services/geminiService';
import { supabase } from '../lib/supabaseClient';

interface TasksModuleProps {
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>; // Recebe o proxy ou o setter
  companies: Company[];
  users: User[];
  onEditTask: (task: Task) => void;
  onNewTask: () => void;
}

export const TasksModule: React.FC<TasksModuleProps> = ({ tasks, setTasks, companies, users, onEditTask, onNewTask }) => {
  const [viewMode, setViewMode] = useState<'LIST' | 'KANBAN'>('LIST');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Pending' | 'Done'>('Pending');
  
  // Custom Filters
  const [priorityFilter, setPriorityFilter] = useState<string>('All');
  

  const [aiSuggestion, setAiSuggestion] = useState<string>('');
  const [loadingAi, setLoadingAi] = useState(false);

  // Drag and Drop State (Kanban)
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  // --- Helpers ---
  const isOverdue = (task: Task): boolean => {
    if (task.status === 'Done' || !task.dueDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today in local time
    // The dueDate is 'YYYY-MM-DD'. Splitting it avoids timezone issues.
    const [year, month, day] = task.dueDate.split('-').map(Number);
    const dueDate = new Date(year, month - 1, day);
    return dueDate < today;
  };

  // --- Handlers ---

  const toggleStatus = async (id: string) => {
    // Determine new status
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    const newStatus = task.status === 'Done' ? 'Pending' : 'Done';

    // Optimistic Update
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: newStatus } : t));
    
    // Persist to Supabase
    const { error } = await supabase.from('tasks').update({ status: newStatus }).eq('id', id);
    if (error) console.error("Error updating task status:", error);
  };

  const handlePrioritize = async () => {
    setLoadingAi(true);
    const suggestion = await prioritizeTasksAI(tasks);
    setAiSuggestion(suggestion);
    setLoadingAi(false);
  };

  const handleDeleteTask = async (id: string) => {
      if (window.confirm('Tem certeza que deseja excluir esta tarefa?')) {
          // Get the task to be deleted to access its tenant_id
          const taskToDelete = tasks.find(t => t.id === id);
          if (!taskToDelete) {
              console.error("❌ Task not found:", id);
              return;
          }

          console.log("🗑️ Deleting task:", { id, title: taskToDelete.title, tenant_id: taskToDelete.tenant_id });

          // Optimistic update
          setTasks(prev => prev.filter(t => t.id !== id));

          // Persist with tenant_id filter for security
          const { error } = await supabase
              .from('tasks')
              .delete()
              .eq('id', id)
              .eq('tenant_id', taskToDelete.tenant_id);
          
          if (error) {
              console.error("❌ Error deleting task:", error);
              // Rollback optimistic update on error
              setTasks(prev => [...prev, taskToDelete].sort((a, b) => 
                  new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime()
              ));
              alert('Erro ao excluir tarefa. Por favor, tente novamente.');
          } else {
              console.log("✅ Task deleted successfully:", id);
          }
      }
  };

  // --- Filtering Logic ---
  const tasksMatchingGlobalFilters = tasks.filter(t => {
      const matchesPriority = priorityFilter === 'All' ? true : t.priority === priorityFilter;
      // FIX: Removed filtering by assignee as it no longer exists on Task.
      return matchesPriority;
  });

  const listFilteredTasks = tasksMatchingGlobalFilters.filter(t => {
      return statusFilter === 'All' ? true : t.status === statusFilter;
  });

  // --- Drag & Drop (Kanban) ---
  const handleDragStart = (e: React.DragEvent, taskId: string) => {
      setDraggedTaskId(taskId);
      e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, status: string) => {
      e.preventDefault();
      setDragOverColumn(status);
  };

  const handleDrop = async (e: React.DragEvent, status: 'Pending' | 'Done') => {
      e.preventDefault();
      setDragOverColumn(null);
      if (draggedTaskId) {
          // Optimistic
          setTasks(prev => prev.map(t => t.id === draggedTaskId ? { ...t, status } : t));
          
          // Persist
          const { error } = await supabase.from('tasks').update({ status }).eq('id', draggedTaskId);
          if (error) console.error("Error updating task status (drag):", error);

          setDraggedTaskId(null);
      }
  };

  // --- UI Helpers ---
  // FIX: Changed type from TaskType to string to match Task interface
  const getTypeStyles = (type: string) => {
      switch(type) {
          case TaskType.MEETING: return 'bg-purple-100 text-purple-700';
          case TaskType.CALL: return 'bg-blue-100 text-blue-700';
          case TaskType.EMAIL: return 'bg-yellow-100 text-yellow-700';
          case TaskType.FOLLOW_UP: return 'bg-orange-100 text-orange-700';
          default: return 'bg-gray-100 text-gray-700';
      }
  };

  const getPriorityStyles = (priority: string) => {
      switch(priority) {
          case 'High': return 'text-red-500 bg-red-50';
          case 'Medium': return 'text-orange-500 bg-orange-50';
          case 'Low': return 'text-green-500 bg-green-50';
          default: return 'text-gray-500';
      }
  };

  // --- Render Views ---
  const renderCard = (task: Task) => {
    const overdue = isOverdue(task);
    return (
      <div 
          key={task.id} 
          draggable={viewMode === 'KANBAN'}
          onDragStart={(e) => handleDragStart(e, task.id)}
          className={`p-5 rounded-xl shadow-sm border group transition-all hover:shadow-md relative
            ${task.status === 'Done' ? 'bg-white opacity-70' : 'bg-white'}
            ${draggedTaskId === task.id ? 'opacity-50' : ''}
            ${overdue ? 'border-red-400 bg-red-50/50 hover:border-red-500' : 'border-gray-100'}
          `}
      >
          <div className="absolute top-4 right-4 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
               <button onClick={() => onEditTask(task)} className="p-1.5 text-gray-400 hover:text-mcsystem-500 rounded-md hover:bg-gray-50"><Pencil size={14} /></button>
               <button onClick={() => handleDeleteTask(task.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-md hover:bg-gray-50"><Trash2 size={14} /></button>
          </div>

          <div className="flex items-start">
              <button onClick={() => toggleStatus(task.id)} className="mt-1 mr-4 text-gray-300 hover:text-mcsystem-500 transition-colors flex-shrink-0 relative z-10">
                  {task.status === 'Done' ? <CheckCircle2 size={24} className="text-green-500" /> : <Circle size={24} />}
              </button>
              
              <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                      {overdue && (
                          <span className="text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider flex items-center gap-1 bg-red-100 text-red-700">
                              <AlertTriangle size={10} />
                              Atrasado
                          </span>
                      )}
                      <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider ${getTypeStyles(task.type)}`}>
                          {task.type}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider flex items-center gap-1 ${getPriorityStyles(task.priority)}`}>
                          {task.priority === 'High' && <AlertCircle size={10} />}
                          {task.priority}
                      </span>
                  </div>

                  <h3 className={`font-bold text-gray-800 text-base mb-3 truncate pr-8 ${task.status === 'Done' ? 'line-through text-gray-500' : ''}`}>
                      {task.title}
                  </h3>

                  <div className="flex flex-wrap items-center justify-between gap-y-2">
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                          <div className="flex items-center" title="Empresa Relacionada">
                              <Building size={14} className="mr-1.5 text-gray-400" />
                              <span className="truncate max-w-[120px]">{task.relatedTo}</span>
                          </div>
                          {/* FIX: Removed assignee display as it no longer exists on Task. */}
                      </div>

                      <div className="flex items-center gap-3 text-xs font-medium text-gray-400">
                           <div className="flex items-center">
                               <CalendarIcon size={14} className="mr-1.5" />
                               {new Date(task.dueDate).toLocaleDateString('pt-BR')}
                           </div>
                           <div className="flex items-center">
                               <Clock size={14} className="mr-1.5" />
                               09:00
                           </div>
                      </div>
                  </div>
              </div>
          </div>
      </div>
  )};

  const renderKanbanColumn = (status: 'Pending' | 'Done', title: string) => {
      const columnTasks = tasksMatchingGlobalFilters.filter(t => t.status === status);
      const isDragOver = dragOverColumn === status;

      return (
          <div 
            className={`flex-1 bg-gray-50/50 rounded-xl p-4 border transition-colors ${isDragOver ? 'border-mcsystem-500 bg-blue-50/50' : 'border-gray-200'}`}
            onDragOver={(e) => handleDragOver(e, status)}
            onDrop={(e) => handleDrop(e, status)}
          >
              <div className="flex justify-between items-center mb-4">
                  <h3 className={`font-bold text-sm uppercase tracking-wide ${status === 'Pending' ? 'text-gray-700' : 'text-green-600'}`}>
                      {title}
                  </h3>
                  <span className="bg-white border border-gray-200 text-gray-500 text-xs px-2 py-0.5 rounded-full font-medium shadow-sm">
                      {columnTasks.length}
                  </span>
              </div>
              <div className="space-y-3 min-h-[200px]">
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

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 h-full">
        {/* Main Content (Tasks) */}
        <div className="xl:col-span-3 flex flex-col h-full">
            {/* Header Toolbar */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <div className="flex items-center gap-4">
                    <h2 className="text-xl font-bold text-gray-800">Minhas Tarefas</h2>
                    {/* View Toggle */}
                    <div className="bg-gray-100 p-1 rounded-lg flex text-gray-500">
                        <button onClick={() => setViewMode('LIST')} className={`p-1.5 rounded transition-all ${viewMode === 'LIST' ? 'bg-white text-mcsystem-600 shadow-sm' : 'hover:bg-gray-200'}`} title="Lista">
                            <LayoutList size={18} />
                        </button>
                        <button onClick={() => setViewMode('KANBAN')} className={`p-1.5 rounded transition-all ${viewMode === 'KANBAN' ? 'bg-white text-mcsystem-600 shadow-sm' : 'hover:bg-gray-200'}`} title="Kanban">
                            <LayoutGrid size={18} />
                        </button>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {/* Filter Dropdowns */}
                    <div className="relative group">
                         <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Filter size={14} className="text-gray-400" />
                         </div>
                         <select 
                            value={priorityFilter}
                            onChange={(e) => setPriorityFilter(e.target.value)}
                            className="pl-9 pr-4 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-mcsystem-500 bg-white"
                         >
                             <option value="All">Todas Prioridades</option>
                             <option value="High">Alta</option>
                             <option value="Medium">Média</option>
                             <option value="Low">Baixa</option>
                         </select>
                    </div>

                    {/* FIX: Removed assignee filter as it no longer exists on Task. */}

                    <button 
                        onClick={onNewTask}
                        className="bg-mcsystem-500 text-white px-4 py-2 rounded-md text-sm font-medium flex items-center hover:bg-mcsystem-400 transition-colors shadow-sm ml-2"
                    >
                        <Plus size={16} className="mr-1" /> Nova Tarefa
                    </button>
                </div>
            </div>

            {/* View Content */}
            {viewMode === 'LIST' ? (
                <div className="flex-1 flex flex-col bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                    {/* Tabs */}
                    <div className="flex border-b border-gray-200 px-6 pt-4 space-x-6">
                        {['Pending', 'Done', 'All'].map(f => (
                            <button 
                                key={f}
                                onClick={() => setStatusFilter(f as any)}
                                className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                                    statusFilter === f 
                                    ? 'text-mcsystem-600 border-mcsystem-500' 
                                    : 'text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300'
                                }`}
                            >
                                {f === 'Pending' ? 'Pendentes' : f === 'Done' ? 'Concluídas' : 'Todas'}
                            </button>
                        ))}
                    </div>

                    {/* List Content */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/30">
                        {listFilteredTasks.length > 0 ? (
                            listFilteredTasks.map(renderCard)
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-gray-400">
                                <CheckCircle2 size={48} className="mb-4 opacity-20" />
                                <p>Nenhuma tarefa encontrada.</p>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="flex-1 flex gap-6 overflow-x-auto pb-2">
                    {renderKanbanColumn('Pending', 'A Fazer')}
                    {renderKanbanColumn('Done', 'Concluído')}
                </div>
            )}
        </div>

        {/* Sidebar (AI & Agenda) */}
        <div className="xl:col-span-1 space-y-4 overflow-y-auto pr-1">
            <div className="bg-gradient-to-b from-mcsystem-900 to-mcsystem-800 text-white rounded-xl p-6 shadow-lg">
                <div className="flex items-center mb-4 text-mcsystem-400">
                    <Bot size={24} className="mr-2" />
                    <h3 className="text-lg font-semibold">Smart Assist</h3>
                </div>
                <p className="text-sm text-gray-300 mb-6 leading-relaxed">
                    A IA analisa prazos e prioridades para organizar seu dia.
                </p>

                <div className="bg-white/10 rounded-lg p-4 text-sm text-gray-200 mb-4 min-h-[100px] whitespace-pre-line border border-white/5 shadow-inner">
                    {loadingAi ? (
                        <div className="flex items-center gap-2">
                            <div className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full"></div>
                            Analisando...
                        </div>
                    ) : aiSuggestion || 'Clique abaixo para priorizar suas tarefas.'}
                </div>

                <button 
                    onClick={handlePrioritize}
                    disabled={loadingAi}
                    className="w-full bg-mcsystem-500 hover:bg-mcsystem-400 text-white py-2.5 rounded-lg font-medium transition-colors shadow-lg shadow-mcsystem-900/50"
                >
                    Priorizar Tarefas
                </button>
            </div>
        </div>
    </div>
  );
};