import { GoogleGenAI } from '@google/genai';

/**
 * Gemini AI Service
 * Provides AI-powered analysis and insights
 */

// Get API key from environment variables
const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || '';
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

export const analyzeBusinessPerformance = async (data: any): Promise<string> => {
  if (!ai) {
    return "Funcionalidade de IA não configurada. Configure a variável VITE_GEMINI_API_KEY para ativar.";
  }

  try {
    const prompt = `Analise os seguintes dados de desempenho de negócios e forneça insights acionáveis:
    
${JSON.stringify(data, null, 2)}

Por favor, forneça:
1. Principais tendências identificadas
2. Áreas de preocupação
3. Oportunidades de melhoria
4. Recomendações específicas`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    
    return response.text || 'Nenhuma resposta gerada.';
  } catch (error) {
    console.error('Error analyzing business performance:', error);
    return 'Erro ao analisar dados. Por favor, tente novamente.';
  }
};

export const generateFinancialInsights = async (financialData: any): Promise<string> => {
  if (!ai) {
    return "Funcionalidade de IA não configurada. Configure a variável VITE_GEMINI_API_KEY para ativar.";
  }

  try {
    const prompt = `Analise os seguintes dados financeiros e forneça insights detalhados:
    
${JSON.stringify(financialData, null, 2)}

Por favor, forneça:
1. Análise de fluxo de caixa
2. Tendências de receita e despesas
3. Indicadores de saúde financeira
4. Recomendações para otimização financeira`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    
    return response.text || 'Nenhuma resposta gerada.';
  } catch (error) {
    console.error('Error generating financial insights:', error);
    return 'Erro ao gerar insights financeiros. Por favor, tente novamente.';
  }
};

export const analyzeDealPipeline = async (deals: any[]): Promise<string> => {
  if (!ai) {
    return "Funcionalidade de IA não configurada. Configure a variável VITE_GEMINI_API_KEY para ativar.";
  }

  try {
    const prompt = `Analise o seguinte pipeline de negócios e forneça recomendações:
    
${JSON.stringify(deals, null, 2)}

Por favor, forneça:
1. Análise de conversão por estágio
2. Negócios em risco
3. Oportunidades prioritárias
4. Estratégias para acelerar fechamentos`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    
    return response.text || 'Nenhuma resposta gerada.';
  } catch (error) {
    console.error('Error analyzing deal pipeline:', error);
    return 'Erro ao analisar pipeline. Por favor, tente novamente.';
  }
};

export const generateTaskPriorities = async (tasks: any[]): Promise<string> => {
  if (!ai) {
    return "Funcionalidade de IA não configurada. Configure a variável VITE_GEMINI_API_KEY para ativar.";
  }

  try {
    const prompt = `Analise as seguintes tarefas e sugira priorização:
    
${JSON.stringify(tasks, null, 2)}

Por favor, forneça:
1. Tarefas críticas que precisam de atenção imediata
2. Tarefas que podem ser delegadas
3. Tarefas que podem ser adiadas
4. Sugestões de otimização de tempo`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    
    return response.text || 'Nenhuma resposta gerada.';
  } catch (error) {
    console.error('Error generating task priorities:', error);
    return 'Erro ao priorizar tarefas. Por favor, tente novamente.';
  }
};

// Alias for compatibility with FinanceDashboard
export const generateFinancialInsight = generateFinancialInsights;

// Function for KanbanBoard - accepts deal and company name
export const analyzeDealRisks = async (deal: any, companyName?: string): Promise<string> => {
  if (!ai) {
    return "Funcionalidade de IA não configurada. Configure a variável VITE_GEMINI_API_KEY para ativar.";
  }

  try {
    const prompt = `Analise o seguinte negócio e identifique riscos potenciais:

Cliente: ${companyName || 'Não informado'}
Dados do Negócio:
${JSON.stringify(deal, null, 2)}

Por favor, forneça:
1. Riscos identificados
2. Probabilidade de fechamento
3. Ações recomendadas para mitigar riscos
4. Próximos passos sugeridos`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    
    return response.text || 'Nenhuma resposta gerada.';
  } catch (error) {
    console.error('Error analyzing deal risks:', error);
    return 'Erro ao analisar riscos. Por favor, tente novamente.';
  }
};

// Function for TasksModule
export const prioritizeTasksAI = async (tasks: any[]): Promise<string> => {
  // Alias to generateTaskPriorities
  return generateTaskPriorities(tasks);
};
