/**
 * Response engine: turns an Interpretation into displayed/spoken text and UI actions,
 * following the AFAIK answering rules:
 *
 * - Answer only from the configured knowledge source; never add general knowledge.
 * - If the information is not in the source, reply exactly with NO_ANSWER.
 * - People are given as Name / Title / Group, with "Not available in source." for missing fields.
 * - Conflicting sources are reported, never silently merged.
 * - References use only the page file and SharePoint site stated in the source; URLs are never constructed.
 */
import type {
  AssistantAction,
  AssistantResponse,
  Brand,
  CommandOutcome,
  DocField,
  FollowUp,
  FollowUpOption,
  Interpretation,
  KnowledgeBase,
  KnowledgeCategory,
  KnowledgeDoc,
  PersonEntry,
} from '../types/afaik';
import { formatClockTime, linesToSentences, toSpeakable, truncateForSpeech } from '../utils/text';
import { interpretCommand, normalizeCommand, type InterpreterContext } from './commandInterpreter';
import { normalizeText } from './knowledgeParser';
import {
  brandConflict,
  brandOfDoc,
  brandSource,
  brandsPageDoc,
  departmentDocs,
  docsForBrand,
  findPortfolioGroup,
  portfolioGroups,
  findPeopleByName,
  peopleOnDoc,
  playbookDocs,
  playbookPageDoc,
  REGION_BRANDS,
} from './knowledgeStructure';
import { searchKnowledge, tokenize } from './knowledgeSearch';
import { friendlyLinkName, keyFacts, pairLines } from './answerFormat';

export interface ResponseContext extends InterpreterContext {
  now: number;
  /** Choices offered by the previous answer; a reply like "Residentials" or "the second one" picks one. */
  pendingOptions?: readonly FollowUpOption[];
  /** Injectable for deterministic tests. Defaults to Math.random. */
  random?: () => number;
}

/** The exact reply when the configured source does not contain the answer. */
export const NO_ANSWER = 'This information is not available in the configured knowledge source.';
export const NOT_IN_SOURCE = 'Not available in source.';

const pick = <T>(items: readonly T[], random: () => number): T =>
  items[Math.min(items.length - 1, Math.floor(random() * items.length))] as T;

export const CATEGORY_LABELS: Record<KnowledgeCategory, { singular: string; plural: string }> = {
  project: { singular: 'project', plural: 'Projects & estates' },
  building: { singular: 'building', plural: 'Buildings & locators' },
  department: { singular: 'department', plural: 'Departments' },
  procedure: { singular: 'procedure', plural: 'Procedures & forms' },
  news: { singular: 'news item', plural: 'News & events' },
  general: { singular: 'page', plural: 'General & tools' },
};

const FIELD_LABELS: Record<DocField, string> = {
  pricing: 'Pricing',
  payment: 'Payment terms',
  location: 'Location',
  status: 'Status',
  units: 'Units / lots',
  turnover: 'Turnover date',
  amenities: 'Amenities',
  parking: 'Parking',
  transport: 'Transportation',
  process: 'Process',
  requirements: 'Requirements',
  approval_time: 'Approval time',
  documents: 'Related documents',
  team: 'People',
  links: 'Links',
  awards: 'Awards',
  overview: 'Overview',
};

