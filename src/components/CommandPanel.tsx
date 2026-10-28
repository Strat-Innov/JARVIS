import { Activity, BatteryMedium, Gauge, HelpCircle, PartyPopper, Radar, Settings, Timer, Wrench } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Suit, View } from '../types/afaik';
import { REPAIR_COLORS, REPAIR_LABELS } from './suitDisplay';

interface CommandPanelProps {
  suits: Suit[];
  selectedSuitId: string | null;
  partyMode: boolean;
  view: View;
  busy: boolean;
  onSelectSuit: (id: string) => void;
  onCommand: (text: string) => void;
  onNavigate: (view: View) => void;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="hud-panel p-3">
      <h2 className="hud-label mb-2">{title}</h2>
      {children}
    </section>
  );
}

export function CommandPanel({ suits, selectedSuitId, partyMode, view, busy, onSelectSuit, onCommand, onNavigate }: CommandPanelProps) {
  const quickCommands: Array<{ label: string; command: string; icon: ReactNode }> = [
    { label: 'Status', command: 'Status report', icon: <Activity size={16} aria-hidden /> },
    { label: 'Repair ETA', command: 'How long for the repair?', icon: <Timer size={16} aria-hidden /> },
    { label: 'Diagnostics', command: 'Run diagnostics', icon: <Radar size={16} aria-hidden /> },
    { label: 'Power level', command: 'How much power remains?', icon: <BatteryMedium size={16} aria-hidden /> },
    {
      label: partyMode ? 'End party' : 'Party mode',
      command: partyMode ? 'Deactivate party mode' : 'Activate party mode',
      icon: <PartyPopper size={16} aria-hidden />,
    },
    { label: 'Capabilities', command: 'What can you do?', icon: <HelpCircle size={16} aria-hidden /> },
  ];

  const nav: Array<{ view: View; label: string; icon: ReactNode }> = [
    { view: 'workshop', label: 'Workshop', icon: <Wrench size={16} aria-hidden /> },
    { view: 'diagnostics', label: 'Diagnostics', icon: <Gauge size={16} aria-hidden /> },
    { view: 'settings', label: 'Settings', icon: <Settings size={16} aria-hidden /> },
  ];

  return (
    <div className="flex flex-col gap-3">
      <Section title="Suit designations">
        {suits.length === 0 ? (
          <p className="text-sm text-haze">No suits on record. Add one in the Workshop.</p>
        ) : (
          <ul className="flex flex-col gap-1" aria-label="Select a suit">
            {suits.map((suit) => {
              const selected = suit.id === selectedSuitId;
              return (
                <li key={suit.id}>
                  <button
                    type="button"
                    onClick={() => onSelectSuit(suit.id)}
                    aria-current={selected}
                    className="hud-button w-full justify-between text-left"
                  >
                    <span className="min-w-0">
                      <span className="block truncate">{suit.name}</span>
                      {suit.name !== suit.designation && (
                        <span className="block truncate font-mono text-[0.7rem] font-normal text-haze">{suit.designation}</span>
                      )}
                    </span>
                    <span className="flex items-center gap-1.5 text-[0.7rem] font-normal text-haze">
                      {REPAIR_LABELS[suit.repairStatus]}
                      <span className="status-dot" style={{ background: REPAIR_COLORS[suit.repairStatus] }} aria-hidden />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Quick commands">
        <div className="grid grid-cols-2 gap-1.5">
          {quickCommands.map((q) => (
            <button key={q.label} type="button" className="hud-button text-sm" disabled={busy} onClick={() => onCommand(q.command)}>
              {q.icon}
              <span className="truncate">{q.label}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Systems">
        <nav className="grid grid-cols-3 gap-1.5 lg:grid-cols-1" aria-label="Systems">
          {nav.map((item) => (
            <button
              key={item.view}
              type="button"
              className="hud-button justify-center text-sm lg:justify-start"
              aria-current={view === item.view ? 'page' : undefined}
              onClick={() => onNavigate(item.view)}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>
      </Section>
    </div>
  );
}
