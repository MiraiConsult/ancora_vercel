import React, { useMemo, useState, useEffect } from 'react';
import { Company, Product, ContractTemplate, Contract, Tenant, User } from '../types';
import { supabase } from '../lib/supabaseClient';
import {
  FileSignature, FileText, Plus, Save, X, Search, Printer, Copy, Check, Trash2,
  Loader2, Package, ChevronRight, Eye, Pencil, AlertCircle,
} from 'lucide-react';

interface ContractsModuleProps {
  companies: Company[];
  products: Product[];
  tenant: Tenant | null;
  currentUser: User;
}

const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const fmtDate = (iso?: string) => {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};
const todayISO = () => new Date().toISOString().slice(0, 10);
const addMonths = (iso: string, months: number) => {
  const d = new Date(iso + 'T00:00:00');
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
};
const longDate = (iso?: string) => {
  if (!iso) return '';
  const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${parseInt(d)} de ${meses[parseInt(m) - 1]} de ${y}`;
};

// Valor por extenso (reais)
const numeroExtenso = (n: number): string => {
  const u = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  const dez = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const cem = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
  const ate999 = (v: number): string => {
    if (v === 0) return '';
    if (v === 100) return 'cem';
    const c = Math.floor(v / 100), r = v % 100;
    const parts: string[] = [];
    if (c) parts.push(cem[c]);
    if (r) {
      if (r < 20) parts.push(u[r]);
      else {
        const d = Math.floor(r / 10), un = r % 10;
        parts.push(un ? `${dez[d]} e ${u[un]}` : dez[d]);
      }
    }
    return parts.join(' e ');
  };
  const int = Math.floor(Math.abs(n));
  const cents = Math.round((Math.abs(n) - int) * 100);
  const partes: string[] = [];
  const mi = Math.floor(int / 1_000_000);
  const mil = Math.floor((int % 1_000_000) / 1000);
  const resto = int % 1000;
  if (mi) partes.push(`${mi === 1 ? 'um milhão' : ate999(mi) + ' milhões'}`);
  if (mil) partes.push(`${mil === 1 ? 'mil' : ate999(mil) + ' mil'}`);
  if (resto) partes.push(ate999(resto));
  let txt = partes.join(' e ') || 'zero';
  txt += int === 1 ? ' real' : ' reais';
  if (cents) txt += ` e ${ate999(cents)} ${cents === 1 ? 'centavo' : 'centavos'}`;
  return txt;
};

const VARIABLES: { key: string; label: string }[] = [
  { key: 'cliente', label: 'Nome do cliente' },
  { key: 'cnpj', label: 'CNPJ/CPF do cliente' },
  { key: 'endereco', label: 'Endereço do cliente' },
  { key: 'produto', label: 'Produto/serviço' },
  { key: 'valor', label: 'Valor (R$)' },
  { key: 'valor_extenso', label: 'Valor por extenso' },
  { key: 'vigencia', label: 'Vigência (meses)' },
  { key: 'data_inicio', label: 'Data de início' },
  { key: 'data_fim', label: 'Data de término' },
  { key: 'dia_vencimento', label: 'Dia do vencimento' },
  { key: 'numero', label: 'Número do contrato' },
  { key: 'hoje', label: 'Data de hoje (por extenso)' },
  { key: 'empresa', label: 'Sua empresa (contratada)' },
  { key: 'empresa_cnpj', label: 'CNPJ da sua empresa' },
];

const DEFAULT_TEMPLATE = `CONTRATO DE PRESTAÇÃO DE SERVIÇOS Nº {{numero}}

CONTRATADA: {{empresa}}, inscrita no CNPJ sob o nº {{empresa_cnpj}}.

CONTRATANTE: {{cliente}}, inscrita no CNPJ/CPF sob o nº {{cnpj}}, com endereço em {{endereco}}.

As partes acima qualificadas têm entre si justo e contratado o seguinte:

CLÁUSULA 1ª — DO OBJETO
O presente contrato tem por objeto a prestação, pela CONTRATADA, dos serviços de {{produto}}, conforme escopo e condições descritos neste instrumento.

CLÁUSULA 2ª — DO VALOR E DA FORMA DE PAGAMENTO
Pelos serviços prestados, a CONTRATANTE pagará à CONTRATADA o valor de {{valor}} ({{valor_extenso}}), com vencimento todo dia {{dia_vencimento}} de cada mês.

CLÁUSULA 3ª — DO PRAZO
O presente contrato terá vigência de {{vigencia}} meses, com início em {{data_inicio}} e término em {{data_fim}}, renovando-se automaticamente por igual período caso não haja manifestação em contrário por qualquer das partes com antecedência mínima de 30 (trinta) dias.

CLÁUSULA 4ª — DAS OBRIGAÇÕES DA CONTRATADA
a) Executar os serviços com zelo, qualidade técnica e dentro dos prazos acordados;
b) Manter sigilo sobre todas as informações a que tiver acesso em razão deste contrato;
c) Comunicar previamente qualquer fato que possa impactar a execução dos serviços.

