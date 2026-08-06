/**
 * Consulta de CNPJ (base pública da Receita) e de CEP, ambas pela BrasilAPI.
 * São públicas e sem chave: a chamada sai direto do navegador, sem passar por
 * Edge Function, para não gastar invocação em algo que não toca dado nosso.
 */

const digits = (s: string) => (s || '').replace(/\D/g, '');

export interface CnpjInfo {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia?: string;
  situacao?: string;
  email?: string;
  phone?: string;
  zip?: string;
  address?: string;
  addressNumber?: string;
  complement?: string;
  district?: string;
  city?: string;
  state?: string;
}

export interface CepInfo {
  zip: string;
  address?: string;
  district?: string;
  city?: string;
  state?: string;
}

/** Telefone da Receita vem como DDD+número colados. */
const fmtPhone = (raw?: string) => {
  const d = digits(raw || '');
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  return raw || undefined;
};

export const isCnpjComplete = (v: string) => digits(v).length === 14;
export const isCepComplete = (v: string) => digits(v).length === 8;

export async function lookupCnpj(value: string): Promise<CnpjInfo> {
  const cnpj = digits(value);
  if (cnpj.length !== 14) throw new Error('CNPJ precisa ter 14 números.');

  const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
  if (res.status === 404) throw new Error('CNPJ não encontrado na base da Receita.');
  if (!res.ok) throw new Error('Consulta de CNPJ indisponível no momento.');
  const d = await res.json();

  return {
    cnpj,
    razaoSocial: d.razao_social || '',
    nomeFantasia: d.nome_fantasia || undefined,
    situacao: d.descricao_situacao_cadastral || undefined,
    email: d.email || undefined,
    phone: fmtPhone(d.ddd_telefone_1),
    zip: d.cep ? digits(d.cep) : undefined,
    address: d.logradouro || undefined,
    addressNumber: d.numero || undefined,
    complement: d.complemento || undefined,
    district: d.bairro || undefined,
    city: d.municipio || undefined,
    state: d.uf || undefined,
  };
}

export async function lookupCep(value: string): Promise<CepInfo> {
  const cep = digits(value);
  if (cep.length !== 8) throw new Error('CEP precisa ter 8 números.');

  const res = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`);
  if (res.status === 404) throw new Error('CEP não encontrado.');
  if (!res.ok) throw new Error('Consulta de CEP indisponível no momento.');
  const d = await res.json();

  return {
    zip: cep,
    address: d.street || undefined,
    district: d.neighborhood || undefined,
    city: d.city || undefined,
    state: d.state || undefined,
  };
}

/** CNPJ com máscara, para exibir. */
export const maskCnpj = (v: string) => {
  const d = digits(v).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
};

export const maskCep = (v: string) => {
  const d = digits(v).slice(0, 8);
  return d.replace(/^(\d{5})(\d)/, '$1-$2');
};
