import { CheckCircle2, Radar, XCircle } from 'lucide-react';
import { DIAGNOSTIC_COLORS, DIAGNOSTIC_LABELS, REPAIR_COLORS, REPAIR_LABELS } from '../components/suitDisplay';
import type { Suit } from '../types/afaik';
import { formatCountdown, getRepairRemainingMs } from '../utils/time';

export interface BrowserCapabilities {
  recognition: boolean;
  synthesis: boolean;
  secureContext: boolean;
  voiceCount: number;
  storage: boolean;
}

interface DiagnosticsProps {
  suits: Suit[];
  now: number;
  busy: boolean;
  capabilities: BrowserCapabilities;
  onCommand: (text: string) => void;
}

function Check({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <li className="flex items-start gap-2">
      {ok ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-ok" aria-label="OK" /> : <XCircle size={18} className="mt-0.5 shrink-0 text-warn" aria-label="Unavailable" />}
      <span>
        <span className="font-semibold">{label}</span>
        <span className="block text-sm text-haze">{detail}</span>
      </span>
    </li>
  );
}

export function Diagnostics({ suits, now, busy, capabilities, onCommand }: DiagnosticsProps) {
  return (
    <div className="space-y-6">
      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="hud-label">Suit diagnostics</h3>
          <button type="button" className="hud-button text-sm" disabled={busy} onClick={() => onCommand('Status report')}>
            Full status report
          </button>
        </div>
        <ul className="space-y-2">
          {suits.map((suit) => {
            const remaining = getRepairRemainingMs(suit.repairCompletesAt, now);
            return (
              <li key={suit.id} className="border border-arc/15 bg-arc/5 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-display font-bold tracking-wider">{suit.name}</p>
                    {suit.name !== suit.designation && <p className="font-mono text-xs text-haze">{suit.designation}</p>}
                  </div>
                  <button type="button" className="hud-button text-sm" disabled={busy} onClick={() => onCommand(`Run diagnostics on the ${suit.name}`)}>
                    <Radar size={15} aria-hidden /> Run diagnostics
                  </button>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-haze">Repair</dt>
                    <dd className="flex items-center gap-1.5">
                      <span className="status-dot" style={{ background: REPAIR_COLORS[suit.repairStatus] }} aria-hidden />
                      {REPAIR_LABELS[suit.repairStatus]}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-haze">Remaining</dt>
                    <dd className="font-mono tabular-nums">
                      {remaining === null ? 'Unavailable' : remaining > 0 ? formatCountdown(remaining) : 'Elapsed'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-haze">Power</dt>
                    <dd className="font-mono">{suit.powerLevel === null ? 'Unavailable' : `${Math.round(suit.powerLevel)}%`}</dd>
                  </div>
                  <div>
                    <dt className="text-haze">Diagnostics</dt>
                    <dd className="flex items-center gap-1.5">
                      <span className="status-dot" style={{ background: DIAGNOSTIC_COLORS[suit.diagnosticStatus] }} aria-hidden />
                      {DIAGNOSTIC_LABELS[suit.diagnosticStatus]}
                    </dd>
                  </div>
                </dl>
              </li>
            );
          })}
        </ul>
        {suits.length === 0 && <p className="text-haze">No suits on record.</p>}
      </section>

      <section>
        <h3 className="hud-label mb-2">Browser systems check</h3>
        <p className="mb-3 text-sm text-haze">Run this on the exact device and browser you will use at the party.</p>
        <ul className="space-y-2.5">
          <Check
            ok={capabilities.recognition}
            label="Speech recognition"
            detail={capabilities.recognition ? 'Available. Chrome and Edge need an internet connection for it.' : 'Not supported here — use the text input, or try Chrome, Edge or Safari.'}
          />
          <Check
            ok={capabilities.secureContext}
            label="Secure context (HTTPS)"
            detail={capabilities.secureContext ? 'OK — the microphone can be requested.' : 'Microphone access requires HTTPS or localhost.'}
          />
          <Check
            ok={capabilities.synthesis && capabilities.voiceCount > 0}
            label="Speech synthesis"
            detail={
              capabilities.synthesis
                ? `${capabilities.voiceCount} voice${capabilities.voiceCount === 1 ? '' : 's'} available on this device.`
                : 'Not supported — responses will be shown as text only.'
            }
          />
          <Check
            ok={capabilities.storage}
            label="Local storage"
            detail={capabilities.storage ? 'Settings and suit data persist in this browser.' : 'Blocked — changes will be lost on refresh.'}
          />
        </ul>
      </section>
    </div>
  );
}
