import { BookOpen, Building2, FileText, FolderKanban, Gauge, HelpCircle, Library, Newspaper, Search, Settings, Users } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { CATEGORY_LABELS } from '../services/responseEngine';
import { KNOWLEDGE_CATEGORIES, type KnowledgeBase, type KnowledgeCategory, type View } from '../types/afaik';
import { normalizeText } from '../services/knowledgeParser';

interface KnowledgePanelProps {
  knowledge: KnowledgeBase | null;
  selectedDocId: string | null;
  category: KnowledgeCategory;
  view: View;
  busy: boolean;
  onSelectCategory: (category: KnowledgeCategory) => void;
  onSelectDoc: (id: string) => void;
  onCommand: (text: string) => void;
  onNavigate: (view: View) => void;
}

export const CATEGORY_ICONS: Record<KnowledgeCategory, ReactNode> = {
  project: <FolderKanban size={15} aria-hidden />,
  building: <Building2 size={15} aria-hidden />,
  department: <Users size={15} aria-hidden />,
  procedure: <FileText size={15} aria-hidden />,
  news: <Newspaper size={15} aria-hidden />,
  general: <BookOpen size={15} aria-hidden />,
};

function Section({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`hud-panel p-3 ${className}`}>
      <h2 className="hud-label mb-2">{title}</h2>
      {children}
    </section>
  );
}

const QUICK_COMMANDS: Array<{ label: string; command: string; icon: ReactNode }> = [
  { label: 'FAI projects', command: 'List the FAI projects', icon: <FolderKanban size={16} aria-hidden /> },
  { label: 'Prestige', command: 'List the Prestige projects', icon: <Building2 size={16} aria-hidden /> },
  { label: 'Aspire', command: 'List the Aspire projects', icon: <Building2 size={16} aria-hidden /> },
  { label: 'Procedures', command: 'List the procedures', icon: <FileText size={16} aria-hidden /> },
  { label: 'Departments', command: 'List the departments', icon: <Users size={16} aria-hidden /> },
  { label: 'Help', command: 'What can you do?', icon: <HelpCircle size={16} aria-hidden /> },
];

/** Left panel: knowledge areas, page list, quick questions and navigation. */
export function KnowledgePanel({ knowledge, selectedDocId, category, view, busy, onSelectCategory, onSelectDoc, onCommand, onNavigate }: KnowledgePanelProps) {
  const [filter, setFilter] = useState('');
  const counts = useMemo(() => {
    const c = Object.fromEntries(KNOWLEDGE_CATEGORIES.map((k) => [k, 0])) as Record<KnowledgeCategory, number>;
    for (const d of knowledge?.docs ?? []) c[d.category] += 1;
    return c;
  }, [knowledge]);

  const docs = useMemo(() => {
    const all = knowledge?.docs ?? [];
    const f = normalizeText(filter);
    // Filtering searches every area; otherwise show the selected area.
    return (f ? all.filter((d) => normalizeText(d.title).includes(f) || d.aliases.some((a) => a.includes(f))) : all.filter((d) => d.category === category))
      .slice()
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [knowledge, category, filter]);

  const nav: Array<{ view: View; label: string; icon: ReactNode }> = [
    { view: 'library', label: 'Library', icon: <Library size={16} aria-hidden /> },
    { view: 'diagnostics', label: 'Diagnostics', icon: <Gauge size={16} aria-hidden /> },
    { view: 'settings', label: 'Settings', icon: <Settings size={16} aria-hidden /> },
  ];

  return (
    <div className="flex flex-col gap-3 lg:h-full lg:min-h-0">
      <Section title="Knowledge areas" className="flex min-h-0 flex-col lg:flex-1">
        {!knowledge ? (
          <div className="space-y-2 text-sm text-haze">
            <p>No knowledge source is loaded on this device.</p>
            <button type="button" className="hud-button text-sm" onClick={() => onNavigate('library')}>
              <Library size={16} aria-hidden /> Load knowledge file
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-1" role="tablist" aria-label="Knowledge areas">
              {KNOWLEDGE_CATEGORIES.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={k === category && !filter}
                  aria-current={k === category && !filter}
                  className="hud-button justify-between px-2! py-1.5! text-xs"
                  onClick={() => {
                    setFilter('');
                    onSelectCategory(k);
                  }}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    {CATEGORY_ICONS[k]}
                    <span className="truncate">{CATEGORY_LABELS[k].plural.split(' & ')[0]}</span>
                  </span>
                  <span className="font-mono text-haze">{counts[k]}</span>
                </button>
              ))}
            </div>
            <label className="relative mt-2 block">
              <span className="sr-only">Filter pages</span>
              <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-haze" aria-hidden />
              <input className="hud-input pl-8! text-sm!" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter all pages…" />
            </label>
            <ul className="mt-2 max-h-64 min-h-0 space-y-0.5 overflow-y-auto pr-1 lg:max-h-none lg:flex-1" aria-label="Pages">
              {docs.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => onSelectDoc(d.id)}
                    aria-current={d.id === selectedDocId}
                    className={`w-full truncate rounded-[2px] px-2 py-1 text-left text-sm transition-colors ${
                      d.id === selectedDocId ? 'bg-arc/20 text-white' : 'text-ice/85 hover:bg-arc/10'
                    }`}
                    title={d.title}
                  >
                    {d.title}
                  </button>
                </li>
              ))}
              {docs.length === 0 && <li className="px-2 text-sm text-haze">No pages match.</li>}
            </ul>
          </>
        )}
      </Section>

      <Section title="Quick questions">
        <div className="grid grid-cols-2 gap-1.5">
          {QUICK_COMMANDS.map((q) => (
            <button key={q.label} type="button" className="hud-button text-sm" disabled={busy} onClick={() => onCommand(q.command)}>
              {q.icon}
              <span className="truncate">{q.label}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Systems">
        <nav className="grid grid-cols-3 gap-1.5" aria-label="Systems">
          {nav.map((item) => (
            <button
              key={item.view}
              type="button"
              className="hud-button flex-col justify-center gap-1! px-1! py-1.5! text-xs"
              aria-current={view === item.view ? 'page' : undefined}
              onClick={() => onNavigate(item.view)}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </Section>
    </div>
  );
}
