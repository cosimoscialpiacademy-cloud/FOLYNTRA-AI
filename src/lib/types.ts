/** Tipi di dominio FOLYNTRA AI (Fase A). */

import type { CoverCritiqueOutput, CoverStrategyOutput } from './ai/schemas';

export type Marketplace = 'amazon.it' | 'amazon.com' | 'amazon.co.uk' | 'amazon.de' | 'amazon.fr' | 'amazon.es';
export type Currency = 'EUR' | 'USD' | 'GBP';

/** Provenienza di ogni dato di mercato (docs/03). */
export type EvidenceStatus = 'observed' | 'estimated' | 'imported' | 'ai_estimate' | 'demo' | 'missing';

export interface Metric {
  value: number | null;
  unit: string;
  status: EvidenceStatus;
  source: string;
  observedAt: string | null;
  sampleSize?: number;
  methodology?: string;
}

export type SignalKey = 'demand' | 'competition' | 'trend' | 'unitEconomics' | 'differentiation';

export interface Competitor {
  title: string;
  asin?: string;
  price?: number;
  reviews?: number;
  rating?: number;
  bsr?: number;
  pages?: number;
  publishedAt?: string;
  /** I competitor non verificati dall'utente restano marcati come tali. */
  verified: boolean;
}

export interface Niche {
  id: string;
  keyword: string;
  buyerPersona: string;
  marketplace: Marketplace;
  category: string;
  status: 'hypothesis' | 'researched' | 'selected';
  /** true quando TUTTI i dati sono sintetici di dimostrazione. */
  demoOnly: boolean;
  signals: Record<SignalKey, Metric>;
  competitors: Competitor[];
  secondaryKeywords: string[];
  differentiationIdeas: string[];
  risks: string[];
  commentary: string;
  /** Rischio accettato esplicitamente dall'utente al momento della selezione. */
  riskAccepted: boolean;
  createdAt: string;
  updatedAt: string;
}

export type BookKind = 'nonfiction' | 'workbook' | 'cookbook' | 'coloring';
export type ProjectStatus = 'draft' | 'research' | 'writing' | 'review' | 'export_ready' | 'published_by_user';
export type PublishState = 'non_pronto' | 'pacchetto_pronto' | 'inviato_dall_utente' | 'pubblicato_e_verificato';

export interface Brief {
  audience: string;
  problem: string;
  goal: string;
  uniqueValue: string;
  exclusions: string;
  style: string;
  synopsis: string;
}

export interface SourceRef {
  id: string;
  citation: string;
  url: string;
  /** Solo l'utente può confermare una fonte: l'AI non la marca mai verificata. */
  verified: boolean;
}

export interface GlossaryEntry {
  term: string;
  definition: string;
}

export type TrimSizeId = '5x8' | '5.5x8.5' | '6x9' | '7x10' | '8.5x11';
export type PaperType = 'white' | 'cream';
export type BodyFont = 'EB Garamond' | 'Inter';

export interface LayoutSettings {
  trim: TrimSizeId;
  paper: PaperType;
  bleed: boolean;
  bodyFont: BodyFont;
  fontSizePt: number;
  lineHeight: number;
  runningHeaders: boolean;
  /** Avviso al lettore sull'uso dell'IA (facoltativo, distinto dalla dichiarazione KDP). */
  readerAiNotice: boolean;
}

export type CoverTemplateId = 'classico' | 'moderno' | 'editoriale' | 'immersiva' | 'cornice' | 'vetrina';

/** Etichetta commerciale sul fronte: fascia (bonus/contenuto), sigillo (numero + parola) o invito all'azione. Solo layout con immagine. */
export interface CoverBadge {
  kind: 'banner' | 'seal' | 'cta';
  text: string;
  /** Solo per il sigillo: seconda riga (es. «RICETTE» sotto «100+»). */
  subtext: string;
}

/** Immagine di copertina: dal catalogo (id) oppure caricata dall'utente (data URL). */
export interface CoverArt {
  id: string | null;
  dataUrl: string | null;
  /** true se l'immagine è stata generata con IA: va dichiarato a KDP. */
  aiGenerated: boolean;
  /** Velatura per la leggibilità del testo, 0 (nessuna) – 1 (massima). */
  dim: number;
}

