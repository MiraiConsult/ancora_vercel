import React, { useState } from 'react';
import { FinancialRecord, Supplier } from '../types';
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

export type PayMethod = 'BOLETO' | 'PIX_QR' | 'PIX_KEY' | 'TED';

export interface PayForm {
  method: PayMethod;
  schedule: string;
  line: string;
  qr: string;
  pixKey: string;
  pixKeyType: string;
  bank: {
    bankCode: string; agency: string; account: string; accountDigit: string;
    ownerName: string; cpfCnpj: string; bankAccountType: string;
  };
}

const METHODS: { key: PayMethod; label: string; icon: React.ElementType }[] = [
  { key: 'BOLETO', label: 'Boleto', icon: Barcode },
  { key: 'PIX_QR', label: 'PIX copia-e-cola', icon: QrCode },
  { key: 'PIX_KEY', label: 'PIX por chave', icon: KeyRound },
  { key: 'TED', label: 'TED', icon: Landmark },
];

/** Tipo da chave a partir do formato — o usuário não precisa classificar. */
export const guessKeyType = (key: string): string => {
  const k = (key || '').trim();
  const d = digits(k);
  if (k.includes('@')) return 'EMAIL';
  if (d.length === 11 && !k.startsWith('+')) return 'CPF';
  if (d.length === 14) return 'CNPJ';
  if (d.length >= 12 || k.startsWith('+')) return 'PHONE';
  return 'EVP';
};

/**
 * Começa no meio que o lançamento já indicava: a conta de pagamento informada
 * na hora de lançar. Boleto traz a linha digitável quando ela já foi colada.
 */
export const emptyPayForm = (record?: FinancialRecord): PayForm => {
  const acc = record?.payment_account;
  const savedKey = acc?.type === 'PIX' ? (acc.pixKey || '') : '';
  const method: PayMethod = acc?.type === 'BOLETO' ? 'BOLETO'
    : acc?.type === 'BANK' ? 'TED'
      : savedKey ? 'PIX_KEY' : 'BOLETO';
  return {
    method,
    schedule: '',
    line: acc?.type === 'BOLETO' ? (acc.barcode || '') : '',
    qr: '',
    pixKey: savedKey,
    pixKeyType: record?.payment_account?.pixKeyType || '',
    bank: {
      bankCode: '', agency: acc?.agency || '', account: acc?.account || '', accountDigit: '',
      ownerName: acc?.holder || '', cpfCnpj: acc?.document || '', bankAccountType: 'CONTA_CORRENTE',
    },
  };
};

/**
 * Preenche o formulário com o destino cadastrado no fornecedor, e abre no meio
 * que ele escolheu no cadastro. O que o usuário já digitou no boleto ou no
 * copia-e-cola não é tocado.
 */
export const applySupplier = (f: PayForm, s: Supplier): PayForm => {
  const bank = {
    ...f.bank,
    bankCode: s.bank_code || f.bank.bankCode,
    agency: s.bank_agency || f.bank.agency,
    account: s.bank_account || f.bank.account,
    accountDigit: s.bank_account_digit || f.bank.accountDigit,
    ownerName: s.bank_owner_name || s.name || f.bank.ownerName,
    cpfCnpj: s.bank_owner_document || s.document || f.bank.cpfCnpj,
    bankAccountType: s.bank_account_type || f.bank.bankAccountType,
  };
  const withPix = { ...f, bank, pixKey: s.pix_key || f.pixKey, pixKeyType: s.pix_key ? (s.pix_key_type || guessKeyType(s.pix_key)) : f.pixKeyType };
  switch (s.payment_method) {
    case 'BOLETO': return { ...withPix, method: 'BOLETO' };
    case 'TED': return { ...withPix, method: 'TED' };
    case 'PIX': return { ...withPix, method: 'PIX_KEY' };
    default:
      // Cadastro antigo, sem forma definida: decide pelo que existe.
      if (s.pix_key) return { ...withPix, method: 'PIX_KEY' };
      if (s.bank_code) return { ...withPix, method: 'TED' };
      return withPix;
  }
};

export const payFormReady = (f: PayForm): boolean =>
  f.method === 'BOLETO' ? digits(f.line).length >= 44
    : f.method === 'PIX_QR' ? f.qr.trim().length > 20
      : f.method === 'PIX_KEY' ? f.pixKey.trim().length > 0
        : !!(digits(f.bank.bankCode) && digits(f.bank.agency) && digits(f.bank.account)
          && f.bank.ownerName.trim() && digits(f.bank.cpfCnpj));

/**
 * Dispara o pagamento e devolve o que mudou no lançamento. Boleto vira um
 * "bill"; os demais são saque, e passam pela validação que confere o pedido
 * antes do dinheiro sair.
 */
