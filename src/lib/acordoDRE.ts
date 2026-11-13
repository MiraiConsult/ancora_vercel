import { FinancialRecord } from '../types';

/**
 * Do que o devedor paga num acordo, 80% são do credor (o cliente do MDT) e 20%
 * ficam com a Mirai. No DRE a receita do acordo é só esses 20%; os 2% do Diego
 * da BR Clin saem deles, como despesa em REPASSE BR CLIN.
 */
export const PARTE_MIRAI_ACORDO = 0.2;

/** O PIX ao credor é os 80% que já não entram como receita: fica fora do DRE. */
export const RUBRICA_REPASSE_CREDOR = 'coa_repasse_credor';

const centavos = (v: number) => Math.round(v * 100) / 100;

/** Os lançamentos como o DRE os conta: acordo pela parte da Mirai, sem o repasse ao credor. */
export function paraDRE(records: FinancialRecord[], idsAcordo: Set<string>): FinancialRecord[] {
  if (!idsAcordo.size) return records.filter(r => r.rubricId !== RUBRICA_REPASSE_CREDOR);
  return records
    .filter(r => r.rubricId !== RUBRICA_REPASSE_CREDOR)
    .map(r => {
      if (!(r.amount > 0)) return r;
      if (r.split_revenue?.length) {
        if (!r.split_revenue.some(sp => idsAcordo.has(sp.product_id || ''))) return r;
        let corte = 0;
        const split = r.split_revenue.map(sp => {
          if (!idsAcordo.has(sp.product_id || '')) return sp;
          const parte = centavos(sp.amount * PARTE_MIRAI_ACORDO);
          corte += sp.amount - parte;
          return { ...sp, amount: parte };
        });
        return { ...r, amount: centavos(r.amount - corte), split_revenue: split };
      }
      if (r.product_id && idsAcordo.has(r.product_id)) {
        return { ...r, amount: centavos(r.amount * PARTE_MIRAI_ACORDO), description: `${r.description} (20% Mirai)` };
      }
      return r;
    });
}
