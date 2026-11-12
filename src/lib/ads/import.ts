/**
 * Import dei report forniti dall'utente: Sponsored Products (Amazon Ads) e
 * royalties KDP, in CSV. Le intestazioni vengono riconosciute tramite alias
 * (inglese/italiano). STATO: gli alias derivano dai nomi di colonna più comuni
 * e NON sono stati verificati su esportazioni reali di ogni marketplace; se un
 * file non viene riconosciuto, l'errore elenca le colonne attese.
 */
import Papa from 'papaparse';
import type { AdReportRow, SaleEntry } from '../types';

export const MAX_REPORT_BYTES = 3_000_000;
export const MAX_REPORT_ROWS = 5000;

export interface ReportIssue {
  row: number;
  message: string;
}

const norm = (h: string) => h.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** "€ 1.234,56", "$1,234.56", "12,5", "3%" → numero; stringa vuota → 0; non numerico → NaN. */
export function parseAmount(raw: string | undefined): number {
  if (raw === undefined) return 0;
  let t = raw.replace(/[^\d.,\-]/g, '');
  if (t === '' || t === '-') return raw.trim() === '' || raw.trim() === '-' || raw.trim() === '—' ? 0 : NaN;
  const lastComma = t.lastIndexOf(','), lastDot = t.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) t = lastComma > lastDot ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  else if (lastComma >= 0) t = /^-?\d{1,3}(,\d{3})+$/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.'); // "1,234" = migliaia; "12,5" = decimale
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

function table(text: string): { rows: { r: Record<string, string>; line: number }[]; cols: Map<string, string>; errors: ReportIssue[] } {
  const errors: ReportIssue[] = [];
  if (!text.trim()) return { rows: [], cols: new Map(), errors: [{ row: 0, message: 'Il file è vuoto.' }] };
  if (new TextEncoder().encode(text).length > MAX_REPORT_BYTES) return { rows: [], cols: new Map(), errors: [{ row: 0, message: `File troppo grande (massimo ${MAX_REPORT_BYTES / 1_000_000} MB).` }] };
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ''), { header: true, skipEmptyLines: false });
  const rows = parsed.data.map((r, i) => ({ r, line: i + 2 })).filter((x) => Object.values(x.r).some((v) => String(v ?? '').trim()));
  if (rows.length > MAX_REPORT_ROWS) return { rows: [], cols: new Map(), errors: [{ row: 0, message: `Troppe righe (${rows.length}); massimo ${MAX_REPORT_ROWS}.` }] };
  const cols = new Map<string, string>();
  for (const f of parsed.meta.fields ?? []) cols.set(norm(f), f);
  return { rows, cols, errors };
}

function pick(cols: Map<string, string>, aliases: string[]): string | null {
  for (const a of aliases) if (cols.has(a)) return cols.get(a)!;
  for (const a of aliases) for (const [k, v] of cols) if (k.startsWith(a)) return v;
  return null;
}

const ADS = {
  campaign: ['campaign name', 'campaign', 'nome campagna', 'campagna'],
  target: ['customer search term', 'targeting', 'keyword', 'termine di ricerca cliente', 'termine di ricerca del cliente', 'parola chiave', 'ad group name', 'nome gruppo di annunci'],
  impressions: ['impressions', 'impressioni'],
  clicks: ['clicks', 'clic'],
  spend: ['spend', 'cost', 'spesa', 'costo'],
  sales: ['7 day total sales', '14 day total sales', 'total sales', 'sales', 'vendite totali', 'vendite'],
  orders: ['7 day total orders', '14 day total orders', 'total orders', 'orders', 'ordini totali', 'ordini'],
};

export interface AdsImportResult {
  rows: AdReportRow[];
  errors: ReportIssue[];
  rowsRead: number;
}