export interface CoverSpec {
  template: CoverTemplateId;
  palette: { background: string; accent: string; text: string };
  titleFont: 'Playfair Display' | 'Oswald' | 'EB Garamond' | 'Montserrat';
  title: string;
  subtitle: string;
  author: string;
  tagline: string;
  backText: string;
  seed: number;
  art?: CoverArt | null;
  badges?: CoverBadge[];
  /** L'autore conferma che quanto scritto nelle etichette è vero e presente nel libro. */
  badgesConfirmed?: boolean;
}

export interface KdpMeta {
  description: string;
  keywords: string[];
  categories: string[];
  listPricePaperback: number;
  listPriceEbook: number;
  aiText: 'none' | 'assisted' | 'generated';
  aiImages: 'none' | 'assisted' | 'generated';
  aiTranslation: 'none' | 'assisted' | 'generated';
  rightsConfirmed: boolean;
  humanReviewConfirmed: boolean;
  publishState: PublishState;
}

export interface Matter {
  dedication: string;
  preface: string;
  conclusion: string;
  acknowledgments: string;
  authorBio: string;
}

/** Screenshot di una copertina concorrente caricato dall'utente (ridimensionato, JPEG in base64 senza prefisso). */
export interface CompetitorShot {
  id: string;
  data: string;
  note: string;
}

export interface CoverBrief {
  competitors: CompetitorShot[];
  notes: string;
  /** Bonus e contenuti realmente inclusi nel libro (scritti dall'autore): l'agente può usare solo questi per le etichette. */
  bonuses?: string;
  strategy: CoverStrategyOutput | null;
  strategyIsMock: boolean;
  critique: CoverCritiqueOutput | null;
  critiqueIsMock: boolean;
}

/** Kit marketing: bozze per l'autore. Mai testimonianze, recensioni o dati di vendita inventati. */
export interface MarketingKit {
  generatedBy: 'mock' | 'anthropic' | 'human';
  generatedAt: string;
  hook: string;
  amazonDescription: string;
  bullets: string[];
  aPlus: { title: string; body: string; imageIdea: string }[];
  authorBio: string;
  emails: { subject: string; body: string; sendWhen: string }[];
  posts: { platform: string; text: string; hashtags: string[] }[];
  adAngles: string[];
  launchChecklist: string[];
}

/** Una pagina di un libro da colorare: disegno al tratto (SVG vettoriale o immagine caricata), mai testo. */
export interface ColoringPage {
  id: string;
  title: string;
  source: 'ia' | 'caricata' | 'mandala';
  /** SVG pulito (solo tratti neri su bianco). */
  svg: string | null;
  /** Immagine caricata (data URL JPEG/PNG) già ripulita in bianco/nero. */
  image: string | null;
  width: number;
  height: number;
  /** Soggetto in inglese: serve all'IA e come prompt per ChatGPT/altri generatori. */
  prompt: string;
  /** true se il disegno è stato prodotto con IA (da dichiarare a KDP). */
  aiGenerated: boolean;
  seed: number;
}

export interface ColoringBook {
  pages: ColoringPage[];
  ageRange: string;
  /** Indice dei disegni con i numeri di pagina reali. */
  toc: boolean;
  /** Titolo del disegno stampato sotto l'immagine. */
  captions: boolean;
}

export interface Project {
  id: string;
  nicheId: string | null;
  name: string;
  marketplace: Marketplace;
  locale: string;
  status: ProjectStatus;
  kind: BookKind;
  title: string;
  subtitle: string;
  altTitles: string[];
  author: string;
  brief: Brief;
  targetWords: number;
  matter: Matter;
  glossary: GlossaryEntry[];
  sources: SourceRef[];
  layout: LayoutSettings;
  cover: CoverSpec;
  kdp: KdpMeta;
  /** Tetto di spesa AI per questo libro, in USD. */
  budgetUsd: number;
  /** Pagine effettive dell'ultimo PDF interno renderizzato (null = mai renderizzato). */
  pageCount: number | null;
  marketing?: MarketingKit | null;
  /** Solo per kind = 'coloring'. */
  coloring?: ColoringBook | null;
  /** Lavoro dell'agente copertine: screenshot dei concorrenti (forniti dall'utente), strategia e ultima valutazione. */
  coverBrief?: CoverBrief | null;
  createdAt: string;
  updatedAt: string;
}

