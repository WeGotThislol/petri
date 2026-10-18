/**
 * Saving progress in the browser (localStorage), so a reload keeps your
 * organism and its champion brain. Storage can be unavailable (private mode),
 * so every access is wrapped and failure just means "no save".
 */
import type { CreatureSpec } from '../sim/creature';

const KEY = 'petri.save.v1';

export interface SaveData {
  spec: CreatureSpec;
  champion: number[];
  generations: number;
  hidden: number;
}

export function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as SaveData;
    return d && d.spec && Array.isArray(d.champion) ? d : null;
  } catch { return null; }
}

export function writeSave(d: SaveData): void {
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* storage unavailable: fine */ }
}

export function clearSave(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
