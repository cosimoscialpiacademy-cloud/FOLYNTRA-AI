/**
 * Import CSV nicchie con validazione riga per riga (docs/03, docs/06).
 * Formato segnali (data/NICCHIE-DEMO.csv):
 *   keyword,marketplace,demand,competition,trend,unitEconomics,differentiation,source_type,confidence
 * Colonne facoltative: buyer, category, source_name, observed_at
 * Formato concorrenti:
 *   keyword,marketplace,title,asin,price,reviews,rating,bsr,pages,published_at,source_name,observed_at
 */
import Papa from 'papaparse';
import { emptySignals, estimateSignalsFromCompetitors } from './engine';
import type { Competitor, EvidenceStatus, Marketplace, Metric, Niche, SignalKey } from '../types';
import { MARKETPLACES } from '../kdp/specs';

export const MAX_CSV_BYTES = 1_000_000;
export const MAX_CSV_ROWS = 2000;

export interface CsvIssue {
  row: number;
  message: string;
}

export interface CsvImportResult {
  kind: 'signals' | 'competitors' | 'unknown';
  niches: Niche[];
  errors: CsvIssue[];
  warnings: CsvIssue[];
  rowsRead: number;
}

const SIGNAL_COLS: SignalKey[] = ['demand', 'competition', 'trend', 'unitEconomics', 'differentiation'];
const STATUSES: EvidenceStatus[] = ['observed', 'estimated', 'imported', 'demo', 'missing'];

function normMarketplace(raw: string): Marketplace | null {
  const v = raw.trim().toLowerCase().replace(/^www\./, '');
  const alias: Record<string, Marketplace> = { it: 'amazon.it', us: 'amazon.com', com: 'amazon.com', uk: 'amazon.co.uk', de: 'amazon.de', fr: 'amazon.fr', es: 'amazon.es' };
  if (v in MARKETPLACES) return v as Marketplace;
  return alias[v] ?? null;
}

function num(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const t = raw.trim().replace(/\s/g, '');
  if (t === '') return undefined;
  // accetta "12,99" e "12.99"; rifiuta separatori ambigui tipo "1.234,5"
  const n = Number(/^\d+,\d+$/.test(t) ? t.replace(',', '.') : t);
  return Number.isFinite(n) ? n : NaN;
}

