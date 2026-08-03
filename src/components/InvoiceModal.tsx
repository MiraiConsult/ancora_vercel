import React, { useEffect, useMemo, useState } from 'react';
import {
  asaasFiscalStatus, asaasScheduleInvoice, asaasSubscriptionInvoiceSettings,
  FiscalStatus, InvoiceTaxes, InvoicePeriod, SubscriptionInvoiceSettings,
} from '../services/asaasService';
import { X, Save, Loader2, Receipt, AlertTriangle, Trash2, ChevronDown, ChevronRight } from 'lucide-react';

type Target =
  /** Nota automática em toda cobrança gerada pela assinatura. */
  | { kind: 'subscription'; subscriptionId: string; value: number; description: string }
  /** Nota avulsa de uma cobrança já emitida. */
  | { kind: 'charge'; paymentId: string; value: number; description: string };

interface InvoiceModalProps {
  target: Target;
  clientName: string;
  onClose: () => void;
}

const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const todayISO = () => new Date().toISOString().slice(0, 10);

const PERIODS: { value: InvoicePeriod; label: string }[] = [
  { value: 'ON_PAYMENT_CONFIRMATION', label: 'Quando o pagamento for confirmado' },
  { value: 'ON_PAYMENT_DUE_DATE', label: 'No dia do vencimento' },
  { value: 'BEFORE_PAYMENT_DUE_DATE', label: 'Antes do vencimento' },
  { value: 'ON_DUE_DATE_MONTH', label: '1º dia do mês do vencimento' },
  { value: 'ON_NEXT_MONTH', label: '1º dia do mês seguinte ao vencimento' },
];

const DAYS_BEFORE = [5, 10, 15, 30, 60];

const emptyTaxes: InvoiceTaxes = { retainIss: false, iss: 0, cofins: 0, csll: 0, inss: 0, ir: 0, pis: 0 };

const inputCls = 'w-full px-3 py-2.5 rounded-lg border border-gray-200 focus:border-mcsystem-500 focus:ring-2 focus:ring-mcsystem-100 outline-none';
const labelCls = 'block text-sm font-medium text-gray-600 mb-1';

