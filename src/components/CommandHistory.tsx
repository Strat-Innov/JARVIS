import { Keyboard, Mic, Volume2 } from 'lucide-react';
import type { HistoryEntry } from '../types/jarvis';

interface CommandHistoryProps {
  history: HistoryEntry[];
  interimTranscript: string;
  lastInput: string;
  micStatus: string;
  voiceStatus: string;
}

/** Bottom area: live transcript, command history, and microphone/voice status. */
export function CommandHistory({ history, interimTranscript, lastInput, micStatus, voiceStatus }: CommandHistoryProps) {
  const transcript = interimTranscript || lastInput;
  return (
    <section className="hud-panel grid gap-3 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]" aria-label="Transcript and history">
      <div className="min-w-0">
        <h2 className="hud-label mb-1">Transcript</h2>
        <p className={`min-h-6 break-words font-mono text-sm ${interimTranscript ? 'text-arc-bright' : 'text-ice/85'}`} aria-live="polite">
          {transcript ? `“${transcript}”` : <span className="text-haze">Awaiting input…</span>}
        </p>
      </div>

      <div className="min-w-0">
        <h2 className="hud-label mb-1">Command history</h2>
        {history.length === 0 ? (
          <p className="text-sm text-haze">No commands yet. Try “Status report”.</p>
        ) : (
          <ol className="max-h-28 space-y-1 overflow-y-auto pr-1 text-sm">
            {history.map((h) => (
              <li key={h.id} className="flex min-w-0 items-baseline gap-2">
                <span className="shrink-0 text-haze" title={h.source === 'voice' ? 'Voice' : 'Typed'}>
                  {h.source === 'voice' ? <Mic size={12} aria-label="Voice" /> : <Keyboard size={12} aria-label="Typed" />}
                </span>
                <span className="min-w-0 truncate">
                  <span className={h.recognized ? 'text-ice' : 'text-warn'}>{h.input}</span>
                  <span className="text-haze"> → {h.recognized ? h.intent.replace(/_/g, ' ') : 'not recognised'}</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="min-w-0 space-y-1 text-sm md:col-span-2 lg:col-span-1 lg:max-w-64">
        <h2 className="hud-label mb-1">Voice systems</h2>
        <p className="flex items-center gap-2 text-haze">
          <Mic size={14} aria-hidden /> <span className="truncate">{micStatus}</span>
        </p>
        <p className="flex items-center gap-2 text-haze">
          <Volume2 size={14} aria-hidden /> <span className="truncate">{voiceStatus}</span>
        </p>
      </div>
    </section>
  );
}
