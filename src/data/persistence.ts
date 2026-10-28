/** localStorage persistence for suits, settings and session state. All access is guarded. */
import type { SessionState, Settings, Suit } from '../types/afaik';
import { DEFAULT_SETTINGS, sanitizeSettings, sanitizeSuits } from '../utils/validation';
import { createDemoSuits, PRIMARY_SUIT_ID } from './demoData';

export const STORAGE_KEYS = {
  suits: 'afaik.suits.v1',
  settings: 'afaik.settings.v1',
  session: 'afaik.session.v1',
} as const;

export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function defaultStore(): KeyValueStore | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null; // Storage can be blocked (privacy settings, sandboxed iframes).
  }
}

function readJson(key: string, store: KeyValueStore | null): unknown {
  if (!store) return undefined;
  try {
    const raw = store.getItem(key);
    return raw === null ? undefined : (JSON.parse(raw) as unknown);
  } catch {
    return undefined;
  }
}

function writeJson(key: string, value: unknown, store: KeyValueStore | null): boolean {
  if (!store) return false;
  try {
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.warn(`[afaik] Could not persist ${key}`, error);
    return false;
  }
}

/** Loads saved suits; falls back to fresh demo data when nothing valid is stored. */
export function loadSuits(store: KeyValueStore | null = defaultStore(), now: number = Date.now()): Suit[] {
  const saved = sanitizeSuits(readJson(STORAGE_KEYS.suits, store));
  return saved && saved.length > 0 ? saved : createDemoSuits(now);
}

export function saveSuits(suits: Suit[], store: KeyValueStore | null = defaultStore()): boolean {
  return writeJson(STORAGE_KEYS.suits, suits, store);
}

/** Replaces saved suits with freshly generated demo data and returns it. */
export function resetSuits(store: KeyValueStore | null = defaultStore(), now: number = Date.now()): Suit[] {
  const suits = createDemoSuits(now);
  saveSuits(suits, store);
  return suits;
}

export function loadSettings(store: KeyValueStore | null = defaultStore()): Settings {
  const saved = readJson(STORAGE_KEYS.settings, store);
  return saved === undefined ? { ...DEFAULT_SETTINGS } : sanitizeSettings(saved);
}

export function saveSettings(settings: Settings, store: KeyValueStore | null = defaultStore()): boolean {
  return writeJson(STORAGE_KEYS.settings, settings, store);
}

export function loadSession(store: KeyValueStore | null = defaultStore()): SessionState {
  const raw = readJson(STORAGE_KEYS.session, store);
  const session = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    selectedSuitId: typeof session.selectedSuitId === 'string' ? session.selectedSuitId : PRIMARY_SUIT_ID,
    partyMode: session.partyMode === true,
  };
}

export function saveSession(session: SessionState, store: KeyValueStore | null = defaultStore()): boolean {
  return writeJson(STORAGE_KEYS.session, session, store);
}
