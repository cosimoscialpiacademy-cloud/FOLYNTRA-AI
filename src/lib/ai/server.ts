/**
 * Livello server dell'AI: scelta provider (Anthropic reale o mock dichiarato),
 * limiti di costo e stream NDJSON. Mai importare questo file dal client.
 */
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { z } from 'zod';
import { DEFAULT_MODEL, computeCost, worstCaseCost } from './pricing';
import { MOCK_MODEL, mockBrainstorm, mockChapter, mockConcept, mockOutline, mockReview } from './mock';
import { SYSTEM_EDITORIAL, brainstormPrompt, chapterPrompt, conceptPrompt, outlinePrompt, reviewPrompt } from './prompts';
import { BrainstormOutput, ConceptOutput, OutlineOutput, ReviewOutput, type AiEvent, type AiRequest } from './schemas';

export interface AiConfig {
  mode: 'anthropic' | 'mock';
  model: string;
  /** Perché si usa il mock (mostrato in UI): mai dichiarare l'AI "connessa" se non lo è. */
  reason: string;
  maxUsdPerBook: number;
}

export function supabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/** Codice di accesso condiviso (modalità senza Supabase): protegge AI ed esportazione su un link pubblico. */
export function accessCodeConfigured(): boolean {
  return (process.env.APP_ACCESS_CODE?.trim().length ?? 0) >= 8;
}

export function aiConfig(): AiConfig {
  const cents = Number(process.env.MAX_AI_SPEND_CENTS_PER_BOOK ?? '2000');
  const maxUsdPerBook = Number.isFinite(cents) && cents >= 0 ? cents / 100 : 20;
  const model = process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
  const mock = (reason: string): AiConfig => ({ mode: 'mock', model: MOCK_MODEL, reason, maxUsdPerBook });
  if (!process.env.ANTHROPIC_API_KEY) return mock('ANTHROPIC_API_KEY non configurata.');
  if (process.env.ENABLE_EXTERNAL_PAID_APIS !== 'true') return mock('Chiave presente ma ENABLE_EXTERNAL_PAID_APIS non è "true": nessuna spesa autorizzata.');
  if (!supabaseConfigured() && !accessCodeConfigured() && process.env.ALLOW_UNAUTHENTICATED_AI !== 'true') {
    return mock('Il server è pubblico e non protetto: imposta APP_ACCESS_CODE (almeno 8 caratteri) oppure configura Supabase (solo in ambiente privato: ALLOW_UNAUTHENTICATED_AI=true). Senza protezione chiunque conosca il link potrebbe usare la tua chiave.');
  }
  return { mode: 'anthropic', model, reason: '', maxUsdPerBook };
}

const MAX_TOKENS: Record<AiRequest['task'], number> = { brainstorm: 6000, concept: 4000, outline: 8000, chapter: 0, review: 6000 };

function chapterMaxTokens(targetWords: number): number {
  // ~2 token per parola italiana + margine per il ragionamento adattivo.
  return Math.min(24000, Math.round(targetWords * 2.4) + 3000);
}

class PublicError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
  }
}

function toPublicError(err: unknown): PublicError {
  if (err instanceof PublicError) return err;
  if (err instanceof Anthropic.AuthenticationError) return new PublicError('Chiave Anthropic non valida o revocata.', false);
  if (err instanceof Anthropic.PermissionDeniedError) return new PublicError('La chiave Anthropic non ha accesso a questo modello.', false);
  if (err instanceof Anthropic.NotFoundError) return new PublicError('Modello Anthropic inesistente: controlla ANTHROPIC_MODEL.', false);
  if (err instanceof Anthropic.RateLimitError) return new PublicError('Limite di richieste Anthropic raggiunto: riprova tra poco.', true);
  if (err instanceof Anthropic.BadRequestError) return new PublicError('Richiesta rifiutata da Anthropic (parametri non validi).', false);
  if (err instanceof Anthropic.APIConnectionError) return new PublicError('Connessione ad Anthropic non riuscita o scaduta.', true);
  if (err instanceof Anthropic.APIError) return new PublicError('Errore temporaneo del servizio Anthropic.', true);
  return new PublicError('Errore interno durante la generazione.', false);
}

function promptFor(req: AiRequest): string {
  switch (req.task) {
    case 'brainstorm': return brainstormPrompt(req.input);
    case 'concept': return conceptPrompt(req.input.brief);
    case 'outline': return outlinePrompt(req.input.brief, req.input.chapterCount, req.input.targetWords);
    case 'chapter': return chapterPrompt(req.input);
    case 'review': return reviewPrompt(req.input.brief, req.input.chapterTitle, req.input.content);
  }
}

