import React, { useState, useEffect } from 'react';
import { ArrowRight, CheckCircle2, XCircle, BarChart3, Calculator, Shield, FolderKanban, TrendingUp, KeyRound, AlertCircle, Clock, Zap, ShieldX, Target, Users, FileSpreadsheet, PlayCircle, Users2, Headphones, Calendar, Cpu, Award, Briefcase, Mail, Smartphone, MessageCircle, X, Loader2 } from 'lucide-react';

// Modal de Formulário de Contato para Mentoria
const ContactModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const [formData, setFormData] = useState({
    nome: '',
    empresa: '',
    email: '',
    telefone: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus('idle');

    try {
      const response = await fetch('https://diegokek.app.n8n.cloud/webhook/ancora', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          nome: formData.nome,
          empresa: formData.empresa,
          email: formData.email,
          telefone: formData.telefone,
          origem: 'Landing Page Ancóra - Mentoria',
          data: new Date().toISOString()
        }),
      });

      if (response.ok) {
        setSubmitStatus('success');
        setFormData({ nome: '', empresa: '', email: '', telefone: '' });
        setTimeout(() => {
          onClose();
          setSubmitStatus('idle');
        }, 2000);
      } else {
        setSubmitStatus('error');
      }
    } catch (error) {
      setSubmitStatus('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-[#111111] border border-white/10 rounded-3xl p-8 w-full max-w-md shadow-2xl">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
        >
          <X className="w-6 h-6" />
        </button>

        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">⚓</span>
          </div>
          <h3 className="text-2xl font-bold text-white">Quero a Mentoria Ancóra</h3>
          <p className="text-gray-400 mt-2">Preencha seus dados e entraremos em contato</p>
        </div>

        {submitStatus === 'success' ? (
          <div className="text-center py-8">
            <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
            <h4 className="text-xl font-bold text-white">Enviado com sucesso!</h4>
            <p className="text-gray-400 mt-2">Em breve entraremos em contato.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Seu Nome *</label>
              <input
                type="text"
                required
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="Digite seu nome completo"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Nome da Empresa *</label>
              <input
                type="text"
                required
                value={formData.empresa}
                onChange={(e) => setFormData({ ...formData, empresa: e.target.value })}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="Digite o nome da sua empresa"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">E-mail *</label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="seu@email.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Telefone *</label>
              <input
                type="tel"
                required
                value={formData.telefone}
                onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="(11) 99999-9999"
              />
            </div>

            {submitStatus === 'error' && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center">
                <p className="text-red-400 text-sm">Erro ao enviar. Tente novamente.</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white py-4 rounded-xl font-bold text-lg flex items-center justify-center transition-all mt-6"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  Quero minha Mentoria
                  <ArrowRight className="ml-2 w-5 h-5" />
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

interface LandingPageProps {
  onLoginClick: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onLoginClick }) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const problems = [
    {
      icon: <AlertCircle className="w-8 h-8 text-orange-500" />,
      title: "Falta de Controle Real",
      description: "Você olha o saldo e não sabe de onde veio ou para onde vai, sem um DRE ou Fluxo de Caixa claro."
    },
    {
      icon: <Clock className="w-8 h-8 text-blue-500" />,
      title: "Trabalha Muito, Lucra Pouco",
      description: "O faturamento acontece, mas o lucro é baixo. Você não conhece sua margem real ou ponto de equilíbrio."
    },
    {
      icon: <Zap className="w-8 h-8 text-yellow-500" />,
      title: "Caixa no Limite",
      description: "Vive 'apagando incêndios' sem uma projeção de fluxo de caixa para antecipar as contas a pagar e receber."
    },
    {
      icon: <ShieldX className="w-8 h-8 text-red-500" />,
      title: "Dependência do Dono",
      description: "A empresa para sem você, pois só você 'sente' os números. Eles não estão organizados em processos."
    }
  ];

  const ancoraPillars = [
    {
      icon: <BarChart3 className="w-8 h-8 text-blue-400" />,
      letter: "A",
      title: "Análise",
      description: "Transforme números soltos em inteligência de negócio. Entenda o que realmente está acontecendo com sua empresa.",
    },
    {
      icon: <Calculator className="w-8 h-8 text-emerald-400" />,
      letter: "N",
      title: "Números",
      description: "Registre todas as entradas e saídas com precisão. Sem achismo. Sem lacunas. Dados confiáveis.",
    },
    {
      icon: <Shield className="w-8 h-8 text-indigo-400" />,
      letter: "C",
      title: "Controle",
      description: "Tenha domínio total do fluxo de caixa. Saiba exatamente para onde o dinheiro vai — e por quê.",
    },
    {
      icon: <FolderKanban className="w-8 h-8 text-cyan-400" />,
      letter: "Ò",
      title: "Organização",
      description: "Estruture contas, categorias e processos financeiros. Crie um sistema claro, funcional e delegável.",
    },
    {
      icon: <TrendingUp className="w-8 h-8 text-orange-400" />,
      letter: "R",
      title: "Resultado",
      description: "Acompanhe indicadores, margens e desempenho. Decida com base em fatos, não em sensação.",
    },
    {
      icon: <KeyRound className="w-8 h-8 text-pink-400" />,
      letter: "A",
      title: "Autonomia",
      description: "Com clareza e controle, você deixa de apagar incêndios e passa a comandar o financeiro com confiança.",
    }
  ];

  const whyItWorks = [
    "É prático, não teórico",
    "Cria um sistema financeiro vivo",
    "Funciona para empresas pequenas e médias",
    "Gera previsibilidade e lucro",
    "Devolve o controle ao dono do negócio",
  ];

  const deliverables = [
    { icon: <PlayCircle className="w-6 h-6" />, title: "Aulas Gravadas", desc: "Acesso vitalício à plataforma com toda a base teórica e prática." },
    { icon: <FileSpreadsheet className="w-6 h-6" />, title: "Toolkit de Gestão Completo", desc: "Plano de Contas, DRE, Fluxo de Caixa, Orçamento e mais, prontos para adaptar e usar." },
    { icon: <Calendar className="w-6 h-6" />, title: "Encontros ao Vivo", desc: "Hotseats mensais para análise do seu negócio específico." },
    { icon: <Users2 className="w-6 h-6" />, title: "Comunidade de Elite", desc: "Networking com outros empresários focados em escala." },
    { icon: <Headphones className="w-6 h-6" />, title: "Suporte VIP", desc: "Tira-dúvidas direto com os mentores via canal exclusivo." },
    { icon: <Cpu className="w-6 h-6" />, title: "Plataforma de Gestão Ancóra", desc: "Opcional: Um software exclusivo para implementar o método, automatizar relatórios e ter controle total (R$ 189,90/mês)." }
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans">
      {/* --- HEADER --- */}
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isScrolled ? 'bg-[#0a0a0a]/90 backdrop-blur-md py-3 border-b border-white/10' : 'bg-transparent py-5'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-xl">⚓</div>
            <span className="text-xl font-extrabold tracking-tight">Ancóra</span>
          </div>
          
          <nav className="hidden md:flex items-center space-x-8 text-sm font-medium">
            <a href="#problemas" className="hover:text-blue-400 transition-colors">O Desafio</a>
            <a href="#metodo" className="hover:text-blue-400 transition-colors">Método ANCÒRA</a>
            <a href="#entrega" className="hover:text-blue-400 transition-colors">Entregas</a>
            <a href="#planos" className="hover:text-blue-400 transition-colors">Planos</a>
            <a href="#sobre" className="hover:text-blue-400 transition-colors">Sobre</a>
          </nav>

          <div className="flex items-center space-x-4">
            <button 
              onClick={onLoginClick}
              className="text-sm font-medium hover:text-blue-400 transition-colors"
            >
              Entrar
            </button>
            <button 
              onClick={onLoginClick}
              className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-full text-sm font-semibold transition-all shadow-lg shadow-blue-500/20"
            >
              Acessar Sistema
            </button>
          </div>
        </div>
      </header>

      {/* --- HERO SECTION --- */}
      <section className="relative min-h-screen flex items-center pt-20 overflow-hidden">
        <div className="absolute top-1/4 -right-20 w-96 h-96 bg-blue-600/10 rounded-full blur-[100px]"></div>
        <div className="absolute bottom-1/4 -left-20 w-96 h-96 bg-green-600/5 rounded-full blur-[100px]"></div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-8">
            <div className="inline-flex items-center space-x-2 bg-blue-500/10 border border-blue-500/20 px-3 py-1 rounded-full">
              <span className="flex h-2 w-2 rounded-full bg-blue-500 animate-pulse"></span>
              <span className="text-blue-400 text-xs font-bold uppercase tracking-wider">Sistema de Gestão Ancóra</span>
            </div>
            
            <h1 className="text-5xl md:text-6xl font-extrabold leading-tight text-white">
              Tome decisões com base <br /> 
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">em dados, não em achismos.</span>
            </h1>
            
            <p className="text-xl text-gray-400 max-w-lg leading-relaxed">
              O Sistema Ancóra implementa as ferramentas essenciais (DRE, Fluxo de Caixa, CRM, Gestão de Tarefas) para você ter clareza total e parar de apagar incêndios.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4">
              <button 
                onClick={onLoginClick}
                className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-xl font-bold text-lg flex items-center justify-center group transition-all transform hover:scale-105 shadow-xl shadow-blue-600/20"
              >
                Acessar o Sistema
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
              <button className="bg-white/5 hover:bg-white/10 border border-white/10 text-white px-8 py-4 rounded-xl font-bold text-lg transition-all backdrop-blur-sm">
                Ver as ferramentas
              </button>
            </div>

            <div className="flex items-center space-x-4 pt-4">
              <div className="flex -space-x-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="w-10 h-10 rounded-full border-2 border-[#0a0a0a] bg-gray-700 flex items-center justify-center text-xs font-bold">
                    {String.fromCharCode(65 + i)}
                  </div>
                ))}
              </div>
              <p className="text-sm text-gray-500">
                <span className="text-gray-200 font-bold">+150 empresas</span> transformadas pelo método
              </p>
            </div>
          </div>

          <div className="relative">
            <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-white/10 aspect-video lg:aspect-square bg-gray-900">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-600/20 to-emerald-600/20"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-8xl mb-4">⚓</div>
                  <p className="text-2xl font-bold text-white">Sistema Ancóra</p>
                  <p className="text-gray-400">Gestão Integrada</p>
                </div>
              </div>
              
              <div className="absolute bottom-8 left-8 right-8 bg-white/5 backdrop-blur-md border border-white/10 p-6 rounded-xl">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-semibold text-blue-400 uppercase tracking-widest">Saúde Financeira</span>
                  <span className="text-xs text-green-400 font-bold">+34.5% Lucro Médio</span>
                </div>
                <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 w-[78%]"></div>
                </div>
              </div>
            </div>
            
            <div className="absolute -top-6 -right-6 bg-emerald-500/10 border border-emerald-500/20 backdrop-blur-xl p-4 rounded-2xl shadow-2xl hidden md:block">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-emerald-500 rounded-lg flex items-center justify-center">
                  <TrendingUp className="text-white w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs text-emerald-400 font-bold">CAIXA POSITIVO</p>
                  <p className="text-sm font-bold text-white">Autonomia Real</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --- PROBLEMS SECTION --- */}
      <section id="problemas" className="py-24 bg-[#0a0a0a]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center mb-16">
          <h2 className="text-sm font-bold text-blue-500 uppercase tracking-[0.2em]">O Diagnóstico</h2>
          <h3 className="text-3xl md:text-5xl font-extrabold text-white">
            Por que a maioria das PMEs <br /> <span className="text-gray-500">não sobrevive 5 anos?</span>
          </h3>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {problems.map((prob, idx) => (
            <div key={idx} className="bg-[#111111] border border-white/5 p-8 rounded-2xl hover:border-blue-500/30 transition-all group">
              <div className="mb-6 group-hover:scale-110 transition-transform">{prob.icon}</div>
              <h4 className="text-xl font-bold text-white mb-4">{prob.title}</h4>
              <p className="text-gray-500 text-sm leading-relaxed">{prob.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* --- SOLUTION SECTION --- */}
      <section className="py-24 bg-[#0d0d0d]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-8">
              <h2 className="text-3xl md:text-5xl font-extrabold text-white leading-tight">
                O Sistema Ancóra não é uma <br /> 
                <span className="text-blue-500">ferramenta comum.</span>
              </h2>
              <p className="text-lg text-gray-400">
                Ferramentas genéricas entregam planilhas que ninguém entende. O Sistema Ancóra foi construído para você ter controle real do seu negócio.
              </p>
              
              <div className="space-y-4">
                {[
                  { title: "Metodologia Prática", desc: "Aplicação imediata no seu fluxo de caixa real." },
                  { title: "Visão Integrada", desc: "CRM, Financeiro e Tarefas em um só lugar." },
                  { title: "Autonomia de Gestão", desc: "Crie processos que funcionam sem a sua supervisão 24/7." }
                ].map((item, i) => (
                  <div key={i} className="flex items-start space-x-4">
                    <div className="mt-1 flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center">
                      <Zap className="w-3 h-3 text-blue-500" />
                    </div>
                    <div>
                      <h5 className="font-bold text-white">{item.title}</h5>
                      <p className="text-sm text-gray-500">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-[#111111] border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
              <div className="grid grid-cols-2 text-center text-sm font-bold uppercase tracking-wider">
                <div className="py-4 bg-gray-800/50 text-gray-400 border-r border-white/5">Ferramentas Genéricas</div>
                <div className="py-4 bg-blue-600 text-white">Sistema Ancóra</div>
              </div>
              <div className="p-8 space-y-6">
                {[
                  ["Planilhas Complexas", "Dashboards Intuitivos"],
                  ["Dados Espalhados", "Tudo Centralizado"],
                  ["Sem Integração", "CRM + Financeiro + Tarefas"],
                  ["Relatórios Manuais", "IA Integrada"],
                  ["Curva de Aprendizado Alta", "Interface Simples"]
                ].map(([trad, meta], i) => (
                  <div key={i} className="grid grid-cols-2 gap-8 items-center border-b border-white/5 pb-4 last:border-0">
                    <span className="text-gray-600 text-sm line-through">{trad}</span>
                    <span className="text-blue-400 font-semibold flex items-center">
                      <Target className="w-4 h-4 mr-2" />
                      {meta}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --- METHODOLOGY SECTION --- */}
      <section id="metodo" className="py-24 bg-[#0a0a0a] relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-12">
          <div className="max-w-3xl text-center mx-auto">
            <h2 className="text-sm font-bold text-blue-500 uppercase tracking-[0.2em] mb-4">A Metodologia</h2>
            <h3 className="text-3xl md:text-5xl font-extrabold text-white mb-6">
              O Caminho para a Autonomia com o <span className="text-blue-500">Método ANCÒRA</span>
            </h3>
            <p className="text-gray-400 text-lg">
              Nós não entregamos teoria. Construímos juntos, na prática, o ponto de estabilidade financeira da sua empresa — para que você tenha os dados na mão e tome decisões com segurança e lucro.
            </p>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-12">
          <div className="text-center mb-10">
              <h4 className="font-bold text-2xl text-white">Os pilares do Método ANCÒRA</h4>
              <p className="text-gray-500 mt-2">ANCÒRA é o sistema que mantém sua empresa firme, mesmo em cenários instáveis. <br/> Cada etapa cria base, previsibilidade e visão clara do dinheiro.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {ancoraPillars.map((pillar, idx) => (
              <div key={idx} className="bg-[#111111] border border-white/5 p-8 rounded-2xl hover:border-blue-500/30 transition-all group">
                  <div className="flex items-center mb-4">
                  <span className="text-4xl font-black text-blue-600 mr-4">⚓</span>
                  <div>
                      <h4 className="text-2xl font-bold text-white">{pillar.letter} — {pillar.title}</h4>
                  </div>
                  </div>
                  <p className="text-gray-500 text-sm leading-relaxed">{pillar.description}</p>
              </div>
              ))}
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 mt-20 grid md:grid-cols-2 gap-8 items-center">
          <div className="bg-[#111111] border border-white/10 p-10 rounded-3xl h-full">
              <h4 className="text-2xl font-bold text-center text-white mb-8">Por que o Método ANCÒRA funciona?</h4>
              <ul className="space-y-4">
                  {whyItWorks.map((item, i) => (
                      <li key={i} className="flex items-center text-gray-300">
                          <CheckCircle2 className="w-5 h-5 mr-3 text-emerald-500 flex-shrink-0" />
                          <span>{item}</span>
                      </li>
                  ))}
              </ul>
          </div>
          <div className="bg-blue-900/20 border border-blue-500/30 p-10 rounded-3xl text-center">
              <Cpu className="w-12 h-12 text-blue-400 mx-auto mb-4" />
              <h4 className="text-2xl font-bold text-white mb-4">Do Método à Ferramenta: O Sistema Ancóra</h4>
              <p className="text-gray-400 text-sm mb-6">
                  Para acelerar a implementação e centralizar sua gestão, desenvolvemos um sistema próprio que segue cada pilar do método.
              </p>
              <button 
                onClick={onLoginClick}
                className="text-white font-bold text-lg bg-blue-600 hover:bg-blue-700 py-3 px-6 rounded-xl inline-block transition-all"
              >
                Acessar por <span className="text-blue-200">R$ 189,90/mês</span>
              </button>
          </div>
        </div>
      </section>

      {/* --- DELIVERABLES SECTION --- */}
      <section id="entrega" className="py-24 bg-[#0d0d0d]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-extrabold text-white">O que você vai <span className="text-emerald-500">receber:</span></h2>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {deliverables.map((item, idx) => (
            <div key={idx} className="flex p-6 rounded-2xl bg-[#111111] border border-white/5 items-start space-x-6">
              <div className="bg-emerald-500/10 p-3 rounded-xl text-emerald-500">
                {item.icon}
              </div>
              <div>
                <h4 className="text-lg font-bold text-white mb-2">{item.title}</h4>
                <p className="text-sm text-gray-500 leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* --- PRICING SECTION --- */}
      <section id="planos" className="py-24 bg-[#0a0a0a]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-sm font-bold text-blue-500 uppercase tracking-[0.2em] mb-4">Escolha seu Plano</h2>
            <h3 className="text-3xl md:text-5xl font-extrabold text-white">Duas formas de <span className="text-emerald-500">transformar</span> sua gestão</h3>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {/* Plano Método Ancóra */}
            <div className="relative bg-gradient-to-br from-blue-900/30 to-emerald-900/30 border-2 border-blue-500/50 p-10 rounded-3xl">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-4 py-1 rounded-full text-sm font-bold">
                RECOMENDADO
              </div>
              
              <div className="text-center mb-8">
                <h4 className="text-2xl font-bold text-white mb-2">Método Ancóra Completo</h4>
                <p className="text-gray-400">Acompanhamento de 12 meses + Sistema Vitalício</p>
              </div>

              <div className="text-center mb-8">
                <div className="text-5xl font-black text-white mb-2">R$ 899,90<span className="text-xl text-gray-400 font-normal">/mês</span></div>
                <p className="text-emerald-400 font-semibold">ou R$ 8.900,90 à vista</p>
                <p className="text-xs text-gray-500 mt-1">(economia de R$ 1.898,90)</p>
              </div>

              <ul className="space-y-4 mb-8">
                {[
                  "Acompanhamento da equipe MC Castro na implantação",
                  "12 meses de mentoria e suporte dedicado",
                  "Acesso vitalício ao Sistema Ancóra",
                  "Toolkit completo de gestão",
                  "Encontros ao vivo mensais (Hotseats)",
                  "Comunidade exclusiva de empresários",
                  "Suporte VIP via canal exclusivo"
                ].map((item, i) => (
                  <li key={i} className="flex items-start text-gray-300">
                    <CheckCircle2 className="w-5 h-5 mr-3 text-emerald-500 mt-0.5 flex-shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <button 
                onClick={() => setIsContactModalOpen(true)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-xl font-bold text-lg flex items-center justify-center transition-all"
              >
                Quero o Método Completo
                <ArrowRight className="ml-2 w-5 h-5" />
              </button>
            </div>

            {/* Plano Somente Sistema */}
            <div className="bg-[#111111] border border-white/10 p-10 rounded-3xl">
              <div className="text-center mb-8">
                <h4 className="text-2xl font-bold text-white mb-2">Somente o Sistema</h4>
                <p className="text-gray-400">Acesso ao Sistema Ancóra</p>
              </div>

              <div className="text-center mb-8">
                <div className="text-5xl font-black text-white mb-2">R$ 189,90<span className="text-xl text-gray-400 font-normal">/mês</span></div>
                <p className="text-gray-500">Assinatura mensal</p>
              </div>

              <ul className="space-y-4 mb-8">
                {[
                  "Acesso completo ao Sistema Ancóra",
                  "Gestão Financeira (DRE, Fluxo de Caixa)",
                  "CRM de Vendas integrado",
                  "Gestão de Tarefas (Kanban)",
                  "Relatórios e Dashboards",
                  "Suporte técnico via chat"
                ].map((item, i) => (
                  <li key={i} className="flex items-start text-gray-300">
                    <CheckCircle2 className="w-5 h-5 mr-3 text-blue-500 mt-0.5 flex-shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <button 
                onClick={onLoginClick}
                className="w-full bg-white/10 hover:bg-white/20 border border-white/20 text-white py-4 rounded-xl font-bold text-lg flex items-center justify-center transition-all"
              >
                Acessar o Sistema
                <ArrowRight className="ml-2 w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* --- AUDIENCE SECTION --- */}
      <section className="py-24 bg-[#0d0d0d]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-extrabold text-white">O Sistema Ancóra é para <br /> <span className="text-blue-500 text-3xl">o seu momento?</span></h2>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-blue-500/5 border border-blue-500/20 p-10 rounded-3xl">
              <h4 className="text-2xl font-bold text-blue-400 mb-8 flex items-center">
                <CheckCircle2 className="w-6 h-6 mr-3" />
                Ideal para você se:
              </h4>
              <ul className="space-y-5">
                {[
                  "Fatura entre R$ 50k e R$ 300k mensais.",
                  "Deseja parar de ser operacional e ser estratégico.",
                  "Sente que o dinheiro 'some' no meio do mês.",
                  "Possui um negócio com potencial, mas trava no financeiro.",
                  "Quer criar rotinas delegáveis e processos claros."
                ].map((item, i) => (
                  <li key={i} className="flex items-start text-gray-300">
                    <CheckCircle2 className="w-5 h-5 mr-3 text-blue-500 mt-0.5 flex-shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-red-500/5 border border-red-500/20 p-10 rounded-3xl opacity-70">
              <h4 className="text-2xl font-bold text-red-400 mb-8 flex items-center">
                <XCircle className="w-6 h-6 mr-3" />
                NÃO é para você se:
              </h4>
              <ul className="space-y-5">
                {[
                  "Busca uma 'fórmula mágica' para ficar rico sem trabalho.",
                  "Ainda não tem faturamento ou está em fase de ideia.",
                  "Prefere terceirizar 100% da responsabilidade financeira.",
                  "Não está disposto a abrir os números da empresa.",
                  "Acredita que o contador deve gerir seu negócio sozinho."
                ].map((item, i) => (
                  <li key={i} className="flex items-start text-gray-500">
                    <XCircle className="w-5 h-5 mr-3 text-red-500 mt-0.5 flex-shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* --- ABOUT SECTION --- */}
      <section id="sobre" className="py-24 bg-[#0d0d0d] overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col lg:flex-row items-center gap-16">
          <div className="lg:w-1/2 relative">
            <div className="relative z-10 rounded-3xl overflow-hidden border-4 border-white/5 shadow-2xl bg-gradient-to-br from-blue-600/20 to-emerald-600/20 aspect-[3/4] flex items-center justify-center p-8">
              <img 
                src="https://files.manuscdn.com/user_upload_by_module/session_file/310519663169904786/vAunHsrOqfymBvwo.png" 
                alt="MC Castro - Mentoria & Estratégia" 
                className="max-w-full max-h-full object-contain"
              />
            </div>
            <div className="absolute -bottom-6 -right-6 w-48 h-48 bg-blue-600 rounded-full blur-[100px] opacity-20"></div>
            <div className="absolute top-20 -left-10 w-40 h-40 bg-emerald-600 rounded-full blur-[80px] opacity-10"></div>
          </div>

          <div className="lg:w-1/2 space-y-8">
            <h2 className="text-sm font-bold text-blue-500 uppercase tracking-[0.2em]">Quem está por trás</h2>
            <h3 className="text-4xl md:text-5xl font-extrabold text-white">MC Castro <br /> <span className="text-gray-500">Consultoria & Gestão</span></h3>
            
            <p className="text-lg text-gray-400 leading-relaxed">
              A <a href="https://www.mccastro.com.br/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">MC Castro</a> é uma empresa especializada em estruturação financeira e gestão empresarial, com mais de <strong className="text-white">30 anos de experiência</strong> no mercado.
            </p>
            
            <p className="text-gray-400">
              O Método Ancóra foi desenvolvido a partir de décadas de atuação prática com empresas de diversos segmentos. Nossa abordagem é 100% prática: não entregamos teoria, construímos com você as ferramentas para que se torne o CEO financeiro que seu negócio precisa para escalar com segurança.
            </p>

            <div className="grid grid-cols-2 gap-6 pt-6">
              <div className="flex items-center space-x-4">
                <Award className="w-8 h-8 text-blue-500" />
                <div>
                  <p className="text-white font-bold">+30 anos</p>
                  <p className="text-xs text-gray-500">De Experiência</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <Briefcase className="w-8 h-8 text-emerald-500" />
                <div>
                  <p className="text-white font-bold">+60 clientes</p>
                  <p className="text-xs text-gray-500">Atendidos</p>
                </div>
              </div>
            </div>

            <a 
              href="https://www.mccastro.com.br/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center text-blue-400 hover:text-blue-300 font-semibold mt-4"
            >
              Conheça a MC Castro
              <ArrowRight className="ml-2 w-4 h-4" />
            </a>
          </div>
        </div>
      </section>

      {/* --- FOOTER / CTA --- */}
      <footer id="contato" className="bg-[#0a0a0a] pt-24 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-gradient-to-r from-blue-900/40 to-emerald-900/40 border border-white/10 p-12 rounded-[3rem] text-center mb-24 relative overflow-hidden group">
            <div className="relative z-10">
              <h2 className="text-4xl md:text-6xl font-black text-white mb-8">Pronto para ter <br /> <span className="text-blue-400">clareza total?</span></h2>
              <p className="text-xl text-gray-300 mb-12 max-w-2xl mx-auto leading-relaxed">
                Tenha seus dados financeiros na mão para tomar as melhores decisões. Acesse o Sistema Ancóra e transforme sua gestão.
              </p>
              <div className="flex flex-col sm:flex-row gap-6 justify-center">
                <button 
                  onClick={onLoginClick}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-10 py-5 rounded-2xl font-bold text-xl flex items-center justify-center group transform transition-all hover:scale-105"
                >
                  Acessar o Sistema
                  <ArrowRight className="ml-3 w-6 h-6 group-hover:translate-x-1 transition-transform" />
                </button>
                <button 
                  onClick={() => setIsContactModalOpen(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-10 py-5 rounded-2xl font-bold text-xl flex items-center justify-center space-x-3 transition-all"
                >
                  <span>Quero meu Mapeamento</span>
                  <ArrowRight className="w-6 h-6" />
                </button>
              </div>
            </div>
            <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-from)_0%,_transparent_70%)] from-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-1000"></div>
          </div>

          <div className="grid md:grid-cols-4 gap-12 pb-16 border-b border-white/5">
            <div className="col-span-1 md:col-span-2 space-y-6">
              <div className="flex items-center space-x-2">
                <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-xl">⚓</div>
                <span className="text-xl font-extrabold tracking-tight">Ancóra</span>
              </div>
              <p className="text-gray-500 max-w-xs">
                Sistema de Gestão Integrada. O parceiro estratégico do pequeno empresário de elite.
              </p>
            </div>

            <div>
              <h5 className="font-bold text-white mb-6 uppercase tracking-widest text-sm">Links Rápidos</h5>
              <ul className="space-y-4 text-gray-500 text-sm">
                <li><a href="#metodo" className="hover:text-blue-400 transition-colors">Método ANCÒRA</a></li>
                <li><a href="#sobre" className="hover:text-blue-400 transition-colors">Sobre Nós</a></li>
                <li><a href="#entrega" className="hover:text-blue-400 transition-colors">Entregas</a></li>
              </ul>
            </div>

            <div>
              <h5 className="font-bold text-white mb-6 uppercase tracking-widest text-sm">Contato</h5>
              <ul className="space-y-4 text-gray-500 text-sm">
                <li className="flex items-center space-x-3">
                  <Mail className="w-4 h-4" />
                  <span>contato@ancora.com.br</span>
                </li>
                <li className="flex items-center space-x-3">
                  <Smartphone className="w-4 h-4" />
                  <span>+55 (11) 98765-4321</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="py-8 flex flex-col md:flex-row justify-between items-center text-xs text-gray-600 space-y-4 md:space-y-0">
            <p>© {new Date().getFullYear()} Ancóra. Todos os direitos reservados.</p>
            <div className="flex space-x-8">
              <a href="#" className="hover:text-gray-400">Políticas de Privacidade</a>
              <a href="#" className="hover:text-gray-400">Termos de Uso</a>
            </div>
          </div>
        </div>
      </footer>

      {/* Modal de Contato */}
      <ContactModal 
        isOpen={isContactModalOpen} 
        onClose={() => setIsContactModalOpen(false)} 
      />
    </div>
  );
};