export function parseAdsReport(text: string): AdsImportResult {
  const t = table(text);
  if (t.errors.length) return { rows: [], errors: t.errors, rowsRead: 0 };
  const c = Object.fromEntries(Object.entries(ADS).map(([k, a]) => [k, pick(t.cols, a)])) as Record<keyof typeof ADS, string | null>;
  const missing = (['impressions', 'clicks', 'spend', 'sales'] as const).filter((k) => !c[k]);
  if (missing.length) {
    return { rows: [], rowsRead: t.rows.length, errors: [{ row: 1, message: `Colonne non riconosciute: ${missing.join(', ')}. Servono almeno Impressions, Clicks, Spend e Sales (report Sponsored Products in CSV).` }] };
  }
  const rows: AdReportRow[] = [];
  const errors: ReportIssue[] = [];
  for (const { r, line } of t.rows) {
    const n = { impressions: parseAmount(r[c.impressions!]), clicks: parseAmount(r[c.clicks!]), spend: parseAmount(r[c.spend!]), sales: parseAmount(r[c.sales!]), orders: c.orders ? parseAmount(r[c.orders]) : 0 };
    const bad = Object.entries(n).find(([, v]) => Number.isNaN(v) || v < 0);
    if (bad) {
      errors.push({ row: line, message: `Valore non numerico nella colonna "${bad[0]}".` });
      continue;
    }
    rows.push({ campaign: (c.campaign ? r[c.campaign] : '')?.trim() ?? '', target: (c.target ? r[c.target] : '')?.trim() ?? '', ...n, impressions: Math.round(n.impressions), clicks: Math.round(n.clicks), orders: Math.round(n.orders) });
  }
  return { rows, errors, rowsRead: t.rows.length };
}

const KDP = {
  date: ['royalty date', 'date', 'data royalty', 'data'],
  title: ['title', 'titolo'],
  marketplace: ['marketplace', 'negozio'],
  units: ['net units sold', 'units sold', 'units', 'unita nette vendute', 'unita vendute', 'unita'],
  royalty: ['royalty', 'royalties', 'earnings', 'guadagni'],
  currency: ['currency', 'valuta'],
};

export interface SalesImportResult {
  entries: SaleEntry[];
  errors: ReportIssue[];
  rowsRead: number;
}

export function parseKdpRoyalties(text: string, opts: { projectId: string; newId: () => string; defaultCurrency: string }): SalesImportResult {
  const t = table(text);
  if (t.errors.length) return { entries: [], errors: t.errors, rowsRead: 0 };
  const c = Object.fromEntries(Object.entries(KDP).map(([k, a]) => [k, pick(t.cols, a)])) as Record<keyof typeof KDP, string | null>;
  const missing = (['date', 'units', 'royalty'] as const).filter((k) => !c[k]);
  if (missing.length) {
    return { entries: [], rowsRead: t.rows.length, errors: [{ row: 1, message: `Colonne non riconosciute: ${missing.join(', ')}. Servono almeno Royalty Date, Units Sold e Royalty (più Marketplace, Title e Currency se presenti).` }] };
  }
  const entries: SaleEntry[] = [];
  const errors: ReportIssue[] = [];
  for (const { r, line } of t.rows) {
    const rawDate = (r[c.date!] ?? '').trim();
    const iso = /^\d{4}-\d{2}(-\d{2})?$/.test(rawDate) ? (rawDate.length === 7 ? `${rawDate}-01` : rawDate) : Number.isNaN(Date.parse(rawDate)) ? null : new Date(Date.parse(rawDate)).toISOString().slice(0, 10);
    if (!iso) {
      errors.push({ row: line, message: `Data non valida: "${rawDate}".` });
      continue;
    }
    const units = parseAmount(r[c.units!]), royalty = parseAmount(r[c.royalty!]);
    if (Number.isNaN(units) || Number.isNaN(royalty) || units < 0) {
      errors.push({ row: line, message: 'Unità o royalty non numeriche.' });
      continue;
    }
    entries.push({
      id: opts.newId(), projectId: opts.projectId, date: iso, marketplace: (c.marketplace ? r[c.marketplace] : '')?.trim() || 'non indicato', title: (c.title ? r[c.title] : '')?.trim() ?? '',
      units: Math.round(units), royalty: Math.round(royalty * 100) / 100, currency: ((c.currency ? r[c.currency] : '')?.trim() || opts.defaultCurrency).toUpperCase(), source: 'user_kdp_csv',
    });
  }
  return { entries, errors, rowsRead: t.rows.length };
}

export const ADS_TEMPLATE = 'Campaign Name,Targeting,Impressions,Clicks,Spend,7 Day Total Sales,7 Day Total Orders (#)\n"Esempio: sostituisci con il tuo report","keyword di esempio",0,0,0,0,0\n';
export const KDP_TEMPLATE = 'Royalty Date,Title,Marketplace,Units Sold,Royalty,Currency\n2026-11-01,"Esempio: sostituisci con il tuo report",Amazon.it,0,0,EUR\n';
