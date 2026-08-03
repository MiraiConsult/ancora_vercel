import React, { useEffect, useState } from 'react';
import { FinancialRecord } from '../types';
import { asaasPaymentShareInfo, ChargeShareInfo } from '../services/asaasService';
import { X, Copy, Check, ExternalLink, Loader2, QrCode, FileText, Link2, MessageCircle } from 'lucide-react';

interface ChargeShareModalProps {
  charge: FinancialRecord;
  clientName: string;
  /** Telefone já normalizado para o wa.me — sem ele o botão só copia a mensagem. */
  waPhone?: string | null;
  onClose: () => void;
}

const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const fmtDate = (iso?: string | null) => {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

/**
 * O que dá para mandar na mão para o cliente. Existe porque o Asaas notifica
 * por cliente, não por cobrança: quem prefere avisar pelo WhatsApp precisa do
 * PIX copia-e-cola e da linha digitável à mão, não só do link da fatura.
 */
export const ChargeShareModal: React.FC<ChargeShareModalProps> = ({ charge, clientName, waPhone, onClose }) => {
  const [info, setInfo] = useState<ChargeShareInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!charge.asaas_payment_id) {
      setError('Esta cobrança não tem vínculo com o Asaas.');
      return;
    }
    asaasPaymentShareInfo(charge.asaas_payment_id)
      .then(i => alive && setInfo(i))
      .catch(e => alive && setError(e.message));
    return () => { alive = false; };
  }, [charge.asaas_payment_id]);

  const copy = (key: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1600);
  };

  const message = () => [
    `Olá, ${clientName}! 👋`,
    '',
    `📄 ${charge.description || 'Cobrança'}`,
    `💰 ${brl(charge.amount)}`,
    `📅 Vence em ${fmtDate(charge.dueDate)}`,
    ...(info?.pixPayload ? ['', 'PIX copia e cola:', info.pixPayload] : []),
    ...(info?.identificationField ? ['', 'Linha digitável do boleto:', info.identificationField] : []),
    ...(info?.invoiceUrl ? ['', 'Ou pague por aqui:', info.invoiceUrl] : []),
  ].join('\n');

  const sendWhatsApp = () => {
    const msg = message();
    if (!waPhone) {
      navigator.clipboard?.writeText(msg);
      alert('Cliente sem telefone no Asaas — a mensagem foi copiada, é só colar no WhatsApp.');
      return;
    }
    window.open(`https://wa.me/${waPhone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[200] p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-300">
        <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex justify-between items-center sticky top-0 z-10">
          <div>
            <h3 className="font-bold text-lg text-gray-800">Enviar cobrança</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {clientName} · {brl(charge.amount)} · vence {fmtDate(charge.dueDate)}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-200 transition-colors">
            <X size={22} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
          )}

          {!info && !error && (
            <div className="py-12 text-center text-gray-400 flex flex-col items-center gap-2">
              <Loader2 size={22} className="animate-spin" />
              <span className="text-sm">Buscando boleto e PIX no Asaas...</span>
            </div>
          )}

          {info && (
            <>
              {info.pixPayload && (
                <Block icon={<QrCode size={16} />} title="PIX copia e cola">
                  {info.pixQrCode && (
                    <img
                      src={`data:image/png;base64,${info.pixQrCode}`}
                      alt="QR Code do PIX"
                      className="w-40 h-40 mx-auto mb-3 rounded-lg border border-gray-200"
                    />
                  )}
                  <CopyRow
                    value={info.pixPayload}
                    mono
                    copied={copied === 'pix'}
                    onCopy={() => copy('pix', info.pixPayload!)}
                  />
                </Block>
              )}

              {(info.identificationField || info.bankSlipUrl) && (
                <Block icon={<FileText size={16} />} title="Boleto">
                  {info.identificationField && (
                    <CopyRow
                      value={info.identificationField}
                      mono
                      copied={copied === 'slip'}
                      onCopy={() => copy('slip', info.identificationField!)}
                    />
                  )}
                  {info.bankSlipUrl && (
                    <a
                      href={info.bankSlipUrl} target="_blank" rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-mcsystem-700 hover:text-mcsystem-900"
                    >
                      Abrir PDF do boleto <ExternalLink size={13} />
                    </a>
                  )}
                </Block>
              )}

              {info.invoiceUrl && (
                <Block icon={<Link2 size={16} />} title="Link da fatura">
                  <CopyRow
                    value={info.invoiceUrl}
                    copied={copied === 'link'}
                    onCopy={() => copy('link', info.invoiceUrl!)}
                  />
                  <a
                    href={info.invoiceUrl} target="_blank" rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-mcsystem-700 hover:text-mcsystem-900"
                  >
                    Abrir página de pagamento <ExternalLink size={13} />
                  </a>
                </Block>
              )}

              {!info.pixPayload && !info.identificationField && !info.invoiceUrl && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-4 py-3">
                  Esta cobrança não tem boleto, PIX nem link disponíveis
                  {info.status ? ` (situação no Asaas: ${info.status})` : ''}.
                </div>
              )}
            </>
          )}
        </div>

        <div className="bg-gray-50 px-6 py-4 border-t border-gray-100 flex justify-between items-center gap-3 sticky bottom-0">
          <button
            onClick={() => copy('msg', message())}
            disabled={!info}
            className="px-4 py-2.5 rounded-lg text-gray-600 font-medium hover:bg-gray-200 transition-colors flex items-center gap-2 disabled:opacity-40"
          >
            {copied === 'msg' ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
            Copiar mensagem
          </button>
          <button
            onClick={sendWhatsApp}
            disabled={!info}
            className="px-5 py-2.5 bg-[#25D366] text-white rounded-lg font-semibold hover:bg-[#1fb457] transition-colors flex items-center gap-2 disabled:opacity-40"
          >
            <MessageCircle size={16} /> {waPhone ? 'Enviar no WhatsApp' : 'Copiar e abrir'}
          </button>
        </div>
      </div>
    </div>
  );
};

const Block: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
  <div className="border border-gray-200 rounded-xl p-4">
    <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2.5">
      <span className="text-mcsystem-500">{icon}</span>{title}
    </div>
    {children}
  </div>
);

const CopyRow: React.FC<{ value: string; mono?: boolean; copied: boolean; onCopy: () => void }> = ({ value, mono, copied, onCopy }) => (
  <div className="flex gap-2 items-stretch">
    <div className={`flex-1 min-w-0 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-600 break-all max-h-24 overflow-y-auto ${mono ? 'font-mono' : ''}`}>
      {value}
    </div>
    <button
      onClick={onCopy}
      title="Copiar"
      className={`px-3 rounded-lg border transition-colors flex-shrink-0 ${copied ? 'border-green-200 bg-green-50 text-green-600' : 'border-gray-200 text-gray-500 hover:bg-gray-100'}`}
    >
      {copied ? <Check size={16} /> : <Copy size={16} />}
    </button>
  </div>
);
