// Configurações específicas do sistema.

// Asaas é exclusivo de UM tenant (conta única). Somente este tenant vê o módulo
// Cobranças e pode chamar as funções do Asaas. As Edge Functions aplicam o mesmo
// guard no backend (secret ASAAS_TENANT_ID), então isto é apenas UX.
export const ASAAS_ENABLED_TENANT_ID = '12342e47-5baf-4db4-a99d-e26fd1ede8ce';

export const isAsaasEnabled = (tenantId?: string | null): boolean =>
  !!tenantId && tenantId === ASAAS_ENABLED_TENANT_ID;
