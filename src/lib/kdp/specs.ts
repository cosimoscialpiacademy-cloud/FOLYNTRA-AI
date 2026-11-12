/**
 * Parametri KDP per il cartaceo (docs/05, verificati 11/11/2026).
 * Ricontrollare le pagine ufficiali KDP prima di ogni rilascio:
 * https://kdp.amazon.com/en_US/help/topic/G201834190 (interno)
 * https://kdp.amazon.com/en_US/help/topic/G201857950 (copertina)
 */
import type { Currency, Marketplace, PaperType, TrimSizeId } from '../types';

export const TRIM_SIZES: Record<TrimSizeId, { label: string; widthIn: number; heightIn: number }> = {
  '5x8': { label: '5 × 8 in (12,7 × 20,32 cm)', widthIn: 5, heightIn: 8 },
  '5.5x8.5': { label: '5,5 × 8,5 in (13,97 × 21,59 cm)', widthIn: 5.5, heightIn: 8.5 },
  '6x9': { label: '6 × 9 in (15,24 × 22,86 cm)', widthIn: 6, heightIn: 9 },
  '7x10': { label: '7 × 10 in (17,78 × 25,4 cm)', widthIn: 7, heightIn: 10 },
  '8.5x11': { label: '8,5 × 11 in (21,59 × 27,94 cm)', widthIn: 8.5, heightIn: 11 },
};

export const BLEED_IN = 0.125;
export const COVER_SAFE_IN = 0.25;
export const MIN_PAGES = 24;
export const MAX_PAGES = 828;
/** KDP stampa il testo sul dorso solo sopra le 79 pagine. */
export const MIN_PAGES_SPINE_TEXT = 79;

/** Spessore pagina in pollici (inchiostro nero). */
export const PAPER_THICKNESS_IN: Record<PaperType, number> = { white: 0.002252, cream: 0.0025 };

export function spineWidthIn(pageCount: number, paper: PaperType): number {
  if (!Number.isInteger(pageCount) || pageCount < 1) throw new Error('Numero di pagine non valido');
  return pageCount * PAPER_THICKNESS_IN[paper];
}

/** Margine interno (gabbia) minimo in funzione delle pagine. */
export function insideMarginIn(pageCount: number): number {
  if (pageCount <= 150) return 0.375;
  if (pageCount <= 300) return 0.5;
  if (pageCount <= 500) return 0.625;
  if (pageCount <= 700) return 0.75;
  return 0.875;
}

export function outsideMarginMinIn(bleed: boolean): number {
  return bleed ? 0.375 : 0.25;
}

export interface PageGeometry {
  /** Dimensioni della pagina PDF (rifilo + eventuale abbondanza). */
  pageWidthIn: number;
  pageHeightIn: number;
  insideIn: number;
  outsideIn: number;
  topIn: number;
  bottomIn: number;
}

/**
 * Geometria della pagina interna. I margini scelti sono più generosi dei minimi KDP
 * per leggibilità; con bleed il PDF cresce di 0,125" sul lato esterno e 0,25" in altezza.
 */
export function pageGeometry(trim: TrimSizeId, pageCount: number, bleed: boolean): PageGeometry {
  const t = TRIM_SIZES[trim];
  const b = bleed ? BLEED_IN : 0;
  return {
    pageWidthIn: t.widthIn + b,
    pageHeightIn: t.heightIn + 2 * b,
    insideIn: insideMarginIn(pageCount) + 0.25,
    outsideIn: Math.max(outsideMarginMinIn(bleed), 0.5) + b,
    topIn: 0.75 + b,
    bottomIn: 0.75 + b,
  };
}

export interface CoverGeometry {
  fullWidthIn: number;
  fullHeightIn: number;
  spineIn: number;
  trimWidthIn: number;
  trimHeightIn: number;
  spineTextAllowed: boolean;
  pageCount: number;
}

/** Copertina completa: retro + dorso + fronte, con 0,125" di abbondanza per lato. */
export function coverGeometry(trim: TrimSizeId, pageCount: number, paper: PaperType): CoverGeometry {
  const t = TRIM_SIZES[trim];
  const spine = spineWidthIn(pageCount, paper);
  return {
    fullWidthIn: round4(2 * BLEED_IN + 2 * t.widthIn + spine),
    fullHeightIn: round4(2 * BLEED_IN + t.heightIn),
    spineIn: round4(spine),
    trimWidthIn: t.widthIn,
    trimHeightIn: t.heightIn,
    spineTextAllowed: pageCount >= MIN_PAGES_SPINE_TEXT,
    pageCount,
  };
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export const MARKETPLACES: Record<Marketplace, { label: string; currency: Currency; locale: string; language: string; vatBooks: number }> = {
  'amazon.it': { label: 'Italia (Amazon.it)', currency: 'EUR', locale: 'it-IT', language: 'Italiano', vatBooks: 0.04 },
  'amazon.com': { label: 'USA (Amazon.com)', currency: 'USD', locale: 'en-US', language: 'English (US)', vatBooks: 0 },
  'amazon.co.uk': { label: 'Regno Unito (Amazon.co.uk)', currency: 'GBP', locale: 'en-GB', language: 'English (UK)', vatBooks: 0 },
  'amazon.de': { label: 'Germania (Amazon.de)', currency: 'EUR', locale: 'de-DE', language: 'Deutsch', vatBooks: 0.07 },
  'amazon.fr': { label: 'Francia (Amazon.fr)', currency: 'EUR', locale: 'fr-FR', language: 'Français', vatBooks: 0.055 },
  'amazon.es': { label: 'Spagna (Amazon.es)', currency: 'EUR', locale: 'es-ES', language: 'Español', vatBooks: 0.04 },
};

/**
 * Costi di stampa cartaceo in bianco e nero: fisso + costo per pagina.
 * VALORI INDICATIVI E AGGIORNABILI: `verified` indica se la cifra è stata
 * riscontrata sulla documentazione KDP; in caso contrario l'interfaccia la
 * presenta come "da verificare" e l'utente può sovrascriverla.
 * Fonte: https://kdp.amazon.com/en_US/help/topic/G201834340
 */
export const PRINT_COSTS: Record<Currency, { shortFixed: number; fixed: number; perPage: number; verified: boolean }> = {
  USD: { shortFixed: 2.3, fixed: 1.0, perPage: 0.012, verified: true },
  GBP: { shortFixed: 1.93, fixed: 0.85, perPage: 0.01, verified: true },
  EUR: { shortFixed: 2.05, fixed: 0.75, perPage: 0.012, verified: false },
};

/** Costo di stampa stimato (B/N, formati standard). 24–108 pagine: costo fisso. */
export function estimatePrintingCost(pageCount: number, currency: Currency): { cost: number; verified: boolean } {
  const c = PRINT_COSTS[currency];
  const cost = pageCount <= 108 ? c.shortFixed : c.fixed + c.perPage * pageCount;
  return { cost: Math.round(cost * 100) / 100, verified: c.verified };
}
