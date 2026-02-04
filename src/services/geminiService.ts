import { GoogleGenAI } from '@google/genai';

/**
 * Gemini AI Service
 * Provides AI-powered analysis and insights
 */
const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

export const analyzeBusinessPerformance = async (data: any) => {
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

    const response = await ai.generateText({ prompt });
    return response.text;
  } catch (error) {
    console.error('Error analyzing business performance:', error);
    return 'Erro ao analisar dados. Por favor, tente novamente.';
  }
};

export const generateFinancialInsights = async (financialData: any) => {
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

    const response = await ai.generateText({ prompt });
    return response.text;
  } catch (error) {
    console.error('Error generating financial insights:', error);
    return 'Erro ao gerar insights financeiros. Por favor, tente novamente.';
  }
};

export const analyzeDealPipeline = async (deals: any[]) => {
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

    const response = await ai.generateText({ prompt });
    return response.text;
  } catch (error) {
    console.error('Error analyzing deal pipeline:', error);
    return 'Erro ao analisar pipeline. Por favor, tente novamente.';
  }
};

export const generateTaskPriorities = async (tasks: any[]) => {
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

    const response = await ai.generateText({ prompt });
    return response.text;
  } catch (error) {
    console.error('Error generating task priorities:', error);
    return 'Erro ao priorizar tarefas. Por favor, tente novamente.';
  }
};