export const InvoiceModal: React.FC<InvoiceModalProps> = ({ target, clientName, onClose }) => {
  const isSub = target.kind === 'subscription';

  const [fiscal, setFiscal] = useState<FiscalStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<any>(null);

  const [serviceId, setServiceId] = useState('');
  const [serviceCode, setServiceCode] = useState('');
  const [description, setDescription] = useState(target.description || '');
  const [value, setValue] = useState(target.value || 0);
  const [deductions, setDeductions] = useState(0);
  const [effectiveDate, setEffectiveDate] = useState(todayISO());
  const [period, setPeriod] = useState<InvoicePeriod>('ON_PAYMENT_CONFIRMATION');
  const [daysBefore, setDaysBefore] = useState(5);
  const [receivedOnly, setReceivedOnly] = useState(false);
  const [observations, setObservations] = useState('');
  const [taxes, setTaxes] = useState<InvoiceTaxes>(emptyTaxes);
  const [showOtherTaxes, setShowOtherTaxes] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const status = await asaasFiscalStatus();
        if (!alive) return;
        setFiscal(status);

        if (isSub) {
          const { settings } = await asaasSubscriptionInvoiceSettings({ subscriptionId: (target as any).subscriptionId });
          if (!alive) return;
          if (settings) {
            setExisting(settings);
            setServiceId(settings.municipalServiceId || '');
            setServiceCode(settings.municipalServiceCode || '');
            setObservations(settings.observations || '');
            setDeductions(Number(settings.deductions) || 0);
            setPeriod(settings.effectiveDatePeriod || 'ON_PAYMENT_CONFIRMATION');
            setDaysBefore(Number(settings.daysBeforeDueDate) || 5);
            setReceivedOnly(!!settings.receivedOnly);
            if (settings.taxes) setTaxes({ ...emptyTaxes, ...settings.taxes });
          }
        }
      } catch (e: any) {
        if (alive) setError(e.message);
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    return () => { alive = false; };
  }, [isSub, target]);

  // Serviço municipal já traz a alíquota de ISS do município — evita digitar errado.
  const selectedService = useMemo(
    () => fiscal?.services.find(s => s.id === serviceId),
    [fiscal, serviceId],
  );
  useEffect(() => {
    if (selectedService?.issTax != null) setTaxes(t => ({ ...t, iss: selectedService.issTax as number }));
  }, [selectedService]);

  const save = async () => {
    if (!serviceId && !serviceCode.trim()) return alert('Escolha o serviço municipal ou informe o código.');
    if (!isSub && !description.trim()) return alert('Descreva o serviço prestado.');
    setSaving(true);
    try {
      if (isSub) {
        const settings: SubscriptionInvoiceSettings = {
          municipalServiceId: serviceId || undefined,
          municipalServiceCode: serviceId ? undefined : serviceCode.trim(),
          effectiveDatePeriod: period,
          daysBeforeDueDate: period === 'BEFORE_PAYMENT_DUE_DATE' ? daysBefore : undefined,
          receivedOnly: period === 'ON_NEXT_MONTH' ? receivedOnly : undefined,
          deductions: deductions || 0,
          observations: observations || undefined,
          taxes,
        };
        await asaasSubscriptionInvoiceSettings({ subscriptionId: (target as any).subscriptionId, settings });
        alert('Nota fiscal automática configurada para esta assinatura.');
      } else {
        await asaasScheduleInvoice({
          paymentId: (target as any).paymentId,
          serviceDescription: description,
          observations,
          value: Number(value),
          deductions: deductions || 0,
          effectiveDate,
          municipalServiceId: serviceId || undefined,
          municipalServiceCode: serviceId ? undefined : serviceCode.trim(),
          taxes,
        });
        alert('Nota fiscal agendada.');
      }
      onClose();
    } catch (e: any) {
      alert(`Erro ao salvar a nota fiscal: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const removeSettings = async () => {
    if (!window.confirm('Parar de emitir nota automática nesta assinatura?')) return;
    setSaving(true);
    try {
      await asaasSubscriptionInvoiceSettings({ subscriptionId: (target as any).subscriptionId, remove: true });
      onClose();
    } catch (e: any) {
      alert(`Erro ao remover: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const taxField = (key: keyof InvoiceTaxes, label: string) => (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <input
        type="number" step="0.01" min="0" value={(taxes[key] as number) || ''}
        onChange={e => setTaxes(t => ({ ...t, [key]: parseFloat(e.target.value) || 0 }))}
        placeholder="0" className={inputCls}
      />
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[200] p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-300">
        <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
              <Receipt size={20} className="text-mcsystem-500" />
              {isSub ? 'Nota fiscal automática' : 'Emitir nota fiscal'}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {clientName} · {brl(target.value)}
              {isSub && ' · vale para toda cobrança desta assinatura'}
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
              <span className="text-sm">Verificando a configuração fiscal...</span>
            </div>
          )}

          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>}

          {!loading && !error && fiscal && !fiscal.configured && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-4 py-3 flex gap-3">
              <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
              <div>
                <b>A conta Asaas ainda não tem configuração fiscal.</b> A emissão depende do cadastro
                municipal (inscrição, regime e certificado ou login da prefeitura), que é feito
                dentro do Asaas em <i>Configurações → Notas Fiscais</i>. Dá para preencher o formulário
                abaixo, mas a nota só vai sair depois disso.
              </div>
            </div>
          )}

          {!loading && !error && (
            <>
              {existing && (
                <div className="bg-green-50 border border-green-200 text-green-800 text-sm rounded-xl px-4 py-3">
                  Esta assinatura já emite nota automaticamente. Salvar substitui a configuração.
                </div>
              )}

              <div>
                <label className={labelCls}>Serviço municipal *</label>
                {fiscal && fiscal.services.length > 0 ? (
                  <select value={serviceId} onChange={e => setServiceId(e.target.value)} className={inputCls}>
                    <option value="">Informar o código na mão</option>
                    {fiscal.services.map(s => <option key={s.id} value={s.id}>{s.description}</option>)}
                  </select>
                ) : (
                  <p className="text-xs text-gray-400 mb-1">
                    A lista de serviços não está disponível nesta conta (acontece no Portal Nacional) — informe o código.
                  </p>
                )}
                {!serviceId && (
                  <input
                    type="text" value={serviceCode} onChange={e => setServiceCode(e.target.value)}
                    placeholder="Código do serviço na prefeitura (ex: 1.05)"
                    className={`${inputCls} mt-2`}
                  />
                )}
              </div>

              {!isSub && (
                <div>
                  <label className={labelCls}>Descrição do serviço *</label>
                  <textarea
                    value={description} onChange={e => setDescription(e.target.value)} rows={2}
                    className={inputCls} placeholder="O que foi prestado"
                  />
                </div>
              )}

              {isSub ? (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Quando emitir</label>
                    <select value={period} onChange={e => setPeriod(e.target.value as InvoicePeriod)} className={inputCls}>
                      {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  </div>
                  {period === 'BEFORE_PAYMENT_DUE_DATE' && (
                    <div>
                      <label className={labelCls}>Antecedência</label>
                      <select value={daysBefore} onChange={e => setDaysBefore(Number(e.target.value))} className={inputCls}>
                        {DAYS_BEFORE.map(d => <option key={d} value={d}>{d} dias antes</option>)}
                      </select>
                    </div>
                  )}
                  {period === 'ON_NEXT_MONTH' && (
                    <label className="flex items-center gap-2 text-sm text-gray-600 self-end pb-3">
                      <input
                        type="checkbox" checked={receivedOnly}
                        onChange={e => setReceivedOnly(e.target.checked)}
                        className="rounded border-gray-300 text-mcsystem-600 focus:ring-mcsystem-500"
                      />
                      Só as que foram pagas
                    </label>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Valor da nota (R$)</label>
                    <input type="number" step="0.01" min="0" value={value} onChange={e => setValue(parseFloat(e.target.value) || 0)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Data de emissão</label>
                    <input type="date" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)} className={inputCls} />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>ISS (%)</label>
                  <input
                    type="number" step="0.01" min="0" value={taxes.iss || ''}
                    onChange={e => setTaxes(t => ({ ...t, iss: parseFloat(e.target.value) || 0 }))}
                    className={inputCls} placeholder="0"
                  />
                </div>
                <div>
                  <label className={labelCls}>Deduções (R$)</label>
                  <input type="number" step="0.01" min="0" value={deductions || ''} onChange={e => setDeductions(parseFloat(e.target.value) || 0)} className={inputCls} placeholder="0" />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox" checked={taxes.retainIss}
                  onChange={e => setTaxes(t => ({ ...t, retainIss: e.target.checked }))}
                  className="rounded border-gray-300 text-mcsystem-600 focus:ring-mcsystem-500"
                />
                ISS retido na fonte
              </label>

              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <button
                  type="button" onClick={() => setShowOtherTaxes(o => !o)}
                  className="w-full px-3 py-2.5 flex items-center gap-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  {showOtherTaxes ? <ChevronDown size={15} className="text-gray-400" /> : <ChevronRight size={15} className="text-gray-400" />}
                  Outros impostos (COFINS, CSLL, INSS, IR, PIS)
                </button>
                {showOtherTaxes && (
                  <div className="p-3 pt-0 border-t border-gray-100">
                    <div className="grid grid-cols-3 gap-3 pt-3">
                      {taxField('cofins', 'COFINS (%)')}
                      {taxField('csll', 'CSLL (%)')}
                      {taxField('inss', 'INSS (%)')}
                      {taxField('ir', 'IR (%)')}
                      {taxField('pis', 'PIS (%)')}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className={labelCls}>Observações</label>
                <textarea value={observations} onChange={e => setObservations(e.target.value)} rows={2} className={inputCls} />
              </div>
            </>
          )}
        </div>

        <div className="bg-gray-50 px-6 py-4 border-t border-gray-100 flex justify-between items-center gap-3">
          {isSub && existing ? (
            <button
              onClick={removeSettings} disabled={saving}
              className="px-4 py-2.5 rounded-lg text-red-600 font-medium hover:bg-red-50 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <Trash2 size={16} /> Parar de emitir
            </button>
          ) : <span />}
          <div className="flex gap-3">
            <button onClick={onClose} disabled={saving} className="px-4 py-2.5 rounded-lg text-gray-600 font-medium hover:bg-gray-200 transition-colors disabled:opacity-50">
              Cancelar
            </button>
            <button
              onClick={save} disabled={saving || loading || !!error}
              className="px-5 py-2.5 bg-mcsystem-900 text-white rounded-lg font-semibold hover:bg-mcsystem-800 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {isSub ? 'Salvar' : 'Emitir nota'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
