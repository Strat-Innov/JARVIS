/**
 * Parses the FAI Knowledge Base markdown export (the "AI File") into structured pages.
 *
 * Export format: pages separated by a line containing only `---`. Each page has a `# Title`,
 * `## Section` headings, and a trailing `## Source` block naming the SharePoint file.
 */
import type { KnowledgeBase, KnowledgeCategory, KnowledgeDoc, KnowledgeLink, KnowledgeSection, PageRefGroup } from '../types/afaik';

/** Navigation and metadata sections that carry no knowledge. */
const IGNORED_SECTIONS = /^(?:quick links?|chat with afaik agent|source|socials?)$/i;
/** H1 headings that are section labels rather than page titles. */
const GENERIC_HEADINGS = /^(?:purpose|overview:?|knowledge-[a-z0-9]+|what are .*\?|top picks.*)$/i;
const NOISE_LINES = /^(?:learn more|read more|click here)$/i;

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

function parseLine(raw: string): { text: string; links: KnowledgeLink[] } {
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
  if (NOISE_LINES.test(text)) text = '';
  return { text, links };
}

/** Pulls `Key: Value` facts (e.g. "Status: RFO") from a line. */
const FACT_LINE = /^([A-Za-z][A-Za-z /&.'-]{1,45}):\s*(.+)$/;
const FACT_KEYS = /^(?:status|location|(?:total )?(?:no\.?|number) of units|units|turnover(?: date)?|lot sizes?|developer|land area|floors?|storeys|gross leasable area|gla|completion|tenure)$/i;

function categorize(title: string, sourceFile: string, headings: string[]): KnowledgeCategory {
  const h = headings.map((x) => x.toLowerCase());
  const has = (re: RegExp) => h.some((x) => re.test(x));
  const name = `${title} ${sourceFile}`.toLowerCase();

  if (
    has(/^(?:how to (?:process|apply|get)|approval (?:time|workflow)|common requirements|required documents|submission requirements)/) ||
    /permit|clearance|gate-pass|request|requisition|reimbursement|cash-advance|budget|vehicle|form|licensed-to-sell/.test(sourceFile.toLowerCase())
  ) {
    return 'procedure';
  }
  if (/news|feature|event|week-|sportsfest|anniversary|promo|focused-wednesday|gallery|fast-bytes/.test(name)) return 'news';
  if (has(/^(?:development details|units? (?:and|&) pricing|lot sizes? (?:and|&) pricing|payment schemes?|standard payment schemes?|unit details)/)) {
    return 'project';
  }
  if (has(/^how it feels working/) || /department|human-resources|finance\.aspx|marketing\.aspx|operations\.aspx|sales\.aspx|security\.aspx|internal-audit|external-affairs|technical-support|strategy-and-innovation|^pd|crd\.aspx/.test(sourceFile.toLowerCase())) {
    return 'department';
  }
  // Estates and townships list their own project teams.
  if (has(/^meet the team|^project development$/)) return 'project';
  if (has(/^transportation hub|^location:|^locators|^parking/)) return 'building';
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

function parsePage(chunk: string, index: number): KnowledgeDoc | null {
  const lines = chunk.split('\n');
  const sourceFile = lines.map((l) => /^-\s*Source file:\s*(.+)$/.exec(l.trim())?.[1]?.trim()).find(Boolean) ?? '';
  const sharepointSite = lines.map((l) => /^-\s*SharePoint site:\s*(.+)$/.exec(l.trim())?.[1]?.trim()).find(Boolean) ?? '';
  const refGroups: PageRefGroup[] = [];
  let lastText = '';

  let title = '';
  const sections: KnowledgeSection[] = [];
  let current: KnowledgeSection = { heading: '', lines: [], links: [] };
  const facts: Record<string, string> = {};
  let ignoring = false;

  const flush = () => {
    if (!ignoring && (current.lines.length > 0 || current.links.length > 0)) sections.push(current);
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const heading = /^(#{1,6})\s+(.*)$/.exec(line.trim());
    if (heading) {
      const level = heading[1]?.length ?? 1;
      const text = parseLine(heading[2] ?? '').text;
      if (level === 1 && !title && !GENERIC_HEADINGS.test(text)) {
        title = text;
        continue;
      }
      if (/^knowledge-[a-z0-9]+$/i.test(text)) continue;
      flush();
      const location = /^location:\s*(.+)$/i.exec(text);
      if (location?.[1]) facts.Location ??= location[1].trim();
      ignoring = IGNORED_SECTIONS.test(text) || Boolean(location);
      current = { heading: text.replace(/:$/, '').trim(), lines: [], links: [] };
      continue;
    }
    if (ignoring || line.trim() === '' || line.trim() === '---') continue;
    const { text, links } = parseLine(line);
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
      current.lines.push(text);
      lastText = text;
    }
    current.links.push(...links);
  }
  flush();

  if (!title && !sourceFile) return null;
  const fileTitle = sourceFile.replace(/\.aspx$/i, '');
  const headline = title;
  // A tagline used as the page heading ("Modern digital tools for…") — prefer the page's file name.
  if (title.split(/\s+/).length > 5 && fileTitle && !normalizeText(fileTitle).includes(normalizeText(title).split(' ').slice(0, 2).join(' '))) {
    title = fileTitle;
  }
  title = tidyTitle(title || fileTitle);

  // Merge adjacent duplicate headings ("Related Documents" / "RELATED DOCUMENTS").
  const merged: KnowledgeSection[] = [];
  for (const section of sections) {
    const prev = merged[merged.length - 1];
    if (prev && prev.heading.toLowerCase() === section.heading.toLowerCase()) {
      prev.lines.push(...section.lines);
      prev.links.push(...section.links);
    } else {
      merged.push(section);
    }
  }

  for (const section of merged) {
    const isDetails = /details|information/i.test(section.heading);
    for (const text of section.lines) {
      const fact = FACT_LINE.exec(text);
      if (fact?.[1] && fact[2] && (isDetails || FACT_KEYS.test(fact[1].trim()))) {
        const key = fact[1]
          .trim()
          .replace(/^(?:total )?(?:no\.?|number) of units$/i, 'Units')
          .replace(/^turnover date$/i, 'Turnover date');
        facts[key] ??= fact[2].trim();
      }
    }
    if (/^approval time$/i.test(section.heading) && section.lines[0]) facts['Approval time'] ??= section.lines[0];
  }

  const summarySource =
    merged.find((s) => /^(?:|overview|purpose|about.*|what is this\??)$/i.test(s.heading) && s.lines.some((l) => l.length >= 60)) ??
    merged.find((s) => s.lines.some((l) => l.length >= 80));
  const summary = summarySource?.lines.find((l) => l.length >= 60) ?? '';

  return {
    id: slugify(sourceFile.replace(/\.aspx$/i, '') || title) || `page-${index}`,
    title,
    category: categorize(title, sourceFile, merged.map((s) => s.heading)),
    aliases: headline && headline !== title ? [...buildAliases(title, sourceFile), normalizeText(headline)] : buildAliases(title, sourceFile),
    summary,
    facts,
    sections: merged,
    sourceFile,
    sharepointSite,
    refGroups,
  };
}

/** Parses the knowledge export. Throws if the text does not look like a knowledge base. */
export function parseKnowledgeMarkdown(markdown: string, sourceName: string, loadedAt: number = Date.now()): KnowledgeBase {
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
  return { docs, sourceName, loadedAt };
}
