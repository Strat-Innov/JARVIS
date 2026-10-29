import { ExternalLink } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';

const URL = /(https?:\/\/[^\s]+)/g;

/** Turns URLs in a line into links that open in a new tab. */
function linkify(text: string): ReactNode {
  const parts = text.split(URL);
  return parts.map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 break-all text-arc-bright underline-offset-2 hover:underline">
        {part.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
        <ExternalLink size={12} aria-hidden />
      </a>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

/**
 * Renders an answer. Plain text is shown as-is; structured answers use light markers:
 * "# " title, "## " sub-heading, "• " bullet, "Source: " reference.
 */
export function AnswerText({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <>
      {lines.map((line, i) => {
        if (line.startsWith('# ')) return <p key={i} className="font-display text-base font-bold tracking-wide text-ice glow-text sm:text-lg">{line.slice(2)}</p>;
        if (line.startsWith('## ')) return <p key={i} className="hud-label mt-1 text-arc-bright!">{line.slice(3)}</p>;
        if (line.startsWith('• ')) {
          return (
            <p key={i} className="flex gap-2 pl-1">
              <span className="text-arc" aria-hidden>
                •
              </span>
              <span className="min-w-0">{linkify(line.slice(2))}</span>
            </p>
          );
        }
        if (line.startsWith('  – ')) {
          return (
            <p key={i} className="flex gap-2 pl-6 text-ice/90">
              <span className="text-arc/70" aria-hidden>
                –
              </span>
              <span className="min-w-0">{linkify(line.slice(4))}</span>
            </p>
          );
        }
        if (line.endsWith(':') && line.length < 80) return <p key={i} className="mt-1 font-semibold text-ice">{line}</p>;
        if (line.startsWith('Source: ')) return <p key={i} className="mt-1 text-xs break-all text-haze">{line}</p>;
        if (!line.trim()) return <div key={i} className="h-2" aria-hidden />;
        return <p key={i}>{linkify(line)}</p>;
      })}
    </>
  );
}
