import { describe, expect, it } from 'vitest';
import { createDemoSuits } from '../data/demoData';
import { loadSession, loadSettings, loadSuits, resetSuits, saveSettings, saveSuits, STORAGE_KEYS, type KeyValueStore } from '../data/persistence';
import type { Suit } from '../types/afaik';
import { DEFAULT_SETTINGS, hasErrors, sanitizeSettings, sanitizeSuit, validateSuit } from './validation';

const NOW = Date.UTC(2026, 9, 31, 18, 0);
const [mark43, mark42] = createDemoSuits(NOW) as [Suit, Suit];

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe('validateSuit', () => {
  it('accepts the demo data', () => {
    for (const suit of createDemoSuits(NOW)) expect(validateSuit(suit)).toEqual({});
  });

  it('rejects out-of-range percentages', () => {
    expect(validateSuit({ ...mark43, repairProgress: 120 }).repairProgress).toBeDefined();
    expect(validateSuit({ ...mark43, powerLevel: -1 }).powerLevel).toBeDefined();
    expect(validateSuit({ ...mark43, powerLevel: Number.NaN }).powerLevel).toBeDefined();
  });

  it('allows unknown (null) values', () => {
    expect(validateSuit({ ...mark43, repairProgress: null, powerLevel: null, repairCompletesAt: null })).toEqual({});
  });

  it('rejects invalid timestamps and missing required fields', () => {
    const errors = validateSuit({ ...mark43, name: ' ', designation: '', repairCompletesAt: 'soon' });
    expect(Object.keys(errors).sort()).toEqual(['designation', 'name', 'repairCompletesAt']);
  });

  it('rejects duplicate designations', () => {
    expect(hasErrors(validateSuit({ ...mark42, designation: 'mark xliii' }, [mark43, mark42]))).toBe(true);
  });
});

describe('sanitizeSuit', () => {
  it('drops records without required fields', () => {
    expect(sanitizeSuit({ id: 'x' })).toBeNull();
    expect(sanitizeSuit('nope')).toBeNull();
  });

  it('turns invalid optional values into unknown rather than guessing', () => {
    const suit = sanitizeSuit({ ...mark43, repairProgress: 'lots', powerLevel: 500, repairCompletesAt: 'tomorrow', diagnosticStatus: 'meh' });
    expect(suit).toMatchObject({ repairProgress: null, powerLevel: null, repairCompletesAt: null, diagnosticStatus: 'unknown' });
  });
});

describe('persistence', () => {
  it('persists suits across loads', () => {
    const store = memoryStore();
    const edited = [{ ...mark43, powerLevel: 12 }];
    saveSuits(edited, store);
    expect(loadSuits(store, NOW)).toEqual(edited);
  });

  it('falls back to demo data when storage is empty or corrupt', () => {
    const store = memoryStore();
    expect(loadSuits(store, NOW)).toEqual(createDemoSuits(NOW));
    store.data.set(STORAGE_KEYS.suits, '{broken');
    expect(loadSuits(store, NOW)).toEqual(createDemoSuits(NOW));
  });

  it('reset restores demo data', () => {
    const store = memoryStore();
    saveSuits([{ ...mark43, name: 'Edited' }], store);
    const reset = resetSuits(store, NOW);
    expect(reset).toEqual(createDemoSuits(NOW));
    expect(loadSuits(store, NOW)).toEqual(createDemoSuits(NOW));
  });

  it('persists settings and clamps invalid values', () => {
    const store = memoryStore();
    saveSettings({ ...DEFAULT_SETTINGS, rate: 1.2, activationMode: 'conversation' }, store);
    expect(loadSettings(store)).toMatchObject({ rate: 1.2, activationMode: 'conversation' });
    expect(sanitizeSettings({ rate: 99, activationMode: 'telepathy' })).toMatchObject({ rate: 1.5, activationMode: 'push-to-talk' });
  });

  it('works without storage', () => {
    expect(loadSuits(null, NOW)).toHaveLength(4);
    expect(loadSession(null)).toEqual({ selectedSuitId: 'mark-43', partyMode: false });
  });
});
