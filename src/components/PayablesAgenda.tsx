import React, { useMemo, useState } from 'react';
import { FinancialRecord, Company, ChartOfAccount, Bank, TransactionStatus, User } from '../types';
import { supabase } from '../lib/supabaseClient';
import {
  AlertTriangle, CalendarClock, CheckCircle2, Search, ChevronDown, Loader2, Wallet, Landmark,
  Copy, Check, Send, Barcode, X,
} from 'lucide-react';
import { asaasCreateTransfer, asaasPayBill } from '../services/asaasService';
import { isAsaasEnabled } from '../config';

interface PayablesAgendaProps {
  records: FinancialRecord[];
  setRecords: React.Dispatch<React.SetStateAction<FinancialRecord[]>>;
  companies: Company[];
  chartOfAccounts: ChartOfAccount[];
  banks: Bank[];
  currentUser: User;
}

const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Math.abs(v) || 0);
const fmtDate = (iso?: string) => {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};
const todayISO = () => new Date().toISOString().slice(0, 10);
const daysBetween = (iso: string) => {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const d = new Date(iso.slice(0, 10) + 'T00:00:00');
  return Math.round((d.getTime() - t.getTime()) / 86400000);
};

export const PayablesAgenda: React.FC<PayablesAgendaProps> = ({ records, setRecords, companies, chartOfAccounts, banks, currentUser }) => {
  const [search, setSearch] = useState('');
  const [horizon, setHorizon] = useState(30);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payTarget, setPayTarget] = useState<FinancialRecord | null>(null);
  const [sending, setSending] = useState(false);
  const [billTarget, setBillTarget] = useState<FinancialRecord | null>(null);

  const companyName = (id?: string) => companies.find(c => c.id === id)?.name || null;
  const rubricName = (id?: string) => chartOfAccounts.find(c => c.id === id)?.rubricName || null;
  const bankName = (id?: string) => banks.find(b => b.id === id)?.name || null;

  const open = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records
      .filter(r => r.amount < 0 && (r.status as string) !== 'Pago' && r.dueDate && !r.needsValidation)
      .filter(r => !q
        || (r.description || '').toLowerCase().includes(q)
        || (companyName(r.companyId) || '').toLowerCase().includes(q)
        || (rubricName(r.rubricId) || r.category || '').toLowerCase().includes(q));
  }, [records, search, companies, chartOfAccounts]);

  const today = todayISO();
  const overdue = useMemo(() => open.filter(r => r.dueDate < today).sort((a, b) => a.dueDate.localeCompare(b.dueDate)), [open, today]);
  const upcoming = useMemo(() => open.filter(r => r.dueDate >= today && daysBetween(r.dueDate) <= horizon)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate)), [open, today, horizon]);

  const sum = (l: FinancialRecord[]) => l.reduce((s, r) => s + Math.abs(r.amount), 0);
  const dueToday = open.filter(r => r.dueDate === today);
  const next7 = open.filter(r => r.dueDate >= today && daysBetween(r.dueDate) <= 7);

  const upcomingByDate = useMemo(() => {
    const m = new Map<string, FinancialRecord[]>();
    upcoming.forEach(r => {
      if (!m.has(r.dueDate)) m.set(r.dueDate, []);
      m.get(r.dueDate)!.push(r);
    });
    return Array.from(m.entries());
  }, [upcoming]);

  const markPaid = async (r: FinancialRecord) => {
    setPayingId(r.id);
    const paymentDate = todayISO();
    const prev = records;
    setRecords(list => list.map(x => x.id === r.id ? { ...x, status: TransactionStatus.PAID, paymentDate } : x));
    const { error } = await supabase.from('financial_records')
      .update({ status: 'Pago', paymentDate }).eq('id', r.id);
    setPayingId(null);
    if (error) {
      setRecords(prev);
      alert('Erro ao dar baixa: ' + error.message);
    }
  };

  /**
   * Envia o PIX pelo Asaas. O dinheiro não sai aqui: a transferência é criada e
   * fica retida até a nossa função de validação conferir que ela corresponde a
   * este pedido. A baixa do lançamento vem depois, pelo evento TRANSFER_DONE.
   */
  const confirmAndPay = async () => {
    if (!payTarget) return;
    setSending(true);
    try {
      const { transfer } = await asaasCreateTransfer({ recordId: payTarget.id });
      setRecords(list => list.map(x => x.id === payTarget.id ? { ...x, asaas_transfer_id: transfer.id } : x));
      setPayTarget(null);
      alert('PIX enviado ao Asaas. A baixa do lançamento acontece assim que a transferência for concluída.');
    } catch (e: any) {
      alert(`Erro ao enviar o PIX: ${e.message}`);
    } finally {
      setSending(false);
    }
  };

  /** Dados de pagamento com botão de copiar — é o que se usa na hora de pagar. */
  const PaymentAccountLine: React.FC<{ account?: FinancialRecord['payment_account'] }> = ({ account }) => {
    const [copied, setCopied] = useState(false);
    if (!account?.type) return null;

    const value = account.type === 'PIX'
      ? (account.pixKey || '')
      : [account.bank, account.agency && `Ag. ${account.agency}`, account.account && `C/C ${account.account}`].filter(Boolean).join(' · ');
    if (!value) return null;

    const copy = () => {
      navigator.clipboard?.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    };

    return (
      <div className="text-xs mt-1 flex items-center gap-1.5 flex-wrap">
        <span className="bg-mcsystem-50 text-mcsystem-700 px-1.5 py-0.5 rounded font-medium">
          {account.type === 'PIX' ? 'PIX' : 'TED'}
        </span>
        <span className="text-gray-600 font-mono truncate max-w-[280px]" title={value}>{value}</span>
        {account.holder && <span className="text-gray-400">· {account.holder}</span>}
        <button onClick={copy} className="text-gray-400 hover:text-mcsystem-600 transition-colors" title="Copiar">
          {copied ? <Check size={12} className="text-green-600" /> : <Copy size={12} />}
        </button>
      </div>
    );
  };

  const Row: React.FC<{ r: FinancialRecord; late?: boolean }> = ({ r, late }) => {
    const lateDays = Math.max(0, -daysBetween(r.dueDate));
    const cat = rubricName(r.rubricId) || r.category;
    const bank = bankName(r.bankId);
    return (
      <div className="flex flex-col md:flex-row md:items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 truncate">{r.description || 'Despesa'}</span>
            {cat && <span className="text-[11px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{cat}</span>}
          </div>
          <div className="text-xs text-gray-400 truncate mt-0.5 flex items-center gap-2">
            {companyName(r.companyId) && <span>{companyName(r.companyId)}</span>}
            {bank && <span className="inline-flex items-center gap-1"><Landmark size={10} /> {bank}</span>}
          </div>
          <PaymentAccountLine account={r.payment_account} />
        </div>

        <div className="flex items-center gap-4 flex-shrink-0">
          <div className="text-right">
            <div className="font-semibold text-red-600 tabular-nums">{brl(r.amount)}</div>
            <div className={`text-xs ${late ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
              {late ? `${lateDays} ${lateDays === 1 ? 'dia' : 'dias'} · ${fmtDate(r.dueDate)}` : fmtDate(r.dueDate)}
            </div>
          </div>
          {r.asaas_transfer_id ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-blue-50 text-blue-700">
              <Send size={14} /> PIX enviado
            </span>
          ) : r.asaas_bill_id ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-blue-50 text-blue-700">
              <Barcode size={14} /> Boleto no Asaas
            </span>
          ) : (
            <>
              {r.payment_account?.type === 'PIX' && r.payment_account?.pixKey && isAsaasEnabled(currentUser.tenant_id) && (
                <button onClick={() => setPayTarget(r)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-mcsystem-50 text-mcsystem-700 hover:bg-mcsystem-100 transition-colors"
                  title="Enviar PIX pelo Asaas">
                  <Send size={14} /> Pagar por PIX
                </button>
              )}
              {isAsaasEnabled(currentUser.tenant_id) && (
                <button onClick={() => setBillTarget(r)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-mcsystem-50 text-mcsystem-700 hover:bg-mcsystem-100 transition-colors"
                  title="Pagar boleto pelo saldo do Asaas">
                  <Barcode size={14} /> Pagar boleto
                </button>
              )}
              <button onClick={() => markPaid(r)} disabled={payingId === r.id}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 transition-colors disabled:opacity-50"
                title="Marcar como pago (sem mover dinheiro)">
                {payingId === r.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Dar baixa
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="bg-white p-6 rounded-2xl border border-gray-200/80 flex items-start gap-4">
        <div className="bg-gray-900 p-3 rounded-xl text-white"><Wallet size={26} /></div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Contas a pagar</h2>
          <p className="text-gray-500 text-sm mt-0.5">Agenda de vencimentos das despesas, com baixa rápida.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Vencidas" value={brl(sum(overdue))} hint={`${overdue.length} conta(s)`} tone="critical" />
        <Stat label="Vence hoje" value={brl(sum(dueToday))} hint={`${dueToday.length} conta(s)`} tone="warning" />
        <Stat label="Próximos 7 dias" value={brl(sum(next7))} hint={`${next7.length} conta(s)`} tone="neutral" />
        <Stat label={`Próximos ${horizon} dias`} value={brl(sum(upcoming))} hint={`${upcoming.length} conta(s)`} tone="neutral" />
      </div>

      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar despesa, fornecedor ou rubrica..."
            className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-gray-200 focus:border-gray-400 outline-none text-sm" />
        </div>
        <div className="relative">
          <select value={horizon} onChange={e => setHorizon(Number(e.target.value))}
            className="appearance-none pl-4 pr-9 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-medium outline-none focus:border-gray-400">
            <option value={7}>Próximos 7 dias</option>
            <option value={15}>Próximos 15 dias</option>
            <option value={30}>Próximos 30 dias</option>
            <option value={60}>Próximos 60 dias</option>
            <option value={90}>Próximos 90 dias</option>
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* Vencidas */}
      <div className="bg-white rounded-2xl border border-gray-200/80 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <AlertTriangle size={17} className="text-red-500" />
          <h3 className="font-semibold text-gray-900">Vencidas</h3>
          <span className="text-xs text-gray-400">{overdue.length} · {brl(sum(overdue))}</span>
        </div>
        {overdue.length === 0 ? (
          <div className="py-14 text-center">
            <CheckCircle2 size={36} className="mx-auto text-green-500/40 mb-2" />
            <p className="text-sm text-gray-400">Nenhuma conta vencida 🎉</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">{overdue.map(r => <Row key={r.id} r={r} late />)}</div>
        )}
      </div>

      {/* Próximas */}
      <div className="bg-white rounded-2xl border border-gray-200/80 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <CalendarClock size={17} className="text-gray-400" />
          <h3 className="font-semibold text-gray-900">Próximos vencimentos</h3>
          <span className="text-xs text-gray-400">{upcoming.length} · {brl(sum(upcoming))}</span>
        </div>
        {upcomingByDate.length === 0 ? (
          <div className="py-14 text-center text-sm text-gray-300">Nada a vencer nos próximos {horizon} dias</div>
        ) : (
          <div>
            {upcomingByDate.map(([date, list]) => {
              const d = daysBetween(date);
              const label = d === 0 ? 'Hoje' : d === 1 ? 'Amanhã' : `Em ${d} dias`;
              return (
                <div key={date}>
                  <div className="px-5 py-2 bg-gray-50/80 border-y border-gray-100 flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-600">{fmtDate(date)} · {label}</span>
                    <span className="text-xs text-gray-400 tabular-nums">{brl(list.reduce((s, r) => s + Math.abs(r.amount), 0))}</span>
                  </div>
                  <div className="divide-y divide-gray-100">{list.map(r => <Row key={r.id} r={r} />)}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirmação do PIX — última chance de conferir destino e valor */}
      {payTarget && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2.5">
              <div className="bg-mcsystem-50 text-mcsystem-700 p-2 rounded-lg"><Send size={18} /></div>
              <h3 className="font-bold text-gray-900">Confirmar pagamento por PIX</h3>
            </div>

            <div className="p-6 space-y-4">
              <div className="text-center py-2">
                <p className="text-3xl font-bold text-gray-900 tabular-nums">{brl(payTarget.amount)}</p>
                <p className="text-sm text-gray-500 mt-1">{payTarget.description}</p>
              </div>

              <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-gray-500 flex-shrink-0">Chave PIX</span>
                  <span className="font-mono text-gray-900 text-right break-all">{payTarget.payment_account?.pixKey}</span>
                </div>
                {payTarget.payment_account?.pixKeyType && (
                  <div className="flex justify-between"><span className="text-gray-500">Tipo</span><span className="text-gray-900">{payTarget.payment_account.pixKeyType}</span></div>
                )}
                {payTarget.payment_account?.holder && (
                  <div className="flex justify-between gap-4"><span className="text-gray-500 flex-shrink-0">Favorecido</span><span className="text-gray-900 text-right">{payTarget.payment_account.holder}</span></div>
                )}
              </div>

              <p className="text-xs text-gray-500 leading-relaxed">
                O Asaas ainda vai pedir a confirmação do sistema antes de executar. O lançamento só
                é baixado quando a transferência for concluída de fato.
              </p>
            </div>

            <div className="bg-gray-50 px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setPayTarget(null)} disabled={sending}
                className="px-4 py-2.5 rounded-lg text-gray-600 font-medium hover:bg-gray-200 disabled:opacity-50">Cancelar</button>
              <button onClick={confirmAndPay} disabled={sending}
                className="px-5 py-2.5 bg-mcsystem-900 text-white rounded-lg font-semibold hover:bg-mcsystem-800 flex items-center gap-2 disabled:opacity-50">
                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Enviar PIX
              </button>
            </div>
          </div>
        </div>
      )}

      {billTarget && (
        <PayBillModal
          record={billTarget}
          onClose={() => setBillTarget(null)}
          onPaid={(billId) => {
            setRecords(list => list.map(x => x.id === billTarget.id ? { ...x, asaas_bill_id: billId } : x));
            setBillTarget(null);
          }}
        />
      )}
    </div>
  );
};

/**
 * Pagamento de boleto pelo saldo do Asaas. O valor cobrado é o do próprio
 * boleto — o do lançamento serve só de conferência, porque juros e multa
 * costumam mudar o total na hora de pagar.
 */
const PayBillModal: React.FC<{
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

const Stat: React.FC<{ label: string; value: string; hint: string; tone: 'critical' | 'warning' | 'neutral' }> = ({ label, value, hint, tone }) => {
  const ring = tone === 'critical' ? 'border-red-200 bg-red-50/40' : tone === 'warning' ? 'border-amber-200 bg-amber-50/40' : 'border-gray-200/80 bg-white';
  const text = tone === 'critical' ? 'text-red-700' : tone === 'warning' ? 'text-amber-700' : 'text-gray-900';
  return (
    <div className={`rounded-2xl border p-5 ${ring}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
      <div className={`mt-2 text-2xl font-bold tabular-nums ${text}`}>{value}</div>
      <div className="mt-1 text-xs text-gray-500">{hint}</div>
    </div>
  );
};
