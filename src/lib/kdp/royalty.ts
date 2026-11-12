/**
 * Simulatore royalty KDP. Tutti i risultati sono STIME: verificare sempre
 * con il calcolatore ufficiale KDP prima di fissare un prezzo.
 */
import type { Marketplace } from '../types';
import { MARKETPLACES, estimatePrintingCost } from './specs';

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface PaperbackRoyalty {
  listPrice: number;
  netPrice: number;
  rate: number;
  printingCost: number;
  printingCostVerified: boolean;
  royalty: number;
  /** Prezzo minimo perché la royalty non sia negativa. */
  minListPrice: number;
  status: 'estimate';
}

/**
 * Cartaceo: aliquota 60% (50% sotto 9,99 €/$ o 7,99 £) sul prezzo al netto IVA,
 * meno il costo di stampa. Fonte: https://kdp.amazon.com/it_IT/help/topic/G201834330
 */
export function paperbackRoyalty(input: { listPrice: number; marketplace: Marketplace; pageCount: number; printingCostOverride?: number }): PaperbackRoyalty {
  const { listPrice, marketplace, pageCount } = input;
  if (!Number.isFinite(listPrice) || listPrice < 0) throw new Error('Prezzo non valido');
  const m = MARKETPLACES[marketplace];
  const threshold = m.currency === 'GBP' ? 7.99 : 9.99;
  const rate = listPrice >= threshold ? 0.6 : 0.5;
  const est = estimatePrintingCost(pageCount, m.currency);
  const printingCost = input.printingCostOverride ?? est.cost;
  const netPrice = listPrice / (1 + m.vatBooks);
  const minAt = (r: number) => (printingCost / r) * (1 + m.vatBooks);
  const min60 = minAt(0.6);
  return {
    listPrice,
    netPrice: round2(netPrice),
    rate,
    printingCost: round2(printingCost),
    printingCostVerified: input.printingCostOverride !== undefined ? true : est.verified,
    royalty: round2(rate * netPrice - printingCost),
    minListPrice: round2(min60 >= threshold ? min60 : Math.min(minAt(0.5), threshold)),
    status: 'estimate',
  };
}

export interface EbookRoyalty {
  listPrice: number;
  rate: number;
  royalty: number;
  note: string;
  status: 'estimate';
}

/** eBook: 70% fra 2,99 e 9,99 (meno costo di consegna, qui non modellato), altrimenti 35%. */
export function ebookRoyalty(input: { listPrice: number; marketplace: Marketplace }): EbookRoyalty {
  const { listPrice, marketplace } = input;
  if (!Number.isFinite(listPrice) || listPrice < 0) throw new Error('Prezzo non valido');
  const m = MARKETPLACES[marketplace];
  const lo = m.currency === 'GBP' ? 1.77 : 2.99;
  const eligible70 = listPrice >= lo && listPrice <= 9.99;
  const rate = eligible70 ? 0.7 : 0.35;
  const net = listPrice / (1 + m.vatBooks);
  return {
    listPrice,
    rate,
    royalty: round2(rate * net),
    note: eligible70 ? 'Aliquota 70%: va sottratto il costo di consegna in base al peso del file (non modellato).' : 'Aliquota 35%: prezzo fuori dall’intervallo del 70%.',
    status: 'estimate',
  };
}

/** Tre fasce di prezzo simulate attorno al prezzo scelto. */
export function priceLadder(marketplace: Marketplace, pageCount: number, basePrice: number, printingCostOverride?: number): PaperbackRoyalty[] {
  return [-2, 0, 2].map((d) => paperbackRoyalty({ listPrice: Math.max(0.99, round2(basePrice + d)), marketplace, pageCount, printingCostOverride }));
}
