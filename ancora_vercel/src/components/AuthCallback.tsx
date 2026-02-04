import React, { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Loader, ArrowRight } from 'lucide-react';

interface AuthCallbackProps {
  supabase: any;
}

export const AuthCallback: React.FC<AuthCallbackProps> = ({ supabase }) => {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Processando confirmação do email...');
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    const processConfirmation = async () => {
      try {
        // Aguarda um momento para garantir que o Supabase processou o token
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Obtém a sessão atual
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Erro ao obter sessão:', error);
          throw error;
        }
        
        if (session) {
          console.log('Sessão obtida com sucesso:', session.user.email);
          setStatus('success');
          setMessage(`Email ${session.user.email} confirmado com sucesso!`);
          
          // Inicia contagem regressiva
          const timer = setInterval(() => {
            setCountdown(prev => {
              if (prev <= 1) {
                clearInterval(timer);
                window.location.href = '/';
                return 0;
              }
              return prev - 1;
            });
          }, 1000);
          
          return () => clearInterval(timer);
        } else {
          // Verifica se há erro nos parâmetros da URL
          const hashParams = new URLSearchParams(window.location.hash.substring(1));
          const errorCode = hashParams.get('error_code');
          const errorDescription = hashParams.get('error_description');
          
          if (errorCode) {
            throw new Error(errorDescription || 'Erro desconhecido ao confirmar email');
          }
          
          throw new Error('Sessão não encontrada. O link pode ter expirado.');
        }
      } catch (error: any) {
        console.error('Erro ao processar confirmação:', error);
        setStatus('error');
        
        // Mensagens de erro amigáveis
        if (error.message.includes('expired')) {
          setMessage('O link de confirmação expirou. Por favor, solicite um novo link.');
        } else if (error.message.includes('invalid')) {
          setMessage('Link de confirmação inválido. Por favor, solicite um novo link.');
        } else {
          setMessage(error.message || 'Erro ao confirmar email. Por favor, tente novamente.');
        }
      }
    };

    processConfirmation();
  }, [supabase]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="bg-white p-10 rounded-2xl shadow-2xl max-w-md w-full text-center border border-gray-100">
        {status === 'loading' && (
          <div className="space-y-4">
            <Loader className="w-20 h-20 text-blue-500 animate-spin mx-auto" />
            <h2 className="text-2xl font-bold text-gray-800">Confirmando email...</h2>
            <p className="text-gray-600">{message}</p>
            <div className="flex items-center justify-center gap-2 text-sm text-gray-500 mt-6">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse delay-75"></div>
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse delay-150"></div>
            </div>
          </div>
        )}
        
        {status === 'success' && (
          <div className="space-y-4 animate-in zoom-in-95 duration-300">
            <div className="relative">
              <CheckCircle className="w-20 h-20 text-green-500 mx-auto" />
              <div className="absolute inset-0 w-20 h-20 mx-auto bg-green-100 rounded-full animate-ping opacity-20"></div>
            </div>
            <h2 className="text-2xl font-bold text-gray-800">Email Confirmado!</h2>
            <p className="text-gray-600">{message}</p>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mt-6">
              <p className="text-sm text-green-800 font-medium">
                Sua conta está ativa e pronta para uso!
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 text-sm text-gray-500 mt-4">
              <span>Redirecionando em {countdown} segundos</span>
              <ArrowRight className="w-4 h-4 animate-pulse" />
            </div>
            <button
              onClick={() => window.location.href = '/'}
              className="mt-4 bg-green-500 text-white px-8 py-3 rounded-lg hover:bg-green-600 transition-all duration-200 font-semibold shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
            >
              Ir para Login Agora
            </button>
          </div>
        )}
        
        {status === 'error' && (
          <div className="space-y-4 animate-in zoom-in-95 duration-300">
            <XCircle className="w-20 h-20 text-red-500 mx-auto" />
            <h2 className="text-2xl font-bold text-gray-800">Erro na Confirmação</h2>
            <p className="text-gray-600">{message}</p>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mt-6">
              <p className="text-sm text-red-800 font-medium mb-2">
                O que fazer agora?
              </p>
              <ul className="text-sm text-red-700 text-left space-y-1">
                <li>• Solicite um novo link de confirmação</li>
                <li>• Verifique se o email está correto</li>
                <li>• Entre em contato com o suporte se o problema persistir</li>
              </ul>
            </div>
            <button
              onClick={() => window.location.href = '/'}
              className="mt-4 bg-blue-500 text-white px-8 py-3 rounded-lg hover:bg-blue-600 transition-all duration-200 font-semibold shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
            >
              Voltar para Login
            </button>
          </div>
        )}
      </div>
    </div>
  );
};