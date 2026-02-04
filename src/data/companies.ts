import { Company } from '../types';

export const MOCK_COMPANIES: Company[] = [
  { id: '1', tenant_id: 'default', name: 'TechSolutions Ltda', cnpj: '12.345.678/0001-90', segment: 'Tecnologia', status: 'Active', location: 'São Paulo, SP' },
  { id: '2', tenant_id: 'default', name: 'Construtora Horizonte', cnpj: '98.765.432/0001-10', segment: 'Construção', status: 'Active', location: 'Rio de Janeiro, RJ' },
  { id: '3', tenant_id: 'default', name: 'Varejo Express', cnpj: '45.123.789/0001-22', segment: 'Varejo', status: 'Prospect', location: 'Curitiba, PR' },
  { id: '4', tenant_id: 'default', name: 'AgroFarm S.A.', cnpj: '11.222.333/0001-44', segment: 'Agronegócio', status: 'Active', location: 'Goiânia, GO' },
  { id: '5', tenant_id: 'default', name: 'Consultoria Alpha', cnpj: '55.666.777/0001-88', segment: 'Serviços', status: 'Churned', location: 'Belo Horizonte, MG' },
];