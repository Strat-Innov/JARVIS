import { Database, Play, RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import type { VoicesState } from '../hooks/useVoices';
import { ACTIVATION_MODES, type ActivationMode, type Settings as SettingsModel } from '../types/afaik';
import { DEFAULT_SETTINGS, PITCH_RANGE, RATE_RANGE } from '../utils/validation';

interface SettingsProps {
  settings: SettingsModel;
  voices: VoicesState;
  recognitionSupported: boolean;
  busy: boolean;
  onChange: (settings: SettingsModel) => void;
  onTestVoice: () => void;
  onOpenWorkshop: () => void;
  onResetDemo: () => void;
}

const MODE_INFO: Record<ActivationMode, { title: string; description: string }> = {
  'push-to-talk': {
    title: 'Push to talk',
    description: 'Press the microphone, speak one command. Most reliable — recommended for the party.',
  },
  conversation: {
    title: 'Conversation',
    description: 'After each reply the microphone re-opens for the next command. Stops after a few seconds of silence or “Go to standby”.',
  },
  'wake-word': {
    title: 'Wake word “AFAIK” (experimental)',
    description:
      'Listens continuously and only responds to speech containing “AFAIK”, spelled out letter by letter. Chrome/Edge desktop only in practice; browsers stop continuous listening periodically and it restarts automatically, so occasional misses are expected.',
  },
};

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border-b border-arc/15 pb-5">
      <h3 className="hud-label">{title}</h3>
      {children}
    </section>
  );
}

function Toggle({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center justify-between gap-3">
      <span>{label}</span>
      <input id={id} type="checkbox" role="switch" className="h-5 w-5 accent-arc" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function Settings({ settings, voices, recognitionSupported, busy, onChange, onTestVoice, onOpenWorkshop, onResetDemo }: SettingsProps) {
  const set = <K extends keyof SettingsModel>(key: K, value: SettingsModel[K]) => onChange({ ...settings, [key]: value });

  return (
    <div className="space-y-5">
      <Group title="Voice">
        {!voices.supported ? (
          <p className="text-warn">Speech synthesis is not supported in this browser. Responses will be shown as text.</p>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <label htmlFor="voice-select" className="text-sm font-semibold text-haze">
                Voice
              </label>
              <select
                id="voice-select"
                className="hud-input"
                value={settings.voiceURI ?? ''}
                onChange={(e) => set('voiceURI', e.target.value || null)}
                disabled={voices.loading}
              >
                <option value="">Automatic — {voices.activeVoice && !settings.voiceURI ? voices.activeVoice.name : 'best British voice available'}</option>
                {voices.voices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name} ({v.lang}){v.localService ? '' : ' · online'}
                  </option>
                ))}
              </select>
              <p className="text-xs text-haze">
                {voices.loading
                  ? 'Loading voices…'
                  : `${voices.voices.length} voices found. Voices depend on your browser and operating system — British male voices include “Daniel” (Apple), “Google UK English Male” (Chrome) and “Microsoft Ryan” (Edge). This is a JARVIS-style delivery, not the film voice.`}
              </p>
              {voices.usingFallback && <p className="text-sm text-warn">Your saved voice isn’t available on this device; using {voices.activeVoice?.name ?? 'the default'}.</p>}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label htmlFor="rate" className="flex justify-between text-sm font-semibold text-haze">
                  Speech rate <span className="font-mono">{settings.rate.toFixed(2)}×</span>
                </label>
                <input id="rate" type="range" min={RATE_RANGE.min} max={RATE_RANGE.max} step={0.05} value={settings.rate} onChange={(e) => set('rate', Number(e.target.value))} />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="pitch" className="flex justify-between text-sm font-semibold text-haze">
                  Pitch <span className="font-mono">{settings.pitch.toFixed(2)}</span>
                </label>
                <input id="pitch" type="range" min={PITCH_RANGE.min} max={PITCH_RANGE.max} step={0.05} value={settings.pitch} onChange={(e) => set('pitch', Number(e.target.value))} />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="button" className="hud-button" onClick={onTestVoice} disabled={busy || voices.loading}>
                <Play size={16} aria-hidden /> Test voice
              </button>
              <button
                type="button"
                className="hud-button"
                onClick={() => onChange({ ...settings, voiceURI: null, rate: DEFAULT_SETTINGS.rate, pitch: DEFAULT_SETTINGS.pitch })}
              >
                <RotateCcw size={16} aria-hidden /> Default voice settings
              </button>
            </div>
          </>
        )}
      </Group>

      <Group title="Output">
        <Toggle id="speech-enabled" label="Spoken responses" checked={settings.speechEnabled} onChange={(v) => set('speechEnabled', v)} />
        <Toggle id="sfx-enabled" label="Interface sound effects" checked={settings.soundEffectsEnabled} onChange={(v) => set('soundEffectsEnabled', v)} />
      </Group>

      <Group title="Activation mode">
        {!recognitionSupported && <p className="text-sm text-warn">Speech recognition isn’t available in this browser, so only typed commands will work.</p>}
        <fieldset className="space-y-2">
          <legend className="sr-only">Activation mode</legend>
          {ACTIVATION_MODES.map((mode) => (
            <label key={mode} className={`flex cursor-pointer gap-3 border p-3 ${settings.activationMode === mode ? 'border-arc-bright bg-arc/10' : 'border-arc/15'}`}>
              <input type="radio" name="activation" className="mt-1 accent-arc" checked={settings.activationMode === mode} onChange={() => set('activationMode', mode)} />
              <span>
                <span className="font-semibold">{MODE_INFO[mode].title}</span>
                <span className="block text-sm text-haze">{MODE_INFO[mode].description}</span>
              </span>
            </label>
          ))}
        </fieldset>
      </Group>

      <Group title="Suit data">
        <div className="flex flex-wrap gap-2">
          <button type="button" className="hud-button" onClick={onOpenWorkshop}>
            <Database size={16} aria-hidden /> Manage suits in Workshop
          </button>
          <button
            type="button"
            className="hud-button"
            onClick={() => {
              if (window.confirm('Reset all suits to the demo data? Your edits will be lost.')) onResetDemo();
            }}
          >
            <RotateCcw size={16} aria-hidden /> Reset demo configuration
          </button>
        </div>
      </Group>

      <p className="text-xs text-haze">
        Settings are stored only in this browser’s local storage. No accounts, API keys or servers are involved. Fan-made project; not affiliated with
        Marvel or Disney.
      </p>
    </div>
  );
}
