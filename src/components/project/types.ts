import type { Chapter, Niche, Project } from '@/lib/types';

export interface TabProps {
  project: Project;
  chapters: Chapter[];
  niche: Niche | null;
  /** Aggiorna il progetto (salvataggio automatico ritardato). */
  update: (patch: Partial<Project>) => void;
  goTo: (tab: TabKey) => void;
}

export type TabKey = 'brief' | 'indice' | 'scrittura' | 'studio' | 'kit' | 'vendite';
