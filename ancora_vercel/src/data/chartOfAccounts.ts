import { ChartOfAccount } from '../types';

export const MOCK_CHART_OF_ACCOUNTS: ChartOfAccount[] = [
  // 1. ENTRADAS
  { id: 'coa_std_1.1.1', tenant_id: 'default', classificationCode: '1', classificationName: 'ENTRADAS', centerCode: '1.1', centerName: 'ENTRADAS OPERACIONAIS', rubricCode: '1.1.1', rubricName: 'DINHEIRO' },
  { id: 'coa_std_1.1.2', tenant_id: 'default', classificationCode: '1', classificationName: 'ENTRADAS', centerCode: '1.1', centerName: 'ENTRADAS OPERACIONAIS', rubricCode: '1.1.2', rubricName: 'PIX/DÉBITO' },
  { id: 'coa_std_1.1.3', tenant_id: 'default', classificationCode: '1', classificationName: 'ENTRADAS', centerCode: '1.1', centerName: 'ENTRADAS OPERACIONAIS', rubricCode: '1.1.3', rubricName: 'BOLETOS' },
  { id: 'coa_std_1.1.4', tenant_id: 'default', classificationCode: '1', classificationName: 'ENTRADAS', centerCode: '1.1', centerName: 'ENTRADAS OPERACIONAIS', rubricCode: '1.1.4', rubricName: 'CARTÃO DE CRÉDITO' },
  { id: 'coa_std_1.1.5', tenant_id: 'default', classificationCode: '1', classificationName: 'ENTRADAS', centerCode: '1.1', centerName: 'ENTRADAS OPERACIONAIS', rubricCode: '1.1.5', rubricName: 'CHEQUE' },
  { id: 'coa_std_1.1.6', tenant_id: 'default', classificationCode: '1', classificationName: 'ENTRADAS', centerCode: '1.1', centerName: 'ENTRADAS OPERACIONAIS', rubricCode: '1.1.6', rubricName: 'OUTRAS ENTRADAS' },
  { id: 'coa_std_1.1.7', tenant_id: 'default', classificationCode: '1', classificationName: 'ENTRADAS', centerCode: '1.1', centerName: 'ENTRADAS OPERACIONAIS', rubricCode: '1.1.7', rubricName: 'DESCONTOS CEDIDOS' },
  { id: 'coa_std_1.1.8', tenant_id: 'default', classificationCode: '1', classificationName: 'ENTRADAS', centerCode: '1.1', centerName: 'ENTRADAS OPERACIONAIS', rubricCode: '1.1.8', rubricName: 'DEVOLUÇÕES' },

  // 2. CUSTO VARIÁVEL
  { id: 'coa_std_2.1.1', tenant_id: 'default', classificationCode: '2', classificationName: 'CUSTO VARIÁVEL', centerCode: '2.1', centerName: 'VARIÁVEIS DE VENDA', rubricCode: '2.1.1', rubricName: 'SIMPLES NACIONAL' },
  { id: 'coa_std_2.1.2', tenant_id: 'default', classificationCode: '2', classificationName: 'CUSTO VARIÁVEL', centerCode: '2.1', centerName: 'VARIÁVEIS DE VENDA', rubricCode: '2.1.2', rubricName: 'COMISSÃO INDIVIDUAL' },
  { id: 'coa_std_2.1.3', tenant_id: 'default', classificationCode: '2', classificationName: 'CUSTO VARIÁVEL', centerCode: '2.1', centerName: 'VARIÁVEIS DE VENDA', rubricCode: '2.1.3', rubricName: 'COMISSÃO EQUIPE' },
  { id: 'coa_std_2.1.4', tenant_id: 'default', classificationCode: '2', classificationName: 'CUSTO VARIÁVEL', centerCode: '2.1', centerName: 'VARIÁVEIS DE VENDA', rubricCode: '2.1.4', rubricName: 'REPASSE PARCEIROS' },
  { id: 'coa_std_2.1.5', tenant_id: 'default', classificationCode: '2', classificationName: 'CUSTO VARIÁVEL', centerCode: '2.1', centerName: 'VARIÁVEIS DE VENDA', rubricCode: '2.1.5', rubricName: 'CUSTAS PROCESSUAIS' },

  // 3. CUSTO FIXO - 3.1 PESSOAL
  { id: 'coa_std_3.1.1', tenant_id: 'default', classificationCode: '3', classificationName: 'CUSTO FIXO', centerCode: '3.1', centerName: 'DESPESAS PESSOAL', rubricCode: '3.1.1', rubricName: 'REMUNERAÇÃO CLT' },
  { id: 'coa_std_3.1.2', tenant_id: 'default', classificationCode: '3', classificationName: 'CUSTO FIXO', centerCode: '3.1', centerName: 'DESPESAS PESSOAL', rubricCode: '3.1.2', rubricName: 'FÉRIAS' },
  { id: 'coa_std_3.1.3', tenant_id: 'default', classificationCode: '3', classificationName: 'CUSTO FIXO', centerCode: '3.1', centerName: 'DESPESAS PESSOAL', rubricCode: '3.1.3', rubricName: '13º SALÁRIO' },
  { id: 'coa_std_3.1.4', tenant_id: 'default', classificationCode: '3', classificationName: 'CUSTO FIXO', centerCode: '3.1', centerName: 'DESPESAS PESSOAL', rubricCode: '3.1.4', rubricName: 'RESCISÕES' },
  { id: 'coa_std_3.1.5', tenant_id: 'default', classificationCode: '3', classificationName: 'CUSTO FIXO', centerCode: '3.1', centerName: 'DESPESAS PESSOAL', rubricCode: '3.1.5', rubricName: 'REMUNERAÇÃO PJ' },
  { id: 'coa_std_3.1.6', tenant_id: 'default', classificationCode: '3', classificationName: 'CUSTO FIXO', centerCode: '3.1', centerName: 'DESPESAS PESSOAL', rubricCode: '3.1.6', rubricName: 'PRÓ-LABORE' },
  { id: 'coa_std_3.1.7', tenant_id: 'default', classificationCode: '3', classificationName: 'CUSTO FIXO', centerCode: '3.1', centerName: 'DESPESAS PESSOAL', rubricCode: '3.1.7', rubricName: 'FGTS' },
  { id: 'coa_std_3.1.8', tenant_id: 'default', classificationCode: '3', classificationName: 'CUSTO FIXO', centerCode: '3.1', centerName: 'DESPESAS PESSOAL', rubricCode: '3.1.8', rubricName: 'TREINAMENTO' },
  { id: 'coa_std_3.1.9', tenant_id: 'default', classificationCode: '3', classificationName: 'CUSTO FIXO', centerCode: '3.1', centerName: 'DESPESAS PESSOAL', rubricCode: '3.1.9', rubricName: 'INSS' },
  { id: 'coa_std_3.1.10', tenant_id: 'default', classificationCode: '3', classificationName: 'CUSTO FIXO', centerCode: '3.1', centerName: 'DESPESAS PESSOAL', rubricCode: '3.1.10', rubricName: 'ESTACIONAMENTO EQUIPE' },
  { id: 'coa_std_3.1.11', tenant_id: 'default', classificationCode: '3', classificationName: 'CUSTO FIXO', centerCode: '3.1', centerName: 'DESPESAS PESSOAL', rubricCode: '3.1.11', rubricName: 'EXAMES ADMISSIONAIS E DEMISSIONAIS' },
  { id: 'coa_std_3.1.12', tenant_id: 'default', classificationCode: '3', classificationName: 'CUSTO FIXO', centerCode: '3.1', centerName: 'DESPESAS PESSOAL', rubricCode: '3.1.12', rubricName: 'BRINDES COLABORADORES' },
  { id: 'coa_std_3.1.13', tenant_id: 'default', classificationCode: '3', classificationName: 'CUSTO FIXO', centerCode: '3.1', centerName: 'DESPESAS PESSOAL', rubricCode: '3.1.13', rubricName: 'OUTROS PESSOAL' },

  // 3.2 VENDAS E MKT
  { id: 'coa_std_3.2.1', tenant_id: 'default', classificationCode: '3', classificationName: 'CUSTO FIXO', centerCode: '3.2', centerName: 'DESPESAS COM VENDAS E MKT', rubricCode: '3.2.1', rubricName: 'AGÊNCIA DE MARKETING' },
  { id: 'coa_std_3.2.2', tenant_id: 'default', classificationCode: '3', classificationName: 'CUSTO FIXO', centerCode: '3.2', centerName: 'DESPESAS COM VENDAS E MKT', rubricCode: '3.2.2', rubricName: 'PROPAGANDA E PUBLICIDADE' },
  { id: 'coa_std_3.2.3', tenant_id: 'default', classificationCode: '3', classificationName: 'CUSTO FIXO', centerCode: '3.2', centerName: 'DESPESAS COM VENDAS E MKT', rubricCode: '3.2.3', rubricName: 'VIAGENS E ESTADIAS' },
  { id: 'coa_std_3.2.4', tenant_id: 'default', classificationCode: '3', classificationName: 'CUSTO FIXO', centerCode: '3.2', centerName: 'DESPESAS COM VENDAS E MKT', rubricCode: '3.2.4', rubricName: 'EVENTOS' },
  { id: 'coa_std_3.2.5', tenant_id: 'default', classificationCode: '3', classificationName: 'CUSTO FIXO', centerCode: '3.2', centerName: 'DESPESAS COM VENDAS E MKT', rubricCode: '3.2.5', rubricName: 'DOAÇÃO' },
  { id: 'coa_std_3.2.6', tenant_id: 'default', classificationCode: '3', classificationName: 'CUSTO FIXO', centerCode: '3.2', centerName: 'DESPESAS COM VENDAS E MKT', rubricCode: '3.2.6', rubricName: 'BRINDES' },
  { id: 'coa_std_3.2.7', tenant_id: 'default', classificationCode: '3', classificationName: 'CUSTO FIXO', centerCode: '3.2', centerName: 'DESPESAS COM VENDAS E MKT', rubricCode: '3.2.7', rubricName: 'PATROCÍNIOS' },
  { id: 'coa_std_3.2.8', tenant_id: 'default', classificationCode: '3', classificationName: 'CUSTO FIXO', centerCode: '3.2', centerName: 'DESPESAS COM VENDAS E MKT', rubricCode: '3.2.8', rubricName: 'OUTRAS MARKETING' },
  
  // 3.3 ADMINISTRATIVAS
  { id: 'coa_std_3.3.1', tenant_id: 'default', classificationCode: '3', classificationName: 'CUSTO FIXO', centerCode: '3.3', centerName: 'DESPESAS ADMINISTRATIVAS', rubricCode: '3.3.1', rubricName: 'MATERIAL DE USO E CONSUMO' },
  { id: 'coa_std_3.3.2', tenant_id: 'default', classificationCode: '3', classificationName: 'CUSTO FIXO', centerCode: '3.3', centerName: 'DESPESAS ADMINISTRATIVAS', rubricCode: '3.3.2', rubricName: 'LIMPEZA E CONSERVAÇÃO' },
  { id: 'coa_std_3.3.3', tenant_id: 'default', classificationCode: '3', classificationName: 'CUSTO FIXO', centerCode: '3.3', centerName: 'DESPESAS ADMINISTRATIVAS', rubricCode: '3.3.3', rubricName: 'MÁQUINAS E EQUIPAMENTOS' },
  { id: 'coa_std_3.3.4', tenant_id: 'default', classificationCode: '3', classificationName: 'CUSTO FIXO', centerCode: '3.3', centerName: 'DESPESAS ADMINISTRATIVAS', rubricCode: '3.3.4', rubricName: 'PROGRAMAS DE SOFTWARE' },
  { id: 'coa_std_3.3.5', tenant_id: 'default', classificationCode: '3', classificationName: 'CUSTO FIXO', centerCode: '3.3', centerName: 'DESPESAS ADMINISTRATIVAS', rubricCode: '3.3.5', rubricName: 'CELULAR E INTERNET' },
  { id: 'coa_std_3.3.6', tenant_id: 'default', classificationCode: '3', classificationName: 'CUSTO FIXO', centerCode: '3.3', centerName: 'DESPESAS ADMINISTRATIVAS', rubricCode: '3.3.6', rubricName: 'INTERNET' },
  { id: 'coa_std_3.3.7', tenant_id: 'default', classificationCode: '3', classificationName: 'CUSTO FIXO', centerCode: '3.3', centerName: 'DESPESAS ADMINISTRATIVAS', rubricCode: '3.3.7', rubricName: 'ALVARÁS E ADMINISTRATIVOS' },
  { id: 'coa_std_3.3.8', tenant_id: 'default', classificationCode: '3', classificationName: 'CUSTO FIXO', centerCode: '3.3', centerName: 'DESPESAS ADMINISTRATIVAS', rubricCode: '3.3.8', rubricName: 'REFEIÇÕES E LANCHES INTERNOS' },
  { id: 'coa_std_3.3.9', tenant_id: 'default', classificationCode: '3', classificationName: 'CUSTO FIXO', centerCode: '3.3', centerName: 'DESPESAS ADMINISTRATIVAS', rubricCode: '3.3.9', rubricName: 'UNIFORMES' },
  { id: 'coa_std_3.3.10', tenant_id: 'default', classificationCode: '3', classificationName: 'CUSTO FIXO', centerCode: '3.3', centerName: 'DESPESAS ADMINISTRATIVAS', rubricCode: '3.3.10', rubricName: 'OAB' },
  { id: 'coa_std_3.3.11', tenant_id: 'default', classificationCode: '3', classificationName: 'CUSTO FIXO', centerCode: '3.3', centerName: 'DESPESAS ADMINISTRATIVAS', rubricCode: '3.3.11', rubricName: 'OUTROS ADM' },
  
  // 3.4 ESTRUTURA
  { id: 'coa_std_3.4.1', tenant_id: 'default', classificationCode: '3', classificationName: 'CUSTO FIXO', centerCode: '3.4', centerName: 'DESPESAS DE ESTRUTURA', rubricCode: '3.4.1', rubricName: 'ALUGUEL' },
  { id: 'coa_std_3.4.2', tenant_id: 'default', classificationCode: '3', classificationName: 'CUSTO FIXO', centerCode: '3.4', centerName: 'DESPESAS DE ESTRUTURA', rubricCode: '3.4.2', rubricName: 'ENERGIA ELÉTRICA' },
  { id: 'coa_std_3.4.3', tenant_id: 'default', classificationCode: '3', classificationName: 'CUSTO FIXO', centerCode: '3.4', centerName: 'DESPESAS DE ESTRUTURA', rubricCode: '3.4.3', rubricName: 'MANUTENÇÃO E REPAROS' },
  { id: 'coa_std_3.4.4', tenant_id: 'default', classificationCode: '3', classificationName: 'CUSTO FIXO', centerCode: '3.4', centerName: 'DESPESAS DE ESTRUTURA', rubricCode: '3.4.4', rubricName: 'IPTU' },
  { id: 'coa_std_3.4.5', tenant_id: 'default', classificationCode: '3', classificationName: 'CUSTO FIXO', centerCode: '3.4', centerName: 'DESPESAS DE ESTRUTURA', rubricCode: '3.4.5', rubricName: 'OUTROS ESTRUTURA' },
  
  // 3.5 SERVIÇOS CONTRATADOS
  { id: 'coa_std_3.5.1', tenant_id: 'default', classificationCode: '3', classificationName: 'CUSTO FIXO', centerCode: '3.5', centerName: 'SERVIÇOS CONTRATADOS', rubricCode: '3.5.1', rubricName: 'SERVIÇOS COM INFORMÁTICA' },
  { id: 'coa_std_3.5.2', tenant_id: 'default', classificationCode: '3', classificationName: 'CUSTO FIXO', centerCode: '3.5', centerName: 'SERVIÇOS CONTRATADOS', rubricCode: '3.5.2', rubricName: 'SERVIÇOS CONTÁBEIS' },
  { id: 'coa_std_3.5.3', tenant_id: 'default', classificationCode: '3', classificationName: 'CUSTO FIXO', centerCode: '3.5', centerName: 'SERVIÇOS CONTRATADOS', rubricCode: '3.5.3', rubricName: 'HONORÁRIOS ADVOCATÍCIOS' },
  { id: 'coa_std_3.5.4', tenant_id: 'default', classificationCode: '3', classificationName: 'CUSTO FIXO', centerCode: '3.5', centerName: 'SERVIÇOS CONTRATADOS', rubricCode: '3.5.4', rubricName: 'CONSULTORIA FINANCEIRA' },
  { id: 'coa_std_3.5.5', tenant_id: 'default', classificationCode: '3', classificationName: 'CUSTO FIXO', centerCode: '3.5', centerName: 'SERVIÇOS CONTRATADOS', rubricCode: '3.5.5', rubricName: 'SERVIÇOS DE LIMPEZA' },
  { id: 'coa_std_3.5.6', tenant_id: 'default', classificationCode: '3', classificationName: 'CUSTO FIXO', centerCode: '3.5', centerName: 'SERVIÇOS CONTRATADOS', rubricCode: '3.5.6', rubricName: 'OUTROS SERVIÇOS CONTRATADOS' },

  // 3.6 BANCÁRIAS
  { id: 'coa_std_3.6.1', tenant_id: 'default', classificationCode: '3', classificationName: 'CUSTO FIXO', centerCode: '3.6', centerName: 'DESPESAS BANCÁRIAS', rubricCode: '3.6.1', rubricName: 'DESPESA BANCÁRIA' },
  { id: 'coa_std_3.6.2', tenant_id: 'default', classificationCode: '3', classificationName: 'CUSTO FIXO', centerCode: '3.6', centerName: 'DESPESAS BANCÁRIAS', rubricCode: '3.6.2', rubricName: 'TRANSFERÊNCIAS ENTRE CONTAS' },
  { id: 'coa_std_3.6.3', tenant_id: 'default', classificationCode: '3', classificationName: 'CUSTO FIXO', centerCode: '3.6', centerName: 'DESPESAS BANCÁRIAS', rubricCode: '3.6.3', rubricName: 'OUTRAS FINANCEIRAS' },
  { id: 'coa_std_3.6.4', tenant_id: 'default', classificationCode: '3', classificationName: 'CUSTO FIXO', centerCode: '3.6', centerName: 'DESPESAS BANCÁRIAS', rubricCode: '3.6.4', rubricName: 'ESTORNO DE CHEQUES' },
  { id: 'coa_std_3.6.5', tenant_id: 'default', classificationCode: '3', classificationName: 'CUSTO FIXO', centerCode: '3.6', centerName: 'DESPESAS BANCÁRIAS', rubricCode: '3.6.5', rubricName: 'OUTROS FINANCEIRO' },

  // 4. DESPESAS NÃO-OPERACIONAIS
  { id: 'coa_std_4.1.1', tenant_id: 'default', classificationCode: '4', classificationName: 'DESPESAS NÃO-OPERACIONAIS', centerCode: '4.1', centerName: 'SOCIETÁRIO', rubricCode: '4.1.1', rubricName: 'DISTRIBUIÇÃO ANDRESSA' },
  { id: 'coa_std_4.2.1', tenant_id: 'default', classificationCode: '4', classificationName: 'DESPESAS NÃO-OPERACIONAIS', centerCode: '4.2', centerName: 'DESPESAS FINANCEIRAS', rubricCode: '4.2.1', rubricName: 'AMORTIZAÇÃO DE RECURSOS' },
  { id: 'coa_std_4.2.2', tenant_id: 'default', classificationCode: '4', classificationName: 'DESPESAS NÃO-OPERACIONAIS', centerCode: '4.2', centerName: 'DESPESAS FINANCEIRAS', rubricCode: '4.2.2', rubricName: 'TOMADA DE RECURSOS' },

  // 5. INVESTIMENTOS
  { id: 'coa_std_5.1.1', tenant_id: 'default', classificationCode: '5', classificationName: 'INVESTIMENTOS', centerCode: '5.1', centerName: 'INVESTIMENTOS', rubricCode: '5.1.1', rubricName: 'INVESTIMENTOS EM ESTRUTURA' },
  { id: 'coa_std_5.1.2', tenant_id: 'default', classificationCode: '5', classificationName: 'INVESTIMENTOS', centerCode: '5.1', centerName: 'INVESTIMENTOS', rubricCode: '5.1.2', rubricName: 'INVESTIMENTOS EM MAQ/EQUIP' },
  { id: 'coa_std_5.1.3', tenant_id: 'default', classificationCode: '5', classificationName: 'INVESTIMENTOS', centerCode: '5.1', centerName: 'INVESTIMENTOS', rubricCode: '5.1.3', rubricName: 'APORTE NOS INVESTIMENTOS' },
  { id: 'coa_std_5.1.4', tenant_id: 'default', classificationCode: '5', classificationName: 'INVESTIMENTOS', centerCode: '5.1', centerName: 'INVESTIMENTOS', rubricCode: '5.1.4', rubricName: 'RESGATE DOS INVESTIMENTOS' },

  // 6. ANDRESSA
  { id: 'coa_std_6.1.1', tenant_id: 'default', classificationCode: '6', classificationName: 'ANDRESSA', centerCode: '6.1', centerName: 'RESIDÊNCIA', rubricCode: '6.1.1', rubricName: 'EMPREGADA' },
  { id: 'coa_std_6.1.2', tenant_id: 'default', classificationCode: '6', classificationName: 'ANDRESSA', centerCode: '6.1', centerName: 'RESIDÊNCIA', rubricCode: '6.1.2', rubricName: 'CONDOMÍNIO' },
  { id: 'coa_std_6.1.3', tenant_id: 'default', classificationCode: '6', classificationName: 'ANDRESSA', centerCode: '6.1', centerName: 'RESIDÊNCIA', rubricCode: '6.1.3', rubricName: 'ALUGUEL' },
  { id: 'coa_std_6.1.4', tenant_id: 'default', classificationCode: '6', classificationName: 'ANDRESSA', centerCode: '6.1', centerName: 'RESIDÊNCIA', rubricCode: '6.1.4', rubricName: 'ENERGIA ELÉTRICA PESSOAL' },
  { id: 'coa_std_6.1.5', tenant_id: 'default', classificationCode: '6', classificationName: 'ANDRESSA', centerCode: '6.1', centerName: 'SAÚDE', rubricCode: '6.1.5', rubricName: 'TERAPIA' },
  { id: 'coa_std_6.1.6', tenant_id: 'default', classificationCode: '6', classificationName: 'ANDRESSA', centerCode: '6.1', centerName: 'SAÚDE', rubricCode: '6.1.6', rubricName: 'PLANO DE SAÚDE' },
  { id: 'coa_std_6.1.7', tenant_id: 'default', classificationCode: '6', classificationName: 'ANDRESSA', centerCode: '6.1', centerName: 'AUTOMÓVEL', rubricCode: '6.1.7', rubricName: 'GASOLINA' },
  { id: 'coa_std_6.1.8', tenant_id: 'default', classificationCode: '6', classificationName: 'ANDRESSA', centerCode: '6.1', centerName: 'AUTOMÓVEL', rubricCode: '6.1.8', rubricName: 'ESTACIONAMENTO' },
  { id: 'coa_std_6.1.9', tenant_id: 'default', classificationCode: '6', classificationName: 'ANDRESSA', centerCode: '6.1', centerName: 'AUTOMÓVEL', rubricCode: '6.1.9', rubricName: 'PEDÁGIO' },
  { id: 'coa_std_6.1.10', tenant_id: 'default', classificationCode: '6', classificationName: 'ANDRESSA', centerCode: '6.1', centerName: 'AUTOMÓVEL', rubricCode: '6.1.10', rubricName: 'UBER' },
  { id: 'coa_std_6.1.11', tenant_id: 'default', classificationCode: '6', classificationName: 'ANDRESSA', centerCode: '6.1', centerName: 'AUTOMÓVEL', rubricCode: '6.1.11', rubricName: 'MULTA' },
  { id: 'coa_std_6.1.12', tenant_id: 'default', classificationCode: '6', classificationName: 'ANDRESSA', centerCode: '6.1', centerName: 'AUTOMÓVEL', rubricCode: '6.1.12', rubricName: 'IPVA' },
  { id: 'coa_std_6.1.13', tenant_id: 'default', classificationCode: '6', classificationName: 'ANDRESSA', centerCode: '6.1', centerName: 'AUTOMÓVEL', rubricCode: '6.1.13', rubricName: 'SEGURO CARRO' },
  { id: 'coa_std_6.1.14', tenant_id: 'default', classificationCode: '6', classificationName: 'ANDRESSA', centerCode: '6.1', centerName: 'ALIMENTAÇÃO', rubricCode: '6.1.14', rubricName: 'SUPERMERCADO' },
  { id: 'coa_std_6.1.15', tenant_id: 'default', classificationCode: '6', classificationName: 'ANDRESSA', centerCode: '6.1', centerName: 'ALIMENTAÇÃO', rubricCode: '6.1.15', rubricName: 'RESTAURANTES' },
  { id: 'coa_std_6.1.16', tenant_id: 'default', classificationCode: '6', classificationName: 'ANDRESSA', centerCode: '6.1', centerName: 'ESPORTES', rubricCode: '6.1.16', rubricName: 'ACADEMIA' },
  { id: 'coa_std_6.1.17', tenant_id: 'default', classificationCode: '6', classificationName: 'ANDRESSA', centerCode: '6.1', centerName: 'PESSOAIS', rubricCode: '6.1.17', rubricName: 'SALÃO' },
  { id: 'coa_std_6.1.18', tenant_id: 'default', classificationCode: '6', classificationName: 'ANDRESSA', centerCode: '6.1', centerName: 'PESSOAIS', rubricCode: '6.1.18', rubricName: 'COMPRAS PESSOAIS' },
  { id: 'coa_std_6.1.19', tenant_id: 'default', classificationCode: '6', classificationName: 'ANDRESSA', centerCode: '6.1', centerName: 'PESSOAIS', rubricCode: '6.1.19', rubricName: 'PRESENTES' },
  { id: 'coa_std_6.1.20', tenant_id: 'default', classificationCode: '6', classificationName: 'ANDRESSA', centerCode: '6.1', centerName: 'PESSOAIS', rubricCode: '6.1.20', rubricName: 'CACHORRO' },
  { id: 'coa_std_6.1.21', tenant_id: 'default', classificationCode: '6', classificationName: 'ANDRESSA', centerCode: '6.1', centerName: 'PESSOAIS', rubricCode: '6.1.21', rubricName: 'FARMÁCIA' },
  { id: 'coa_std_6.1.22', tenant_id: 'default', classificationCode: '6', classificationName: 'ANDRESSA', centerCode: '6.1', centerName: 'PESSOAIS', rubricCode: '6.1.22', rubricName: 'OUTRAS PESSOAIS' },
  { id: 'coa_std_6.1.23', tenant_id: 'default', classificationCode: '6', classificationName: 'ANDRESSA', centerCode: '6.1', centerName: 'INVESTIMENTOS', rubricCode: '6.1.23', rubricName: 'VIAGEM' },
  { id: 'coa_std_6.1.24', tenant_id: 'default', classificationCode: '6', classificationName: 'ANDRESSA', centerCode: '6.1', centerName: 'INVESTIMENTOS', rubricCode: '6.1.24', rubricName: 'CONSÓRCIO' },
  { id: 'coa_std_6.1.25', tenant_id: 'default', classificationCode: '6', classificationName: 'ANDRESSA', centerCode: '6.1', centerName: 'INVESTIMENTOS', rubricCode: '6.1.25', rubricName: 'APORTE INVESTIMENTOS PESSOAIS' },
];
