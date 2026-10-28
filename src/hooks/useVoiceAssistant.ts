/**
 * Voice assistant state machine.
 *
 *   standby ──mic──▶ listening ──final transcript──▶ processing ──▶ speaking ──▶ standby
 *                                                                     │
 *              conversation / wake-word modes re-open the microphone ─┘
 *
 * Recognition is always stopped before AFAIK speaks, so it never hears itself.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { containsWakeWord, normalizeCommand } from '../services/commandInterpreter';
import { processCommand } from '../services/responseEngine';
import { playSound, type SoundEffect } from '../services/soundEffects';
import {
  isRecognitionSupported,
  RECOGNITION_ERROR_MESSAGES,
  startRecognition,
  type RecognitionErrorCode,
  type RecognitionSession,
} from '../services/speechRecognition';
import { cancelSpeech, isSynthesisSupported, speak, unlockSynthesis } from '../services/speechSynthesis';
import type { AssistantAction, AssistantState, HistoryEntry, Settings, Suit } from '../types/afaik';
import { toSpeakable } from '../utils/time';

export interface VoiceAssistantOptions {
  suits: Suit[];
  selectedSuitId: string | null;
  partyMode: boolean;
  settings: Settings;
  voice: SpeechSynthesisVoice | null;
  onAction: (action: AssistantAction) => void;
}

type SessionKind = 'command' | 'wake';

const MAX_HISTORY = 50;
const DUPLICATE_WINDOW_MS = 1500;
const WAKE_FOLLOW_UP_MS = 8000;
const ERROR_DISPLAY_MS = 4000;
const BOOT_ANIMATION_MS = 2800;
const MAX_WAKE_RESTART_FAILURES = 3;

const FATAL_ERRORS: ReadonlySet<RecognitionErrorCode> = new Set(['unsupported', 'insecure-context', 'not-allowed', 'audio-capture']);

const delay = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function useVoiceAssistant(options: VoiceAssistantOptions) {
  const [state, setState] = useState<AssistantState>('standby');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [lastInput, setLastInput] = useState('');
  const [responseText, setResponseText] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<SessionKind | null>(null);
  const [handsFree, setHandsFreeState] = useState(false);
  const [booting, setBooting] = useState(false);
  const [speechPulse, setSpeechPulse] = useState(0);

  const latest = useRef(options);
  latest.current = options;

  const sessionRef = useRef<{ id: number; kind: SessionKind; control: RecognitionSession } | null>(null);
  const sessionCounter = useRef(0);
  const busyRef = useRef(false);
  const handsFreeRef = useRef(false);
  const awaitingUntilRef = useRef(0);
  const lastCommandRef = useRef<{ text: string; at: number } | null>(null);
  const wakeFailuresRef = useRef(0);
  const listenAfterSpeechRef = useRef(false);
  const errorTimerRef = useRef<number | undefined>(undefined);
  const mountedRef = useRef(true);

  const sfx = useCallback((effect: SoundEffect) => {
    if (latest.current.settings.soundEffectsEnabled) playSound(effect);
  }, []);

  const setHandsFree = useCallback((value: boolean) => {
    handsFreeRef.current = value;
    setHandsFreeState(value);
    if (!value) awaitingUntilRef.current = 0;
  }, []);

  const showError = useCallback(
    (message: string) => {
      setErrorMessage(message);
      setState('error');
      sfx('error');
      window.clearTimeout(errorTimerRef.current);
      errorTimerRef.current = window.setTimeout(() => {
        setState((s) => (s === 'error' ? 'standby' : s));
      }, ERROR_DISPLAY_MS);
    },
    [sfx],
  );

  const stopSession = useCallback(() => {
    const session = sessionRef.current;
    sessionRef.current = null;
    setActiveSession(null);
    session?.control.abort();
  }, []);

  // Declared via ref so startSession and runInput can call each other.
  const runInputRef = useRef<(text: string, source: HistoryEntry['source']) => Promise<void>>(async () => {});

  const startSession = useCallback(
    (kind: SessionKind) => {
      if (sessionRef.current) stopSession();
      const id = ++sessionCounter.current;
      const isCurrent = () => sessionRef.current?.id === id;
      let heardFinal = false;

      const control = startRecognition(
        {
          onStart: () => {
            if (!isCurrent()) return;
            wakeFailuresRef.current = 0;
            setErrorMessage(null);
            if (kind === 'command') {
              setState('listening');
              sfx('listen');
            } else if (Date.now() < awaitingUntilRef.current) {
              setState('listening');
            }
          },
          onInterim: (text) => {
            if (!isCurrent() || busyRef.current) return;
            if (kind === 'command' || containsWakeWord(text) || Date.now() < awaitingUntilRef.current) {
              setInterimTranscript(text);
              setState('listening');
            }
          },
          onFinal: (text) => {
            if (!isCurrent() || busyRef.current) return;
            if (kind === 'command') {
              heardFinal = true;
              void runInputRef.current(text, 'voice');
              return;
            }
            // Wake-word mode: only act on speech addressed to AFAIK, or a follow-up just after "AFAIK?".
            if (Date.now() < awaitingUntilRef.current || containsWakeWord(text)) {
              awaitingUntilRef.current = 0;
              void runInputRef.current(text, 'voice');
            } else {
              setInterimTranscript('');
            }
          },
          onError: (code) => {
            if (!isCurrent() || code === 'aborted') return;
            if (FATAL_ERRORS.has(code)) {
              setHandsFree(false);
              showError(RECOGNITION_ERROR_MESSAGES[code]);
              return;
            }
            if (kind === 'wake') {
              if (code !== 'no-speech') wakeFailuresRef.current += 1;
              return; // onEnd restarts the session.
            }
            if (code === 'no-speech') {
              if (handsFreeRef.current) {
                // Conversation mode times out quietly when nobody speaks.
                setHandsFree(false);
                setErrorMessage('Listening timed out. Press the microphone to continue.');
                setState('standby');
              } else {
                showError(RECOGNITION_ERROR_MESSAGES['no-speech']);
              }
              return;
            }
            setHandsFree(false);
            showError(RECOGNITION_ERROR_MESSAGES[code]);
          },
          onEnd: () => {
            if (!isCurrent()) return;
            sessionRef.current = null;
            setActiveSession(null);
            setInterimTranscript('');
            if (busyRef.current) return;
            if (kind === 'wake' && handsFreeRef.current) {
              if (wakeFailuresRef.current >= MAX_WAKE_RESTART_FAILURES) {
                setHandsFree(false);
                showError('Wake-word listening stopped after repeated recognition errors. Press the microphone to try again.');
                return;
              }
              // Browsers end continuous sessions periodically; restart while the mode is armed.
              window.setTimeout(() => {
                if (handsFreeRef.current && !busyRef.current && !sessionRef.current && mountedRef.current) startSession('wake');
              }, 300);
              setState((s) => (s === 'listening' ? 'standby' : s));
              return;
            }
            if (!heardFinal) setState((s) => (s === 'listening' ? 'standby' : s));
          },
        },
        { continuous: kind === 'wake' },
      );

      if (control) {
        sessionRef.current = { id, kind, control };
        setActiveSession(kind);
      }
    },
    [setHandsFree, sfx, showError, stopSession],
  );

  /** After a response: re-open the microphone in hands-free modes, otherwise return to standby. */
  const resumeAfterResponse = useCallback(
    (bareWakeWord: boolean) => {
      if (!mountedRef.current) return;
      const mode = latest.current.settings.activationMode;
      if (listenAfterSpeechRef.current) {
        // The user pressed the microphone while AFAIK was talking.
        listenAfterSpeechRef.current = false;
        startSession(mode === 'wake-word' ? 'wake' : 'command');
        return;
      }
      if (!handsFreeRef.current) {
        setState('standby');
        return;
      }
      if (mode === 'wake-word') {
        if (bareWakeWord) awaitingUntilRef.current = Date.now() + WAKE_FOLLOW_UP_MS;
        setState(bareWakeWord ? 'listening' : 'standby');
        startSession('wake');
      } else {
        startSession('command');
      }
    },
    [startSession],
  );

  const runInput = useCallback(
    async (text: string, source: HistoryEntry['source']) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const normalized = normalizeCommand(trimmed);
      const now = Date.now();
      const last = lastCommandRef.current;
      if (last && last.text === normalized && now - last.at < DUPLICATE_WINDOW_MS) return;
      if (busyRef.current) return;
      lastCommandRef.current = { text: normalized, at: now };

      busyRef.current = true;
      stopSession(); // Never listen while processing or speaking.
      window.clearTimeout(errorTimerRef.current);
      setErrorMessage(null);
      setInterimTranscript('');
      setLastInput(trimmed);
      setState('processing');

      try {
        const { suits, selectedSuitId, partyMode } = latest.current;
        const { interpretation, response } = processCommand(trimmed, { suits, selectedSuitId, partyMode, now });

        if (response.bootSequence) {
          setBooting(true);
          sfx('boot');
          window.setTimeout(() => mountedRef.current && setBooting(false), BOOT_ANIMATION_MS);
        } else {
          sfx('acknowledge');
        }

        await delay(response.processingMs);
        if (!mountedRef.current) {
          busyRef.current = false;
          return;
        }

        for (const action of response.actions) {
          if (action.type === 'standby') {
            setHandsFree(false);
          }
          latest.current.onAction(action);
        }

        setHistory((h) =>
          [
            {
              id: newId(),
              at: Date.now(),
              input: trimmed,
              source,
              intent: interpretation.intent,
              recognized: interpretation.recognized,
              response: response.display,
            },
            ...h,
          ].slice(0, MAX_HISTORY),
        );
        setResponseText(response.display);

        const { settings, voice } = latest.current;
        if (settings.speechEnabled && isSynthesisSupported()) {
          setState('speaking');
          await speak(response.speech, {
            voice,
            rate: settings.rate,
            pitch: settings.pitch,
            onBoundary: () => setSpeechPulse((p) => p + 1),
          });
        } else {
          await delay(600);
        }
      } catch (error) {
        console.error('[afaik] Command handling failed', error);
        busyRef.current = false;
        showError('Something went wrong handling that command. Please try again.');
        return;
      }

      busyRef.current = false;
      if (mountedRef.current) resumeAfterResponse(source === 'voice' && normalized === '');
    },
    [resumeAfterResponse, setHandsFree, sfx, showError, stopSession],
  );
  runInputRef.current = runInput;

  /** User-initiated: starts listening according to the configured activation mode. */
  const startListening = useCallback(() => {
    unlockSynthesis();
    if (!isRecognitionSupported()) {
      showError(RECOGNITION_ERROR_MESSAGES.unsupported);
      return;
    }
    const mode = latest.current.settings.activationMode;
    setHandsFree(mode !== 'push-to-talk');
    wakeFailuresRef.current = 0;
    if (busyRef.current) {
      // Barge-in: stop talking, then listen once speech has ended.
      listenAfterSpeechRef.current = true;
      cancelSpeech();
      return;
    }
    startSession(mode === 'wake-word' ? 'wake' : 'command');
  }, [setHandsFree, showError, startSession]);

  /** Turns the microphone off completely, including hands-free modes. */
  const stopListening = useCallback(() => {
    setHandsFree(false);
    listenAfterSpeechRef.current = false;
    const session = sessionRef.current;
    if (session?.kind === 'command' && !busyRef.current) {
      // Let the recogniser finalise what it has already heard.
      session.control.stop();
      return;
    }
    stopSession();
    setInterimTranscript('');
    if (!busyRef.current) setState('standby');
  }, [setHandsFree, stopSession]);

  const micOn = activeSession !== null || handsFree;

  const toggleListening = useCallback(() => {
    if (micOn) stopListening();
    else startListening();
  }, [micOn, startListening, stopListening]);

  const submitText = useCallback(
    (text: string) => {
      unlockSynthesis();
      void runInput(text, 'text');
    },
    [runInput],
  );

  /** Stops speech immediately. */
  const interrupt = useCallback(() => cancelSpeech(), []);

  /** Speaks arbitrary text (used by the voice test in Settings). */
  const speakText = useCallback(async (text: string, voiceOverride?: SpeechSynthesisVoice | null) => {
    if (busyRef.current || !isSynthesisSupported()) return;
    unlockSynthesis();
    busyRef.current = true;
    stopSession();
    setResponseText(text);
    setState('speaking');
    const { settings, voice } = latest.current;
    try {
      await speak(toSpeakable(text), {
        voice: voiceOverride ?? voice,
        rate: settings.rate,
        pitch: settings.pitch,
        onBoundary: () => setSpeechPulse((p) => p + 1),
      });
    } finally {
      busyRef.current = false;
    }
    resumeAfterResponse(false);
  }, [resumeAfterResponse, stopSession]);

  // Switching activation mode turns hands-free listening off to avoid surprises.
  const activationMode = options.settings.activationMode;
  useEffect(() => {
    if (!handsFreeRef.current) return;
    setHandsFree(false);
    stopSession();
    if (!busyRef.current) setState('standby');
  }, [activationMode, setHandsFree, stopSession]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      handsFreeRef.current = false;
      sessionRef.current?.control.abort();
      sessionRef.current = null;
      window.clearTimeout(errorTimerRef.current);
      cancelSpeech();
    };
  }, []);

  return {
    state,
    interimTranscript,
    lastInput,
    responseText,
    history,
    errorMessage,
    booting,
    speechPulse,
    recognitionSupported: isRecognitionSupported(),
    /** True while the microphone is on (a session is running or a hands-free mode is armed). */
    micOn,
    /** True while wake-word mode is armed and waiting for "AFAIK". */
    wakeArmed: handsFree && options.settings.activationMode === 'wake-word',
    handsFree,
    startListening,
    stopListening,
    toggleListening,
    submitText,
    interrupt,
    speakText,
  };
}

export type VoiceAssistant = ReturnType<typeof useVoiceAssistant>;