export type ChapterStatus = 'draft' | 'generating' | 'generated' | 'reviewed' | 'locked';

export interface Chapter {
  id: string;
  projectId: string;
  position: number;
  title: string;
  summary: string;
  sections: string[];
  targetWords: number;
  content: string;
  status: ChapterStatus;
  /** Chi ha prodotto il testo corrente. 'mock' non è mai contenuto pubblicabile. */
  generatedBy: 'none' | 'mock' | 'anthropic' | 'human';
  aiGenerated: boolean;
  updatedAt: string;
}

export interface ChapterRevision {
  id: string;
  projectId: string;
  chapterId: string;
  content: string;
  words: number;
  reason: 'generazione' | 'salvataggio' | 'ripristino';
  createdAt: string;
}

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface Job {
  id: string;
  projectId: string;
  chapterId: string | null;
  jobType: 'chapter' | 'outline' | 'titles' | 'brainstorm' | 'review' | 'export';
  status: JobStatus;
  progress: number;
  idempotencyKey: string;
  attempts: number;
  errorPublic: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CostEvent {
  id: string;
  projectId: string | null;
  provider: 'anthropic' | 'mock';
  model: string;
  activity: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  recordedAt: string;
}

export interface ExportFile {
  name: string;
  bytes: number;
  sha256: string;
}

export interface QaCheck {
  id: string;
  label: string;
  severity: 'critico' | 'avviso' | 'info';
  result: 'ok' | 'fallito' | 'non_eseguito';
  detail: string;
}

export interface ExportRecord {
  id: string;
  projectId: string;
  createdAt: string;
  pageCount: number;
  kdpReady: boolean;
  files: ExportFile[];
  checks: QaCheck[];
}

export interface Activity {
  id: string;
  projectId: string | null;
  message: string;
  createdAt: string;
}

export type MatchType = 'exact' | 'phrase' | 'broad';

export interface AdGroup {
  name: string;
  matchType: MatchType;
  keywords: string[];
  bid: number;
}

/** Riga di un report Sponsored Products importato dall'utente. */
export interface AdReportRow {
  campaign: string;
  target: string;
  impressions: number;
  clicks: number;
  spend: number;
  sales: number;
  orders: number;
}

/** Piano campagna MANUALE: FOLYNTRA non crea né avvia campagne. */
export interface AdPlan {
  id: string;
  projectId: string;
  status: 'planning' | 'manual_ready';
  dailyBudget: number;
  defaultBid: number;
  /** Tasso di conversione IPOTIZZATO dall'utente (clic → ordine), in %. */
  assumedCvrPct: number;
  groups: AdGroup[];
  negatives: string[];
  asinTargets: string[];
  reportRows: AdReportRow[];
  reportFileName: string | null;
  reportImportedAt: string | null;
  updatedAt: string;
}

export interface SaleEntry {
  id: string;
  projectId: string;
  date: string;
  marketplace: string;
  title: string;
  units: number;
  royalty: number;
  currency: string;
  source: 'manual' | 'user_kdp_csv';
}

export interface CollectionMap {
  niches: Niche;
  projects: Project;
  chapters: Chapter;
  revisions: ChapterRevision;
  jobs: Job;
  costs: CostEvent;
  exports: ExportRecord;
  activity: Activity;
  adPlans: AdPlan;
  sales: SaleEntry;
}
export type CollectionName = keyof CollectionMap;

/** Pacchetto inviato alle route di export: tutto ciò che serve per impaginare. */
export interface BookBundle {
  project: Project;
  chapters: Chapter[];
}
