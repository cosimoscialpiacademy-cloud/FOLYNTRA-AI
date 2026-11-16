/**
 * Catalogo degli sfondi per copertina inclusi nell'app (public/cover-art).
 * Sono immagini generate con IA (modello GPT Image 2.6 di OpenAI, tramite Higgsfield, 16/11/2026): vedi brand/cover-art-prompts.md.
 * Quando una copertina li usa, la dichiarazione KDP sulle immagini IA deve essere "generate".
 */
import type { CoverSpec } from './types';

export interface CoverArtItem {
  id: string;
  name: string;
  /** "dark": sfondo scuro → testo chiaro; "light": sfondo chiaro → testo scuro. */
  tone: 'dark' | 'light';
  /** Colori consigliati per fondo (velatura), accento e testo con questa immagine. */
  palette: CoverSpec['palette'];
  /** Generi adatti (solo indicazione). */
  suits: string;
  /** Layout in cui l'immagine rende meglio (es. soggetto al centro: «vetrina»). */
  bestTemplate?: 'immersiva' | 'cornice' | 'vetrina';
}

export const COVER_ART: CoverArtItem[] = [
  { id: 'oro-notte', name: 'Oro su blu notte', tone: 'dark', palette: { background: '#0A1426', accent: '#E4C07A', text: '#F7F4ED' }, suits: 'business, saggistica, premium' },
  { id: 'marmo-oro', name: 'Marmo e oro', tone: 'light', palette: { background: '#F4F1EA', accent: '#A9852F', text: '#1B2233' }, suits: 'lusso, finanza, eleganza' },
  { id: 'botanico', name: 'Botanico acquerello', tone: 'light', palette: { background: '#F1EFE6', accent: '#4F7149', text: '#243322' }, suits: 'giardino, natura, benessere' },
  { id: 'geometrico', name: 'Geometria moderna', tone: 'light', palette: { background: '#F4EBDD', accent: '#B4532A', text: '#1F2A44' }, suits: 'design, creatività, produttività' },
  { id: 'aurora', name: 'Aurora', tone: 'dark', palette: { background: '#070B22', accent: '#6FE7FF', text: '#F5F7FA' }, suits: 'crescita personale, tecnologia, sogni' },
  { id: 'carta', name: 'Carta minimal', tone: 'light', palette: { background: '#F5EFE4', accent: '#B4532A', text: '#2B2118' }, suits: 'casa, ordine, minimalismo' },
  { id: 'montagna', name: 'Montagne all’alba', tone: 'dark', palette: { background: '#17213B', accent: '#FFC27A', text: '#FFF8EE' }, suits: 'viaggi, motivazione, outdoor' },
  { id: 'oceano', name: 'Oceano profondo', tone: 'dark', palette: { background: '#04292E', accent: '#7FF3E1', text: '#F2FFFC' }, suits: 'calma, mindfulness, mare' },
  { id: 'legno-erbe', name: 'Legno ed erbe', tone: 'dark', palette: { background: '#2A1A0E', accent: '#F2C98A', text: '#FFF6E8' }, suits: 'ricettari, cucina, casa' },
  { id: 'neon-tech', name: 'Linee neon', tone: 'dark', palette: { background: '#050814', accent: '#00E5FF', text: '#F5F7FA' }, suits: 'tecnologia, IA, digitale' },
  { id: 'pastello', name: 'Pastello sereno', tone: 'light', palette: { background: '#FBF3EE', accent: '#7C55C9', text: '#2A2340' }, suits: 'benessere, famiglia, bambini' },
  { id: 'piatto-bilanciato', name: 'Piatto bilanciato (dall’alto)', tone: 'light', palette: { background: '#F1EDE3', accent: '#3E7A4F', text: '#1F2A22' }, suits: 'ricettari salutari, dieta, cucina per una persona', bestTemplate: 'vetrina' },
  { id: 'tavola-per-uno', name: 'Tavola calda per una persona', tone: 'dark', palette: { background: '#1A110A', accent: '#F2C98A', text: '#FFF6E8' }, suits: 'ricettari caldi, comfort food, cucina per uno', bestTemplate: 'immersiva' },
  { id: 'icone-salvia', name: 'Icone pulite in verde salvia', tone: 'light', palette: { background: '#F4EEDD', accent: '#4F7149', text: '#243322' }, suits: 'meal prep, piani alimentari, organizzazione', bestTemplate: 'vetrina' },
  { id: 'inchiostro', name: 'Inchiostro', tone: 'light', palette: { background: '#F4EDE0', accent: '#B3261E', text: '#14110F' }, suits: 'letteratura, storia, filosofia' },
];

export const ART_IDS = COVER_ART.map((a) => a.id);
export const artById = (id: string | null | undefined): CoverArtItem | undefined => COVER_ART.find((a) => a.id === id);
export const artUrl = (id: string): string => `/cover-art/${id}.jpg`;
export const artThumb = (id: string): string => `/cover-art/thumb/${id}.webp`;

/** Immagine da usare nell'SVG: quella caricata dall'utente (data URL) oppure quella del catalogo. */
export function artHref(art: CoverSpec['art']): string | null {
  if (!art) return null;
  if (art.dataUrl) return art.dataUrl;
  return art.id && artById(art.id) ? artUrl(art.id) : null;
}

export const ART_TEMPLATES: CoverSpec['template'][] = ['immersiva', 'cornice', 'vetrina'];
export const usesArt = (spec: Pick<CoverSpec, 'template' | 'art'>): boolean => ART_TEMPLATES.includes(spec.template) && artHref(spec.art) !== null;
