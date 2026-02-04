
import React, { useState } from 'react';
import { User } from '../types';
import { ArrowRight, Loader2, WifiOff, AlertTriangle, Database, CheckCircle, LogIn, ArrowLeft, Building } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { MOCK_USERS } from '../constants';

interface LoginScreenProps {
  onLogin: (user: User) => void;
  onBack?: () => void;
  connectionStatus?: 'pending' | 'connected' | 'error' | 'missing_tables';
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin, onBack, connectionStatus = 'pending' }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState(''); // State for new company name
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAuthAction = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    setLoading(true);

    try {
      if (isSignUp) {
          // --- NEW SIGN UP LOGIC (v12 - Single User per Company) ---
          if (!companyName) {
            throw new Error("O nome da empresa é obrigatório.");
          }

          // A lógica de criação de organização e perfil é tratada pelo gatilho do banco de dados `handle_new_user`.
          // Passamos apenas os dados necessários nos metadados.
          const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                company_name: companyName, // Lido pelo gatilho para nomear a organização e o perfil.
              }
            }
          });

          if (authError) throw authError;
          
          if (authData.user) {
             setSuccessMessage("Conta criada! Verifique seu e-mail para confirmação e depois faça o login.");
             setIsSignUp(false); // Switch back to login
             // Clear form
             setCompanyName('');
             setEmail('');
             setPassword('');
          }

      } else {
          // --- LOGIN LOGIC ---
          const mockUser = MOCK_USERS.find(u => u.email === email && u.password === password);
          if (connectionStatus === 'error' && mockUser) {
              console.log("Logged in with Mock User (Offline mode):", mockUser.name);
              onLogin(mockUser);
              return;
          }
          
          const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
          });
          
          if (error) {
              if (mockUser) {
                  console.log("Logged in with Mock User (Fallback):", mockUser.name);
                  onLogin(mockUser);
                  return;
              }
              throw error;
          }
      }
      
    } catch (err: any) {
      console.error("Erro auth:", err);
      let msg = err.message || err.error_description || '';
      if (msg === 'Invalid login credentials') msg = 'E-mail ou senha incorretos.';
      if (msg.includes('already registered')) msg = 'Este e-mail já está cadastrado.';
      if (msg.includes('Email not confirmed')) msg = 'E-mail pendente de confirmação. Verifique sua caixa de entrada ou desative "Confirm Email" no Supabase.';
      setError(msg || 'Erro ao processar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex overflow-hidden animate-in zoom-in-95 duration-500">
        
        {/* LEFT PANEL */}
        <div className="hidden md:flex w-1/2 bg-mcsystem-900 text-white p-12 flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 -mr-24 -mt-24 w-64 h-64 bg-mcsystem-800 rounded-full opacity-50 blur-2xl"></div>
          <div className="absolute bottom-0 left-0 -ml-24 -mb-24 w-64 h-64 bg-mcsystem-500 rounded-full opacity-30 blur-2xl"></div>

          <div className="relative z-10">
            {onBack && <button onClick={onBack} className="flex items-center text-sm text-mcsystem-300 hover:text-white mb-8 transition-colors"><ArrowLeft size={16} className="mr-2"/> Voltar ao Site</button>}
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-mcsystem-500 rounded-lg flex-shrink-0 shadow-lg shadow-mcsystem-500/30 flex items-center justify-center font-bold text-lg">⚓</div>
              <div>
                 <h1 className="text-xl font-bold tracking-tight text-white leading-none">Ancóra</h1>
              </div>
            </div>
            <h2 className="text-3xl font-bold mt-12 leading-tight">Solidez para o seu Crescimento.</h2>
            <p className="text-mcsystem-100 mt-4 opacity-80">Plataforma integrada para gestão financeira, CRM e análises preditivas com tecnologia de ponta.</p>
          </div>
          <div className="relative z-10">
            <p className="text-xs text-mcsystem-300 opacity-60">&copy; {new Date().getFullYear()} Ancóra.</p>
          </div>
        </div>

        {/* RIGHT PANEL (FORM) */}
        <div className="w-full md:w-1/2 p-8 sm:p-12 flex flex-col justify-center">
            <h2 className="text-3xl font-bold text-mcsystem-900 mb-2">{isSignUp ? 'Criar Conta' : 'Acessar Plataforma'}</h2>
            <p className="text-gray-500 mb-8">{isSignUp ? 'Preencha os dados da sua empresa para começar.' : 'Bem-vindo(a) de volta!'}</p>

            <form onSubmit={handleAuthAction} className="space-y-6">
                {isSignUp && (
                  <div className="relative">
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Nome da Empresa</label>
                    <Building size={16} className="absolute left-3.5 top-[43px] text-gray-400" />
                    <input required type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Sua Empresa Ltda." className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-mcsystem-500 outline-none transition-all" />
                  </div>
                )}
                <div className="relative">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">E-mail de Acesso</label>
                  <input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="contato@suaempresa.com" className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-mcsystem-500 outline-none transition-all" />
                </div>
                <div className="relative">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Senha</label>
                  <input required type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-mcsystem-500 outline-none transition-all" />
                </div>

                {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm flex items-center"><AlertTriangle size={16} className="mr-2"/>{error}</div>}
                {successMessage && <div className="bg-green-50 text-green-700 p-3 rounded-lg text-sm flex items-center"><CheckCircle size={16} className="mr-2"/>{successMessage}</div>}

                <button type="submit" disabled={loading} className="w-full bg-mcsystem-900 text-white py-4 rounded-lg font-bold text-lg hover:bg-mcsystem-800 transition-all shadow-xl shadow-mcsystem-900/20 flex items-center justify-center disabled:opacity-50">
                  {loading ? <Loader2 className="animate-spin" /> : isSignUp ? 'Criar Conta' : 'Entrar'}
                  {!loading && <LogIn className="ml-2" size={20} />}
                </button>
            </form>

            <p className="text-center text-sm text-gray-500 mt-8">
              {isSignUp ? 'Já tem uma conta?' : 'Ainda não tem uma conta?'}
              <button onClick={() => { setIsSignUp(!isSignUp); setError(''); setSuccessMessage(''); }} className="font-bold text-mcsystem-500 hover:underline ml-1">
                {isSignUp ? 'Fazer Login' : 'Criar Conta'}
              </button>
            </p>

            <div className="mt-8 pt-6 border-t border-gray-100">
                <div className={`flex items-center justify-center space-x-2 px-3 py-2 rounded-full border shadow-sm ${connectionStatus === 'connected' ? 'bg-green-50 border-green-200' : connectionStatus === 'missing_tables' ? 'bg-yellow-50 border-yellow-200' : 'bg-red-50 border-red-200'}`} title="Status da Conexão">
                    {connectionStatus === 'connected' && <CheckCircle size={14} className="text-green-500" />}
                    {connectionStatus === 'missing_tables' && <AlertTriangle size={14} className="text-yellow-500" />}
                    {connectionStatus === 'error' && <WifiOff size={14} className="text-red-500" />}
                    <Database size={14} className="text-gray-400"/>
                    <span className={`text-xs font-medium ${connectionStatus === 'connected' ? 'text-green-700' : connectionStatus === 'missing_tables' ? 'text-yellow-700' : 'text-red-700'}`}>{connectionStatus === 'connected' ? 'Servidor Online' : connectionStatus === 'missing_tables' ? 'Setup Pendente' : 'Desconectado'}</span>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};