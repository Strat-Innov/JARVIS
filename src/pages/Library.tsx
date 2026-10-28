import { Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CATEGORY_ICONS } from '../components/KnowledgePanel';
import { KnowledgeLoader } from '../components/KnowledgeLoader';
import { CATEGORY_LABELS } from '../services/responseEngine';
import { searchKnowledge } from '../services/knowledgeSearch';
import { KNOWLEDGE_CATEGORIES, type KnowledgeBase } from '../types/afaik';

interface LibraryProps {
  knowledge: KnowledgeBase | null;
  persisted: boolean;
  onLoad: (file: File) => Promise<void>;
  onClear: () => void;
  onOpenDoc: (id: string) => void;
}

/** Load, replace or clear the local knowledge file, and search across every page. */
export function Library({ knowledge, persisted, onLoad, onClear, onOpenDoc }: LibraryProps) {
  const [query, setQuery] = useState('');
  const hits = useMemo(() => (knowledge && query.trim() ? searchKnowledge(knowledge, query, 12) : []), [knowledge, query]);

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="hud-label">Knowledge source</h3>
        {knowledge ? (
          <div className="space-y-1 border border-arc/15 bg-arc/5 p-3 text-sm">
            <p>
              <span className="text-haze">File:</span> <span className="font-mono break-all">{knowledge.sourceName}</span>
            </p>
            <p>
              <span className="text-haze">Loaded:</span> {new Date(knowledge.loadedAt).toLocaleString()}
            </p>
            <p>
              <span className="text-haze">Pages:</span> {knowledge.docs.length}
            </p>
            {!persisted && <p className="text-warn">This browser could not save the file, so it will need to be loaded again after a refresh.</p>}
          </div>
        ) : (
          <p className="text-sm text-haze">No knowledge file is loaded on this device.</p>
        )}
        <KnowledgeLoader onLoad={onLoad} />
        {knowledge && (
          <button
            type="button"
            className="hud-button text-sm text-warn"
            onClick={() => {
              if (window.confirm('Remove the knowledge file from this browser?')) onClear();
            }}
          >
            <Trash2 size={16} aria-hidden /> Remove from this device
          </button>
        )}
      </section>

      {knowledge && (
        <>
          <section>
            <h3 className="hud-label mb-2">Pages by area</h3>
            <ul className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              {KNOWLEDGE_CATEGORIES.map((c) => (
                <li key={c} className="flex items-center gap-2 border border-arc/15 px-2 py-1.5">
                  {CATEGORY_ICONS[c]}
                  <span className="min-w-0 flex-1 truncate">{CATEGORY_LABELS[c].plural}</span>
                  <span className="font-mono text-haze">{knowledge.docs.filter((d) => d.category === c).length}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-haze">Areas are grouped automatically from page structure, for browsing only. Project lists in answers come from the Project Playbook.</p>
          </section>

          <section>
            <h3 className="hud-label mb-2">Search the knowledge base</h3>
            <label className="relative block">
              <span className="sr-only">Search</span>
              <Search size={15} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-haze" aria-hidden />
              <input className="hud-input pl-8!" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. liquidation, shuttle, LEED" />
            </label>
            <ul className="mt-2 space-y-1.5">
              {hits.map((h) => {
                const section = h.sectionIndex >= 0 ? h.doc.sections[h.sectionIndex] : undefined;
                const snippet = (section?.lines.join(' ') ?? h.doc.summary).slice(0, 180);
                return (
                  <li key={h.doc.id}>
                    <button type="button" className="w-full border border-arc/15 p-2 text-left hover:border-arc/50 hover:bg-arc/5" onClick={() => onOpenDoc(h.doc.id)}>
                      <span className="font-semibold">{h.doc.title}</span>
                      {section?.heading && <span className="text-haze"> — {section.heading}</span>}
                      <span className="mt-0.5 block text-sm text-ice/75">{snippet}</span>
                    </button>
                  </li>
                );
              })}
              {query.trim() && hits.length === 0 && <li className="text-sm text-haze">No matching pages.</li>}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