/** Section headings and fact keys that answer each field. */
const FIELD_SOURCES: Record<DocField, { sections?: RegExp; facts?: RegExp }> = {
  pricing: { sections: /pric|lot sizes?|unit details|units? (?:and|&)/i },
  payment: { sections: /payment/i },
  location: { sections: /^location|how to get|address/i, facts: /^location(?: \(|$)/i },
  status: { facts: /^status(?: \(|$)/i },
  units: { facts: /^(?:units|lots|rooms)(?: \(|$)/i },
  turnover: { facts: /^turnover/i },
  amenities: { sections: /amenit|facilit/i },
  parking: { sections: /parking/i },
  transport: { sections: /transport|shuttle|commute/i },
  process: { sections: /how to|process|approval workflow|how it works|steps|procedure/i },
  requirements: { sections: /requirement|required/i },
  approval_time: { sections: /approval time/i, facts: /^approval time(?: \(|$)/i },
  documents: { sections: /document|forms?$|template/i },
  team: { sections: /team|^project development$|^marketing$|^sales support|contact|leads$|^residentials and estates$/i },
  links: { sections: /socials?|website|links?$/i },
  awards: { sections: /award|certif/i },
  overview: {},
};

const GREETINGS = ['Good day. AFAIK is online. How can I help?', 'Hello. What would you like to know?'];
const STANDBY = ['Going to standby.', 'Standing by.'];
const THANKS = ["You're welcome.", 'Happy to help.'];

/* ----------------------------------------------------------------- helpers */

function reply(display: string, actions: AssistantAction[] = [], processingMs = 450, speechText?: string, followUp?: FollowUp): AssistantResponse {
  const { text, truncated } = truncateForSpeech(toSpeakable(speechText ?? display), followUp ? 260 : 320);
  const base = { display, speech: truncated ? `${text} The full details are on screen.` : text, actions, processingMs };
  return followUp ? attachFollowUp(base, followUp) : base;
}

/** Adds a follow-up question (and its choices, when few) to an answer's display and speech. */
function attachFollowUp(response: AssistantResponse, followUp: FollowUp): AssistantResponse {
  if (followUp.options.length === 0) return response;
  const labels = followUp.options.map((o) => o.label);
  const spokenOptions = labels.length <= 6 ? ` ${labels.slice(0, -1).join(', ')}${labels.length > 1 ? ', or ' : ''}${labels[labels.length - 1]}.` : '';
  return {
    ...response,
    display: followUp.prompt ? `${response.display}\n\n${followUp.prompt}` : response.display,
    speech: `${response.speech} ${toSpeakable(`${followUp.prompt}${spokenOptions}`)}`.trim(),
    followUp,
  };
}

/* --------------------------------------------------------------- follow-ups */

const OPTION_FIELDS: DocField[] = ['overview', 'pricing', 'payment', 'amenities', 'location', 'status', 'units', 'turnover', 'parking', 'transport', 'process', 'requirements', 'approval_time', 'documents', 'team', 'links', 'awards'];
const MAX_OPTIONS = 12;

const option = (label: string, text: string, intent: FollowUpOption['intent'], params: FollowUpOption['params']): FollowUpOption => ({ label, text, intent, params });
const openDoc = (doc: KnowledgeDoc, label = doc.title) => option(label, `Tell me about ${doc.title}`, 'doc_field', { docId: doc.id, docExplicit: true, field: 'overview' });

function tidyHeading(heading: string): string {
  const h = heading.replace(/:$/, '').trim();
  const titled = h === h.toUpperCase() ? h.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\b(And|Of|The|At|In|For)\b/g, (w) => w.toLowerCase()) : h;
  return titled.length > 48 ? `${titled.slice(0, 45)}…` : titled;
}

/** What can be asked next about a page: the fields it actually has, then any other sections. */
function docOptions(kb: KnowledgeBase, doc: KnowledgeDoc, current?: { field?: DocField; sectionIndex?: number }): FollowUpOption[] {
  const options: FollowUpOption[] = [];
  for (const field of OPTION_FIELDS) {
    if (field === current?.field || !fieldAnswer(kb, doc, field)) continue;
    options.push(option(FIELD_LABELS[field], `${FIELD_LABELS[field]} — ${doc.title}`, 'doc_field', { docId: doc.id, docExplicit: true, field }));
  }
  doc.sections.forEach((section, i) => {
    if (!section.heading || i === current?.sectionIndex) return;
    const covered = OPTION_FIELDS.some((f) => FIELD_SOURCES[f].sections?.test(section.heading));
    if (covered || /details|information/i.test(section.heading) || section.lines.every((l) => l === doc.summary)) return;
    options.push(option(tidyHeading(section.heading), `${tidyHeading(section.heading)} — ${doc.title}`, 'doc_section', { docId: doc.id, docExplicit: true, sectionIndex: i }));
  });
  return options.slice(0, MAX_OPTIONS);
}

function withDocFollowUp(kb: KnowledgeBase, response: AssistantResponse, doc: KnowledgeDoc, current: { field?: DocField; sectionIndex?: number }): AssistantResponse {
  if (response.display === NO_ANSWER) return response;
  const options = docOptions(kb, doc, current);
  if (options.length === 0) return response;
  const prompt = current.field === 'overview' ? `What would you like to know about ${doc.title}?` : `Anything else about ${doc.title}?`;
  return attachFollowUp(response, { prompt, options });
}

const ORDINALS: Record<string, number> = {
  first: 0, '1st': 0, one: 0, second: 1, '2nd': 1, two: 1, third: 2, '3rd': 2, three: 2, fourth: 3, four: 3, fifth: 4, five: 4,
  sixth: 5, six: 5, seventh: 6, seven: 6, eighth: 7, eight: 7, ninth: 8, nine: 8, tenth: 9, ten: 9,
};

/** Maps a reply such as "Residentials", "the second one" or "number 3" onto an offered option. */
export function resolveFollowUp(text: string, options: readonly FollowUpOption[]): FollowUpOption | null {
  if (options.length === 0) return null;
  const input = normalizeCommand(text);
  if (!input) return null;
  const ordinal = /^(?:the |option |number |no )?(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last|1st|2nd|3rd|\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)(?: one| option)?$/.exec(input);
  if (ordinal?.[1]) {
    const w = ordinal[1];
    const index = w === 'last' ? options.length - 1 : /^\d+$/.test(w) ? Number(w) - 1 : (ORDINALS[w] ?? -1);
    return options[index] ?? null;
  }
  const n = normalizeText(input).replace(/^(?:the|about|tell me about|what about|show me|show|open)\s+/, '');
  const scored = options
    .map((o) => {
      const label = normalizeText(o.label.replace(/\([^)]*\)/g, ' ')).replace(/^the /, '');
      const full = normalizeText(o.label);
      if (n === label || n === full) return { o, score: 100 };
      if (label.length >= 3 && ` ${n} `.includes(` ${label} `)) return { o, score: 50 + label.length };
      if (n.length >= 4 && ` ${full} `.includes(` ${n} `)) return { o, score: 20 + n.length };
      return { o, score: 0 };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0) return null;
  // Ambiguous partial matches (e.g. "botanika" for two options) don't resolve.
  if (scored.length > 1 && scored[0]?.score === scored[1]?.score && (scored[0]?.score ?? 0) < 100) return null;
  return scored[0]?.o ?? null;
}

const noAnswer = (actions: AssistantAction[] = []) => reply(NO_ANSWER, actions, 500);
const select = (doc: KnowledgeDoc): AssistantAction => ({ type: 'select-doc', docId: doc.id });

/** Reference line built only from values stated in the source. */
export function referenceFor(doc: KnowledgeDoc): string {
  if (!doc.sourceFile) return `Source: ${doc.title}`;
  return doc.sharepointSite ? `Source: ${doc.sourceFile} — SharePoint site: ${doc.sharepointSite}` : `Source: ${doc.sourceFile}`;
}

function formatPerson(p: PersonEntry): string {
  const parts = [`Name: ${p.name}`, `Title: ${p.title ?? NOT_IN_SOURCE}`, `Group: ${p.group ?? NOT_IN_SOURCE}`];
  if (p.email) parts.push(`Email: ${p.email}`);
  return `• ${parts.join(' · ')}`;
}

const speakPerson = (p: PersonEntry) => `${p.name}, ${p.title ?? 'title not available'}${p.group ? `, ${p.group}` : ''}.`;

interface FieldAnswer {
  lines: string[];
  spoken: string;
}

/** Lines of the sections that answer a field, in readable form (labels paired with their values). */
function sectionsFor(doc: KnowledgeDoc, field: DocField, factValues: Set<string> = new Set()) {
  const source = FIELD_SOURCES[field];
  return doc.sections.filter((s) => source.sections?.test(s.heading) && !(s.lines.length === 1 && factValues.has(s.lines[0] ?? '')));
}

function linkLines(links: readonly KnowledgeDoc['sections'][number]['links'][number][]): string[] {
  // Only URLs that appear in the source; SharePoint-relative paths are labelled, never expanded.
  return links.map((l) => (l.url ? `• ${friendlyLinkName(l)} — ${l.url}` : `• ${l.label} (SharePoint document; link not available in source)`));
}

/** Bullet for a content line; numbered steps, sub-items and sub-labels keep their own form. */
const asBullet = (l: string) => (/^\d+\.\s|^ {2}– /.test(l) || l.endsWith(':') ? l : `• ${l}`);

/**
 * A readable brief of a page for "Tell me about …": description, key facts, then the page's
 * pricing, payment terms, amenities, steps or transport — each quoted from the source.
 */
function docBrief(kb: KnowledgeBase, doc: KnowledgeDoc): FieldAnswer | null {
  const summary = doc.summary || doc.sections[0]?.lines.slice(0, 3).join(' ') || '';
  const brand = brandOfDoc(kb, doc.id);
  const facts = keyFacts(doc, 8).map(([k, v]) => `• ${k}: ${v}`);
  const lines: string[] = [];
  const spoken: string[] = [summary];
  if (summary) lines.push(summary);
  if (facts.length > 0 || brand) {
    lines.push('', '## Key details');
    if (brand) lines.push(`• Brand: ${brand}`);
    lines.push(...facts);
    spoken.push(linesToSentences(keyFacts(doc, 4).map(([k, v]) => `${k}: ${v}`)));
  }

  const block = (title: string, field: DocField, opts: { list?: boolean; compact?: boolean } = {}) => {
    const sections = sectionsFor(doc, field);
    if (sections.length === 0) return;
    lines.push('', `## ${title}`);
    for (const s of sections) {
      // On multi-offering pages, label each part ("Lot Sizes & Pricing — Terrace Homes" → "Terrace Homes").
      const part = sections.length > 1 ? (s.heading.split(' — ')[1] ?? s.heading) : null;
      const paired = pairLines(s.lines);
      if (opts.compact) lines.push(`${part ? `${part}: ` : ''}${paired.join(' · ')}`);
      else lines.push(...(part ? [`${part}:`] : []), ...paired.map(asBullet));
    }
  };

  if (doc.category === 'project' || sectionsFor(doc, 'pricing').length > 0) {
    block('Pricing', 'pricing');
    block('Payment terms', 'payment');
    block('Amenities', 'amenities', { compact: true });
    block('Awards', 'awards');
  } else if (doc.category === 'procedure') {
    block('How to process', 'process');
    block('Requirements', 'requirements');
  } else if (doc.category === 'building') {
    block('Transportation', 'transport');
    block('Parking', 'parking');
  }

  if (lines.length === 0) return null;
  return { lines, spoken: spoken.filter(Boolean).join(' ') };
}

/** Collects what one page says about a field, or null when it says nothing. */
function fieldAnswer(kb: KnowledgeBase, doc: KnowledgeDoc, field: DocField): FieldAnswer | null {
  if (field === 'overview') return docBrief(kb, doc);

  const source = FIELD_SOURCES[field];
  const factLines = Object.entries(doc.facts)
    .filter(([k]) => source.facts?.test(k))
    .map(([k, v]) => `${k}: ${v}`);
  const factValues = new Set(factLines.map((l) => l.slice(l.indexOf(':') + 1).trim()));
  const sections = sectionsFor(doc, field, factValues);
  if (factLines.length === 0 && sections.length === 0) return null;

  if (field === 'team') {
    const headings = new Set(sections.map((s) => s.heading));
    const people = peopleOnDoc(kb, doc.id).filter((p) => sections.some((s) => headings.has(s.heading) && s.lines.some((l) => l.startsWith(p.name))));
    if (people.length > 0) return { lines: people.map(formatPerson), spoken: people.map(speakPerson).join(' ') };
  }

  if (field === 'links') {
    const links = sections.flatMap((s) => s.links.filter((l) => l.url));
    if (links.length > 0) {
      const names = links.map(friendlyLinkName);
      return { lines: linkLines(links), spoken: `Links are on screen: ${[...new Set(names)].join(', ')}.` };
    }
  }

  const lines = factLines.map((l) => `• ${l}`);
  const spokenLines = [...factLines];
  for (const s of sections) {
    if (sections.length > 1 || factLines.length > 0) lines.push(`## ${s.heading}`);
    if (field === 'documents') {
      lines.push(...linkLines(s.links), ...s.lines.filter((l) => !s.links.some((k) => k.label === l)).map((l) => `• ${l}`));
      spokenLines.push(...s.lines);
      continue;
    }
    const paired = pairLines(s.lines);
    lines.push(...paired.map(asBullet));
    spokenLines.push(...paired.map((l) => l.replace(/^ {2}– /, '')));
  }
  return { lines, spoken: linesToSentences(spokenLines) };
}

/** Answers a field for a page, checking same-named pages for conflicts. */
function answerField(kb: KnowledgeBase, doc: KnowledgeDoc, field: DocField, ties: KnowledgeDoc[]): AssistantResponse {
  const label = FIELD_LABELS[field];
  const answers = [doc, ...ties]
    .map((d) => ({ doc: d, answer: fieldAnswer(kb, d, field) }))
    .filter((a): a is { doc: KnowledgeDoc; answer: FieldAnswer } => a.answer !== null);

  if (answers.length === 0) return noAnswer([select(doc)]);

  const distinct = new Map(answers.map((a) => [a.answer.lines.join('\n'), a]));
  if (distinct.size > 1 && field !== 'overview') {
    const blocks = [...distinct.values()].flatMap(({ doc: d, answer }) => ['', `${d.title} (${d.sourceFile}):`, ...answer.lines, referenceFor(d)]);
    return reply(
      [`${doc.title} — ${label}`, 'The configured sources contain conflicting information:', ...blocks].join('\n'),
      [select(doc)],
      700,
      `The configured sources contain conflicting information about the ${label.toLowerCase()} for ${doc.title}. Both versions are on screen.`,
    );
  }

  const first = answers[0] as { doc: KnowledgeDoc; answer: FieldAnswer };
  const refs = [...new Set(answers.map((a) => referenceFor(a.doc)))];
  const heading = field === 'overview' ? `# ${first.doc.title}` : `# ${first.doc.title} — ${label}`;
  return reply(
    [heading, ...first.answer.lines, '', ...refs].join('\n'),
    [select(first.doc)],
    650,
    `${first.doc.title}. ${field === 'overview' ? '' : `${label}. `}${first.answer.spoken}`,
  );
}

const spokenList = (names: string[]) => (names.length > 8 ? `${names.slice(0, 8).join(', ')}, and ${names.length - 8} more` : names.join(', '));

function listCategory(kb: KnowledgeBase, category: KnowledgeCategory): AssistantResponse {
  const docs = kb.docs.filter((d) => d.category === category);
  const label = CATEGORY_LABELS[category];
  const action: AssistantAction = { type: 'select-category', category };
  if (docs.length === 0) return noAnswer([action]);
  const names = docs.map((d) => d.title);
  return reply(
    [`${label.plural} (${docs.length}):`, ...names.map((n) => `• ${n}`)].join('\n'),
    [action],
    500,
    `There are ${docs.length} ${label.plural.toLowerCase()}: ${spokenList(names)}.`,
    { prompt: `Which ${label.singular} would you like to know about?`, options: docs.slice(0, 30).map((d) => openDoc(d)) },
  );
}

/** "Our portfolio" — offers the Project Playbook's groups, like the SharePoint page's accordion. */
function answerPortfolio(kb: KnowledgeBase): AssistantResponse {
  const groups = portfolioGroups(kb);
  const page = playbookPageDoc(kb);
  if (groups.length === 0) {
    // Without the Master File the groups are unknown; offer the Playbook's projects directly.
    const docs = playbookDocs(kb);
    if (!docs || !page || docs.length === 0) return noAnswer();
    return reply(
      [`Projects listed in the Project Playbook (FAI projects) — ${docs.length}:`, ...docs.map((d) => `• ${d.title}`), '', referenceFor(page)].join('\n'),
      [{ type: 'select-category', category: 'project' }],
      550,
      `The Project Playbook lists ${docs.length} FAI projects.`,
      { prompt: 'Which project would you like to know about?', options: docs.map((d) => openDoc(d)) },
    );
  }
  const lines = groups.map((g) => `• ${g.name} (${g.items.length})`);
  return reply(
    ['Our projects (Project Playbook):', ...lines, ...(page ? ['', referenceFor(page)] : [])].join('\n'),
    [{ type: 'select-category', category: 'project' }],
    500,
    'Our projects in the Project Playbook are grouped into categories.',
    {
      prompt: 'What would you like to know? Choose a category.',
      options: groups.map((g) => option(g.name, `${g.name} projects`, 'portfolio_group', { group: g.name })),
    },
  );
}

/** One Project Playbook group: its projects, with the brand label shown on each card. */
function answerPortfolioGroup(kb: KnowledgeBase, name: string): AssistantResponse {
  const group = findPortfolioGroup(kb, name);
  if (!group) return noAnswer();
  const page = playbookPageDoc(kb);
  const lines = group.docs.map((d) => `• ${d.doc?.title ?? d.title}${d.label ? ` — ${d.label}` : ''}`);
  const options = group.docs.filter((d) => d.doc).map((d) => openDoc(d.doc as KnowledgeDoc, d.doc?.title ?? d.title));
  return reply(
    [`${group.name} (${group.items.length}):`, ...lines, ...(page ? ['', referenceFor(page)] : [])].join('\n'),
    [{ type: 'select-category', category: 'project' }],
    500,
    `${group.name}: ${group.docs.map((d) => d.doc?.title ?? d.title).join(', ')}.`,
    { prompt: 'Which project would you like to know about?', options },
  );
}

/** "Life at FAI" / "at the office" — the Home page's Life at FAI text, then which department. */
function answerLifeAtFai(kb: KnowledgeBase): AssistantResponse {
  const home = kb.docs.find((d) => d.sourceFile.toLowerCase() === 'home.aspx');
  const section = home?.sections.find((s) => /^life at fai$/i.test(s.heading));
  const departments = departmentDocs(kb);
  if (!section && departments.length === 0) return noAnswer();
  const intro = section?.lines ?? [];
  return reply(
    [...(intro.length ? ['Life at FAI', ...intro] : []), ...(home && section ? ['', referenceFor(home)] : [])].join('\n') || 'Life at FAI',
    [{ type: 'select-category', category: 'department' }],
    500,
    intro.length ? linesToSentences(intro) : '',
    {
      prompt: 'Which department would you like to know about?',
      options: departments.map(({ title, doc }) => openDoc(doc, title)),
    },
  );
}

/** One section of a page, chosen from a follow-up. */
function answerSection(kb: KnowledgeBase, doc: KnowledgeDoc, index: number): AssistantResponse {
  const section = doc.sections[index];
  if (!section || section.lines.length === 0) return noAnswer([select(doc)]);
  const people = peopleOnDoc(kb, doc.id).filter((p) => section.lines.some((l) => l.startsWith(p.name)));
  const urlLinks = section.links.filter((l) => l.url);
  const body =
    people.length > 0
      ? people.map(formatPerson)
      : urlLinks.length > 0 && urlLinks.length >= section.lines.length
        ? linkLines(urlLinks)
        : pairLines(section.lines).map(asBullet);
  return reply(
    [`# ${doc.title} — ${tidyHeading(section.heading)}`, ...body, '', referenceFor(doc)].join('\n'),
    [select(doc)],
    550,
    `${doc.title}, ${tidyHeading(section.heading)}. ${people.length > 0 ? people.map(speakPerson).join(' ') : linesToSentences(section.lines)}`,
  );
}

export function listPlaybook(kb: KnowledgeBase): AssistantResponse {
  const docs = playbookDocs(kb);
  const page = playbookPageDoc(kb);
  if (!docs || !page || docs.length === 0) return noAnswer();
  const names = docs.map((d) => d.title);
  return reply(
    [`Projects listed in the Project Playbook (FAI projects) — ${docs.length}:`, ...names.map((n) => `• ${n}`), '', referenceFor(page)].join('\n'),
    [{ type: 'select-category', category: 'project' }],
    550,
    `The Project Playbook lists ${docs.length} FAI projects: ${spokenList(names)}. The full list is on screen.`,
  );
}

function answerBrand(kb: KnowledgeBase, interpretation: Interpretation): AssistantResponse {
  const { docId, brand, region } = interpretation.params;
  const brandsPage = brandsPageDoc(kb);
  if (!brandsPage) return noAnswer();
  const ref = referenceFor(brandsPage);

  // "What brand is Celestia?" / "Is Celestia a north project?"
  if (docId) {
    const doc = kb.docs.find((d) => d.id === docId);
    if (!doc) return noAnswer();
    const docBrand = brandOfDoc(kb, doc.id);
    if (!docBrand) return noAnswer([select(doc)]);
    const conflict = brandConflict(kb, doc.id);
    if (conflict) {
      return reply(
        [
          `The configured sources contain conflicting information about the brand of ${doc.title}:`,
          `• Brands page: ${conflict.brandsPage}`,
          `• Project Playbook card: ${conflict.card}`,
          '',
          ref,
        ].join('\n'),
        [select(doc)],
        500,
      );
    }
    const fromBrandsPage = brandSource(kb, doc.id) === 'brands-page';
    const playbook = playbookPageDoc(kb);
    const where = fromBrandsPage ? 'on the Brands page' : 'on its Project Playbook card';
    const sourceRef = fromBrandsPage || !playbook ? ref : referenceFor(playbook);
    const lines = [`${doc.title} is listed under ${docBrand} ${where}.`];
    if (region) {
      const regionOf = (Object.entries(REGION_BRANDS) as Array<['north' | 'south', Brand]>).find(([, b]) => b === docBrand)?.[0];
      const regionLabel = regionOf === 'north' ? 'North' : 'South';
      lines.push(regionOf ? `Per the business rule (${regionLabel} projects = ${docBrand} projects), it is a ${regionLabel} project.` : `Region: ${NO_ANSWER}`);
    }
    return reply([...lines, '', sourceRef].join('\n'), [select(doc)], 500, lines.join(' '));
  }

  // "Prestige projects" / "North projects"
  if (!brand) return noAnswer();
  const docs = docsForBrand(kb, brand);
  if (docs.length === 0) return noAnswer();
  const intro = region ? `${region === 'north' ? 'North' : 'South'} projects = ${brand} projects (business rule).` : null;
  const names = docs.map((d) => d.title);
  return reply(
    [...(intro ? [intro] : []), `${brand} projects listed on the Brands page:`, ...names.map((n) => `• ${n}`), '', ref].join('\n'),
    [],
    550,
    `${intro ? `${intro} ` : ''}The Brands page lists these ${brand} projects: ${names.join(', ')}.`,
  );
}

function answerPerson(kb: KnowledgeBase, query: string): AssistantResponse {
  const people = findPeopleByName(kb, query);
  if (people.length === 0) return noAnswer();
  const docs = new Map<string, KnowledgeDoc>();
  // One line per distinct name/title/group, with every page that lists it.
  const unique = new Map<string, { person: PersonEntry; pages: string[] }>();
  for (const p of people) {
    const doc = kb.docs.find((d) => d.id === p.docId);
    if (doc) docs.set(doc.id, doc);
    const key = `${p.name}|${p.title ?? ''}|${p.group ?? ''}`;
    const entry = unique.get(key) ?? { person: p, pages: [] };
    if (doc && !entry.pages.includes(doc.title)) entry.pages.push(doc.title);
    unique.set(key, entry);
  }
  const lines = [...unique.values()].map(({ person, pages }) => `${formatPerson(person)}${pages.length ? ` (listed on ${pages.join(', ')})` : ''}`);
  const conflict = new Set(people.map((p) => p.name)).size === 1 && new Set(people.map((p) => p.title)).size > 1;
  const firstDoc = [...docs.values()][0];
  return reply(
    [...(conflict ? ['The configured sources list this person with different titles:'] : []), ...lines, '', ...[...docs.values()].map(referenceFor)].join('\n'),
    firstDoc ? [select(firstDoc)] : [],
    550,
    [...new Map([...unique.values()].map(({ person }) => [person.name + (person.title ?? ''), person])).values()].map(speakPerson).join(' '),
  );
}

function answerClarify(kb: KnowledgeBase, docIds: readonly string[], field: DocField = 'overview'): AssistantResponse {
  const docs = docIds.map((id) => kb.docs.find((d) => d.id === id)).filter((d): d is KnowledgeDoc => Boolean(d));
  if (docs.length < 2) return noAnswer();
  const titles = docs.map((d) => d.title);
  const question = `Did you mean ${titles.slice(0, -1).join(', ')} or ${titles[titles.length - 1]}?`;
  const options = docs.map((d) => option(d.title, field === 'overview' ? `Tell me about ${d.title}` : `${FIELD_LABELS[field]} — ${d.title}`, 'doc_field', { docId: d.id, docExplicit: true, field }));
  return { display: question, speech: toSpeakable(question), actions: [], processingMs: 350, followUp: { prompt: '', options } };
}

function answerSearch(kb: KnowledgeBase, query: string): AssistantResponse {
  const [hit] = searchKnowledge(kb, query, 3);
  // Require a reasonably specific match so unrelated questions don't return an unrelated passage.
  const terms = new Set(tokenize(query)).size;
  if (!hit || hit.score < 2 || hit.coverage < (terms >= 4 ? 0.5 : 0.6)) return noAnswer();

  const { doc } = hit;
  const section = hit.sectionIndex >= 0 ? doc.sections[hit.sectionIndex] : undefined;
  const lines = section ? section.lines : [doc.summary, ...Object.entries(doc.facts).map(([k, v]) => `${k}: ${v}`)].filter(Boolean);
  if (lines.length === 0) return noAnswer();
  const heading = section?.heading ? ` — ${section.heading}` : '';
  return reply(
    [`${doc.title}${heading}`, ...lines, '', referenceFor(doc)].join('\n'),
    [select(doc)],
    800,
    `From the ${doc.title} page${section?.heading ? `, ${section.heading}` : ''}: ${linesToSentences(lines)}`,
  );
}

/* ------------------------------------------------------------------ engine */

export function generateResponse(interpretation: Interpretation, ctx: ResponseContext): AssistantResponse {
  const random = ctx.random ?? Math.random;
  const kb = ctx.knowledge;

  if (interpretation.error === 'empty_input') return reply("I didn't catch that.");
  if (interpretation.error === 'knowledge_missing') {
    return reply('The knowledge source isn’t loaded on this device yet. Open the Library and load the FAI knowledge file, then ask again.');
  }

  switch (interpretation.intent) {
    case 'greeting':
      return reply(pick(GREETINGS, random));
    case 'help':
      return reply(
        'I answer questions from the FAI knowledge source: projects, buildings, departments, people and procedures. Try “What are our projects?”, “Tell me about life at FAI”, “How much is a 1-bedroom at 1001 Parkway?”, “How do I request a cash advance?” or “Where is Aeon Center?” When I offer choices, tap one or say it — for example “Residentials” or “the second one”.',
      );
    case 'standby':
      return reply(pick(STANDBY, random), [{ type: 'standby' }], 300);
    case 'time':
      return reply(`It is ${formatClockTime(ctx.now)}.`);
    case 'thanks':
      return reply(pick(THANKS, random));
    case 'identity':
      return reply('I am AFAIK, the FAI knowledge agent. I answer only from the configured knowledge source.');
    case 'unknown':
      return noAnswer();
    default:
      break;
  }

  if (!kb) return noAnswer();

  switch (interpretation.intent) {
    case 'list_category':
      return interpretation.params.category ? listCategory(kb, interpretation.params.category) : noAnswer();
    case 'list_playbook':
    case 'portfolio':
      return answerPortfolio(kb);
    case 'portfolio_group':
      return interpretation.params.group ? answerPortfolioGroup(kb, interpretation.params.group) : answerPortfolio(kb);
    case 'life_at_fai':
      return answerLifeAtFai(kb);
    case 'doc_section': {
      const doc = kb.docs.find((d) => d.id === interpretation.params.docId);
      const index = interpretation.params.sectionIndex ?? -1;
      if (!doc) return noAnswer();
      return withDocFollowUp(kb, answerSection(kb, doc, index), doc, { sectionIndex: index });
    }
    case 'brand':
      return answerBrand(kb, interpretation);
    case 'person':
      return answerPerson(kb, interpretation.params.personQuery ?? interpretation.normalizedText);
    case 'clarify':
      return answerClarify(kb, interpretation.params.docIds ?? [], interpretation.params.field);
    case 'show_doc':
    case 'doc_field': {
      const doc = kb.docs.find((d) => d.id === interpretation.params.docId);
      if (!doc) return noAnswer();
      const ties = (interpretation.params.docIds ?? []).map((id) => kb.docs.find((d) => d.id === id)).filter((d): d is KnowledgeDoc => Boolean(d));
      const field = interpretation.intent === 'show_doc' ? 'overview' : (interpretation.params.field ?? 'overview');
      return withDocFollowUp(kb, answerField(kb, doc, field, ties), doc, { field });
    }
    case 'search':
      return answerSearch(kb, interpretation.params.query ?? interpretation.normalizedText);
    default:
      return noAnswer();
  }
}

/**
 * Interprets text and generates the response in one step. A chosen follow-up option (clicked,
 * or matched from a reply like "Residentials" / "the second one") runs its preset directly.
 */
export function processCommand(text: string, ctx: ResponseContext, chosen?: FollowUpOption | null): CommandOutcome {
  const picked = chosen ?? (ctx.pendingOptions && ctx.knowledge ? resolveFollowUp(text, ctx.pendingOptions) : null);
  const interpretation: Interpretation = picked
    ? { intent: picked.intent, params: picked.params, recognized: true, rawText: text, normalizedText: normalizeCommand(text) }
    : interpretCommand(text, ctx);
  const response = generateResponse(interpretation, ctx);
  const answered = response.display !== NO_ANSWER;
  return { interpretation: { ...interpretation, recognized: interpretation.recognized && answered }, response };
}