const OUTPUT_SCHEMA = { brainstorm: BrainstormOutput, concept: ConceptOutput, outline: OutlineOutput, review: ReviewOutput } as const;

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
  });
}

async function* runMock(req: AiRequest, signal: AbortSignal): AsyncGenerator<AiEvent> {
  const usage = { inputTokens: 0, outputTokens: 0, costUsd: 0, priceKnown: true };
  const done = (extra: { data?: unknown; text?: string }): AiEvent => ({ t: 'done', provider: 'mock', model: MOCK_MODEL, usage, ...extra });
  switch (req.task) {
    case 'brainstorm': return void (yield done({ data: mockBrainstorm(req.input.theme) }));
    case 'concept': return void (yield done({ data: mockConcept(req.input.brief) }));
    case 'outline': return void (yield done({ data: mockOutline(req.input.brief, req.input.chapterCount, req.input.targetWords) }));
    case 'review': return void (yield done({ data: mockReview() }));
    case 'chapter': {
      const text = mockChapter(req.input);
      for (let i = 0; i < text.length; i += 220) {
        if (signal.aborted) return;
        yield { t: 'delta', text: text.slice(i, i + 220) };
        await sleep(15, signal);
      }
      yield done({ text });
    }
  }
}

async function* runAnthropic(req: AiRequest, cfg: AiConfig, signal: AbortSignal): AsyncGenerator<AiEvent> {
  const client = new Anthropic({ maxRetries: 2, timeout: 9 * 60 * 1000 });
  const prompt = promptFor(req);
  const maxTokens = req.task === 'chapter' ? chapterMaxTokens(req.input.chapter.targetWords) : MAX_TOKENS[req.task];
  const cap = Math.min(cfg.maxUsdPerBook, req.budgetUsd);
  const estimate = worstCaseCost(cfg.model, prompt.length + SYSTEM_EDITORIAL.length, maxTokens);
  if (req.spentUsd + estimate > cap) {
    throw new PublicError(`Budget AI insufficiente: spesi ${req.spentUsd.toFixed(2)} $ su ${cap.toFixed(2)} $, questa richiesta può costare fino a ${estimate.toFixed(2)} $. Aumenta il tetto del libro per proseguire.`, false);
  }
  const base = {
    model: cfg.model,
    max_tokens: maxTokens,
    system: SYSTEM_EDITORIAL,
    messages: [{ role: 'user' as const, content: prompt }],
  };

  if (req.task === 'chapter') {
    const stream = client.messages.stream({ ...base, output_config: { effort: 'medium' } }, { signal });
    let text = '';
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        text += event.delta.text;
        yield { t: 'delta', text: event.delta.text };
      }
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === 'refusal') throw new PublicError('Il modello ha rifiutato la richiesta per motivi di policy: modifica brief o capitolo.', false);
    const usage = computeCost(cfg.model, final.usage.input_tokens, final.usage.output_tokens);
    if (final.stop_reason === 'max_tokens') text += '\n\n[DA COMPLETARE: il capitolo è stato troncato al limite di token]\n';
    yield { t: 'done', provider: 'anthropic', model: final.model, text, usage };
    return;
  }

  const schema: z.ZodType = OUTPUT_SCHEMA[req.task];
  const res = await client.messages.parse({ ...base, output_config: { effort: 'low', format: zodOutputFormat(schema) } }, { signal });
  if (res.stop_reason === 'refusal') throw new PublicError('Il modello ha rifiutato la richiesta per motivi di policy.', false);
  if (!res.parsed_output) throw new PublicError('Risposta AI non conforme allo schema atteso: riprova.', true);
  yield { t: 'done', provider: 'anthropic', model: res.model, data: res.parsed_output, usage: computeCost(cfg.model, res.usage.input_tokens, res.usage.output_tokens) };
}

/** Esegue la richiesta e produce eventi; gli errori diventano un evento 'error' senza dettagli sensibili. */
export async function* runAi(req: AiRequest, signal: AbortSignal): AsyncGenerator<AiEvent> {
  const cfg = aiConfig();
  try {
    if (cfg.mode === 'mock') yield* runMock(req, signal);
    else yield* runAnthropic(req, cfg, signal);
  } catch (err) {
    if (signal.aborted) return;
    const pub = toPublicError(err);
    console.error('[ai]', JSON.stringify({ task: req.task, mode: cfg.mode, error: pub.message, type: err instanceof Error ? err.name : 'unknown' }));
    yield { t: 'error', message: pub.message, retryable: pub.retryable };
  }
}
