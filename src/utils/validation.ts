/** Validation and sanitisation for suit records and settings. */
import {
  ACTIVATION_MODES,
  DIAGNOSTIC_STATUSES,
  REPAIR_STATUSES,
  type ActivationMode,
  type DiagnosticStatus,
  type RepairStatus,
  type Settings,
  type Suit,
} from '../types/jarvis';

export type SuitFieldErrors = Partial<Record<keyof Suit, string>>;

const MAX_NAME_LENGTH = 40;
const MAX_NOTES_LENGTH = 280;

function isPercent(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
}

export function isValidTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value));
}

/** Returns field-level errors for a suit. An empty object means the suit is valid. */
export function validateSuit(suit: Suit, others: readonly Suit[] = []): SuitFieldErrors {
  const errors: SuitFieldErrors = {};
  const name = suit.name.trim();
  const designation = suit.designation.trim();

  if (!suit.id.trim()) errors.id = 'ID is required.';
  if (!name) errors.name = 'Name is required.';
  else if (name.length > MAX_NAME_LENGTH) errors.name = `Name must be ${MAX_NAME_LENGTH} characters or fewer.`;

  if (!designation) errors.designation = 'Designation is required.';
  else if (designation.length > MAX_NAME_LENGTH) errors.designation = `Designation must be ${MAX_NAME_LENGTH} characters or fewer.`;
  else if (
    others.some((o) => o.id !== suit.id && o.designation.trim().toLowerCase() === designation.toLowerCase())
  ) {
    errors.designation = 'Another suit already uses this designation.';
  }

  if (!REPAIR_STATUSES.includes(suit.repairStatus)) errors.repairStatus = 'Choose a valid repair status.';
  if (!DIAGNOSTIC_STATUSES.includes(suit.diagnosticStatus)) errors.diagnosticStatus = 'Choose a valid diagnostic status.';

  if (suit.repairProgress !== null && !isPercent(suit.repairProgress)) {
    errors.repairProgress = 'Repair progress must be between 0 and 100.';
  }
  if (suit.powerLevel !== null && !isPercent(suit.powerLevel)) {
    errors.powerLevel = 'Power level must be between 0 and 100.';
  }
  if (suit.repairCompletesAt !== null && !isValidTimestamp(suit.repairCompletesAt)) {
    errors.repairCompletesAt = 'Completion time is not a valid date.';
  }
  if (suit.notes.length > MAX_NOTES_LENGTH) errors.notes = `Notes must be ${MAX_NOTES_LENGTH} characters or fewer.`;

  return errors;
}

export function hasErrors(errors: object): boolean {
  return Object.keys(errors).length > 0;
}

function asNullablePercent(value: unknown): number | null {
  return isPercent(value) ? value : null;
}

/**
 * Converts untrusted data (e.g. from localStorage) into a Suit, or null if required fields are missing.
 * Invalid optional values become null ("unknown") — never a guessed replacement.
 */
export function sanitizeSuit(input: unknown): Suit | null {
  if (typeof input !== 'object' || input === null) return null;
  const raw = input as Record<string, unknown>;
  if (typeof raw.id !== 'string' || !raw.id.trim()) return null;
  if (typeof raw.name !== 'string' || !raw.name.trim()) return null;
  if (typeof raw.designation !== 'string' || !raw.designation.trim()) return null;

  const repairStatus = REPAIR_STATUSES.includes(raw.repairStatus as RepairStatus)
    ? (raw.repairStatus as RepairStatus)
    : 'offline';
  const diagnosticStatus = DIAGNOSTIC_STATUSES.includes(raw.diagnosticStatus as DiagnosticStatus)
    ? (raw.diagnosticStatus as DiagnosticStatus)
    : 'unknown';

  return {
    id: raw.id,
    name: raw.name.slice(0, MAX_NAME_LENGTH),
    designation: raw.designation.slice(0, MAX_NAME_LENGTH),
    repairStatus,
    repairProgress: asNullablePercent(raw.repairProgress),
    repairCompletesAt: isValidTimestamp(raw.repairCompletesAt) ? raw.repairCompletesAt : null,
    powerLevel: asNullablePercent(raw.powerLevel),
    diagnosticStatus,
    notes: typeof raw.notes === 'string' ? raw.notes.slice(0, MAX_NOTES_LENGTH) : '',
    fictional: raw.fictional === true,
  };
}

/** Sanitises a list of suits, dropping invalid entries and duplicate IDs. */
export function sanitizeSuits(input: unknown): Suit[] | null {
  if (!Array.isArray(input)) return null;
  const seen = new Set<string>();
  const suits: Suit[] = [];
  for (const item of input) {
    const suit = sanitizeSuit(item);
    if (suit && !seen.has(suit.id)) {
      seen.add(suit.id);
      suits.push(suit);
    }
  }
  return suits;
}

export const DEFAULT_SETTINGS: Settings = {
  voiceURI: null,
  rate: 0.95,
  pitch: 0.9,
  speechEnabled: true,
  soundEffectsEnabled: true,
  activationMode: 'push-to-talk',
};

export const RATE_RANGE = { min: 0.6, max: 1.5 } as const;
export const PITCH_RANGE = { min: 0.5, max: 1.5 } as const;

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

export function sanitizeSettings(input: unknown): Settings {
  if (typeof input !== 'object' || input === null) return { ...DEFAULT_SETTINGS };
  const raw = input as Record<string, unknown>;
  return {
    voiceURI: typeof raw.voiceURI === 'string' && raw.voiceURI ? raw.voiceURI : null,
    rate: clamp(raw.rate, RATE_RANGE.min, RATE_RANGE.max, DEFAULT_SETTINGS.rate),
    pitch: clamp(raw.pitch, PITCH_RANGE.min, PITCH_RANGE.max, DEFAULT_SETTINGS.pitch),
    speechEnabled: typeof raw.speechEnabled === 'boolean' ? raw.speechEnabled : DEFAULT_SETTINGS.speechEnabled,
    soundEffectsEnabled:
      typeof raw.soundEffectsEnabled === 'boolean' ? raw.soundEffectsEnabled : DEFAULT_SETTINGS.soundEffectsEnabled,
    activationMode: ACTIVATION_MODES.includes(raw.activationMode as ActivationMode)
      ? (raw.activationMode as ActivationMode)
      : DEFAULT_SETTINGS.activationMode,
  };
}
