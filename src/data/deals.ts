
import { Deal, DealStage } from '../types';

export const MOCK_DEALS: Deal[] = [
  { 
    id: '101', 
    tenant_id: 'default',
    title: 'Consultoria Tributária Anual', 
    value: 15000, 
    stage: DealStage.PROPOSAL, 
    companyId: '1', 
    contactId: 'c1',
    probability: 60, 
    lastActivity: '2023-10-25', 
    temperature: 'Warm',
    products: ['Consultoria Tributária', 'Revisão Fiscal'],
    description: 'Cliente busca reduzir carga tributária para o próximo ano fiscal.',
    history: [
      { id: 'h1', type: 'Meeting', date: '2023-10-20', description: 'Reunião inicial de levantamento de necessidades.', author: 'Sistema' },
      { id: 'h2', type: 'Email', date: '2023-10-22', description: 'Envio de proposta comercial v1.', author: 'Sistema' }
    ]
  },
  { 
    id: '102', 
    tenant_id: 'default',
    title: 'Implementação ERP', 
    value: 45000, 
    stage: DealStage.NEGOTIATION, 
    companyId: '2', 
    contactId: 'c2',
    probability: 80, 
    lastActivity: '2023-10-26', 
    temperature: 'Hot',
    products: ['Licença ERP', 'Implantação', 'Treinamento'],
    description: 'Migração do sistema legado para o nosso ERP.',
    history: [
      { id: 'h3', type: 'Call', date: '2023-09-15', description: 'Contato inicial via indicação.', author: 'Sistema' },
      { id: 'h4', type: 'Meeting', date: '2023-10-01', description: 'Demo do sistema para diretoria.', author: 'Sistema' },
      { id: 'h5', type: 'Note', date: '2023-10-26', description: 'Cliente pediu desconto de 5% para fechar.', author: 'Sistema' }
    ]
  },
  { 
    id: '103', 
    tenant_id: 'default',
    title: 'Treinamento de Equipe', 
    value: 5000, 
    stage: DealStage.PROSPECTING, 
    companyId: '3', 
    contactId: 'c3',
    probability: 20, 
    lastActivity: '2023-09-20', 
    temperature: 'Cold',
    products: ['Workshop Fiscal'],
    history: []
  },
  { 
    id: '104', 
    tenant_id: 'default',
    title: 'Auditoria Fiscal', 
    value: 22000, 
    stage: DealStage.QUALIFICATION, 
    companyId: '1', 
    contactId: 'c1',
    probability: 40, 
    lastActivity: '2023-10-24', 
    temperature: 'Warm',
    products: ['Auditoria'],
    history: [
      { id: 'h6', type: 'Email', date: '2023-10-24', description: 'Solicitação de documentos preliminares.', author: 'Sistema' }
    ]
  },
  { 
    id: '105', 
    tenant_id: 'default',
    title: 'Planejamento 2024', 
    value: 12000, 
    stage: DealStage.CLOSED_WON, 
    companyId: '2', 
    contactId: 'c2',
    probability: 100, 
    lastActivity: '2023-10-15', 
    temperature: 'Hot',
    products: ['Planejamento Estratégico'],
    history: [
      { id: 'h7', type: 'System', date: '2023-10-15', description: 'Negociação marcada como Ganha.', author: 'Sistema' }
    ]
  },
  { 
    id: '106', 
    tenant_id: 'default',
    title: 'Gestão de Passivos', 
    value: 85000, 
    stage: DealStage.PROPOSAL, 
    companyId: '4', 
    probability: 50, 
    lastActivity: '2023-10-28', 
    temperature: 'Hot',
    products: ['Gestão de Passivos', 'Jurídico'],
    history: [
      { id: 'h8', type: 'Call', date: '2023-10-28', description: 'Cliente demonstrou urgência.', author: 'Sistema' }
    ]
  },
];
