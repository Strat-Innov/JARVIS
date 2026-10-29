/**
 * Formatting helpers that turn the export's line-by-line content into readable answers,
 * without adding or changing any information.
 */
import type { KnowledgeDoc, KnowledgeLink } from '../types/afaik';

const VALUE = /₱|\bP\s?\d|\bPHP\b|\bsq\.?\s?m\b|\bsqm\b|%|\d[\d,.]*\s*[–-]\s*\d/i;

/** A short line that names what the following value lines describe ("1-BR Unit", "Single Slot", "Cash:"). */
/** "Lot sizes: 200 – 400 sqm" — already a complete label/value line. */
const KEY_VALUE = /^[^:]{2,40}:\s+\S/;

function isLabel(line: string, next: string | undefined): boolean {
  if (line.endsWith(':')) return true;
  if (KEY_VALUE.test(line) || (next && KEY_VALUE.test(next))) return false;
  if (!next || !VALUE.test(next) || line.length > 32) return false;
  return !VALUE.test(line) || /^price\s*\/\s*sq\.?\s?m$/i.test(line);
}

/**
 * Joins label lines with the values that follow them:
 * ["1-BR Unit", "52–60 sqm", "₱14.4M–₱19.1M"] → ["1-BR Unit: 52–60 sqm, ₱14.4M–₱19.1M"]
 * ["Cash:", "95% payment; with 18% discount."] → ["Cash: 95% payment; with 18% discount."]
 */
export function pairLines(lines: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (!isLabel(line, lines[i + 1])) {
      out.push(line);
      continue;
    }
    const values: string[] = [];
    // Take the value lines that follow, stopping at the next label. A "Cash:"-style label takes
    // its first line even when it has no numbers.
    while (i + 1 < lines.length) {
      const next = lines[i + 1] ?? '';
      if (isLabel(next, lines[i + 2]) || KEY_VALUE.test(next)) break;
      if (!VALUE.test(next) && !(line.endsWith(':') && values.length === 0)) break;
      values.push(next);
      i += 1;
    }
    if (values.length === 0) out.push(line);
    else if (line.endsWith(':') && values.length > 1) out.push(line, ...values.map((v) => `  – ${v}`)); // e.g. several "Deferred" schemes
    else out.push(`${line.replace(/:$/, '')}: ${values.join(line.endsWith(':') ? '; ' : ', ')}`);
  }
  return out;
}

const HOST_NAMES: Array<[RegExp, string]> = [
  [/facebook\.com/i, 'Facebook'],
  [/instagram\.com/i, 'Instagram'],
  [/youtube\.com|youtu\.be/i, 'YouTube'],
  [/linkedin\.com/i, 'LinkedIn'],
  [/tiktok\.com/i, 'TikTok'],
  [/exsight360|virtual|360/i, '360° virtual tour'],
];

/** A readable name for a link, from its URL ("Facebook", "Official website"), keeping the source label as detail. */
export function friendlyLinkName(link: KnowledgeLink): string {
  if (!link.url) return link.label;
  const known = HOST_NAMES.find(([re]) => re.test(link.url ?? ''))?.[1];
  if (known) return known;
  try {
    return `Website (${new URL(link.url).hostname.replace(/^www\./, '')})`;
  } catch {
    return 'Website';
  }
}

/** Facts shown in summaries, in priority order. Variant-qualified keys ("Status (Terrace Homes)") are included. */
const KEY_FACTS = [/^status/i, /^location/i, /^(?:units|lots|rooms)\b/i, /^turnover/i, /^approval time/i, /^year finished/i, /^max occupancy/i];

export function keyFacts(doc: KnowledgeDoc, limit = 6): Array<[string, string]> {
  const entries = Object.entries(doc.facts);
  const picked: Array<[string, string]> = [];
  for (const pattern of KEY_FACTS) {
    for (const entry of entries) if (pattern.test(entry[0]) && !picked.includes(entry)) picked.push(entry);
  }
  return picked.slice(0, limit);
}

/** External links on a page (socials, websites, tours), de-duplicated by URL. */
export function externalLinks(doc: KnowledgeDoc): KnowledgeLink[] {
  const seen = new Set<string>();
  return doc.sections
    .flatMap((s) => s.links)
    .filter((l) => l.url && !seen.has(l.url) && seen.add(l.url));
}
