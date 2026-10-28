/** localStorage persistence for settings, session state and the locally loaded knowledge file. All access is guarded. */
import { KNOWLEDGE_CATEGORIES, type KnowledgeCategory, type SessionState, type Settings } from '../types/afaik';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../utils/validation';

export const STORAGE_KEYS = {
  settings: 'afaik.settings.v1',
  session: 'afaik.session.v2',
  knowledge: 'afaik.knowledge.v1',
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
    selectedDocId: typeof session.selectedDocId === 'string' ? session.selectedDocId : null,
    selectedCategory: KNOWLEDGE_CATEGORIES.includes(session.selectedCategory as KnowledgeCategory)
      ? (session.selectedCategory as KnowledgeCategory)
      : 'project',
  };
}

export function saveSession(session: SessionState, store: KeyValueStore | null = defaultStore()): boolean {
  return writeJson(STORAGE_KEYS.session, session, store);
}

/** The raw knowledge file as loaded by the user. Stored only in this browser — never bundled or uploaded. */
export interface StoredKnowledge {
  markdown: string;
  sourceName: string;
  loadedAt: number;
}

export function loadStoredKnowledge(store: KeyValueStore | null = defaultStore()): StoredKnowledge | null {
  const raw = readJson(STORAGE_KEYS.knowledge, store);
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.markdown !== 'string' || !r.markdown) return null;
  return {
    markdown: r.markdown,
    sourceName: typeof r.sourceName === 'string' ? r.sourceName : 'knowledge.md',
    loadedAt: typeof r.loadedAt === 'number' ? r.loadedAt : Date.now(),
  };
}

/** Returns false when the browser refuses (storage blocked or full); the knowledge then lasts for this session only. */
export function saveStoredKnowledge(knowledge: StoredKnowledge, store: KeyValueStore | null = defaultStore()): boolean {
  return writeJson(STORAGE_KEYS.knowledge, knowledge, store);
}

export function clearStoredKnowledge(store: KeyValueStore | null = defaultStore()): void {
  try {
    store?.removeItem(STORAGE_KEYS.knowledge);
  } catch {
    /* ignore */
  }
}
