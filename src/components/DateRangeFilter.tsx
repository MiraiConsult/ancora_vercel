import React, { useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

export interface DateRange { from: string; to: string }

const iso = (d: Date) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};
const fmt = (s?: string) => (s ? s.slice(0, 10).split('-').reverse().join('/') : '');
const addDays = (s: string, n: number) => {
  const d = new Date(s + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return iso(d);
};
const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000);

/** Atalhos do filtro — os mesmos em toda tela do sistema. */
export const PRESETS: { key: string; label: string; range: () => DateRange }[] = [
  { key: 'TODAY', label: 'Hoje', range: () => { const t = iso(new Date()); return { from: t, to: t }; } },
  {
    key: 'WEEK', label: 'Esta semana',
    range: () => {
      const d = new Date();
      const ini = new Date(d); ini.setDate(d.getDate() - d.getDay());
      const fim = new Date(ini); fim.setDate(ini.getDate() + 6);
      return { from: iso(ini), to: iso(fim) };
    },
  },
  {
    key: 'MONTH', label: 'Este mês',
    range: () => {
      const d = new Date();
      return { from: iso(new Date(d.getFullYear(), d.getMonth(), 1)), to: iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
    },
  },
  {
    key: 'YEAR', label: 'Este ano',
    range: () => {
      const y = new Date().getFullYear();
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    },
  },
  { key: 'LAST30', label: 'Últimos 30 dias', range: () => ({ from: addDays(iso(new Date()), -29), to: iso(new Date()) }) },
  {
    key: 'LAST12M', label: 'Últimos 12 meses',
    range: () => {
      const d = new Date();
      const ini = new Date(d.getFullYear(), d.getMonth() - 11, 1);
      return { from: iso(ini), to: iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
    },
  },
  { key: 'ALL', label: 'Todo o período', range: () => ({ from: '', to: '' }) },
];

export const presetRange = (key: string): DateRange =>
  (PRESETS.find(p => p.key === key) || PRESETS[2]).range();

/**
 * Filtro de período usado em todas as telas: atalhos, intervalo livre e setas
 * que andam uma janela inteira por vez. Ter um componente só é o que mantém o
 * comportamento igual — antes cada tela tinha o seu, com regras diferentes.
 */
export const DateRangeFilter: React.FC<{
  value: DateRange;
  onChange: (r: DateRange) => void;
  /** Rótulo à esquerda, ex. "Vencimento". */
  label?: string;
  className?: string;
}> = ({ value, onChange, label, className = '' }) => {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(false);

  const shift = (dir: -1 | 1) => {
    if (!value.from || !value.to) return;
    const len = daysBetween(value.from, value.to) + 1;
    onChange({ from: addDays(value.from, dir * len), to: addDays(value.to, dir * len) });
  };

  const resumo = value.from && value.to
    ? `${fmt(value.from)} até ${fmt(value.to)}`
    : value.from ? `a partir de ${fmt(value.from)}`
      : value.to ? `até ${fmt(value.to)}` : 'Todo o período';

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {label && <span className="text-sm text-gray-500 whitespace-nowrap">{label}</span>}

      {/* Sem overflow-hidden aqui: ele recorta o menu absoluto do filho, e o
          dropdown some sem nenhum sinal de erro. O arredondamento vai nas
          pontas dos botões. */}
      <div className="flex items-center rounded-lg border border-gray-200 bg-white">
        <button type="button" onClick={() => shift(-1)} disabled={!value.from || !value.to}
          title="Período anterior"
          className="px-2 py-2 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed border-r border-gray-200 rounded-l-lg">
          <ChevronLeft size={15} />
        </button>

        <div className="relative">
          <button type="button" onClick={() => setOpen(o => !o)}
            className="px-3 py-2 text-sm text-mcsystem-700 font-medium flex items-center gap-2 hover:bg-gray-50 whitespace-nowrap">
            <Calendar size={14} className="text-gray-400" />
            {resumo}
            <ChevronDown size={14} className="text-gray-400" />
          </button>

          {open && (
            <>
            {/* Fecha ao clicar fora sem depender de listener global — o mesmo
                padrão dos outros seletores do sistema. */}
            <div className="fixed inset-0 z-[59]" onClick={() => { setOpen(false); setCustom(false); }} />
            <div className="absolute z-[60] left-0 mt-1 w-64 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
              <ul className="py-1">
                {PRESETS.map(p => (
                  <li key={p.key}>
                    <button type="button"
                      onClick={() => { onChange(p.range()); setOpen(false); setCustom(false); }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                      {p.label}
                    </button>
                  </li>
                ))}
                <li className="border-t border-gray-100 mt-1 pt-1">
                  <button type="button" onClick={() => setCustom(c => !c)}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                    Período personalizado
                  </button>
                </li>
              </ul>

              {custom && (
                <div className="p-3 border-t border-gray-100 bg-gray-50/60 space-y-2">
                  <div>
                    <label className="block text-[11px] font-medium text-gray-500 mb-1">De</label>
                    <input type="date" value={value.from} onChange={e => onChange({ ...value, from: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm outline-none focus:border-mcsystem-500" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-gray-500 mb-1">Até</label>
                    <input type="date" value={value.to} onChange={e => onChange({ ...value, to: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm outline-none focus:border-mcsystem-500" />
                  </div>
                </div>
              )}
            </div>
            </>
          )}
        </div>

        <button type="button" onClick={() => shift(1)} disabled={!value.from || !value.to}
          title="Próximo período"
          className="px-2 py-2 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed border-l border-gray-200 rounded-r-lg">
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
};

/** Um lançamento cai no período? Data vazia dos dois lados = sem filtro. */
export const inRange = (date: string | undefined, r: DateRange): boolean => {
  if (!r.from && !r.to) return true;
  const d = (date || '').slice(0, 10);
  if (!d) return false;
  if (r.from && d < r.from) return false;
  if (r.to && d > r.to) return false;
  return true;
};
