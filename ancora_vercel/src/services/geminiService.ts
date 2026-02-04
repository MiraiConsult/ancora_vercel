

import { GoogleGenAI } from "@google/genai";
import { Deal, FinancialRecord, Task } from "../types";

// @google/genai: Initialize the GoogleGenAI client with the API key from environment variables.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const analyzeDealRisks = async (deal: Deal, companyName: string): Promise<string> => {
  // @google/genai: Removed redundant API key check as it's handled by the client initialization.

  try {
    // Format history for the prompt
    const historyText = deal.history && deal.history.length > 0 
      ? deal.history.map(h => `- [${h.date.split('T')[0]} - ${h.type}]: ${h.description}`).join('\n')
      : "Nenhuma interação registrada.";

    const prompt = `
      Atue como um especialista em vendas B2B e CRM. Analise a seguinte oportunidade de negócio de forma holística:
      
      DADOS DO NEGÓCIO:
      Cliente: ${companyName}
      Valor: R$ ${deal.value}
      Estágio Atual: ${deal.stage}
      Probabilidade: ${deal.probability}%
      Temperatura Atual: ${deal.temperature}
      
      HISTÓRICO DE INTERAÇÕES (Cronológico):
      ${historyText}
      
      TAREFA:
      1. Analise o engajamento do cliente com base no histórico.
      2. Identifique riscos ocultos que não estão óbvios nos dados numéricos.
      3. Sugira o PRÓXIMO PASSO concreto para avançar o deal.
      
      Responda em tópicos curtos e diretos. Máximo 5 linhas.
    `;

    const response = await ai.models.generateContent({
      // @google/genai: Updated model to gemini-3-flash-preview as per standard text task guidelines.
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });

    // @google/genai: Use the .text property to get the text from the response.
    return response.text || "Não foi possível gerar análise.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Erro ao conectar com a IA.";
  }
};

export const generateFinancialInsight = async (records: FinancialRecord[]): Promise<string> => {
  // @google/genai: Removed redundant API key check.

  try {
    const summary = records.slice(0, 15).map(r => 
      `${r.description}: R$${r.amount} (${r.type}) - ${r.status} - Cat: ${r.category}`
    ).join('\n');

    const prompt = `
      Atue como um CFO (Diretor Financeiro). Analise este registros financeiros recentes (DRE e Fluxo de Caixa):
      ${summary}
      
      Identifique 2 pontos críticos (positivos ou negativos) sobre a saúde financeira da empresa e sugira 1 ação corretiva ou de investimento. Seja direto.
    `;

    const response = await ai.models.generateContent({
      // @google/genai: Updated model to gemini-3-flash-preview for reasoning-based text tasks.
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });

    // @google/genai: Use the .text property to get the text from the response.
    return response.text || "Análise indisponível.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Erro na análise financeira.";
  }
};

export const prioritizeTasksAI = async (tasks: Task[]): Promise<string> => {
    // @google/genai: Removed redundant API key check.
  
    try {
      const taskList = tasks.filter(t => t.status === 'Pending').map(t => 
        `- ${t.title} (${t.type}) para ${t.relatedTo}. Vence: ${t.dueDate}. Prioridade Atual: ${t.priority}`
      ).join('\n');
  
      const prompt = `
        Você é um assistente executivo de alta performance. Tenho as seguintes tarefas pendentes:
        ${taskList}
        
        Sugira uma ordem de execução para maximizar produtividade e resultados comerciais. Explique brevemente o porquê da primeira tarefa escolhida.
      `;
  
      const response = await ai.models.generateContent({
        // @google/genai: Updated model to gemini-3-flash-preview for task prioritization logic.
        model: 'gemini-3-flash-preview',
        contents: prompt,
      });
  
      // @google/genai: Use the .text property to get the text from the response.
      return response.text || "Não foi possível priorizar.";
    } catch (error) {
      console.error("Gemini Error:", error);
      return "Erro na priorização.";
    }
  };