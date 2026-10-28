import { PartyPopper, Settings as SettingsIcon } from 'lucide-react';

interface HeaderProps {
  now: number;
  availability: { label: string; tone: 'ok' | 'warn' };
  partyMode: boolean;
  onOpenSettings: () => void;
}

export function Header({ now, availability, partyMode, onOpenSettings }: HeaderProps) {
  const time = new Date(now);
  return (
    <header className="hud-panel flex items-center gap-3 px-3 py-2 sm:gap-6 sm:px-5">
      <div className="min-w-0">
        <p className="font-display text-[0.6rem] tracking-[0.25em] text-haze sm:tracking-[0.35em] sm:text-xs">FILINVEST ALABANG INC.</p>
        <h1 className="font-display text-lg font-bold tracking-[0.3em] text-ice glow-text sm:text-2xl">A.F.A.I.K.</h1>
      </div>

      <div className="ml-auto flex items-center gap-3 sm:gap-6">
        {partyMode && (
          <span className="hidden items-center gap-1.5 border border-fuchsia-400/40 bg-fuchsia-400/10 px-2 py-1 font-display text-[0.6rem] tracking-[0.2em] text-fuchsia-200 sm:flex">
            <PartyPopper size={14} aria-hidden /> PARTY PROTOCOL
          </span>
        )}
        <div className="flex items-center gap-2" role="status" aria-label={`System ${availability.label}`}>
          <span
            className="status-dot live"
            style={{ background: availability.tone === 'ok' ? 'var(--color-ok)' : 'var(--color-warn)' }}
            aria-hidden
          />
          <span className="font-display text-[0.6rem] tracking-[0.2em] text-haze sm:text-xs">{availability.label}</span>
        </div>
        <div className="text-right">
          <time className="block font-mono text-base text-ice tabular-nums sm:text-xl" dateTime={time.toISOString()}>
            {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </time>
          <span className="hidden font-mono text-[0.65rem] text-haze sm:block">
            {time.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        </div>
        <button type="button" className="hud-button p-2!" onClick={onOpenSettings} aria-label="Open settings">
          <SettingsIcon size={18} aria-hidden />
        </button>
      </div>
    </header>
  );
}
