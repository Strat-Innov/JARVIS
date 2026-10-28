import { Clock, Wrench } from 'lucide-react';
import type { Suit } from '../types/jarvis';
import { formatClockTime, formatCountdown, getRepairRemainingMs } from '../utils/time';
import { REPAIR_COLORS, REPAIR_LABELS } from './suitDisplay';

interface SuitStatusPanelProps {
  suit: Suit | undefined;
  now: number;
}

/** Selected suit's repair state with a live countdown derived from the configured completion time. */
export function SuitStatusPanel({ suit, now }: SuitStatusPanelProps) {
  if (!suit) {
    return (
      <section className="hud-panel p-4">
        <h2 className="hud-label">Suit status</h2>
        <p className="mt-2 text-haze">No suit selected.</p>
      </section>
    );
  }

  const remaining = getRepairRemainingMs(suit.repairCompletesAt, now);
  const inRepair = suit.repairStatus === 'repairing' || suit.repairStatus === 'damaged';
  let countdown: { value: string; caption: string };
  if (suit.repairStatus === 'operational') countdown = { value: '—', caption: 'No repairs scheduled' };
  else if (remaining === null) countdown = { value: '--:--:--', caption: 'Estimate unavailable' };
  else if (remaining <= 0) countdown = { value: '00:00:00', caption: 'Scheduled window elapsed — awaiting confirmation' };
  else countdown = { value: formatCountdown(remaining), caption: `Est. completion ${formatClockTime(now + remaining)}` };

  return (
    <section className="hud-panel p-4" aria-labelledby="suit-status-title">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="hud-label">Selected suit</h2>
          <p id="suit-status-title" className="truncate font-display text-xl font-bold tracking-wider text-ice glow-text">
            {suit.name}
          </p>
          {suit.name !== suit.designation && <p className="font-mono text-xs text-haze">{suit.designation}</p>}
        </div>
        {suit.fictional && (
          <span className="shrink-0 border border-haze/30 px-1.5 py-0.5 font-mono text-[0.6rem] uppercase tracking-wider text-haze" title="Invented demo data">
            Demo data
          </span>
        )}
      </div>

      <dl className="mt-4 space-y-3">
        <div className="flex items-center justify-between">
          <dt className="flex items-center gap-2 text-haze">
            <Wrench size={15} aria-hidden /> Repair status
          </dt>
          <dd className="flex items-center gap-2 font-semibold">
            <span className="status-dot" style={{ background: REPAIR_COLORS[suit.repairStatus] }} aria-hidden />
            {REPAIR_LABELS[suit.repairStatus]}
          </dd>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <dt className="text-haze">Repair progress</dt>
            <dd className="font-mono tabular-nums">{suit.repairProgress === null ? 'Unknown' : `${Math.round(suit.repairProgress)}%`}</dd>
          </div>
          <div className="meter mt-1.5" aria-hidden>
            <span style={{ width: `${suit.repairProgress ?? 0}%` }} />
          </div>
        </div>

        <div className="border-t border-arc/15 pt-3">
          <dt className="flex items-center gap-2 text-haze">
            <Clock size={15} aria-hidden /> Time remaining
          </dt>
          <dd>
            <span
              className={`block font-mono text-3xl tabular-nums tracking-wider ${inRepair && remaining !== null && remaining > 0 ? 'text-arc-bright glow-text' : 'text-haze'}`}
              aria-live="off"
            >
              {countdown.value}
            </span>
            <span className="text-sm text-haze">{countdown.caption}</span>
          </dd>
        </div>
      </dl>
    </section>
  );
}
