import { ExternalLink, FileText } from 'lucide-react';
import { externalLinks, friendlyLinkName, keyFacts } from '../services/answerFormat';
import { referenceFor } from '../services/responseEngine';
import type { ActivityEntry, Brand, KnowledgeDoc } from '../types/afaik';
import { CATEGORY_LABELS } from '../services/responseEngine';
import { KnowledgeLoader } from './KnowledgeLoader';

interface DocumentPanelProps {
  doc: KnowledgeDoc | undefined;
  brand: Brand | null;
  hasKnowledge: boolean;
  activity: ActivityEntry[];
  onLoadKnowledge: (file: File) => Promise<void>;
}

const timeOf = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** Right panel: a short summary of the selected page (key facts, description, links), plus recent activity. */
export function DocumentPanel({ doc, brand, hasKnowledge, activity, onLoadKnowledge }: DocumentPanelProps) {
  const facts = doc ? keyFacts(doc, 5) : [];
  const links = doc ? externalLinks(doc).slice(0, 5) : [];
  return (
    <div className="flex flex-col gap-3 lg:h-full lg:min-h-0">
      <section className="hud-panel flex min-h-0 flex-col p-4 lg:flex-1" aria-labelledby="doc-title">
        {!hasKnowledge ? (
          <>
            <h2 id="doc-title" className="hud-label">
              Knowledge source
            </h2>
            <p className="mt-2 mb-3 text-sm text-ice/85">
              Load the FAI knowledge export (the “AI File” markdown, or the zip that contains it) to start asking questions.
            </p>
            <KnowledgeLoader onLoad={onLoadKnowledge} />
          </>
        ) : !doc ? (
          <>
            <h2 id="doc-title" className="hud-label">
              Selected page
            </h2>
            <p className="mt-2 text-sm text-haze">Ask a question or choose a page on the left.</p>
          </>
        ) : (
          <>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="hud-label">{CATEGORY_LABELS[doc.category].singular}</h2>
                <p id="doc-title" className="font-display text-lg leading-tight font-bold tracking-wide text-ice glow-text">
                  {doc.title}
                </p>
              </div>
              {brand && (
                <span className="shrink-0 border border-arc/30 px-1.5 py-0.5 font-mono text-[0.65rem] tracking-wider text-arc-bright uppercase" title="Listed on the Brands page">
                  {brand}
                </span>
              )}
            </div>

            <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 text-sm">
              {facts.length > 0 && (
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 border-y border-arc/15 py-2">
                  {facts.map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-haze">{k}</dt>
                      <dd className="break-words">{v}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {doc.summary && <p className="line-clamp-5 text-ice/90">{doc.summary}</p>}
              {links.length > 0 && (
                <ul className="flex flex-wrap gap-1.5" aria-label="Links">
                  {links.map((link) => (
                    <li key={link.url}>
                      <a
                        href={link.url ?? undefined}
                        target="_blank"
                        rel="noreferrer noopener"
                        title={link.label}
                        className="inline-flex items-center gap-1 border border-arc/25 px-2 py-0.5 text-xs text-arc-bright hover:border-arc-bright"
                      >
                        {friendlyLinkName(link)} <ExternalLink size={11} aria-hidden />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-haze">Ask about this page for the full details — pricing, payment terms, amenities, people and more.</p>
              <p className="flex items-start gap-1.5 border-t border-arc/15 pt-2 text-xs text-haze">
                <FileText size={13} className="mt-0.5 shrink-0" aria-hidden />
                <span className="break-all">{referenceFor(doc)}</span>
              </p>
            </div>
          </>
        )}
      </section>

      <section className="hud-panel p-4" aria-labelledby="activity-title">
        <h2 id="activity-title" className="hud-label mb-2">
          Recent activity
        </h2>
        {activity.length === 0 ? (
          <p className="text-sm text-haze">No activity yet.</p>
        ) : (
          <ol className="max-h-32 space-y-1.5 overflow-y-auto pr-1 text-sm">
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
