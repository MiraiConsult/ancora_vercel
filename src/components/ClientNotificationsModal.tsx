import React, { useEffect, useState } from 'react';
import {
  asaasCustomerNotifications, asaasUpdateCustomerNotifications, CustomerNotification,
} from '../services/asaasService';
import { X, Save, Loader2, BellOff, Mail, MessageSquare, Phone, MessageCircle } from 'lucide-react';

interface ClientNotificationsModalProps {
  clientId: string;
  clientName: string;
  onClose: () => void;
}

/** Os eventos são fixos no Asaas — não dá para criar nem apagar, só configurar. */
const EVENT_LABEL: Record<string, { title: string; hint: string }> = {
  PAYMENT_CREATED: { title: 'Cobrança criada', hint: 'Assim que a cobrança é gerada' },
  PAYMENT_DUEDATE_WARNING: { title: 'Aviso de vencimento', hint: 'Antes do vencimento' },
  PAYMENT_OVERDUE: { title: 'Cobrança vencida', hint: 'No dia seguinte ao vencimento' },
  PAYMENT_RECEIVED: { title: 'Pagamento recebido', hint: 'Confirmação para quem pagou' },
  PAYMENT_UPDATED: { title: 'Cobrança alterada', hint: 'Mudança de valor ou vencimento' },
  SEND_LINHA_DIGITAVEL: { title: 'Linha digitável', hint: 'Envio do código do boleto' },
};

const CHANNELS: { key: keyof CustomerNotification; label: string; icon: React.ReactNode }[] = [
  { key: 'emailEnabledForCustomer', label: 'E-mail', icon: <Mail size={13} /> },
  { key: 'smsEnabledForCustomer', label: 'SMS', icon: <MessageSquare size={13} /> },
  { key: 'whatsappEnabledForCustomer', label: 'WhatsApp', icon: <MessageCircle size={13} /> },
  { key: 'phoneCallEnabledForCustomer', label: 'Ligação', icon: <Phone size={13} /> },
];

const OFFSETS = [0, 1, 5, 7, 10, 15, 30];

export const ClientNotificationsModal: React.FC<ClientNotificationsModalProps> = ({ clientId, clientName, onClose }) => {
  const [linked, setLinked] = useState(true);
  const [disabled, setDisabled] = useState(false);
  const [rows, setRows] = useState<CustomerNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    asaasCustomerNotifications(clientId)
      .then(s => {
        if (!alive) return;
        setLinked(s.linked);
        setDisabled(s.notificationDisabled);
        setRows(s.notifications);
      })
      .catch(e => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [clientId]);

  const patch = (id: string, p: Partial<CustomerNotification>) =>
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...p } : r)));

  const save = async () => {
    setSaving(true);
    try {
      await asaasUpdateCustomerNotifications({
        clientId,
        notificationDisabled: disabled,
        // Silenciado no cliente, mandar a grade junto só geraria ruído no Asaas.
        notifications: disabled ? undefined : rows,
      });
      onClose();
    } catch (e: any) {
      alert(`Erro ao salvar notificações: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[200] p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-300">
        <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-lg text-gray-800">Como cobrar {clientName}</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              O Asaas notifica por cliente, não por cobrança — vale para todas as cobranças deste cliente.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-200 transition-colors">
            <X size={22} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {loading && (
            <div className="py-12 text-center text-gray-400 flex flex-col items-center gap-2">
              <Loader2 size={22} className="animate-spin" />
              <span className="text-sm">Carregando configuração no Asaas...</span>
            </div>
          )}

          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>}

          {!loading && !error && !linked && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-4 py-3">
              Este cliente ainda não existe no Asaas — ele é criado na primeira cobrança. Depois disso dá para configurar as notificações aqui.
            </div>
          )}

          {!loading && !error && linked && (
            <>
              <label className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${disabled ? 'border-red-200 bg-red-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                <input
                  type="checkbox" checked={disabled}
                  onChange={e => setDisabled(e.target.checked)}
                  className="mt-0.5 rounded border-gray-300 text-red-600 focus:ring-red-500"
                />
                <div>
                  <div className="font-semibold text-sm text-gray-800 flex items-center gap-2">
                    <BellOff size={15} className={disabled ? 'text-red-500' : 'text-gray-400'} />
                    Não notificar este cliente
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    O Asaas para de mandar qualquer aviso. A cobrança continua sendo gerada normalmente —
                    você envia o boleto ou o PIX na mão, pelo botão de compartilhar da cobrança.
                  </p>
                </div>
              </label>

              <div className={`space-y-3 transition-opacity ${disabled ? 'opacity-40 pointer-events-none' : ''}`}>
                {rows.map(n => {
                  const meta = EVENT_LABEL[n.event] || { title: n.event, hint: '' };
                  return (
                    <div key={n.id} className="border border-gray-200 rounded-xl p-4">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <div className="font-semibold text-sm text-gray-800">{meta.title}</div>
                          {meta.hint && <div className="text-xs text-gray-400 mt-0.5">{meta.hint}</div>}
                        </div>
                        <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer flex-shrink-0">
                          <input
                            type="checkbox" checked={n.enabled}
                            onChange={e => patch(n.id, { enabled: e.target.checked })}
                            className="rounded border-gray-300 text-mcsystem-600 focus:ring-mcsystem-500"
                          />
                          Ativo
                        </label>
                      </div>

                      <div className={`flex flex-wrap gap-2 ${n.enabled ? '' : 'opacity-40 pointer-events-none'}`}>
                        {CHANNELS.map(c => {
                          const on = !!n[c.key];
                          return (
                            <button
                              key={String(c.key)}
                              onClick={() => patch(n.id, { [c.key]: !on } as Partial<CustomerNotification>)}
                              className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                                on ? 'border-mcsystem-200 bg-mcsystem-50 text-mcsystem-700' : 'border-gray-200 text-gray-400 hover:bg-gray-50'
                              }`}
                            >
                              {c.icon}{c.label}
                            </button>
                          );
                        })}

                        {n.event === 'PAYMENT_DUEDATE_WARNING' && (
                          <select
                            value={n.scheduleOffset}
                            onChange={e => patch(n.id, { scheduleOffset: Number(e.target.value) })}
                            className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 outline-none focus:border-mcsystem-500"
                            title="Antecedência do aviso"
                          >
                            {OFFSETS.map(d => (
                              <option key={d} value={d}>{d === 0 ? 'No dia' : `${d} dia${d > 1 ? 's' : ''} antes`}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="bg-gray-50 px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} disabled={saving} className="px-4 py-2.5 rounded-lg text-gray-600 font-medium hover:bg-gray-200 transition-colors disabled:opacity-50">
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={saving || loading || !linked || !!error}
            className="px-5 py-2.5 bg-mcsystem-900 text-white rounded-lg font-semibold hover:bg-mcsystem-800 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}Salvar
          </button>
        </div>
      </div>
    </div>
  );
};
