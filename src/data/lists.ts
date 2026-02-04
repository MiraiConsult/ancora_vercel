import { ListItem, DealStage, TaskType, DealStageConfig } from '../types';

export const MOCK_SEGMENTS: ListItem[] = [
    { id: 'sg1', tenant_id: 'default', name: 'Small' },
    { id: 'sg2', tenant_id: 'default', name: 'Middle' },
    { id: 'sg3', tenant_id: 'default', name: 'Enterprise' },
    { id: 'sg4', tenant_id: 'default', name: 'Governo' }
];

export const MOCK_DEAL_STAGES: DealStageConfig[] = [
  { id: 'ds1', tenant_id: 'default', name: DealStage.PROSPECTING, order: 1, is_fixed: false, is_visible: true },
  { id: 'ds2', tenant_id: 'default', name: DealStage.QUALIFICATION, order: 2, is_fixed: false, is_visible: true },
  { id: 'ds3', tenant_id: 'default', name: DealStage.PROPOSAL, order: 3, is_fixed: false, is_visible: true },
  { id: 'ds4', tenant_id: 'default', name: DealStage.NEGOTIATION, order: 4, is_fixed: false, is_visible: true },
  { id: 'ds5', tenant_id: 'default', name: DealStage.CLOSED_WON, order: 5, is_fixed: true, is_visible: true },
  { id: 'ds6', tenant_id: 'default', name: DealStage.CLOSED_LOST, order: 6, is_fixed: true, is_visible: false }, // Oculto por padrão
];

export const MOCK_TASK_TYPES: ListItem[] = Object.values(TaskType).map((type, index) => ({
    id: `tt${index + 1}`,
    tenant_id: 'default',
    name: type,
}));