CLÁUSULA 5ª — DAS OBRIGAÇÕES DA CONTRATANTE
a) Efetuar os pagamentos nas datas acordadas;
b) Fornecer as informações, acessos e materiais necessários à execução dos serviços;
c) Indicar um responsável para acompanhamento e aprovações.

CLÁUSULA 6ª — DA RESCISÃO
O contrato poderá ser rescindido por qualquer das partes, mediante aviso prévio de 30 (trinta) dias. O descumprimento de qualquer cláusula autoriza a rescisão imediata pela parte prejudicada, sem prejuízo das obrigações já vencidas.

CLÁUSULA 7ª — DO FORO
Fica eleito o foro da comarca da sede da CONTRATADA para dirimir quaisquer dúvidas oriundas deste contrato.

E, por estarem justas e contratadas, as partes assinam o presente instrumento.

{{hoje}}


_______________________________________
{{empresa}}
CONTRATADA


_______________________________________
{{cliente}}
CONTRATANTE`;

export const ContractsModule: React.FC<ContractsModuleProps> = ({ companies, products, tenant, currentUser }) => {
  const [tab, setTab] = useState<'CONTRACTS' | 'TEMPLATES'>('CONTRACTS');
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [editingTemplate, setEditingTemplate] = useState<{ productId: string | null; name: string; content: string; id?: string } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [viewing, setViewing] = useState<Contract | null>(null);

  const productName = (id?: string | null) => products.find(p => p.id === id)?.name || null;
  const clientName = (id?: string) => companies.find(c => c.id === id)?.name || 'Sem cliente';

  useEffect(() => {
    (async () => {
      const [t, c] = await Promise.all([
        supabase.from('contract_templates').select('*'),
        supabase.from('contracts').select('*').order('created_at', { ascending: false }),
      ]);
      if (t.error) console.warn('contract_templates:', t.error.message);
      if (c.error) console.warn('contracts:', c.error.message);
      setTemplates(t.data || []);
      setContracts(c.data || []);
      setLoading(false);
    })();
  }, []);

  const templateFor = (productId?: string | null) =>
    templates.find(t => (t.product_id || null) === (productId || null));

  const saveTemplate = async () => {
    if (!editingTemplate) return;
    const payload: any = {
      tenant_id: currentUser.tenant_id,
      product_id: editingTemplate.productId,
      name: editingTemplate.name || 'Modelo de contrato',
      content: editingTemplate.content,
      updated_at: new Date().toISOString(),
    };
    if (editingTemplate.id) payload.id = editingTemplate.id;

    const { data, error } = await supabase.from('contract_templates').upsert(payload).select().single();
    if (error) { alert('Erro ao salvar modelo: ' + error.message); return; }
    setTemplates(prev => {
      const others = prev.filter(t => t.id !== data.id);
      return [...others, data as ContractTemplate];
    });
    setEditingTemplate(null);
  };

  const deleteContract = async (c: Contract) => {
    if (!window.confirm(`Excluir o contrato ${c.number || ''} de ${clientName(c.client_id)}?`)) return;
    const { error } = await supabase.from('contracts').delete().eq('id', c.id);
    if (error) { alert('Erro ao excluir: ' + error.message); return; }
    setContracts(prev => prev.filter(x => x.id !== c.id));
  };

  const filteredContracts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contracts;
    return contracts.filter(c =>
      clientName(c.client_id).toLowerCase().includes(q) ||
      (c.title || '').toLowerCase().includes(q) ||
      (c.number || '').toLowerCase().includes(q));
  }, [contracts, search, companies]);

  if (loading) {
    return <div className="py-24 text-center text-gray-400 text-sm flex items-center justify-center gap-2">
      <Loader2 size={16} className="animate-spin" /> Carregando contratos...
    </div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-gray-200/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="bg-gray-900 p-3 rounded-xl text-white"><FileSignature size={26} /></div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Contratos</h2>
            <p className="text-gray-500 text-sm mt-0.5">Gere contratos a partir de um modelo por produto.</p>
          </div>
        </div>
        <button onClick={() => setGenerating(true)}
          className="px-5 py-3 bg-gray-900 text-white rounded-xl font-semibold hover:bg-gray-800 transition-colors flex items-center justify-center gap-2">
          <Plus size={18} /> Gerar contrato
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button onClick={() => setTab('CONTRACTS')}
          className={`px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-colors ${tab === 'CONTRACTS' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
          <FileText size={16} /> Contratos gerados
        </button>
        <button onClick={() => setTab('TEMPLATES')}
          className={`px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-colors ${tab === 'TEMPLATES' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
          <Package size={16} /> Modelos por produto
        </button>
      </div>

      {tab === 'TEMPLATES' ? (
        <div className="bg-white rounded-2xl border border-gray-200/80 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">Modelo de contrato por produto</h3>
            <p className="text-xs text-gray-400 mt-0.5">Cada produto pode ter seu próprio modelo. O modelo padrão é usado quando o produto não tem um específico.</p>
          </div>
          <div className="divide-y divide-gray-100">
            {/* Modelo padrão */}
            <TemplateRow
              label="Modelo padrão"
              hint="Usado para produtos sem modelo próprio"
              template={templateFor(null)}
              onEdit={() => {
                const t = templateFor(null);
                setEditingTemplate({ productId: null, id: t?.id, name: t?.name || 'Modelo padrão', content: t?.content || DEFAULT_TEMPLATE });
              }}
            />
            {products.filter(p => p.active).map(p => (
              <TemplateRow
                key={p.id}
                label={p.name}
                hint={p.price ? brl(p.price) : undefined}
                template={templateFor(p.id)}
                onEdit={() => {
                  const t = templateFor(p.id);
                  setEditingTemplate({
                    productId: p.id, id: t?.id,
                    name: t?.name || `Contrato — ${p.name}`,
                    content: t?.content || templateFor(null)?.content || DEFAULT_TEMPLATE,
                  });
                }}
              />
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por cliente, título ou número..."
              className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-gray-200 focus:border-gray-400 outline-none text-sm" />
          </div>

          <div className="bg-white rounded-2xl border border-gray-200/80 overflow-hidden">
            {filteredContracts.length === 0 ? (
              <div className="py-16 text-center">
                <FileSignature size={40} className="mx-auto text-gray-200 mb-3" />
                <p className="text-sm text-gray-400">Nenhum contrato gerado ainda.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {filteredContracts.map(c => (
                  <div key={c.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900">{clientName(c.client_id)}</span>
                        {c.number && <span className="text-[11px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{c.number}</span>}
                        {productName(c.product_id) && (
                          <span className="text-[11px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{productName(c.product_id)}</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {c.title} · {brl(c.value || 0)}
                        {c.start_date && ` · início ${fmtDate(c.start_date)}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setViewing(c)} className="px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 rounded-lg flex items-center gap-1.5">
                        <Eye size={14} /> Abrir
                      </button>
                      <button onClick={() => deleteContract(c)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {editingTemplate && (
        <TemplateEditor
          value={editingTemplate}
          onChange={setEditingTemplate}
          onClose={() => setEditingTemplate(null)}
          onSave={saveTemplate}
          onUseDefault={() => setEditingTemplate(t => t && ({ ...t, content: DEFAULT_TEMPLATE }))}
        />
      )}

      {generating && (
        <GenerateContractModal
          companies={companies}
          products={products}
          tenant={tenant}
          templates={templates}
          defaultTemplate={DEFAULT_TEMPLATE}
          contractsCount={contracts.length}
          currentUser={currentUser}
          onClose={() => setGenerating(false)}
          onCreated={c => { setContracts(prev => [c, ...prev]); setGenerating(false); setViewing(c); }}
        />
      )}

      {viewing && <ContractViewer contract={viewing} clientName={clientName(viewing.client_id)} onClose={() => setViewing(null)} />}
    </div>
  );
};

