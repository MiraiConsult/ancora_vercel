import React, { useState } from 'react';
import { FinancialRecord } from '../types';
import { Barcode, X, Loader2, QrCode, KeyRound, Landmark } from 'lucide-react';
import { asaasPayBill, asaasCreateTransfer } from '../services/asaasService';

const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Math.abs(v) || 0);
const fmtDate = (iso?: string) => {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};
const todayISO = () => new Date().toISOString().slice(0, 10);
const digits = (s: string) => (s || '').replace(/\D/g, '');

type Method = 'BOLETO' | 'PIX_QR' | 'PIX_KEY' | 'TED';

const METHODS: { key: Method; label: string; icon: React.ElementType }[] = [
  { key: 'BOLETO', label: 'Boleto', icon: Barcode },
  { key: 'PIX_QR', label: 'PIX copia-e-cola', icon: QrCode },
  { key: 'PIX_KEY', label: 'PIX por chave', icon: KeyRound },
  { key: 'TED', label: 'TED', icon: Landmark },
];

/** Tipo da chave a partir do formato — o usuário não precisa classificar. */
const guessKeyType = (key: string): string => {
  const k = (key || '').trim();
  const d = digits(k);
  if (k.includes('@')) return 'EMAIL';
  if (d.length === 11 && !k.startsWith('+')) return 'CPF';
  if (d.length === 14) return 'CNPJ';
  if (d.length >= 12 || k.startsWith('+')) return 'PHONE';
  return 'EVP';
};

/**
 * Paga um lançamento de despesa pelo saldo do Asaas, por qualquer meio que a
 * conta oferece. Boleto vira um "bill"; os demais são saque, e passam pela
 * validação que confere o pedido antes do dinheiro sair.
 */
