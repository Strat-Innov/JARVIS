/**
 * Parses the FAI Knowledge Base markdown export (the "AI File") into structured pages.
 *
 * Export format: pages separated by a line containing only `---`. Each page has a `# Title`,
 * `## Section` headings, and a trailing `## Source` block naming the SharePoint file.
 */
import type { KnowledgeBase, KnowledgeCategory, KnowledgeDoc, KnowledgeLink, KnowledgeSection, PageRefGroup, SiteStructure } from '../types/afaik';

/** Navigation and metadata sections that carry no knowledge. */
const IGNORED_SECTIONS = /^(?:quick links?|chat with afaik agent|source|socials?)$/i;
/** H1 headings that are section labels rather than page titles. */
const GENERIC_HEADINGS = /^(?:purpose|overview:?|knowledge-[a-z0-9]+|what are .*\?|top picks.*)$/i;
const NOISE_LINES = /^(?:learn more|read more|click here|know more)$/i;
/** Plain text lines the export uses as section titles (e.g. a "Meet the team" label before the contacts). */
const INLINE_HEADINGS = /^(?:meet the team|our team)$/i;

/** A bare SharePoint page path, e.g. "/sites/ExampleKB/SitePages/Some-Page.aspx?Mode=Edit". */
const PAGE_REF = /^\/sites\/[^\s/]+\/SitePages\/([^\s?#]+\.aspx)/i;

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’']/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function slugify(text: string): string {
  return normalizeText(text).replace(/\s+/g, '-') || 'page';
}

const SMALL_WORDS = new Set(['and', 'of', 'the', 'for', 'at', 'in', 'on', 'to', 'di', 'de']);
/** All-caps words longer than three letters that are acronyms. */
const ACRONYMS = new Set(['AFAIK', 'FCAI', 'SSLG', 'MKTG', 'OPEX', 'CAPEX', 'BPO', 'PEZA', 'LEED', 'HLURB', 'DHSUD']);
/** Short all-caps words that are ordinary words, not acronyms. */
const SHORT_WORDS = new Set(['ONE', 'TWO', 'SIX', 'TEN', 'NEW', 'OLD', 'BAY', 'HUB', 'SKY', 'SUN', 'TOP', 'WAY', 'ARC']);

/** "1001 PARKWAY RESIDENCES" → "1001 Parkway Residences"; leaves mixed-case titles and short acronyms alone. */
export function tidyTitle(raw: string): string {
  let title = raw.trim();
  // File-name style titles: "Filinvest-Emegency-Contacts-&-Transportations"
  if (!title.includes(' ') && title.includes('-')) title = title.replace(/-+/g, ' ').trim();
  title = title.replace(/(\w)&(\w)/g, '$1 & $2');
  if (title !== title.toUpperCase()) return title;
  return title
    .split(' ')
    .map((word, i) => {
      if (word.length <= 3 && !SMALL_WORDS.has(word.toLowerCase()) && !SHORT_WORDS.has(word)) return word; // FAI, PD, II
      if (ACRONYMS.has(word.replace(/[^A-Z]/g, ''))) return word;
      const lower = word.toLowerCase();
      if (i > 0 && SMALL_WORDS.has(lower)) return lower;
      return lower.replace(/(^|[(\-/])([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase());
    })
    .join(' ');
}

const MARKDOWN_LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;

function parseLine(raw: string, isHeading = false): { text: string; links: KnowledgeLink[] } {
  const links: KnowledgeLink[] = [];
  let text = raw
    .trim()
    .replace(/^[-*+]\s+/, '')
    .replace(MARKDOWN_LINK, (_m, label: string, url: string) => {
      links.push({ label: label.trim(), url: /^https?:\/\//i.test(url) ? url : null });
      return label.trim();
    })
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  if (!isHeading && NOISE_LINES.test(text)) text = '';
  return { text, links };
}

/** Pulls `Key: Value` facts (e.g. "Status: RFO") from a line. */
const FACT_LINE = /^([A-Za-z][A-Za-z /&.'()-]{1,45}):\s*(.*)$/;
const FACT_KEYS = /^(?:status|location|(?:total )?(?:no\.?|number) of (?:units|lots?|rooms)|units|turnover(?: date)?|lot sizes?|developer|(?:total )?land area|floors?|storeys|gross leasable area|gla|completion|tenure|year finished)$/i;

/* ------------------------------------------------------------ categories */

/** Department pages whose layout doesn't identify them (no "How it feels working…" section). */
const DEPARTMENT_FILES = new Set(['finance', 'internal audit', 'human resources and admin', 'marketing', 'operations', 'sales', 'security', 'external affairs', 'technical support group', 'strategy and innovation', 'crd', 'fcai', 'pd', 'pd township']);

const fileWords = (sourceFile: string) => new Set(normalizeText(sourceFile.replace(/\.aspx$/i, '')).split(' '));
const BUILDING_WORDS = /\b(?:building|buildings|center|centre|tower|towers|plaza|park|mall|condominium|hub|station|terminal|chapel|showroom|tent|hospital|supermarket|range|depot|complex|garden|residences)\b/i;

/** Groups a page for browsing. Pages listed on the Project Playbook or Brands page are re-classed as projects afterwards. */
function categorize(title: string, sourceFile: string, headings: string[]): KnowledgeCategory {
  const h = headings.map((x) => x.toLowerCase());
  const has = (re: RegExp) => h.some((x) => re.test(x));
  const words = fileWords(sourceFile);
  const fileHas = (...w: string[]) => w.some((x) => words.has(x));

  if (
    has(/^(?:how to (?:process|apply|get)|approval (?:time|workflow)|common requirements|required documents|submission requirements|step by step guide|application process)/) ||
    fileHas('permit', 'clearance', 'pass', 'request', 'requisition', 'reimbursement', 'advance', 'budget', 'vehicle', 'form', 'eventpermitform', 'licensed')
  ) {
    return 'procedure';
  }
  if (fileHas('news', 'features', 'events', 'eventspage', 'week', 'sportsfest', 'anniversary', 'promos', 'gallery', 'focused')) return 'news';
  if (has(/^(?:development details|units? (?:and|&) pricing|lot sizes? (?:and|&) pricing|(?:standard )?payment schemes?|unit details|room types)/)) return 'project';
  const base = normalizeText(sourceFile.replace(/\.aspx$/i, ''));
  if (has(/^how it feels working|\bleads$/) || DEPARTMENT_FILES.has(base)) return 'department';
  if (has(/^transportation hub|^locators$|^parking$/) || (has(/^overview$/) && BUILDING_WORDS.test(title))) return 'building';
  return 'general';
}

function buildAliases(title: string, sourceFile: string): string[] {
  const aliases = new Set<string>();
  const add = (s: string) => {
    const n = normalizeText(s).replace(/^the /, '');
    if (n.length >= 2) aliases.add(n);
  };
  const fileBase = sourceFile.replace(/\.aspx$/i, '').replace(/[-_]+/g, ' ');
  for (const source of [title, fileBase]) {
    add(source);
    add(source.replace(/\([^)]*\)/g, ' '));
    for (const m of source.matchAll(/\(([^)]+)\)/g)) {
      const inner = m[1] ?? '';
      // Abbreviations like (CA), (PR), (CRD), (SSLG); full phrases like (City di Mare).
      if (/^[A-Za-z&]{2,6}$/.test(inner.trim()) || inner.includes(' ')) add(inner);
    }
  }
  return [...aliases];
}

/**
 * Picks the page title. The first H1 is usually right, but some pages open with a tagline or a
 * person ("Monkey: …", "Customer Centricity" on the Employee Playbook); when the H1 shares no
 * word with the SharePoint file name, the file name is the page's real name.
 */
function chooseTitle(h1: string, sourceFile: string): string {
  const fileTitle = sourceFile.replace(/\.aspx$/i, '');
  if (!h1) return tidyTitle(fileTitle);
  if (!fileTitle) return tidyTitle(h1);
  const squashedFile = normalizeText(fileTitle).replace(/ /g, '');
  const h1Words = normalizeText(h1).split(' ').filter((w) => w.length >= 3 && !['the', 'and', 'for'].includes(w));
  const abbreviations = [...h1.matchAll(/\(([A-Za-z&]{2,6})\)/g)].map((m) => normalizeText(m[1] ?? ''));
  const shares = h1Words.some((w) => squashedFile.includes(w)) || abbreviations.some((a) => a && squashedFile.includes(a));
  const tagline = h1.split(/\s+/).length > 5 && !squashedFile.includes(h1Words.slice(0, 2).join(''));
  if (!shares || tagline || /^[^:]{2,30}:\s/.test(h1)) return tidyTitle(fileTitle.replace(/-+/g, ' '));
  return tidyTitle(h1);
}

/* ------------------------------------------------------- section building */

interface RawItem {
  text: string;
  isList: boolean;
}

interface RawSection {
  heading: string;
  items: RawItem[];
  links: KnowledgeLink[];
}

/** Words a wrapped line can end on mid-sentence. */
const DANGLING = /\b(?:the|a|an|of|to|for|by|with|and|or|from|in|on|at|two|three|four|five|succeeding|lease)$|\d:\d\d$|[–,(]$/i;

/** The export wraps long list items onto new "- " lines; re-join them. */
function joinWrappedLines(items: RawItem[]): RawItem[] {
  const out: RawItem[] = [];
  for (const item of items) {
    const prev = out[out.length - 1];
    if (prev && prev.isList && item.isList && (/^[a-z]/.test(item.text) || DANGLING.test(prev.text) || /^(?:AM|PM)\b/.test(item.text))) {
      prev.text = `${prev.text} ${item.text}`;
    } else {
      out.push({ ...item });
    }
  }
  return out;
}

type ContentKind = 'payment' | 'pricing' | 'parking' | 'amenities';

function headingKind(heading: string): ContentKind | null {
  if (/payment|financial term/i.test(heading)) return 'payment';
  if (/parking/i.test(heading)) return 'parking';
  if (/pric|lot sizes?|units?\b|unit details|room types|rates/i.test(heading)) return 'pricing';
  if (/amenit|facilit|features/i.test(heading)) return 'amenities';
  return null;
}

const PAYMENT_LABEL = /^(?:cash|deferred|installment|instalment|spot cash|spot down ?payment|in-house financing|bank financing|financing)\b[^:]{0,30}:?$/i;
const PAYMENT_TEXT = /down ?payment|lump ?sum|discount|payable|balance|% payment|bank financing/i;
const MONEY = /₱|\bP\s?\d|\bPHP\b|\bsq\.?\s?m\b|\bsqm\b|\bBR\b|price|lot sizes?|%/i;
const BARE_PRICE = /^(?:₱|P)\s?[\d.,]+\s?[MKk]?\b/;

function lineKind(item: RawItem, prev: ContentKind | null, hasAmenities: boolean): ContentKind | null {
  const t = item.text;
  if (PAYMENT_LABEL.test(t) || PAYMENT_TEXT.test(t)) return 'payment';
  if (item.isList && hasAmenities && !MONEY.test(t)) return 'amenities';
  if (/\b(?:single|tandem|parking)\b|\bslots?\b/i.test(t) && !/\bunit\b/i.test(t)) return 'parking';
  if (BARE_PRICE.test(t) && prev === 'parking') return 'parking';
  if (MONEY.test(t) || /\bunit\b|studio|modal/i.test(t) || /^\d[\d,.]*\s*[–-]\s*\d/.test(t)) return 'pricing';
  return null;
}

/**
 * The export often writes several headings back to back with no content ("Lot Sizes & Pricing",
 * "Amenities", "Standard Payment Schemes") and then all of their content, in a different order.
 * Each line is assigned to the heading its content belongs to.
 */
function distributeGroup(group: RawSection[], content: RawSection): RawSection[] {
  const kinds = group.map((g) => headingKind(g.heading));
  const known = new Set(kinds.filter(Boolean));
  if (known.size < 2) return [content]; // Not a content group (e.g. "Related Documents" / "RELATED DOCUMENTS").

  const byKind = (k: ContentKind) => group[kinds.indexOf(k)];
  const target = (k: ContentKind): RawSection | undefined =>
    k === 'pricing' ? (byKind('pricing') ?? byKind('parking')) : k === 'parking' ? (byKind('parking') ?? byKind('pricing')) : byKind(k);
  const out = group.map((g) => ({ heading: g.heading, items: [] as RawItem[], links: [] as KnowledgeLink[] }));
  const outFor = (section: RawSection | undefined) => out[section ? group.indexOf(section) : group.length - 1] ?? out[out.length - 1];

  let prev: ContentKind | null = null;
  for (const item of content.items) {
    const kind: ContentKind | null = lineKind(item, prev, known.has('amenities')) ?? prev;
    outFor(kind ? target(kind) : undefined)?.items.push(item);
    if (kind) prev = kind;
  }
  for (const link of content.links) outFor(undefined)?.links.push(link);
  return out.filter((o) => o.items.length > 0 || o.links.length > 0);
}

/** Collects `Key: Value` facts, including values listed on the following lines ("No of units:" / "280 (Anaheim)"). */
function sectionFacts(section: KnowledgeSection, isDetails: boolean): Array<[string, string]> {
  const facts: Array<[string, string]> = [];
  const lines = section.lines;
  for (let i = 0; i < lines.length; i += 1) {
    const m = FACT_LINE.exec(lines[i] ?? '');
    if (!m?.[1]) continue;
    const key = m[1].trim();
    if (!isDetails && !FACT_KEYS.test(key)) continue;
    let value = (m[2] ?? '').trim();
    if (!value) {
      const values: string[] = [];
      for (let j = i + 1; j < lines.length && !FACT_LINE.test(lines[j] ?? ''); j += 1) values.push(lines[j] ?? '');
      value = values.join('; ');
    }
    if (value) facts.push([normalizeFactKey(key), value]);
  }
  return facts;
}

function normalizeFactKey(key: string): string {
  return key
    .replace(/^(?:total )?(?:no\.?|number) of units$/i, 'Units')
    .replace(/^(?:total )?(?:no\.?|number) of lots?$/i, 'Lots')
    .replace(/^(?:total )?(?:no\.?|number) of rooms$/i, 'Rooms')
    .replace(/^turnover date$/i, 'Turnover date');
}

function parsePage(chunk: string, index: number): KnowledgeDoc | null {
  const lines = chunk.split('\n');
  const sourceFile = lines.map((l) => /^-\s*Source file:\s*(.+)$/.exec(l.trim())?.[1]?.trim()).find(Boolean) ?? '';
  const sharepointSite = lines.map((l) => /^-\s*SharePoint site:\s*(.+)$/.exec(l.trim())?.[1]?.trim()).find(Boolean) ?? '';
  const refGroups: PageRefGroup[] = [];
  let lastText = '';
  let h1 = '';
  let locationHeading: string | null = null;

  // Pass 1: raw sections in source order, keeping empty headings (they matter for grouping).
  const raw: Array<RawSection & { ignored: boolean }> = [];
  let current: RawSection & { ignored: boolean } = { heading: '', items: [], links: [], ignored: false };
  const push = () => raw.push(current);

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const heading = /^(#{1,6})\s+(.*)$/.exec(line.trim());
    if (heading) {
      const level = heading[1]?.length ?? 1;
      const text = parseLine(heading[2] ?? '', true).text;
      if (level === 1 && !h1 && !GENERIC_HEADINGS.test(text)) {
        h1 = text;
        continue;
      }
      if (/^knowledge-[a-z0-9]+$/i.test(text)) continue;
      push();
      const location = /^location:\s*(.+)$/i.exec(text);
      if (location?.[1]) locationHeading ??= location[1].trim();
      current = { heading: text.replace(/:$/, '').trim(), items: [], links: [], ignored: IGNORED_SECTIONS.test(text) || Boolean(location) };
      continue;
    }
    if (current.ignored || line.trim() === '' || line.trim() === '---') continue;
    const { text, links } = parseLine(line);
    if (INLINE_HEADINGS.test(text) && !/^\s*[-*+]\s/.test(line)) {
      push();
      current = { heading: 'Meet The Team', items: [], links: [], ignored: false };
      continue;
    }
    const ref = PAGE_REF.exec(text);
    if (ref?.[1]) {
      // Page references are navigation data, not readable text.
      const group = refGroups[refGroups.length - 1];
      if (group && group.context === lastText) {
        if (!group.refs.includes(ref[1])) group.refs.push(ref[1]);
      } else {
        refGroups.push({ context: lastText, refs: [ref[1]] });
      }
      continue;
    }
    if (text) {
      current.items.push({ text, isList: /^\s*[-*+]\s+/.test(line) || /^\s*\d+\.\s/.test(line) });
      lastText = text;
    }
    current.links.push(...links);
  }
  push();

  if (!h1 && !sourceFile) return null;

  // Pass 2: re-join wrapped lines, then redistribute grouped headings.
  const built: RawSection[] = [];
  let pending: RawSection[] = [];
  for (const section of raw) {
    const items = joinWrappedLines(section.items);
    const isEmpty = items.length === 0 && section.links.length === 0;
    if (section.ignored) {
      pending = [];
      continue;
    }
    if (isEmpty) {
      if (section.heading) pending.push(section);
      continue;
    }
    const content = { heading: section.heading, items, links: section.links };
    built.push(...(pending.length > 0 ? distributeGroup([...pending, content], content) : [content]));
    pending = [];
  }

  // Pass 3: label repeated headings with the variant they belong to (e.g. Prominence II's
  // "Move-in Ready Townhomes" and "Terrace Homes" each have their own pricing and payment schemes).
  const variants = built.filter((s) => s.heading && !/details/i.test(s.heading) && s.items.some((i) => /^status:/i.test(i.text))).map((s) => s.heading);
  const seen = new Map<string, number>();
  const sections: KnowledgeSection[] = [];
  for (const s of built) {
    const key = s.heading.toLowerCase();
    const count = seen.get(key) ?? 0;
    seen.set(key, count + 1);
    const repeats = built.filter((b) => b.heading.toLowerCase() === key).length;
    let heading = s.heading;
    if (repeats > 1 && s.heading && !variants.includes(s.heading)) {
      heading = repeats === variants.length ? `${s.heading} — ${variants[count]}` : `${s.heading} (${count + 1})`;
    }
    const prev = sections[sections.length - 1];
    const lines = s.items.map((i) => i.text);
    if (prev && repeats === 1 && prev.heading.toLowerCase() === heading.toLowerCase()) {
      prev.lines.push(...lines);
      prev.links.push(...s.links);
    } else {
      sections.push({ heading, lines, links: [...s.links] });
    }
  }

  // Facts: when the same key differs between variant sections, keep each, labelled by variant.
  const entries: Array<{ key: string; value: string; section: string }> = [];
  for (const section of sections) {
    const isDetails = /details|information/i.test(section.heading) || variants.includes(section.heading);
    for (const [key, value] of sectionFacts(section, isDetails)) entries.push({ key, value, section: section.heading });
    if (/^approval time$/i.test(section.heading) && section.lines[0]) entries.push({ key: 'Approval time', value: section.lines[0], section: section.heading });
  }
  if (locationHeading) entries.push({ key: 'Location', value: locationHeading, section: '' });
  const facts: Record<string, string> = {};
  for (const e of entries) {
    const sameKey = entries.filter((x) => x.key === e.key);
    const differs = new Set(sameKey.map((x) => x.value)).size > 1 && sameKey.every((x) => variants.includes(x.section));
    const key = differs ? `${e.key} (${e.section})` : e.key;
    facts[key] ??= e.value;
  }

  const title = chooseTitle(h1, sourceFile);
  const summarySource =
    sections.find((s) => /^(?:|overview|purpose|about.*|what is this\??)$/i.test(s.heading) && s.lines.some((l) => l.length >= 60)) ??
    sections.find((s) => s.lines.some((l) => l.length >= 80));
  const summary = summarySource?.lines.find((l) => l.length >= 60) ?? '';
  const aliases = buildAliases(title, sourceFile);
  if (h1 && normalizeText(h1) !== normalizeText(title)) aliases.push(normalizeText(h1));

  return {
    id: slugify(sourceFile.replace(/\.aspx$/i, '') || title) || `page-${index}`,
    title,
    category: categorize(title, sourceFile, sections.map((s) => s.heading)),
    aliases,
    summary,
    facts,
    sections,
    sourceFile,
    sharepointSite,
    refGroups,
  };
}

/** Pages listed on the Project Playbook or Brands page are projects, whatever their layout. */
function applyProjectListings(docs: KnowledgeDoc[]): void {
  const listingFiles = new Set(['project-playbook.aspx', 'brands.aspx']);
  const listed = new Set(
    docs
      .filter((d) => listingFiles.has(d.sourceFile.toLowerCase()))
      .flatMap((d) => d.refGroups.flatMap((g) => g.refs))
      .map((r) => r.toLowerCase()),
  );
  for (const doc of docs) if (listed.has(doc.sourceFile.toLowerCase())) doc.category = 'project';
}

/** Parses the knowledge export. Throws if the text does not look like a knowledge base. */
export function parseKnowledgeMarkdown(
  markdown: string,
  sourceName: string,
  loadedAt: number = Date.now(),
  structure: SiteStructure | null = null,
): KnowledgeBase {
  const text = markdown.replace(/\r\n?/g, '\n');
  const docs: KnowledgeDoc[] = [];
  const ids = new Set<string>();
  text.split(/\n-{3,}\s*\n/).forEach((chunk, i) => {
    const doc = parsePage(chunk, i);
    if (!doc || (doc.sections.length === 0 && !doc.summary && doc.refGroups.length === 0)) return;
    let id = doc.id;
    for (let n = 2; ids.has(id); n += 1) id = `${doc.id}-${n}`;
    ids.add(id);
    docs.push({ ...doc, id });
  });
  if (docs.length === 0) {
    throw new Error('No knowledge pages were found in this file. Load the “AI File” markdown export (or the zip that contains it).');
  }
  applyProjectListings(docs);
  return { docs, sourceName, loadedAt, structure };
}