// ---------- Linha de modelo ----------

const TemplateRow: React.FC<{ label: string; hint?: string; template?: ContractTemplate; onEdit: () => void }> = ({ label, hint, template, onEdit }) => (
  <button onClick={onEdit} className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-50 text-left transition-colors">
    <div className="flex-1 min-w-0">
      <div className="font-medium text-gray-900">{label}</div>
      <div className="text-xs text-gray-400 mt-0.5">
        {template
          ? `Modelo configurado · ${template.content.length.toLocaleString('pt-BR')} caracteres`
          : 'Sem modelo — usará o padrão'}
        {hint && ` · ${hint}`}
      </div>
    </div>
    {template
      ? <span className="text-[11px] font-semibold text-green-700 bg-green-50 px-2 py-1 rounded-md">Configurado</span>
      : <span className="text-[11px] font-semibold text-gray-500 bg-gray-100 px-2 py-1 rounded-md">Padrão</span>}
    <Pencil size={15} className="text-gray-300" />
  </button>
);

// ---------- Editor de modelo ----------

const TemplateEditor: React.FC<{
  value: { productId: string | null; name: string; content: string; id?: string };
  onChange: (v: any) => void;
  onClose: () => void;
  onSave: () => void;
  onUseDefault: () => void;
}> = ({ value, onChange, onClose, onSave, onUseDefault }) => {
  const insertVar = (key: string) => onChange({ ...value, content: `${value.content}{{${key}}}` });
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-900">Editar modelo</h3>
            <input value={value.name} onChange={e => onChange({ ...value, name: e.target.value })}
              className="mt-1 text-sm text-gray-500 border-b border-transparent hover:border-gray-200 focus:border-gray-400 outline-none" />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onUseDefault} className="text-xs font-semibold text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg px-3 py-1.5">
              Carregar modelo base
            </button>
            <button onClick={onSave} className="text-sm font-semibold bg-gray-900 text-white rounded-lg px-4 py-2 flex items-center gap-1.5 hover:bg-gray-800">
              <Save size={15} /> Salvar
            </button>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
          </div>
        </div>

        <div className="px-6 py-3 border-b border-gray-100 bg-gray-50/60">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Clique para inserir uma variável</p>
          <div className="flex flex-wrap gap-1.5">
            {VARIABLES.map(v => (
              <button key={v.key} onClick={() => insertVar(v.key)} title={v.label}
                className="text-[11px] font-mono bg-white border border-gray-200 hover:border-gray-400 text-gray-700 px-2 py-1 rounded-md transition-colors">
                {`{{${v.key}}}`}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-hidden p-6">
          <textarea value={value.content} onChange={e => onChange({ ...value, content: e.target.value })}
            className="w-full h-full min-h-[380px] font-mono text-sm leading-relaxed border border-gray-200 rounded-xl p-4 outline-none focus:border-gray-400 resize-none"
            placeholder="Escreva o contrato usando as variáveis acima..." />
        </div>
      </div>
    </div>
  );
};

// ---------- Gerar contrato ----------

const GenerateContractModal: React.FC<{
  companies: Company[]; products: Product[]; tenant: Tenant | null;
  templates: ContractTemplate[]; defaultTemplate: string; contractsCount: number; currentUser: User;
  onClose: () => void; onCreated: (c: Contract) => void;
}> = ({ companies, products, tenant, templates, defaultTemplate, contractsCount, currentUser, onClose, onCreated }) => {
  const [clientId, setClientId] = useState('');
  const [productId, setProductId] = useState('');
  const [value, setValue] = useState(0);
  const [startDate, setStartDate] = useState(todayISO());
  const [months, setMonths] = useState(12);
  const [dueDay, setDueDay] = useState(10);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);

  const client = companies.find(c => c.id === clientId);
  const product = products.find(p => p.id === productId);
  const template = templates.find(t => (t.product_id || null) === (productId || null))
    || templates.find(t => !t.product_id);
  const templateContent = template?.content || defaultTemplate;

  useEffect(() => { if (product && !value) setValue(product.price || 0); }, [productId]);

  const number = `${new Date().getFullYear()}-${String(contractsCount + 1).padStart(3, '0')}`;
  const endDate = addMonths(startDate, months);

  const vars: Record<string, string> = {
    cliente: client?.name || '',
    cnpj: client?.cnpj || '',
    endereco: client?.location || '',
    produto: product?.name || '',
    valor: brl(value),
    valor_extenso: numeroExtenso(value),
    vigencia: String(months),
    data_inicio: fmtDate(startDate),
    data_fim: fmtDate(endDate),
    dia_vencimento: String(dueDay),
    numero: number,
    hoje: longDate(todayISO()),
    empresa: tenant?.name || '',
    empresa_cnpj: (tenant as any)?.cnpj || '',
  };

  const rendered = useMemo(
    () => templateContent.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`),
    [templateContent, clientId, productId, value, startDate, months, dueDay, tenant],
  );

  const missing = useMemo(() => {
    const found = new Set<string>();
    const re = /\{\{\s*(\w+)\s*\}\}/g;
    let m;
    while ((m = re.exec(templateContent))) { if (!vars[m[1]]) found.add(m[1]); }
    return Array.from(found);
  }, [templateContent, vars]);

  const save = async () => {
    if (!clientId) return alert('Selecione o cliente.');
    setSaving(true);
    const payload: any = {
      tenant_id: currentUser.tenant_id,
      number,
      client_id: clientId,
      product_id: productId || null,
      template_id: template?.id || null,
      title: product ? `Contrato — ${product.name}` : 'Contrato de prestação de serviços',
      content: rendered,
      variables: vars,
      value,
      start_date: startDate,
      end_date: endDate,
      status: 'ACTIVE',
    };
    const { data, error } = await supabase.from('contracts').insert(payload).select().single();
    setSaving(false);
    if (error) { alert('Erro ao salvar contrato: ' + error.message); return; }
    onCreated(data as Contract);
  };

  const inputCls = 'w-full px-3 py-2.5 rounded-lg border border-gray-200 focus:border-gray-400 outline-none text-sm';
  const labelCls = 'block text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5';

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-900">Gerar contrato</h3>
            <p className="text-xs text-gray-400 mt-0.5">Nº {number}{template ? ` · modelo: ${template.name}` : ' · modelo padrão'}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setPreview(p => !p)}
              className="text-xs font-semibold text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50">
              {preview ? 'Editar dados' : 'Pré-visualizar'}
            </button>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {preview ? (
            <pre className="whitespace-pre-wrap font-serif text-[13px] leading-relaxed text-gray-800">{rendered}</pre>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Cliente *</label>
                  <select value={clientId} onChange={e => setClientId(e.target.value)} className={inputCls}>
                    <option value="">Selecione...</option>
                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Produto</label>
                  <select value={productId} onChange={e => { setProductId(e.target.value); const p = products.find(x => x.id === e.target.value); if (p) setValue(p.price || 0); }} className={inputCls}>
                    <option value="">Nenhum (modelo padrão)</option>
                    {products.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className={labelCls}>Valor (R$)</label>
                  <input type="number" step="0.01" min="0" value={value} onChange={e => setValue(parseFloat(e.target.value) || 0)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Início</label>
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Vigência (meses)</label>
                  <input type="number" min="1" value={months} onChange={e => setMonths(parseInt(e.target.value) || 1)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Dia vencimento</label>
                  <input type="number" min="1" max="31" value={dueDay} onChange={e => setDueDay(parseInt(e.target.value) || 1)} className={inputCls} />
                </div>
              </div>

              {client && !client.cnpj && (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2">
                  <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                  Este cliente está sem CNPJ/CPF — o campo ficará em branco no contrato. Complete o cadastro em Clientes.
                </div>
              )}
              {missing.length > 0 && (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2">
                  <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                  Variáveis sem valor: {missing.map(m => `{{${m}}}`).join(', ')}
                </div>
              )}

              <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-600">
                <div className="font-semibold text-gray-800 mb-1">Resumo</div>
                {clientName(client)} · {product?.name || 'Sem produto'} · {brl(value)} · {months} meses
                ({fmtDate(startDate)} a {fmtDate(endDate)}) · vencimento dia {dueDay}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2.5 rounded-lg text-gray-600 font-medium hover:bg-gray-100">Cancelar</button>
          <button onClick={save} disabled={saving || !clientId}
            className="px-5 py-2.5 bg-gray-900 text-white rounded-lg font-semibold hover:bg-gray-800 flex items-center gap-2 disabled:opacity-50">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Gerar contrato
          </button>
        </div>
      </div>
    </div>
  );
};

const clientName = (c?: Company) => c?.name || 'Sem cliente';

// ---------- Visualizador / impressão ----------

const ContractViewer: React.FC<{ contract: Contract; clientName: string; onClose: () => void }> = ({ contract, clientName, onClose }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard?.writeText(contract.content); setCopied(true); setTimeout(() => setCopied(false), 1600); };
  const print = () => {
    const w = window.open('', '_blank', 'width=820,height=900');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${contract.number || 'Contrato'} — ${clientName}</title>
      <style>
        @page { margin: 2.5cm 2cm; }
        body { font-family: Georgia, 'Times New Roman', serif; font-size: 12pt; line-height: 1.7; color: #111; white-space: pre-wrap; }
      </style></head><body>${contract.content.replace(/[<>&]/g, s => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[s] as string))}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 250);
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="min-w-0">
            <h3 className="font-bold text-gray-900 truncate">{contract.title}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{contract.number} · {clientName}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={copy} className="text-xs font-semibold text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 flex items-center gap-1.5">
              {copied ? <Check size={13} className="text-green-600" /> : <Copy size={13} />} Copiar
            </button>
            <button onClick={print} className="text-xs font-semibold bg-gray-900 text-white rounded-lg px-3 py-1.5 hover:bg-gray-800 flex items-center gap-1.5">
              <Printer size={13} /> Imprimir / PDF
            </button>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
          </div>
        </div>
        <div className="overflow-y-auto p-8 bg-gray-50">
          <div className="bg-white shadow-sm border border-gray-200 rounded-lg p-10 mx-auto max-w-2xl">
            <pre className="whitespace-pre-wrap font-serif text-[13px] leading-relaxed text-gray-800">{contract.content}</pre>
          </div>
        </div>
      </div>
    </div>
  );
};
