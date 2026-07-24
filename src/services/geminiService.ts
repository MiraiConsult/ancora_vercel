import { GoogleGenAI } from '@google/genai';

/**
 * Gemini AI Service
 * Provides AI-powered financial analysis and insights
 */

// Get API key from environment variables
const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || '';
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

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

// Alias for compatibility with FinanceDashboard
export const generateFinancialInsight = generateFinancialInsights;
