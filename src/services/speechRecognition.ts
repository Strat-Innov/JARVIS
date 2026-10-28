/**
 * Thin wrapper around the Web Speech API's SpeechRecognition.
 *
 * Browser support (as of 2026): Chrome, Edge and Safari expose it (Chrome/Edge stream audio to a
 * cloud recogniser, so an internet connection is required). Firefox does not support it.
 */

/* Minimal typings — SpeechRecognition is not part of TypeScript's DOM lib. */
interface RecognitionAlternative {
  transcript: string;
  confidence: number;
}
interface RecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: RecognitionAlternative;
}
interface RecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: { readonly length: number; [index: number]: RecognitionResult };
}
interface RecognitionErrorEvent extends Event {
  readonly error: string;
}
interface Recognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}
type RecognitionConstructor = new () => Recognition;

function getRecognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isRecognitionSupported(): boolean {
  return getRecognitionConstructor() !== null;
}

export type RecognitionErrorCode =
  | 'unsupported'
  | 'insecure-context'
  | 'not-allowed'
  | 'audio-capture'
  | 'network'
  | 'no-speech'
  | 'aborted'
  | 'unknown';

export const RECOGNITION_ERROR_MESSAGES: Record<RecognitionErrorCode, string> = {
  unsupported: 'Voice recognition is not supported in this browser. Use Chrome, Edge or Safari, or type your command below.',
  'insecure-context': 'Voice recognition requires a secure (HTTPS) connection.',
  'not-allowed': 'Microphone access was denied. Allow microphone access in your browser’s site settings, then try again.',
  'audio-capture': 'No microphone was found. Check that one is connected and not in use by another app.',
  network: 'Speech recognition could not reach its service. This browser needs an internet connection for voice input.',
  'no-speech': 'I didn’t hear anything. Press the microphone and try again.',
  aborted: 'Listening was cancelled.',
  unknown: 'Speech recognition stopped unexpectedly. Please try again.',
};

function toErrorCode(error: string): RecognitionErrorCode {
  switch (error) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'not-allowed';
    case 'audio-capture':
      return 'audio-capture';
    case 'network':
      return 'network';
    case 'no-speech':
      return 'no-speech';
    case 'aborted':
      return 'aborted';
    default:
      return 'unknown';
  }
}

export interface RecognitionCallbacks {
  onStart?: () => void;
  /** Latest interim (not yet final) transcript. */
  onInterim?: (transcript: string) => void;
  /** Called once per finalised utterance. */
  onFinal: (transcript: string) => void;
  onError?: (code: RecognitionErrorCode) => void;
  /** Always called when the session ends, including after errors. */
  onEnd?: () => void;
}

export interface RecognitionOptions {
  /** Keep listening across multiple utterances (used by wake-word mode). */
  continuous?: boolean;
  lang?: string;
}

export interface RecognitionSession {
  /** Stop listening and finalise any pending speech. */
  stop(): void;
  /** Stop immediately and discard pending speech. */
  abort(): void;
}

/**
 * Starts a recognition session. The browser shows its microphone permission prompt the first
 * time this is called, so only call it from a user-initiated action.
 */
export function startRecognition(callbacks: RecognitionCallbacks, options: RecognitionOptions = {}): RecognitionSession | null {
  const Ctor = getRecognitionConstructor();
  if (!Ctor) {
    callbacks.onError?.('unsupported');
    callbacks.onEnd?.();
    return null;
  }
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    callbacks.onError?.('insecure-context');
    callbacks.onEnd?.();
    return null;
  }

  const recognition = new Ctor();
  recognition.lang = options.lang ?? 'en-GB';
  recognition.continuous = options.continuous ?? false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  // Each result index is delivered as final only once, preventing duplicate execution.
  const finalized = new Set<number>();
  let ended = false;

  recognition.onstart = () => callbacks.onStart?.();
  recognition.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const transcript = result?.[0]?.transcript.trim() ?? '';
      if (!result || !transcript) continue;
      if (result.isFinal) {
        if (!finalized.has(i)) {
          finalized.add(i);
          callbacks.onFinal(transcript);
        }
      } else {
        interim += `${transcript} `;
      }
    }
    if (interim.trim()) callbacks.onInterim?.(interim.trim());
  };
  recognition.onerror = (event) => callbacks.onError?.(toErrorCode(event.error));
  recognition.onend = () => {
    if (ended) return;
    ended = true;
    callbacks.onEnd?.();
  };

  try {
    recognition.start();
  } catch (error) {
    console.warn('[jarvis] Recognition failed to start', error);
    callbacks.onError?.('unknown');
    callbacks.onEnd?.();
    return null;
  }

  return {
    stop: () => {
      try {
        recognition.stop();
      } catch {
        /* already stopped */
      }
    },
    abort: () => {
      try {
        recognition.abort();
      } catch {
        /* already stopped */
      }
    },
  };
}
