import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { asaasApprovePayment, asaasRejectPayment } from '../services/asaasService';
import { User } from '../types';
import {
  ShieldCheck, Loader2, Check, X, Barcode, KeyRound, QrCode, Landmark, Clock, AlertTriangle,
} from 'lucide-react';

interface Intent {
  id: string;
  value: number;
  method: string;
  destination: any;
  record_id: string;
  record_description: string | null;
  schedule_date: string | null;
  requested_by: string | null;
  requested_at: string | null;
  status: string;
  refuse_reason: string | null;
}

const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Math.abs(v) || 0);
const fmtDate = (iso?: string | null) => {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

const METHOD_LABEL: Record<string, { label: string; icon: React.ElementType }> = {
  BOLETO: { label: 'Boleto', icon: Barcode },
  PIX_KEY: { label: 'PIX por chave', icon: KeyRound },
  PIX_QR: { label: 'PIX copia-e-cola', icon: QrCode },
  TED: { label: 'TED', icon: Landmark },
};

/** Como o destino é mostrado a quem aprova — é o que ele precisa conferir. */
const destinoResumo = (i: Intent): string => {
  const d = i.destination || {};
  switch (String(i.method).toUpperCase()) {
    case 'BOLETO': return `Linha ${String(d.line || '').slice(0, 20)}...`;
    case 'PIX_QR': return `Código PIX ${String(d.payload || '').slice(0, 28)}...`;
    case 'TED': return `Banco ${d.bankCode} · Ag. ${d.agency} · C/C ${d.account}${d.accountDigit ? `-${d.accountDigit}` : ''} · ${d.ownerName || ''}`;
    default: return `Chave ${d.pixKey || ''}`;
  }
};

/**
 * Pedidos de pagamento esperando aval. A aprovação acontece aqui, e não no
 * Asaas, porque o Asaas cancela a transferência se a validação dele não for
 * respondida em segundos — não há janela para um humano decidir depois. Então o
 * pedido para antes de virar transferência, e só é criado lá quando aprovado.
 */
export const ApprovalsModule: React.FC<{ currentUser: User; users: User[] }> = ({ currentUser, users }) => {
  const [items, setItems] = useState<Intent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('payment_intents')
      .select('*')
      .eq('status', 'PENDING_APPROVAL')
      .order('requested_at', { ascending: true });
    if (error) console.warn('payment_intents:', error.message);
    setItems((data as Intent[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const quem = (id?: string | null) => users.find(u => u.id === id)?.name || 'alguém da equipe';

  const aprovar = async (i: Intent) => {
    if (!confirm(
      `Aprovar o pagamento de ${brl(i.value)}?\n\n${i.record_description || ''}\n${destinoResumo(i)}\n\n` +
      'Ao aprovar, o pagamento é criado no Asaas e o dinheiro sai do saldo.',
    )) return;
    setBusy(i.id);
    try {
      await asaasApprovePayment(i.id);
      await load();
      alert('Pagamento aprovado e enviado ao Asaas.');
    } catch (e: any) {
      alert(`Não foi possível aprovar: ${e.message}`);
    } finally {
      setBusy(null);
    }
  };

  const recusar = async (i: Intent) => {
    const motivo = prompt(`Recusar o pagamento de ${brl(i.value)}. Motivo (opcional):`);
    if (motivo === null) return;
    setBusy(i.id);
    try {
      await asaasRejectPayment(i.id, motivo || undefined);
      await load();
    } catch (e: any) {
      alert(`Não foi possível recusar: ${e.message}`);
    } finally {
      setBusy(null);
    }
  };

  const isAdmin = currentUser.role === 'admin';
  const total = items.reduce((s, i) => s + Math.abs(i.value || 0), 0);

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <div className="bg-white p-6 rounded-2xl border border-gray-200/80 flex items-start gap-4">
        <div className="bg-gray-900 p-3 rounded-xl text-white"><ShieldCheck size={26} /></div>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-gray-900">Autorizações de pagamento</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Pedidos que ainda não foram enviados ao Asaas. Nenhum dinheiro sai antes da aprovação aqui.
          </p>
        </div>
        {items.length > 0 && (
          <div className="text-right">
            <p className="text-[11px] uppercase font-bold text-gray-400 tracking-wider">Aguardando</p>
            <p className="text-2xl font-bold text-gray-900 tabular-nums">{brl(total)}</p>
            <p className="text-xs text-gray-400">{items.length} pedido(s)</p>
          </div>
        )}
      </div>

      {!isAdmin && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-amber-600 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-amber-800">
            Você consegue ver os pedidos, mas só um administrador pode aprovar ou recusar.
          </p>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-200/80 overflow-hidden">
        {loading ? (
          <p className="py-16 text-center text-sm text-gray-400">Carregando...</p>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <ShieldCheck size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nenhum pagamento aguardando autorização.</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {items.map(i => {
              const m = METHOD_LABEL[String(i.method).toUpperCase()] || METHOD_LABEL.PIX_KEY;
              const Icon = m.icon;
              return (
                <li key={i.id} className="px-6 py-4 flex flex-col md:flex-row md:items-center gap-4 hover:bg-gray-50/70">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900">{i.record_description || 'Despesa'}</span>
                      <span className="text-[11px] bg-mcsystem-50 text-mcsystem-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                        <Icon size={11} /> {m.label}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 font-mono truncate" title={destinoResumo(i)}>
                      {destinoResumo(i)}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5">
                      <Clock size={11} />
                      Pedido por {quem(i.requested_by)}
                      {i.schedule_date && ` · agendado para ${fmtDate(i.schedule_date)}`}
                    </p>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <p className="text-lg font-bold text-red-600 tabular-nums">{brl(i.value)}</p>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => recusar(i)} disabled={!isAdmin || busy === i.id}
                      className="px-3 py-2 rounded-lg text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-100 flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <X size={15} /> Recusar
                    </button>
                    <button
                      onClick={() => aprovar(i)} disabled={!isAdmin || busy === i.id}
                      className="px-4 py-2 rounded-lg text-sm font-semibold bg-green-600 text-white hover:bg-green-700 flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {busy === i.id ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                      Aprovar
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};
