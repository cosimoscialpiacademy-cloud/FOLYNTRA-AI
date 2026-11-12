/** All revenue estimates are hypotheses until backed by imported royalty reports. */
export function estimatedPaperRoyalty(input: {
  listPrice: number;
  printingCost: number;
  currency: 'EUR' | 'USD' | 'GBP';
}): { royaltyPerSale: number; rate: number; status: 'estimate' } {
  const {listPrice, printingCost, currency} = input;
  if (![listPrice, printingCost].every(Number.isFinite) || listPrice < 0 || printingCost < 0) {
    throw new Error('Prezzo e costo stampa devono essere numeri validi non negativi');
  }
  const threshold = currency === 'GBP' ? 7.99 : 9.99;
  const rate = listPrice >= threshold ? 0.60 : 0.50;
  // Simplification for direct Amazon distribution; verify market/format/currency/print rules in KDP.
  return { royaltyPerSale: Math.round((rate*listPrice-printingCost)*100)/100, rate, status: 'estimate' };
}
export function simulateProfit(input: {
  hypotheticalUnits: number; royaltyPerSale: number;
  adSpend: number; aiSpend: number; otherCosts: number;
}) {
  const vals = Object.values(input);
  if (!vals.every(Number.isFinite) || input.hypotheticalUnits < 0 || input.adSpend < 0 || input.aiSpend < 0 || input.otherCosts < 0) {
    throw new Error('Scenario non valido');
  }
  const revenue = input.hypotheticalUnits * input.royaltyPerSale;
  const costs = input.adSpend + input.aiSpend + input.otherCosts;
  return {
    revenue: Math.round(revenue*100)/100,
    costs: Math.round(costs*100)/100,
    netBeforeTax: Math.round((revenue-costs)*100)/100,
    label: 'SCENARIO IPOTETICO, non previsione di vendita'
  };
}
