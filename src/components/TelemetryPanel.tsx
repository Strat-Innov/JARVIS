import { BatteryMedium, Radar } from 'lucide-react';
import type { ActivityEntry, Suit } from '../types/jarvis';
import { DIAGNOSTIC_COLORS, DIAGNOSTIC_LABELS } from './suitDisplay';

interface TelemetryPanelProps {
  suit: Suit | undefined;
  activity: ActivityEntry[];
  lastDiagnosticAt: number | undefined;
}

const timeOf = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** Simulated power and diagnostic telemetry for the selected suit, plus recent activity. */
export function TelemetryPanel({ suit, activity, lastDiagnosticAt }: TelemetryPanelProps) {
  const power = suit?.powerLevel ?? null;
  const powerColor = power === null ? undefined : power < 25 ? 'var(--color-crit)' : power < 50 ? 'var(--color-warn)' : undefined;

  return (
    <div className="flex flex-col gap-3">
      {suit && (
        <section className="hud-panel space-y-3 p-4" aria-label="Telemetry">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-haze">
                <BatteryMedium size={15} aria-hidden /> Power level <span className="text-[0.65rem] uppercase">(simulated)</span>
              </h2>
              <span className="font-mono tabular-nums" style={{ color: powerColor }}>
                {power === null ? 'Unavailable' : `${Math.round(power)}%`}
              </span>
            </div>
            <div className="meter mt-1.5" aria-hidden>
              <span style={{ width: `${power ?? 0}%`, background: powerColor }} />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-haze">
              <Radar size={15} aria-hidden /> Diagnostics
            </h2>
            <span className="flex items-center gap-2 font-semibold">
              <span className="status-dot" style={{ background: DIAGNOSTIC_COLORS[suit.diagnosticStatus] }} aria-hidden />
              {DIAGNOSTIC_LABELS[suit.diagnosticStatus]}
            </span>
          </div>
          <p className="text-xs text-haze">{lastDiagnosticAt ? `Last scan ${timeOf(lastDiagnosticAt)}` : 'No scan this session'}</p>
          {suit.notes && <p className="border-l-2 border-arc/30 pl-2 text-sm text-ice/85">{suit.notes}</p>}
        </section>
      )}

      <section className="hud-panel flex min-h-0 flex-1 flex-col p-4" aria-labelledby="activity-title">
        <h2 id="activity-title" className="hud-label mb-2">
          Recent activity
        </h2>
        {activity.length === 0 ? (
          <p className="text-sm text-haze">No activity yet.</p>
        ) : (
          <ol className="max-h-48 space-y-1.5 overflow-y-auto pr-1 text-sm lg:max-h-none">
            {activity.map((entry) => (
              <li key={entry.id} className="flex gap-2">
                <time className="shrink-0 font-mono text-xs leading-5 text-haze">{timeOf(entry.at)}</time>
                <span className="min-w-0 break-words">{entry.message}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
