import { Contact } from '../types';

export const MOCK_CONTACTS: Contact[] = [
  { id: 'c1', tenant_id: 'default', name: 'Roberto Almeida', role: 'CEO', email: 'roberto@techsolutions.com.br', phone: '(11) 99999-1111', companyId: '1' },
  { id: 'c2', tenant_id: 'default', name: 'Fernanda Costa', role: 'Gerente Financeiro', email: 'fernanda@horizonte.com.br', phone: '(21) 98888-2222', companyId: '2' },
  { id: 'c3', tenant_id: 'default', name: 'João Silva', role: 'Comprador', email: 'joao@varejoexpress.com.br', phone: '(41) 97777-3333', companyId: '3' },
];