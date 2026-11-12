/**
 * Prezzi Anthropic in USD per milione di token (tabella al 03/11/2026).
 * Aggiornabile: verificare https://www.anthropic.com/pricing prima di fidarsi dei costi.
 */
export const DEFAULT_MODEL = 'claude-opus-5-5';

export const MODEL_PRICING: Record<string, { input: number; output: number; label: string }> = {
  'claude-opus-5-5': { input: 4, output: 20, label: 'Claude Opus 5.5' },
  'claude-sonnet-5-5': { input: 2, output: 10, label: 'Claude Sonnet 5.5' },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, label: 'Claude Haiku 5.5' },
  'claude-fable-5-2': { input: 8, output: 40, label: 'Claude Fable 5.2' },
};

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  /** false se il modello non è in tabella: il costo è calcolato con il listino più caro noto. */
  priceKnown: boolean;
}

export function priceFor(model: string): { input: number; output: number; known: boolean } {
  const p = MODEL_PRICING[model];
  return p ? { input: p.input, output: p.output, known: true } : { input: 8, output: 40, known: false };
}

export function computeCost(model: string, inputTokens: number, outputTokens: number): Usage {
  const p = priceFor(model);
  const costUsd = (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
  return { inputTokens, outputTokens, costUsd: Math.round(costUsd * 1e6) / 1e6, priceKnown: p.known };
}

/** Stima prudente (caso peggiore) prima della chiamata, per il controllo budget. */
export function worstCaseCost(model: string, inputChars: number, maxTokens: number): number {
  const p = priceFor(model);
  return ((inputChars / 2.5) * p.input + maxTokens * p.output) / 1_000_000;
}