export const submitPayment = async (
  recordId: string, f: PayForm, description?: string,
): Promise<{ patch: Partial<FinancialRecord>; message: string }> => {
  const emEspera = {
    patch: {},
    message: 'Pedido registrado e aguardando autorização.\n\nUm administrador precisa aprovar em Autorizações antes de o dinheiro sair. Nada foi enviado ao Asaas ainda.',
  };

  if (f.method === 'BOLETO') {
    const res = await asaasPayBill({
      recordId,
      identificationField: digits(f.line),
      scheduleDate: f.schedule || undefined,
      description,
    });
    if (res.pendingApproval) return emEspera;
    const bill = res.bill!;
    return {
      patch: { asaas_bill_id: bill.id },
      message: `Boleto enviado ao Asaas.\n\nValor: ${brl(bill.value)}\nSituação: ${bill.status}\n\nA baixa do lançamento acontece quando o Asaas confirmar o pagamento.`,
    };
  }
  const res = await asaasCreateTransfer({
    recordId,
    method: f.method,
    scheduleDate: f.schedule || undefined,
    description,
    ...(f.method === 'PIX_QR' ? { payload: f.qr.trim() } : {}),
    ...(f.method === 'PIX_KEY' ? { pixKey: f.pixKey.trim(), pixKeyType: f.pixKeyType || guessKeyType(f.pixKey) } : {}),
    ...(f.method === 'TED' ? { bankAccount: f.bank } : {}),
  });
  if (res.pendingApproval) return emEspera;
  const transfer = res.transfer!;
  return {
    patch: { asaas_transfer_id: transfer.id },
    message: `Pagamento enviado ao Asaas.\n\nValor: ${brl(transfer.value)}\nSituação: ${transfer.status}\n\nO Asaas ainda confirma o saque com o sistema antes de executar. A baixa do lançamento vem quando a transferência concluir.`,
  };
};

const field = 'w-full px-3 py-2.5 rounded-lg border border-gray-200 outline-none focus:border-mcsystem-500 focus:ring-2 focus:ring-mcsystem-100';
const labelCls = 'block text-sm font-medium text-gray-600 mb-1';

