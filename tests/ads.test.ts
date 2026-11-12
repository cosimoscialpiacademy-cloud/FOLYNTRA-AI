import { describe, expect, it } from 'vitest';
import { parseAdsReport, parseAmount, parseKdpRoyalties } from '../src/lib/ads/import';
import { adMargin, breakEven, buildAdPlan, groupRows, planToCsv, summarizeSales, totals } from '../src/lib/ads/metrics';
import { sampleBundle } from './fixtures';

describe('importi', () => {
  it('interpreta formati italiani e inglesi', () => {
    expect(parseAmount('€ 1.234,56')).toBe(1234.56);
    expect(parseAmount('$1,234.56')).toBe(1234.56);
    expect(parseAmount('12,5')).toBe(12.5);
    expect(parseAmount('1,200')).toBe(1200);
    expect(parseAmount('3.5%')).toBe(3.5);
    expect(parseAmount('')).toBe(0);
    expect(parseAmount('abc')).toBeNaN();
  });
});

describe('report Ads', () => {
  const csv = 'Campaign Name,Targeting,Impressions,Clicks,Spend,7 Day Total Sales,7 Day Total Orders (#)\n"A","kw1","1,200",40,"€ 12,00","€ 38,97",3\n"A","kw2",800,10,"€ 4,00","€ 0,00",0\n\n"B","kw3",x,1,1,1,1\n';
  it('calcola ACOS, ROAS, CPC, CTR e conversione dalle righe valide', () => {
    const r = parseAdsReport(csv);
    expect(r.rows).toHaveLength(2);
    expect(r.errors).toEqual([{ row: 5, message: 'Valore non numerico nella colonna "impressions".' }]);
    const t = totals(r.rows);
    expect(t).toMatchObject({ impressions: 2000, clicks: 50, spend: 16, sales: 38.97, orders: 3, acosPct: 41.06, roas: 2.44, cpc: 0.32, ctrPct: 2.5, cvrPct: 6 });
    const byTarget = groupRows(r.rows, 'target');
    expect(byTarget[0].key).toBe('kw1');
    expect(byTarget[1].totals.acosPct).toBeNull();
  });
  it('senza dati le metriche sono "non calcolabili", non zero', () => {
    expect(totals([])).toMatchObject({ acosPct: null, roas: null, cpc: null, ctrPct: null, cvrPct: null, spend: 0 });
  });
  it('intestazioni italiane e file non riconosciuto', () => {
    expect(parseAdsReport('Nome campagna,Parola chiave,Impressioni,Clic,Spesa,Vendite totali,Ordini totali\nX,k,10,1,"0,50","9,99",1\n').rows[0]).toMatchObject({ campaign: 'X', target: 'k', spend: 0.5, sales: 9.99, orders: 1 });
    expect(parseAdsReport('a,b\n1,2\n').errors[0].message).toMatch(/Colonne non riconosciute/);
    expect(parseAdsReport('').errors[0].message).toMatch(/vuoto/);
  });
});

describe('pareggio e margine', () => {
  it('ACOS di pareggio = royalty ÷ prezzo; CPC massimo dalla conversione ipotizzata', () => {
    expect(breakEven({ listPrice: 12.99, royaltyPerSale: 3.9, assumedCvrPct: 8, dailyBudget: 5, defaultBid: 0.35 })).toEqual({ breakEvenAcosPct: 30.02, maxCpc: 0.31, clicksPerDay: 14 });
    expect(breakEven({ listPrice: 12.99, royaltyPerSale: -1, assumedCvrPct: 8, dailyBudget: 5, defaultBid: 0 })).toEqual({ breakEvenAcosPct: null, maxCpc: null, clicksPerDay: null });
  });
  it('il margine può essere negativo', () => {
    expect(adMargin(totals([{ campaign: '', target: '', impressions: 100, clicks: 20, spend: 16, sales: 38.97, orders: 3 }]), 3.9)).toEqual({ estimatedRoyalties: 11.7, margin: -4.3 });
  });
});

describe('piano e royalties', () => {
  it('il piano nasce dalle keyword del libro, senza ASIN non verificati', () => {
    const { project } = sampleBundle();
    const plan = buildAdPlan({ id: 'p', project, niche: null, now: 'x' });
    expect(plan.status).toBe('planning');
    expect(plan.groups.map((g) => g.matchType)).toEqual(['exact', 'phrase', 'broad']);
    expect(plan.groups[0].keywords).toHaveLength(7);
    expect(plan.asinTargets).toEqual([]);
    expect(planToCsv(plan).split('\n')[0]).toBe('tipo,gruppo,corrispondenza,valore,offerta');
  });
  it('importa le royalties, scarta le righe non valide e riassume per mercato e valuta', () => {
    let n = 0;
    const r = parseKdpRoyalties('Royalty Date,Title,Marketplace,Units Sold,Royalty,Currency\n2026-10-31,"L",Amazon.it,5,"18,50",EUR\n2026-10,"L",Amazon.com,2,6.10,USD\nboh,"L",Amazon.it,1,1,EUR\n', { projectId: 'p', newId: () => `s${++n}`, defaultCurrency: 'EUR' });
    expect(r.entries).toHaveLength(2);
    expect(r.entries[1].date).toBe('2026-10-01');
    expect(r.errors).toEqual([{ row: 4, message: 'Data non valida: "boh".' }]);
    const s = summarizeSales(r.entries);
    expect(s.units).toBe(7);
    expect(s.byCurrency).toEqual([{ currency: 'EUR', royalty: 18.5, units: 5 }, { currency: 'USD', royalty: 6.1, units: 2 }]);
    expect(s.from).toBe('2026-10-01');
  });
});
