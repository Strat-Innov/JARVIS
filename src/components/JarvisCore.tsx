import { memo } from 'react';
import type { AssistantState } from '../types/jarvis';

interface JarvisCoreProps {
  state: AssistantState;
  /** Increments on speech word boundaries to flash the reactor in time with speech. */
  pulse: number;
  booting: boolean;
  partyMode: boolean;
}

const CX = 200;
const CY = 200;

const polar = (r: number, deg: number) => {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
};

function arcPath(r: number, start: number, end: number): string {
  const a = polar(r, start);
  const b = polar(r, end);
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${end - start > 180 ? 1 : 0} 1 ${b.x} ${b.y}`;
}

function wedgePath(r: number, start: number, end: number): string {
  const a = polar(r, start);
  const b = polar(r, end);
  return `M ${CX} ${CY} L ${a.x} ${a.y} A ${r} ${r} 0 0 1 ${b.x} ${b.y} Z`;
}

/* Static geometry, computed once. */
const TICKS = Array.from({ length: 120 }, (_, i) => {
  const deg = i * 3;
  const long = i % 10 === 0;
  return { deg, inner: polar(long ? 176 : 181, deg), outer: polar(187, deg), long };
});
const BAR_COUNT = 72;
const BARS = Array.from({ length: BAR_COUNT }, (_, i) => ({
  deg: (360 / BAR_COUNT) * i,
  // Pseudo-random but deterministic delays give an organic voice waveform.
  delay: ((i * 37) % 17) * 0.06,
  duration: 0.45 + ((i * 53) % 11) * 0.05,
}));
const ARCS = [
  [8, 92],
  [128, 212],
  [248, 332],
] as const;

const STATE_LABELS: Record<AssistantState, string> = {
  standby: 'Standby',
  listening: 'Listening',
  processing: 'Processing',
  speaking: 'Speaking',
  error: 'Attention required',
};

/** The animated arc-reactor-style core. All animation is CSS; state is exposed via data attributes. */
function JarvisCoreImpl({ state, pulse, booting, partyMode }: JarvisCoreProps) {
  return (
    <div
      className="core relative aspect-square w-full"
      data-state={state}
      data-booting={booting}
      data-party={partyMode}
      role="img"
      aria-label={`JARVIS core — ${STATE_LABELS[state]}`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-[18%] rounded-full blur-3xl transition-opacity duration-500"
        style={{ background: 'radial-gradient(circle, var(--core-soft), transparent 70%)', opacity: state === 'standby' ? 0.6 : 1 }}
      />
      <svg viewBox="0 0 400 400" className="relative h-full w-full" aria-hidden>
        <defs>
          <radialGradient id="reactor-fill" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="35%" stopColor="currentColor" stopOpacity="0.55" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="scan-fill" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.35" />
          </linearGradient>
        </defs>

        {/* Listening ripples */}
        <g>
          {[0, 1, 2].map((i) => (
            <circle key={i} className="core-ripple" cx={CX} cy={CY} r={92} fill="none" stroke="currentColor" strokeWidth={1.2} />
          ))}
        </g>

        {/* Outer frame */}
        <circle cx={CX} cy={CY} r={194} fill="none" stroke="currentColor" strokeOpacity={0.18} strokeWidth={1} />
        <g className="core-ticks spin">
          {TICKS.map((t) => (
            <line
              key={t.deg}
              x1={t.inner.x}
              y1={t.inner.y}
              x2={t.outer.x}
              y2={t.outer.y}
              stroke="currentColor"
              strokeOpacity={t.long ? 0.75 : 0.3}
              strokeWidth={t.long ? 1.4 : 0.8}
            />
          ))}
        </g>
        <circle
          className="core-boot"
          cx={CX}
          cy={CY}
          r={170}
          fill="none"
          stroke="var(--core-strong)"
          strokeWidth={2.5}
          strokeDasharray="1200"
          transform={`rotate(-90 ${CX} ${CY})`}
        />
        <g className="core-dash spin">
          <circle cx={CX} cy={CY} r={164} fill="none" stroke="currentColor" strokeOpacity={0.45} strokeWidth={1} strokeDasharray="2 7" />
        </g>

        {/* Rotating arc segments */}
        <g className="core-arcs spin">
          {ARCS.map(([start, end]) => (
            <path key={start} d={arcPath(148, start, end)} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="square" />
          ))}
          {ARCS.map(([start]) => {
            const p = polar(148, start - 5);
            return <circle key={`dot-${start}`} cx={p.x} cy={p.y} r={2.2} fill="currentColor" />;
          })}
        </g>

        {/* Processing scan sweep */}
        <g className="core-scan spin">
          <path d={wedgePath(150, 0, 48)} fill="url(#scan-fill)" />
          <line x1={CX} y1={CY} x2={polar(150, 48).x} y2={polar(150, 48).y} stroke="currentColor" strokeOpacity={0.8} strokeWidth={1} />
        </g>

        <circle cx={CX} cy={CY} r={128} fill="none" stroke="currentColor" strokeOpacity={0.35} strokeWidth={1} />

        {/* Voice bars */}
        <g>
          {BARS.map((b) => (
            <g key={b.deg} transform={`rotate(${b.deg} ${CX} ${CY})`}>
              <rect
                className="core-bar"
                x={CX - 1}
                y={CY - 122}
                width={2}
                height={22}
                fill="currentColor"
                style={{ animationDelay: `${b.delay}s`, animationDuration: `${b.duration}s` }}
              />
            </g>
          ))}
        </g>

        {/* Reactor coil and core */}
        <g className="core-coil spin">
          <circle cx={CX} cy={CY} r={76} fill="none" stroke="currentColor" strokeOpacity={0.55} strokeWidth={12} strokeDasharray="22 6" />
        </g>
        <circle cx={CX} cy={CY} r={92} fill="none" stroke="currentColor" strokeOpacity={0.6} strokeWidth={1.2} />
        <g className="core-reactor">
          <circle cx={CX} cy={CY} r={62} fill="url(#reactor-fill)" />
          <circle cx={CX} cy={CY} r={40} fill="none" stroke="var(--core-strong)" strokeWidth={2} />
          <circle cx={CX} cy={CY} r={20} fill="#ffffff" fillOpacity={0.92} />
        </g>
        <circle key={pulse} className="core-flash" cx={CX} cy={CY} r={58} fill="none" stroke="var(--core-strong)" strokeWidth={3} />
      </svg>
    </div>
  );
}

export const JarvisCore = memo(JarvisCoreImpl);
export { STATE_LABELS };