/** Escolha do meio + os campos dele. Usado ao pagar uma conta existente e ao cadastrar uma nova. */
export const PaymentMethodFields: React.FC<{
  form: PayForm;
  onChange: (f: PayForm) => void;
  /** Vencimento no passado: o Asaas não agenda boleto vencido. */
  overdue?: boolean;
  /** Valor do lançamento, só para avisar sobre o PIX de valor fixo. */
  amount?: number;
  autoFocus?: boolean;
}> = ({ form, onChange, overdue = false, amount, autoFocus = false }) => {
  const set = (patch: Partial<PayForm>) => onChange({ ...form, ...patch });
  const lineDigits = digits(form.line);

  return (
    <div className="space-y-4">
      <div>
        <label className={labelCls}>Como pagar</label>
        <div className="grid grid-cols-2 gap-2">
          {METHODS.map(m => {
            const Icon = m.icon;
            const on = form.method === m.key;
            return (
              <button key={m.key} type="button" onClick={() => set({ method: m.key })}
                className={`px-3 py-2.5 rounded-lg border text-sm font-medium flex items-center gap-2 transition-colors ${
                  on ? 'bg-mcsystem-50 border-mcsystem-300 text-mcsystem-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}>
                <Icon size={15} />{m.label}
              </button>
            );
          })}
        </div>
      </div>

      {form.method === 'BOLETO' && (
        <div>
          <label className={labelCls}>Linha digitável *</label>
          <input autoFocus={autoFocus} value={form.line} onChange={e => set({ line: e.target.value })}
            placeholder="00190.00009 02759.288000 21932.978170 1 87890000005000"
            className={`${field} font-mono text-sm`} />
          <p className={`text-xs mt-1 ${lineDigits.length && lineDigits.length < 44 ? 'text-amber-600' : 'text-gray-400'}`}>
            {lineDigits.length} número(s) — o boleto tem 47 ou 48.
          </p>
        </div>
      )}

      {form.method === 'PIX_QR' && (
        <div>
          <label className={labelCls}>PIX copia-e-cola *</label>
          <textarea autoFocus={autoFocus} value={form.qr} onChange={e => set({ qr: e.target.value })} rows={3}
            placeholder="00020126580014br.gov.bcb.pix..."
            className={`${field} font-mono text-xs resize-none`} />
          {amount != null && (
            <p className="text-xs text-gray-400 mt-1">
              O Asaas cobra o valor do lançamento ({brl(amount)}). Código com valor fixo diferente é recusado.
            </p>
          )}
        </div>
      )}

      {form.method === 'PIX_KEY' && (
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className={labelCls}>Chave PIX *</label>
            <input autoFocus={autoFocus} value={form.pixKey}
              onChange={e => set({ pixKey: e.target.value, pixKeyType: '' })}
              placeholder="CPF, CNPJ, e-mail, telefone ou aleatória" className={field} />
          </div>
          <div>
            <label className={labelCls}>Tipo</label>
            <select value={form.pixKeyType || guessKeyType(form.pixKey)} onChange={e => set({ pixKeyType: e.target.value })} className={field}>
              {['CPF', 'CNPJ', 'EMAIL', 'PHONE', 'EVP'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
      )}

      {form.method === 'TED' && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Banco (código) *</label>
              <input value={form.bank.bankCode} onChange={e => set({ bank: { ...form.bank, bankCode: e.target.value } })}
                placeholder="237" className={field} />
            </div>
            <div>
              <label className={labelCls}>Agência *</label>
              <input value={form.bank.agency} onChange={e => set({ bank: { ...form.bank, agency: e.target.value } })}
                placeholder="1263" className={field} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className={labelCls}>Conta *</label>
                <input value={form.bank.account} onChange={e => set({ bank: { ...form.bank, account: e.target.value } })}
                  placeholder="999999" className={field} />
              </div>
              <div>
                <label className={labelCls}>Díg.</label>
                <input value={form.bank.accountDigit} onChange={e => set({ bank: { ...form.bank, accountDigit: e.target.value } })}
                  placeholder="1" className={field} />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Titular *</label>
              <input value={form.bank.ownerName} onChange={e => set({ bank: { ...form.bank, ownerName: e.target.value } })} className={field} />
            </div>
            <div>
              <label className={labelCls}>CPF/CNPJ do titular *</label>
              <input value={form.bank.cpfCnpj} onChange={e => set({ bank: { ...form.bank, cpfCnpj: e.target.value } })} className={field} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Tipo de conta</label>
            <select value={form.bank.bankAccountType} onChange={e => set({ bank: { ...form.bank, bankAccountType: e.target.value } })} className={field}>
              <option value="CONTA_CORRENTE">Conta corrente</option>
              <option value="CONTA_POUPANCA">Conta poupança</option>
            </select>
          </div>
        </div>
      )}

      <div>
        <label className={labelCls}>Agendar para (opcional)</label>
        <input type="date" value={form.schedule} onChange={e => set({ schedule: e.target.value })}
          disabled={form.method === 'BOLETO' && overdue}
          className={`${field} disabled:bg-gray-100 disabled:text-gray-400`} />
        <p className="text-xs text-gray-400 mt-1">
          {form.method === 'BOLETO'
            ? (overdue ? 'Conta vencida não pode ser agendada — o Asaas paga na hora.' : 'Em branco, o Asaas paga na data de vencimento do boleto.')
            : 'Em branco, o pagamento sai agora.'}
        </p>
      </div>

      <p className="text-xs text-gray-500 leading-relaxed">
        {form.method === 'BOLETO'
          ? 'O valor debitado é o do boleto, que pode diferir do lançamento por juros ou multa. Sai do saldo da conta Asaas.'
          : 'O Asaas confirma o saque com o sistema antes de executar — um pedido que não bata com o registrado aqui é recusado. Sai do saldo da conta Asaas.'}
      </p>
    </div>
  );
};

/** Paga um lançamento de despesa já existente pelo saldo do Asaas. */
export const PayRecordModal: React.FC<{
  record: FinancialRecord;
  /** Fornecedor do lançamento, quando houver: entra já preenchido. */
  supplier?: Supplier;
  onClose: () => void;
  /** Recebe o que mudou no lançamento (id do boleto ou da transferência). */
  onPaid: (patch: Partial<FinancialRecord>) => void;
}> = ({ record, supplier, onClose, onPaid }) => {
  const [form, setForm] = useState<PayForm>(
    () => supplier ? applySupplier(emptyPayForm(record), supplier) : emptyPayForm(record),
  );
  const [sending, setSending] = useState(false);
  const overdue = !!record.dueDate && record.dueDate < todayISO();

  const submit = async () => {
    if (!payFormReady(form)) return;
    setSending(true);
    try {
      const { patch, message } = await submitPayment(record.id, form, record.description);
      onPaid(patch);
      alert(message);
      onClose();
    } catch (e: any) {
      alert(`Erro ao pagar: ${e.message}`);
    } finally {
      setSending(false);
    }
  };

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
            {supplier && <p className="text-gray-500 mt-0.5">Fornecedor: {supplier.name}</p>}
          </div>

          <PaymentMethodFields form={form} onChange={setForm} overdue={overdue} amount={record.amount} autoFocus />
        </div>

        <div className="bg-gray-50 px-6 py-4 border-t border-gray-100 flex justify-end gap-3 flex-shrink-0">
          <button onClick={onClose} disabled={sending}
            className="px-4 py-2.5 rounded-lg text-gray-600 font-medium hover:bg-gray-200 disabled:opacity-50">Cancelar</button>
          <button onClick={submit} disabled={sending || !payFormReady(form)}
            className="px-5 py-2.5 bg-mcsystem-900 text-white rounded-lg font-semibold hover:bg-mcsystem-800 flex items-center gap-2 disabled:opacity-50">
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Barcode size={16} />} Pagar {brl(record.amount)}
          </button>
        </div>
      </div>
    </div>
  );
};