export const PayRecordModal: React.FC<{
  record: FinancialRecord;
  onClose: () => void;
  /** Recebe o que mudou no lançamento (id do boleto ou da transferência). */
  onPaid: (patch: Partial<FinancialRecord>) => void;
}> = ({ record, onClose, onPaid }) => {
  const savedKey = record.payment_account?.type === 'PIX' ? (record.payment_account.pixKey || '') : '';
  const [method, setMethod] = useState<Method>(savedKey ? 'PIX_KEY' : 'BOLETO');
  const [sending, setSending] = useState(false);
  const [schedule, setSchedule] = useState('');

  const [line, setLine] = useState('');
  const [qr, setQr] = useState('');
  const [pixKey, setPixKey] = useState(savedKey);
  const [pixKeyType, setPixKeyType] = useState(record.payment_account?.pixKeyType || '');
  const [bank, setBank] = useState({
    bankCode: '', agency: '', account: '', accountDigit: '',
    ownerName: record.payment_account?.holder || '', cpfCnpj: '', bankAccountType: 'CONTA_CORRENTE',
  });

  const overdue = !!record.dueDate && record.dueDate < todayISO();
  const lineDigits = digits(line);

  const ready = method === 'BOLETO' ? lineDigits.length >= 44
    : method === 'PIX_QR' ? qr.trim().length > 20
      : method === 'PIX_KEY' ? pixKey.trim().length > 0
        : !!(digits(bank.bankCode) && digits(bank.agency) && digits(bank.account) && bank.ownerName.trim() && digits(bank.cpfCnpj));

  const submit = async () => {
    if (!ready) return;
    setSending(true);
    try {
      if (method === 'BOLETO') {
        const { bill } = await asaasPayBill({
          recordId: record.id,
          identificationField: lineDigits,
          scheduleDate: schedule || undefined,
          description: record.description,
        });
        onPaid({ asaas_bill_id: bill.id });
        alert(`Boleto enviado ao Asaas.\n\nValor: ${brl(bill.value)}\nSituação: ${bill.status}\n\nA baixa do lançamento acontece quando o Asaas confirmar o pagamento.`);
      } else {
        const { transfer } = await asaasCreateTransfer({
          recordId: record.id,
          method,
          scheduleDate: schedule || undefined,
          ...(method === 'PIX_QR' ? { payload: qr.trim() } : {}),
          ...(method === 'PIX_KEY' ? { pixKey: pixKey.trim(), pixKeyType: pixKeyType || guessKeyType(pixKey) } : {}),
          ...(method === 'TED' ? { bankAccount: bank } : {}),
        });
        onPaid({ asaas_transfer_id: transfer.id });
        alert(`Pagamento enviado ao Asaas.\n\nValor: ${brl(transfer.value ?? record.amount)}\nSituação: ${transfer.status}\n\nO Asaas ainda confirma o saque com o sistema antes de executar. A baixa do lançamento vem quando a transferência concluir.`);
      }
      onClose();
    } catch (e: any) {
      alert(`Erro ao pagar: ${e.message}`);
    } finally {
      setSending(false);
    }
  };

  const field = 'w-full px-3 py-2.5 rounded-lg border border-gray-200 outline-none focus:border-mcsystem-500 focus:ring-2 focus:ring-mcsystem-100';
  const label = 'block text-sm font-medium text-gray-600 mb-1';

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="bg-mcsystem-50 text-mcsystem-700 p-2 rounded-lg"><Barcode size={18} /></div>
            <h3 className="font-bold text-gray-900">Pagar pelo Asaas</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          <div className="bg-gray-50 rounded-xl px-4 py-3 text-sm">
            <p className="font-semibold text-gray-900">{record.description || 'Despesa'}</p>
            <p className="text-gray-500 mt-0.5">{brl(record.amount)} · vence {fmtDate(record.dueDate)}</p>
          </div>

          <div>
            <label className={label}>Como pagar</label>
            <div className="grid grid-cols-2 gap-2">
              {METHODS.map(m => {
                const Icon = m.icon;
                const on = method === m.key;
                return (
                  <button key={m.key} onClick={() => setMethod(m.key)}
                    className={`px-3 py-2.5 rounded-lg border text-sm font-medium flex items-center gap-2 transition-colors ${
                      on ? 'bg-mcsystem-50 border-mcsystem-300 text-mcsystem-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}>
                    <Icon size={15} />{m.label}
                  </button>
                );
              })}
            </div>
          </div>

          {method === 'BOLETO' && (
            <div>
              <label className={label}>Linha digitável *</label>
              <input autoFocus value={line} onChange={e => setLine(e.target.value)}
                placeholder="00190.00009 02759.288000 21932.978170 1 87890000005000"
                className={`${field} font-mono text-sm`} />
              <p className={`text-xs mt-1 ${lineDigits.length && lineDigits.length < 44 ? 'text-amber-600' : 'text-gray-400'}`}>
                {lineDigits.length} número(s) — o boleto tem 47 ou 48.
              </p>
            </div>
          )}

          {method === 'PIX_QR' && (
            <div>
              <label className={label}>PIX copia-e-cola *</label>
              <textarea autoFocus value={qr} onChange={e => setQr(e.target.value)} rows={3}
                placeholder="00020126580014br.gov.bcb.pix..."
                className={`${field} font-mono text-xs resize-none`} />
              <p className="text-xs text-gray-400 mt-1">
                O Asaas cobra o valor do lançamento ({brl(record.amount)}). Código com valor fixo diferente é recusado.
              </p>
            </div>
          )}

          {method === 'PIX_KEY' && (
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className={label}>Chave PIX *</label>
                <input autoFocus value={pixKey} onChange={e => { setPixKey(e.target.value); setPixKeyType(''); }}
                  placeholder="CPF, CNPJ, e-mail, telefone ou aleatória" className={field} />
              </div>
              <div>
                <label className={label}>Tipo</label>
                <select value={pixKeyType || guessKeyType(pixKey)} onChange={e => setPixKeyType(e.target.value)} className={field}>
                  {['CPF', 'CNPJ', 'EMAIL', 'PHONE', 'EVP'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
          )}

          {method === 'TED' && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={label}>Banco (código) *</label>
                  <input value={bank.bankCode} onChange={e => setBank({ ...bank, bankCode: e.target.value })}
                    placeholder="237" className={field} />
                </div>
                <div>
                  <label className={label}>Agência *</label>
                  <input value={bank.agency} onChange={e => setBank({ ...bank, agency: e.target.value })}
                    placeholder="1263" className={field} />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className={label}>Conta *</label>
                    <input value={bank.account} onChange={e => setBank({ ...bank, account: e.target.value })}
                      placeholder="999999" className={field} />
                  </div>
                  <div>
                    <label className={label}>Díg.</label>
                    <input value={bank.accountDigit} onChange={e => setBank({ ...bank, accountDigit: e.target.value })}
                      placeholder="1" className={field} />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>Titular *</label>
                  <input value={bank.ownerName} onChange={e => setBank({ ...bank, ownerName: e.target.value })} className={field} />
                </div>
                <div>
                  <label className={label}>CPF/CNPJ do titular *</label>
                  <input value={bank.cpfCnpj} onChange={e => setBank({ ...bank, cpfCnpj: e.target.value })} className={field} />
                </div>
              </div>
              <div>
                <label className={label}>Tipo de conta</label>
                <select value={bank.bankAccountType} onChange={e => setBank({ ...bank, bankAccountType: e.target.value })} className={field}>
                  <option value="CONTA_CORRENTE">Conta corrente</option>
                  <option value="CONTA_POUPANCA">Conta poupança</option>
                </select>
              </div>
            </div>
          )}

          <div>
            <label className={label}>Agendar para (opcional)</label>
            <input type="date" value={schedule} onChange={e => setSchedule(e.target.value)}
              disabled={method === 'BOLETO' && overdue}
              className={`${field} disabled:bg-gray-100 disabled:text-gray-400`} />
            <p className="text-xs text-gray-400 mt-1">
              {method === 'BOLETO'
                ? (overdue ? 'Conta vencida não pode ser agendada — o Asaas paga na hora.' : 'Em branco, o Asaas paga na data de vencimento do boleto.')
                : 'Em branco, o pagamento sai agora.'}
            </p>
          </div>

          <p className="text-xs text-gray-500 leading-relaxed">
            {method === 'BOLETO'
              ? 'O valor debitado é o do boleto, que pode diferir do lançamento por juros ou multa. Sai do saldo da conta Asaas.'
              : 'O Asaas confirma o saque com o sistema antes de executar — um pedido que não bata com o registrado aqui é recusado. Sai do saldo da conta Asaas.'}
          </p>
        </div>

        <div className="bg-gray-50 px-6 py-4 border-t border-gray-100 flex justify-end gap-3 flex-shrink-0">
          <button onClick={onClose} disabled={sending}
            className="px-4 py-2.5 rounded-lg text-gray-600 font-medium hover:bg-gray-200 disabled:opacity-50">Cancelar</button>
          <button onClick={submit} disabled={sending || !ready}
            className="px-5 py-2.5 bg-mcsystem-900 text-white rounded-lg font-semibold hover:bg-mcsystem-800 flex items-center gap-2 disabled:opacity-50">
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Barcode size={16} />} Pagar {brl(record.amount)}
          </button>
        </div>
      </div>
    </div>
  );
};
