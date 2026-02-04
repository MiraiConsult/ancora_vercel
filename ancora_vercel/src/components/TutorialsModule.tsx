

import React, { useState } from 'react';
import { BookOpen, BarChart3, DollarSign, Users, Calendar, HelpCircle, ArrowRight, ArrowLeft, Send } from 'lucide-react';

interface TutorialsModuleProps {
  onNavigate: (page: string) => void;
}

const tutorials = [
  {
    id: 'create-deal',
    title: "Criando seu Primeiro Negócio",
    description: "Aprenda a adicionar uma nova oportunidade no seu funil de vendas.",
    icon: BarChart3,
    module: 'deals',
    steps: [
      {
        title: "Passo 1: Acesse o Pipeline de Vendas",
        content: "No menu lateral à esquerda, clique no ícone 'Negociações'. Isso abrirá seu funil de vendas, onde você pode visualizar todas as suas oportunidades em andamento.",
      },
      {
        title: "Passo 2: Inicie um Novo Negócio",
        content: "No canto superior direito da tela do pipeline, você encontrará o botão azul '+ Novo Negócio'. Clique nele para abrir o formulário de criação de uma nova oportunidade.",
      },
      {
        title: "Passo 3: Preencha os Dados Essenciais",
        content: "Preencha as informações principais do negócio, como o Título, o Cliente associado e o Valor estimado da venda. Quanto mais detalhes, melhor para sua gestão.",
      },
      {
        title: "Passo 4: Salve e Visualize",
        content: "Após preencher os dados, clique em 'Salvar'. Sua nova oportunidade aparecerá como um card na primeira coluna do pipeline, 'Prospecção', pronta para ser trabalhada!",
      }
    ]
  },
  {
    id: 'register-expense',
    title: "Registrando uma Despesa",
    description: "Mantenha seu financeiro em dia registrando todas as saídas.",
    icon: DollarSign,
    module: 'finance',
    steps: [
      {
        title: "Passo 1: Vá para a Gestão Financeira",
        content: "No menu lateral, clique em 'Gestão Financeira'. Você terá acesso ao painel principal com a visão geral das suas finanças.",
      },
      {
        title: "Passo 2: Acesse a Conciliação",
        content: "Dentro do módulo financeiro, clique na aba 'Conciliação'. Esta é a área onde você gerencia todos os seus lançamentos, tanto receitas quanto despesas.",
      },
      {
        title: "Passo 3: Crie um Novo Lançamento",
        content: "Clique no botão azul '+ Novo Lançamento' no canto superior direito. Um formulário completo será aberto para detalhar sua transação.",
      },
      {
        title: "Passo 4: Detalhe a Despesa",
        content: "Selecione o tipo 'Despesa', preencha a descrição, o valor, a data de vencimento e, o mais importante, selecione a 'Rubrica' (Plano de Contas) correta para categorizar seu gasto.",
      }
    ]
  },
   {
    id: 'create-client',
    title: "Cadastrando um Novo Cliente",
    description: "Aprenda a adicionar uma nova empresa à sua carteira de clientes.",
    icon: Users,
    module: 'companies',
    steps: [
       {
        title: "Passo 1: Acesse a Carteira de Clientes",
        content: "No menu lateral, clique em 'Clientes' para ver a lista de todas as empresas cadastradas no seu sistema.",
      },
      {
        title: "Passo 2: Clique em 'Novo Cliente'",
        content: "No canto superior direito da tela, clique no botão azul '+ Novo Cliente' para abrir o formulário de cadastro.",
      },
      {
        title: "Passo 3: Preencha os Dados",
        content: "Informe os dados principais da empresa, como Nome, CNPJ, Setor e Segmento. Clique em 'Salvar' para adicionar o cliente à sua carteira.",
      }
    ]
  }
];

