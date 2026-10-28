/**
 * Browser speech synthesis helpers. Voice availability varies by browser and operating system,
 * so the preferred voice is chosen from whatever the device actually provides.
 */

export function isSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

/** Known British male voices across platforms, in order of preference. */
const PREFERRED_VOICE_NAMES = [
  'Microsoft Ryan Online (Natural)',
  'Microsoft Thomas Online (Natural)',
  'Google UK English Male',
  'Daniel',
  'Arthur',
  'Oliver',
  'Malcolm',
  'Microsoft George',
  'Microsoft Ryan',
];

const MALE_HINT = /\b(male|man|daniel|arthur|oliver|malcolm|george|ryan|thomas|alfie|elliot|harry)\b/i;

const isBritish = (v: SpeechSynthesisVoice) => /^en[-_]GB/i.test(v.lang);
const isEnglish = (v: SpeechSynthesisVoice) => /^en\b|^en[-_]/i.test(v.lang);

/** Picks the best available voice: preferred British male → any British → any English → first. */
export function pickDefaultVoice(voices: readonly SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  for (const name of PREFERRED_VOICE_NAMES) {
    const voice = voices.find((v) => v.name.startsWith(name) && isBritish(v));
    if (voice) return voice;
  }
  return (
    voices.find((v) => isBritish(v) && MALE_HINT.test(v.name)) ??
    voices.find(isBritish) ??
    voices.find((v) => isEnglish(v) && MALE_HINT.test(v.name)) ??
    voices.find(isEnglish) ??
    voices[0] ??
    null
  );
}

/** Sorts voices with British English first, then other English, then the rest. */
export function sortVoices(voices: readonly SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  const rank = (v: SpeechSynthesisVoice) => (isBritish(v) ? 0 : isEnglish(v) ? 1 : 2);
  return [...voices].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/**
 * Resolves with the device's voices. Many browsers load voices asynchronously and fire
 * `voiceschanged` later, so this waits briefly before giving up.
 */
export function loadVoices(timeoutMs = 2500): Promise<SpeechSynthesisVoice[]> {
  if (!isSynthesisSupported()) return Promise.resolve([]);
  const synth = window.speechSynthesis;
  const initial = synth.getVoices();
  if (initial.length > 0) return Promise.resolve(initial);

  return new Promise((resolve) => {
    const finish = () => {
      synth.removeEventListener('voiceschanged', finish);
      window.clearTimeout(timer);
      resolve(synth.getVoices());
    };
    const timer = window.setTimeout(finish, timeoutMs);
    synth.addEventListener('voiceschanged', finish);
  });
}

export interface SpeakOptions {
  voice: SpeechSynthesisVoice | null;
  rate: number;
  pitch: number;
  onStart?: () => void;
  /** Fires on word boundaries where the voice supports it; used to animate the core. */
  onBoundary?: () => void;
}

/** Keeps a reference to the active utterance; some browsers drop events if it is garbage-collected. */
let activeUtterance: SpeechSynthesisUtterance | null = null;

/**
 * Speaks text and resolves when finished (or failed). A watchdog resolves anyway if the browser
 * never fires `end`, which happens occasionally in Chrome.
 */
export function speak(text: string, options: SpeakOptions): Promise<void> {
  if (!isSynthesisSupported() || !text.trim()) return Promise.resolve();
  const synth = window.speechSynthesis;
  synth.cancel();

  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    activeUtterance = utterance;
    utterance.lang = options.voice?.lang ?? 'en-GB';
    if (options.voice) {
      try {
        utterance.voice = options.voice;
      } catch (error) {
        console.warn('[afaik] Could not apply the selected voice; using the default.', error);
      }
    }
    utterance.rate = options.rate;
    utterance.pitch = options.pitch;

    const words = text.split(/\s+/).length;
    const expectedMs = (words / (2.6 * options.rate)) * 1000;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.clearTimeout(watchdog);
      if (activeUtterance === utterance) activeUtterance = null;
      resolve();
    };
    const watchdog = window.setTimeout(finish, expectedMs + 6000);

    utterance.onstart = () => options.onStart?.();
    utterance.onboundary = () => options.onBoundary?.();
    utterance.onend = finish;
    utterance.onerror = (event) => {
      if (event.error !== 'interrupted' && event.error !== 'canceled') {
        console.warn('[afaik] Speech synthesis error:', event.error);
      }
      finish();
    };

    try {
      synth.speak(utterance);
      // Chrome can leave the queue paused after tab switches.
      if (synth.paused) synth.resume();
    } catch (error) {
      console.warn('[afaik] Speech synthesis failed', error);
      finish();
    }
  });
}

export function cancelSpeech(): void {
  if (isSynthesisSupported()) window.speechSynthesis.cancel();
}

let unlocked = false;

/**
 * iOS Safari only allows speech that starts from a user gesture. Speaking a silent utterance during
 * the first tap or keypress unlocks later, asynchronous responses.
 */
export function unlockSynthesis(): void {
  if (unlocked || !isSynthesisSupported()) return;
  unlocked = true;
  const utterance = new SpeechSynthesisUtterance(' ');
  utterance.volume = 0;
  window.speechSynthesis.speak(utterance);
}
