/** Short synthesised interface tones via the Web Audio API — no audio files required. */

export type SoundEffect = 'listen' | 'acknowledge' | 'error' | 'boot';

let context: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  context ??= new Ctor();
  if (context.state === 'suspended') void context.resume();
  return context;
}

function tone(ctx: AudioContext, frequency: number, start: number, duration: number, volume = 0.06, type: OscillatorType = 'sine') {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

const PATTERNS: Record<SoundEffect, Array<[frequency: number, offset: number, duration: number]>> = {
  listen: [[880, 0, 0.08], [1320, 0.07, 0.12]],
  acknowledge: [[1320, 0, 0.06], [990, 0.06, 0.1]],
  error: [[330, 0, 0.14], [247, 0.13, 0.2]],
  boot: [[440, 0, 0.12], [660, 0.12, 0.12], [880, 0.24, 0.12], [1320, 0.36, 0.3]],
};

export function playSound(effect: SoundEffect): void {
  try {
    const ctx = getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const [frequency, offset, duration] of PATTERNS[effect]) {
      tone(ctx, frequency, now + offset, duration, effect === 'error' ? 0.05 : 0.06, effect === 'error' ? 'triangle' : 'sine');
    }
  } catch {
    /* Sound effects are decorative; ignore failures. */
  }
}
