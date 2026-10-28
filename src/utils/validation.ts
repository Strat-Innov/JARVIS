/** Validation and sanitisation for persisted settings. */
import { ACTIVATION_MODES, type ActivationMode, type Settings } from '../types/afaik';

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
