import React, { useState } from 'react';
import { FinancialRecord } from '../types';
import { Barcode, X, Loader2 } from 'lucide-react';
import { asaasPayBill } from '../services/asaasService';

const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Math.abs(v) || 0);
const fmtDate = (iso?: string) => {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};
const todayISO = () => new Date().toISOString().slice(0, 10);

/**
 * Pagamento de boleto pelo saldo do Asaas. O valor cobrado é o do próprio
 * boleto — o do lançamento serve só de conferência, porque juros e multa
 * costumam mudar o total na hora de pagar.
 */
export const PayBillModal: React.FC<{
  record: FinancialRecord;
  onClose: () => void;
  onPaid: (billId: string) => void;
}> = ({ record, onClose, onPaid }) => {
  const [line, setLine] = useState('');
  const [schedule, setSchedule] = useState('');
  const [sending, setSending] = useState(false);
  const digitsOnly = line.replace(/\D/g, '');
  const overdue = !!record.dueDate && record.dueDate < todayISO();

  const submit = async () => {
    if (digitsOnly.length < 44) {
      alert('A linha digitável tem 47 ou 48 números. Confira o que foi digitado.');
      return;
    }
    setSending(true);
    try {
      const { bill } = await asaasPayBill({
        recordId: record.id,
        identificationField: digitsOnly,
        scheduleDate: schedule || undefined,
        description: record.description,
      });
      onPaid(bill.id);
      alert(
        `Boleto enviado ao Asaas.\n\nValor: ${brl(bill.value)}\nSituação: ${bill.status}\n\n` +
        'A baixa do lançamento acontece quando o Asaas confirmar o pagamento.',
      );
    } catch (e: any) {
      alert(`Erro ao pagar o boleto: ${e.message}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="bg-mcsystem-50 text-mcsystem-700 p-2 rounded-lg"><Barcode size={18} /></div>
            <h3 className="font-bold text-gray-900">Pagar boleto pelo Asaas</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-gray-50 rounded-xl px-4 py-3 text-sm">
            <p className="font-semibold text-gray-900">{record.description || 'Despesa'}</p>
            <p className="text-gray-500 mt-0.5">
              Lançamento de {brl(record.amount)} · vence {fmtDate(record.dueDate)}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Linha digitável *</label>
            <input
              autoFocus value={line} onChange={e => setLine(e.target.value)}
              placeholder="00190.00009 02759.288000 21932.978170 1 87890000005000"
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 font-mono text-sm outline-none focus:border-mcsystem-500 focus:ring-2 focus:ring-mcsystem-100"
            />
            <p className={`text-xs mt-1 ${digitsOnly.length && digitsOnly.length < 44 ? 'text-amber-600' : 'text-gray-400'}`}>
              {digitsOnly.length} número(s) — o boleto tem 47 ou 48.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Agendar para (opcional)</label>
            <input
              type="date" value={schedule} onChange={e => setSchedule(e.target.value)}
              disabled={overdue}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 outline-none focus:border-mcsystem-500 disabled:bg-gray-100 disabled:text-gray-400"
            />
            <p className="text-xs text-gray-400 mt-1">
              {overdue
                ? 'Conta vencida não pode ser agendada — o Asaas paga na hora.'
                : 'Em branco, o Asaas paga na data de vencimento do boleto.'}
            </p>
          </div>

          <p className="text-xs text-gray-500 leading-relaxed">
            O valor debitado é o do boleto, que pode diferir do lançamento por juros ou multa.
            Sai do saldo da conta Asaas.
          </p>
        </div>

        <div className="bg-gray-50 px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} disabled={sending}
            className="px-4 py-2.5 rounded-lg text-gray-600 font-medium hover:bg-gray-200 disabled:opacity-50">Cancelar</button>
          <button onClick={submit} disabled={sending || digitsOnly.length < 44}
            className="px-5 py-2.5 bg-mcsystem-900 text-white rounded-lg font-semibold hover:bg-mcsystem-800 flex items-center gap-2 disabled:opacity-50">
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Barcode size={16} />} Pagar boleto
          </button>
        </div>
      </div>
    </div>
  );
};