export const TutorialsModule: React.FC<TutorialsModuleProps> = ({ onNavigate }) => {
  const [selectedTutorial, setSelectedTutorial] = useState(tutorials[0]);
  const [currentStep, setCurrentStep] = useState(0);

  const handleSelectTutorial = (tutorial: typeof tutorials[0]) => {
    setSelectedTutorial(tutorial);
    setCurrentStep(0);
  };

  const progress = ((currentStep + 1) / selectedTutorial.steps.length) * 100;
  const isLastStep = currentStep === selectedTutorial.steps.length - 1;

  return (
    <div className="flex flex-col md:flex-row gap-8 h-full max-h-[calc(100vh-150px)]">
      {/* Left Pane: Tutorial List */}
      <div className="w-full md:w-1/3 bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col">
        <div className="flex items-center gap-4 mb-6 pb-6 border-b border-gray-100">
            <div className="bg-mcsystem-100 p-3 rounded-xl text-mcsystem-500">
                <HelpCircle size={28} />
            </div>
            <div>
                <h2 className="text-xl font-bold text-mcsystem-900">Central de Ajuda</h2>
                <p className="text-sm text-gray-500">Guias passo a passo.</p>
            </div>
        </div>
        <div className="space-y-3 overflow-y-auto pr-2 -mr-2">
          {tutorials.map((tutorial) => {
            const Icon = tutorial.icon;
            const isActive = selectedTutorial.id === tutorial.id;
            return (
              <button
                key={tutorial.id}
                onClick={() => handleSelectTutorial(tutorial)}
                className={`w-full text-left p-4 rounded-xl transition-all duration-300 flex items-start gap-4 border
                  ${isActive 
                      ? 'bg-mcsystem-50 border-mcsystem-200 shadow-md' 
                      : 'bg-transparent border-transparent hover:bg-gray-50 hover:border-gray-100'
                  }`
                }
              >
                <div className={`mt-1 p-2 rounded-lg transition-colors ${isActive ? 'bg-mcsystem-500 text-white' : 'bg-gray-100 text-mcsystem-500'}`}>
                  <Icon size={20} />
                </div>
                <div>
                  <h3 className={`font-bold transition-colors ${isActive ? 'text-mcsystem-800' : 'text-gray-800'}`}>{tutorial.title}</h3>
                  <p className="text-xs text-gray-500 mt-1">{tutorial.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right Pane: Step-by-step Guide */}
      <div className="flex-1 bg-white p-8 rounded-2xl shadow-sm border border-gray-100 flex flex-col animate-in fade-in duration-500">
          {/* Progress Bar */}
          <div className="mb-6 flex-shrink-0">
            <div className="flex justify-between text-xs font-bold text-gray-500 mb-1">
              <span>{selectedTutorial.title}</span>
              <span>Passo {currentStep + 1} de {selectedTutorial.steps.length}</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div className="bg-mcsystem-500 h-2 rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
            </div>
          </div>

          {/* Text Content */}
          <div className="flex-1 overflow-y-auto -mr-6 pr-6 py-4">
              <h3 className="text-3xl font-bold text-mcsystem-900">{selectedTutorial.steps[currentStep].title}</h3>
              <p className="text-gray-700 mt-4 leading-relaxed text-base">{selectedTutorial.steps[currentStep].content}</p>
          </div>

          {/* Navigation */}
          <div className="mt-auto flex justify-between items-center pt-6 border-t border-gray-100 flex-shrink-0">
            <button
              onClick={() => setCurrentStep(currentStep - 1)}
              disabled={currentStep === 0}
              className="px-6 py-3 rounded-lg text-gray-600 font-bold hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:hover:bg-transparent flex items-center"
            >
              <ArrowLeft size={16} className="mr-2"/> Anterior
            </button>

            {isLastStep ? (
              <button
                onClick={() => onNavigate(selectedTutorial.module)}
                className="px-6 py-3 rounded-lg bg-mcsystem-500 text-white font-bold hover:bg-mcsystem-400 shadow-lg shadow-mcsystem-500/30 transition-all transform hover:scale-105 flex items-center"
              >
                Ir para o Módulo <Send size={16} className="ml-2"/>
              </button>
            ) : (
              <button
                onClick={() => setCurrentStep(currentStep + 1)}
                className="px-6 py-3 rounded-lg bg-mcsystem-900 text-white font-bold hover:bg-mcsystem-800 shadow-lg shadow-mcsystem-900/20 transition-all flex items-center"
              >
                Próximo <ArrowRight size={16} className="ml-2"/>
              </button>
            )}
          </div>
        </div>
    </div>
  );
};