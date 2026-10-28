/** Shared domain types for the AFAIK application. */

export const REPAIR_STATUSES = ['operational', 'repairing', 'damaged', 'offline'] as const;
export type RepairStatus = (typeof REPAIR_STATUSES)[number];

export const DIAGNOSTIC_STATUSES = ['nominal', 'warning', 'critical', 'unknown'] as const;
export type DiagnosticStatus = (typeof DIAGNOSTIC_STATUSES)[number];

/**
 * A suit record. All telemetry is simulated, user-configured data.
 * Nullable fields mean "not recorded" — AFAIK must say so rather than guess.
 */
export interface Suit {
  id: string;
  /** Display name, e.g. "Mark XLIII" or "Hulkbuster". */
  name: string;
  /** Formal designation, e.g. "Mark XLIII". Used for voice matching. */
  designation: string;
  repairStatus: RepairStatus;
  /** 0–100, or null when unknown. */
  repairProgress: number | null;
  /** ISO 8601 timestamp of the estimated repair completion, or null when unknown. */
  repairCompletesAt: string | null;
  /** Simulated power level 0–100, or null when unknown. */
  powerLevel: number | null;
  diagnosticStatus: DiagnosticStatus;
  notes: string;
  /** True for invented sample data shipped with the app. */
  fictional: boolean;
}

export type AssistantState = 'standby' | 'listening' | 'processing' | 'speaking' | 'error';

export const ACTIVATION_MODES = ['push-to-talk', 'conversation', 'wake-word'] as const;
export type ActivationMode = (typeof ACTIVATION_MODES)[number];

export interface Settings {
  /** SpeechSynthesisVoice.voiceURI, or null to auto-select. */
  voiceURI: string | null;
  rate: number;
  pitch: number;
  speechEnabled: boolean;
  soundEffectsEnabled: boolean;
  activationMode: ActivationMode;
}

export interface SessionState {
  selectedSuitId: string | null;
  partyMode: boolean;
}

export type Intent =
  | 'greeting'
  | 'status_report'
  | 'suit_status'
  | 'repair_estimate'
  | 'diagnostics'
  | 'power_level'
  | 'show_suit'
  | 'list_suits'
  | 'party_on'
  | 'party_off'
  | 'help'
  | 'standby'
  | 'time'
  | 'welcome_guests'
  | 'joke'
  | 'thanks'
  | 'identity'
  | 'easter_egg'
  | 'unknown';

export type InterpretationError = 'empty_input' | 'suit_not_found';

/** Output of the deterministic command interpreter. */
export interface Interpretation {
  intent: Intent;
  recognized: boolean;
  rawText: string;
  normalizedText: string;
  params: {
    /** Resolved suit id (explicitly mentioned, or the selected suit as fallback). */
    suitId?: string;
    /** True when the suit was explicitly named in the command. */
    suitExplicit?: boolean;
    /** The suit reference as spoken, e.g. "mark 50", when it could not be resolved. */
    suitQuery?: string;
    /** Key for easter-egg responses. */
    easterEgg?: string;
  };
  error?: InterpretationError;
}

export type View = 'hud' | 'workshop' | 'diagnostics' | 'settings';

export type AssistantAction =
  | { type: 'select-suit'; suitId: string }
  | { type: 'set-party-mode'; enabled: boolean }
  | { type: 'standby' }
  | { type: 'diagnostics-run'; suitId: string };

export interface AssistantResponse {
  /** Text shown on screen. */
  display: string;
  /** Text sent to speech synthesis (designations expanded for pronunciation). */
  speech: string;
  actions: AssistantAction[];
  /** Simulated processing time before replying, in ms. */
  processingMs: number;
  /** Plays the party-mode initialization animation. */
  bootSequence?: boolean;
}

/** A complete command turn: interpretation plus generated response. */
export interface CommandOutcome {
  interpretation: Interpretation;
  response: AssistantResponse;
}

export interface HistoryEntry {
  id: string;
  at: number;
  input: string;
  source: 'voice' | 'text';
  intent: Intent;
  recognized: boolean;
  response: string;
}

export interface ActivityEntry {
  id: string;
  at: number;
  message: string;
}
