/**
 * Extracts navigation structure from the raw SharePoint export (the "Master File"):
 * the Project Playbook's accordion groups (Townships, Residentials, …) with their project cards,
 * and the Life at FAI department cards.
 *
 * Only small, visible data is kept: group names, card headlines, visible card descriptions
 * (brand labels) and the page each card links to. Hidden fields (`hideDescription`, `hideKicker`)
 * are ignored because SharePoint does not show them.
 */
import type { DepartmentCard, PortfolioGroup, SiteStructure } from '../types/afaik';

const NAMED_ENTITIES: Record<string, string> = { lt: '<', gt: '>', quot: '"', amp: '&', apos: "'", nbsp: ' ' };

/** Decodes HTML entities; the export is encoded up to three times. */
export function decodeEntities(text: string): string {
  let out = text;
  for (let i = 0; i < 3; i += 1) {
    const next = out.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
      if (code[0] === '#') {
        const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
      }
      return NAMED_ENTITIES[code.toLowerCase()] ?? whole;
    });
    if (next === out) break;
    out = next;
  }
  return out;
}

/** Returns one page's raw section ("## Page.aspx" … next "## ") from the Master File. */
export function masterSection(master: string, pageFile: string): string | null {
  const marker = `\n## ${pageFile}\n`;
  const start = master.indexOf(marker);
  if (start < 0) return null;
  const end = master.indexOf('\n## ', start + marker.length);
  return master.slice(start + marker.length, end < 0 ? undefined : end);
}

const stripTags = (html: string) =>
  html
    .replace(/\\"/g, '"')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** "/sites/X/SitePages/New-Clark-City.aspx?Mode=Edit" → "New-Clark-City.aspx" */
function pageFileFromUrl(url: string): string | null {
  const m = /\/SitePages\/([^?#"]+\.aspx)/i.exec(url);
  if (!m?.[1]) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

export interface EditorialCard {
  group: string | null;
  title: string;
  description: string | null;
  pageFile: string | null;
  x: number;
  y: number;
}

/** Reads the editorial cards on a page, in visual order (top-to-bottom, left-to-right) within each group. */
export function extractEditorialCards(rawSection: string): EditorialCard[] {
  const decoded = decodeEntities(rawSection);
  const seen = new Set<string>();
  const cards: EditorialCard[] = [];
  for (const segment of decoded.split('data-sp-canvascontrol=""').slice(1)) {
    const instance = /"instanceId":"([^"]+)"/.exec(segment)?.[1];
    if (!instance || seen.has(instance)) continue; // Canvas content appears twice in the export.
    seen.add(instance);
    if (!/"title":"Editorial card"/.test(segment)) continue;

    const headline = /"headline":"(.*?)"(?:,"description"|\},"searchablePlainTexts")/.exec(segment)?.[1];
    const title = headline ? stripTags(headline) : '';
    if (!title) continue;
    const hidden = /"hideDescription":true/.test(segment);
    const descriptionHtml = /"description":"(<p.*?)"\}/.exec(segment)?.[1];
    const description = !hidden && descriptionHtml ? stripTags(descriptionHtml) || null : null;
    const link = /"callToAction\.linkUrl":"([^"]+)"/.exec(segment)?.[1];
    const position = /"flexibleLayoutPosition":\{"lg":\{"x":(\d+),"y":(\d+)/.exec(segment);

    cards.push({
      group: /"zoneGroupMetadata":\{[^}]*"displayName":"([^"]+)"/.exec(segment)?.[1] ?? null,
      title,
      description,
      pageFile: link ? pageFileFromUrl(link) : null,
      x: Number(position?.[1] ?? 0),
      y: Number(position?.[2] ?? 0),
    });
  }
  return cards;
}

/** Builds the portfolio groups and department list from the Master File. Returns null if neither page is present. */
export function extractSiteStructure(master: string): SiteStructure | null {
  const playbook = masterSection(master, 'Project-Playbook.aspx');
  const life = masterSection(master, 'LIFE-AT-FAI.aspx');
  if (!playbook && !life) return null;

  const portfolio: PortfolioGroup[] = [];
  if (playbook) {
    const cards = extractEditorialCards(playbook).filter((c) => c.group && c.pageFile);
    for (const card of cards) {
      let group = portfolio.find((g) => g.name === card.group);
      if (!group) {
        group = { name: card.group as string, items: [] };
        portfolio.push(group);
      }
      group.items.push({ title: card.title, sourceFile: card.pageFile as string, label: card.description, x: card.x, y: card.y });
    }
    for (const group of portfolio) group.items.sort((a, b) => a.y - b.y || a.x - b.x);
  }

  const departments: DepartmentCard[] = life
    ? extractEditorialCards(life)
        .sort((a, b) => a.y - b.y || a.x - b.x)
        .map((c) => ({ title: c.title, sourceFile: c.pageFile }))
    : [];

  return { portfolio, departments };
}