function isoDate(raw: string | undefined): string | null {
  if (!raw || !raw.trim()) return null;
  const t = Date.parse(raw.trim());
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

function baseNiche(keyword: string, marketplace: Marketplace, now: string, id: string): Niche {
  return {
    id, keyword, buyerPersona: '', marketplace, category: '', status: 'researched', demoOnly: false,
    signals: emptySignals(), competitors: [], secondaryKeywords: [], differentiationIdeas: [], risks: [],
    commentary: '', riskAccepted: false, createdAt: now, updatedAt: now,
  };
}

export function parseNicheCsv(text: string, opts: { fileName: string; newId: () => string; now?: Date }): CsvImportResult {
  const now = (opts.now ?? new Date()).toISOString();
  const result: CsvImportResult = { kind: 'unknown', niches: [], errors: [], warnings: [], rowsRead: 0 };
  if (!text.trim()) {
    result.errors.push({ row: 0, message: 'Il file è vuoto.' });
    return result;
  }
  if (new TextEncoder().encode(text).length > MAX_CSV_BYTES) {
    result.errors.push({ row: 0, message: `File troppo grande (massimo ${MAX_CSV_BYTES / 1000} kB).` });
    return result;
  }
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ''), {
    header: true, skipEmptyLines: false, transformHeader: (h) => h.trim(),
  });
  const fields = parsed.meta.fields ?? [];
  // Le righe vuote vengono saltate mantenendo il numero di riga reale del file.
  const numbered = parsed.data.map((r, i) => ({ r, line: i + 2 })).filter((x) => Object.values(x.r).some((v) => String(v ?? '').trim()));
  const kept = new Set(numbered.map((x) => x.line));
  const rows = numbered.map((x) => x.r);
  const lineOf = (i: number) => numbered[i].line;
  result.rowsRead = rows.length;
  for (const e of parsed.errors) {
    if (e.code === 'UndetectableDelimiter' || !kept.has((e.row ?? 0) + 2)) continue;
    result.errors.push({ row: (e.row ?? 0) + 2, message: `Riga malformata: ${e.message}` });
  }
  if (!fields.includes('keyword') || !fields.includes('marketplace')) {
    result.errors.push({ row: 1, message: 'Intestazione non valida: servono almeno le colonne "keyword" e "marketplace".' });
    return result;
  }
  if (rows.length === 0) {
    result.errors.push({ row: 2, message: 'Nessuna riga di dati dopo l’intestazione.' });
    return result;
  }
  if (rows.length > MAX_CSV_ROWS) {
    result.errors.push({ row: 0, message: `Troppe righe (${rows.length}); massimo ${MAX_CSV_ROWS}.` });
    return result;
  }

  const isSignals = SIGNAL_COLS.every((c) => fields.includes(c));
  const isCompetitors = fields.includes('title');
  if (!isSignals && !isCompetitors) {
    result.errors.push({ row: 1, message: 'Formato non riconosciuto: servono le 5 colonne dei segnali (demand, competition, trend, unitEconomics, differentiation) oppure la colonna "title" per i concorrenti.' });
    return result;
  }
  result.kind = isSignals ? 'signals' : 'competitors';
  const defaultSource = `CSV: ${opts.fileName}`;

  if (isSignals) {
    rows.forEach((r, i) => {
      const line = lineOf(i);
      const keyword = (r.keyword ?? '').trim();
      if (!keyword) return void result.errors.push({ row: line, message: 'Keyword mancante.' });
      const marketplace = normMarketplace(r.marketplace ?? '');
      if (!marketplace) return void result.errors.push({ row: line, message: `Marketplace non supportato: "${r.marketplace ?? ''}".` });
      const rawStatus = (r.source_type ?? 'imported').trim().toLowerCase() || 'imported';
      if (!STATUSES.includes(rawStatus as EvidenceStatus)) return void result.errors.push({ row: line, message: `source_type non valido: "${rawStatus}".` });
      const status = rawStatus as EvidenceStatus;
      const observedAt = isoDate(r.observed_at);
      if (r.observed_at && !observedAt) result.warnings.push({ row: line, message: 'observed_at non è una data valida: ignorata.' });
      const niche = baseNiche(keyword, marketplace, now, opts.newId());
      niche.demoOnly = status === 'demo';
      niche.buyerPersona = (r.buyer ?? '').trim();
      niche.category = (r.category ?? '').trim();
      let bad = false;
      for (const col of SIGNAL_COLS) {
        const n = num(r[col]);
        if (n === undefined) {
          result.warnings.push({ row: line, message: `Segnale "${col}" mancante: verrà mostrato come DATO NON DISPONIBILE.` });
          continue;
        }
        if (Number.isNaN(n) || n < 0 || n > 100) {
          result.errors.push({ row: line, message: `Segnale "${col}" deve essere un numero fra 0 e 100 (trovato "${r[col]}").` });
          bad = true;
          continue;
        }
        const metric: Metric = { value: n, unit: 'punti 0-100', status, source: (r.source_name ?? '').trim() || defaultSource, observedAt };
        niche.signals[col] = metric;
      }
      if (!bad) result.niches.push(niche);
    });
    return result;
  }

  const groups = new Map<string, { niche: Niche; competitors: Competitor[]; source: string; observedAt: string | null }>();
  rows.forEach((r, i) => {
    const line = lineOf(i);
    const keyword = (r.keyword ?? '').trim();
    const title = (r.title ?? '').trim();
    if (!keyword || !title) return void result.errors.push({ row: line, message: 'Servono sia "keyword" sia "title".' });
    const marketplace = normMarketplace(r.marketplace ?? '');
    if (!marketplace) return void result.errors.push({ row: line, message: `Marketplace non supportato: "${r.marketplace ?? ''}".` });
    const c: Competitor = { title, verified: false };
    const asin = (r.asin ?? '').trim();
    if (asin) {
      if (!/^[A-Z0-9]{10}$/i.test(asin)) result.warnings.push({ row: line, message: `ASIN "${asin}" non ha un formato valido: ignorato.` });
      else c.asin = asin.toUpperCase();
    }
    for (const col of ['price', 'reviews', 'rating', 'bsr', 'pages'] as const) {
      const n = num(r[col]);
      if (n === undefined) continue;
      if (Number.isNaN(n) || n < 0) {
        result.warnings.push({ row: line, message: `Valore "${col}" non numerico: ignorato.` });
        continue;
      }
      c[col] = n;
    }
    const pub = isoDate(r.published_at);
    if (pub) c.publishedAt = pub;
    const key = `${marketplace}|${keyword.toLowerCase()}`;
    let g = groups.get(key);
    if (!g) {
      g = { niche: baseNiche(keyword, marketplace, now, opts.newId()), competitors: [], source: (r.source_name ?? '').trim() || defaultSource, observedAt: isoDate(r.observed_at) };
      groups.set(key, g);
    }
    g.competitors.push(c);
  });
  for (const g of groups.values()) {
    g.niche.competitors = g.competitors;
    Object.assign(g.niche.signals, estimateSignalsFromCompetitors(g.competitors, g.source, g.observedAt ?? now));
    result.niches.push(g.niche);
  }
  return result;
}

export const CSV_TEMPLATE_SIGNALS =
  'keyword,marketplace,demand,competition,trend,unitEconomics,differentiation,source_type,source_name,observed_at,buyer,category\n' +
  '"Esempio: sostituisci con la tua nicchia",amazon.it,60,50,50,55,65,imported,"Mia ricerca manuale",2026-11-01,"Chi compra e perché","Casa e giardino"\n';

export const CSV_TEMPLATE_COMPETITORS =
  'keyword,marketplace,title,asin,price,reviews,rating,bsr,pages,published_at,source_name,observed_at\n' +
  '"Esempio: sostituisci con la tua nicchia",amazon.it,"Titolo del libro concorrente osservato",,14.99,120,4.3,25000,180,2024-05-01,"Rilevazione manuale su Amazon.it",2026-11-01\n';
