import { Database, Settings as SettingsIcon } from 'lucide-react';

interface HeaderProps {
  now: number;
  availability: { label: string; tone: 'ok' | 'warn' };
  /** e.g. "138 pages", or null when no knowledge file is loaded. */
  knowledgeLabel: string | null;
  onOpenSettings: () => void;
}

export function Header({ now, availability, knowledgeLabel, onOpenSettings }: HeaderProps) {
  const time = new Date(now);
  return (
    <header className="hud-panel flex items-center gap-3 px-3 py-2 sm:gap-6 sm:px-5">
      <div className="min-w-0">
        <p className="font-display text-[0.6rem] tracking-[0.35em] text-haze sm:text-xs">
          <abbr title="Filinvest Alabang Inc." className="no-underline sm:hidden">
            FAI
          </abbr>
          <span className="hidden sm:inline">FILINVEST ALABANG INC.</span>
        </p>
        <h1 className="font-display text-lg font-bold tracking-[0.3em] text-ice glow-text sm:text-2xl">A.F.A.I.K.</h1>
      </div>

      <div className="ml-auto flex items-center gap-3 sm:gap-6">
        <span
          className={`hidden items-center gap-1.5 border px-2 py-1 font-display text-[0.6rem] tracking-[0.2em] md:flex ${
            knowledgeLabel ? 'border-arc/30 bg-arc/10 text-arc-bright' : 'border-warn/40 bg-warn/10 text-warn'
          }`}
        >
          <Database size={14} aria-hidden /> {knowledgeLabel ? `KNOWLEDGE · ${knowledgeLabel.toUpperCase()}` : 'NO KNOWLEDGE LOADED'}
        </span>
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
