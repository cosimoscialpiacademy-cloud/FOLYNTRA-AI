import { describe, it, expect } from 'vitest';
import { scoreNiche } from '../src/lib/niche-score';
import { estimatedPaperRoyalty, simulateProfit } from '../src/lib/unit-economics';

describe('nicchia', () => {
  it('calcola score documentato', () => {
    const r = scoreNiche({demand:80,competition:40,trend:60,unitEconomics:70,differentiation:80,evidenceConfidence:85});
    expect(r.score).toBe(70);
    expect(r.confidence).toBe(85);
  });
  it('non attribuisce confidenza a demo', () => {
    expect(scoreNiche({demand:90,competition:10,trend:90,unitEconomics:90,differentiation:90,evidenceConfidence:100,demoOnly:true}).confidence).toBe(0);
  });
});

describe('scenario economico', () => {
  it('rimuove costi stampa e di promozione', () => {
    expect(estimatedPaperRoyalty({listPrice:12,printingCost:3.5,currency:'EUR'}).royaltyPerSale).toBe(3.7);
    expect(simulateProfit({hypotheticalUnits:50,royaltyPerSale:3,adSpend:70,aiSpend:20,otherCosts:0}).netBeforeTax).toBe(60);
  });
});
