import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../utils/validation';
import { clearStoredKnowledge, loadSession, loadSettings, loadStoredKnowledge, saveSettings, saveStoredKnowledge, STORAGE_KEYS, type KeyValueStore } from './persistence';

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

describe('persistence', () => {
  it('stores, restores and clears the local knowledge file', () => {
    const store = memoryStore();
    expect(loadStoredKnowledge(store)).toBeNull();
    expect(saveStoredKnowledge({ markdown: '# A', sourceName: 'a.md', loadedAt: 5 }, store)).toBe(true);
    expect(loadStoredKnowledge(store)).toEqual({ markdown: '# A', sourceName: 'a.md', loadedAt: 5, structure: null });
    clearStoredKnowledge(store);
    expect(store.data.has(STORAGE_KEYS.knowledge)).toBe(false);
  });

  it('reports when storage refuses the file', () => {
    const full: KeyValueStore = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => {} };
    expect(saveStoredKnowledge({ markdown: 'x', sourceName: 'x', loadedAt: 0 }, full)).toBe(false);
  });

  it('persists settings and clamps invalid values', () => {
    const store = memoryStore();
    saveSettings({ ...DEFAULT_SETTINGS, rate: 1.2, activationMode: 'conversation' }, store);
    expect(loadSettings(store)).toMatchObject({ rate: 1.2, activationMode: 'conversation' });
    expect(sanitizeSettings({ rate: 99, activationMode: 'telepathy' })).toMatchObject({ rate: 1.5, activationMode: 'push-to-talk' });
  });

  it('defaults the session safely', () => {
    expect(loadSession(null)).toEqual({ selectedDocId: null, selectedCategory: 'project' });
    const store = memoryStore();
    store.data.set(STORAGE_KEYS.session, JSON.stringify({ selectedDocId: 'x', selectedCategory: 'bogus' }));
    expect(loadSession(store)).toEqual({ selectedDocId: 'x', selectedCategory: 'project' });
  });
});
