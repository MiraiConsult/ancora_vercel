
import { Task, TaskType } from '../types';

export const MOCK_TASKS: Task[] = [
  { id: 't1', tenant_id: 'default', title: 'Apresentação de Proposta', type: TaskType.MEETING, dueDate: '2023-11-15', priority: 'High', status: 'Pending', relatedTo: 'TechSolutions Ltda' }, 
  { id: 't2', tenant_id: 'default', title: 'Cobrar Fatura em Atraso', type: TaskType.EMAIL, dueDate: '2023-11-10', priority: 'High', status: 'Pending', relatedTo: 'Consultoria Alpha' }, 
  { id: 't3', tenant_id: 'default', title: 'Follow-up Mensal', type: TaskType.CALL, dueDate: '2023-11-12', priority: 'Medium', status: 'Done', relatedTo: 'AgroFarm S.A.' }, 
  { id: 't4', tenant_id: 'default', title: 'Enviar Contrato Revisado', type: TaskType.EMAIL, dueDate: '2023-11-16', priority: 'Medium', status: 'Pending', relatedTo: 'Construtora Horizonte' }, 
];
