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
  Interpretation,
  KnowledgeBase,
  KnowledgeCategory,
  KnowledgeDoc,
  PersonEntry,
} from '../types/afaik';
import { formatClockTime, linesToSentences, toSpeakable, truncateForSpeech } from '../utils/text';
import { interpretCommand, type InterpreterContext } from './commandInterpreter';
import {
  brandOfDoc,
  brandsPageDoc,
  docsForBrand,
  findPeopleByName,
  peopleOnDoc,
  playbookDocs,
  playbookPageDoc,
  REGION_BRANDS,
} from './knowledgeStructure';
import { searchKnowledge, tokenize } from './knowledgeSearch';

export interface ResponseContext extends InterpreterContext {
  now: number;
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
  units: 'Number of units',
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
  location: { sections: /^location|how to get|address/i, facts: /^location$/i },
  status: { facts: /^status$/i },
  units: { facts: /^units$/i },
  turnover: { facts: /^turnover/i },
  amenities: { sections: /amenit|facilit/i },
  parking: { sections: /parking/i },
  transport: { sections: /transport|shuttle|commute/i },
  process: { sections: /how to|process|approval workflow|how it works|steps|procedure/i },
  requirements: { sections: /requirement|required/i },
  approval_time: { sections: /approval time/i, facts: /^approval time$/i },
  documents: { sections: /document|forms?$|template/i },
  team: { sections: /team|^project development$|^marketing$|^sales support|contact/i },
  links: { sections: /socials?|website|links?$/i },
  awards: { sections: /award|certif/i },
  overview: {},
};

const GREETINGS = ['Good day. AFAIK is online. How can I help?', 'Hello. What would you like to know?'];
const STANDBY = ['Going to standby.', 'Standing by.'];
const THANKS = ["You're welcome.", 'Happy to help.'];

/* ----------------------------------------------------------------- helpers */

function reply(display: string, actions: AssistantAction[] = [], processingMs = 450, speechText?: string): AssistantResponse {
  const { text, truncated } = truncateForSpeech(toSpeakable(speechText ?? display));
  return { display, speech: truncated ? `${text} The full details are on screen.` : text, actions, processingMs };
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

/** Collects what one page says about a field, or null when it says nothing. */
function fieldAnswer(kb: KnowledgeBase, doc: KnowledgeDoc, field: DocField): FieldAnswer | null {
  if (field === 'overview') {
    const facts = Object.entries(doc.facts).map(([k, v]) => `${k}: ${v}`);
    const summary = doc.summary || doc.sections[0]?.lines.slice(0, 3).join(' ') || '';
    if (!summary && facts.length === 0) return null;
    return { lines: [summary, ...facts].filter(Boolean), spoken: `${summary} ${linesToSentences(facts.slice(0, 4))}` };
  }

  const source = FIELD_SOURCES[field];
  const factLines = Object.entries(doc.facts)
    .filter(([k]) => source.facts?.test(k))
    .map(([k, v]) => `${k}: ${v}`);
  const factValues = new Set(factLines.map((l) => l.slice(l.indexOf(':') + 1).trim()));
  const sections = doc.sections.filter((s) => source.sections?.test(s.heading) && !(s.lines.length === 1 && factValues.has(s.lines[0] ?? '')));
  if (factLines.length === 0 && sections.length === 0) return null;

  if (field === 'team') {
    const headings = new Set(sections.map((s) => s.heading));
    const people = peopleOnDoc(kb, doc.id).filter((p) => sections.some((s) => headings.has(s.heading) && s.lines.some((l) => l.startsWith(p.name))));
    if (people.length > 0) return { lines: people.map(formatPerson), spoken: people.map(speakPerson).join(' ') };
  }

  const lines = [...factLines];
  for (const s of sections) {
    if (sections.length > 1 || factLines.length > 0) lines.push(`${s.heading}:`);
    for (const line of s.lines) {
      const link = field === 'links' || field === 'documents' ? s.links.find((l) => l.label === line) : undefined;
      // Only URLs that appear in the source; SharePoint-relative paths are labelled, never expanded.
      if (!link) lines.push(line);
      else lines.push(link.url ? `${link.label} — ${link.url}` : `${link.label} (SharePoint document; link not available in source)`);
    }
  }
  return { lines, spoken: linesToSentences([...factLines, ...sections.flatMap((s) => s.lines)]) };
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
  const heading = field === 'overview' ? first.doc.title : `${first.doc.title} — ${label}`;
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
    `There are ${docs.length} ${label.plural.toLowerCase()}: ${spokenList(names)}. They're listed on screen.`,
  );
}

function listPlaybook(kb: KnowledgeBase): AssistantResponse {
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
    const lines = [`${doc.title} is listed under ${docBrand} on the Brands page.`];
    if (region) {
      const regionOf = (Object.entries(REGION_BRANDS) as Array<['north' | 'south', Brand]>).find(([, b]) => b === docBrand)?.[0];
      const regionLabel = regionOf === 'north' ? 'North' : 'South';
      lines.push(regionOf ? `Per the business rule (${regionLabel} projects = ${docBrand} projects), it is a ${regionLabel} project.` : `Region: ${NO_ANSWER}`);
    }
    return reply([...lines, '', ref].join('\n'), [select(doc)], 500, lines.join(' '));
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

function answerClarify(kb: KnowledgeBase, docIds: readonly string[]): AssistantResponse {
  const titles = docIds.map((id) => kb.docs.find((d) => d.id === id)?.title).filter((t): t is string => Boolean(t));
  if (titles.length < 2) return noAnswer();
  return reply(`Did you mean ${titles.slice(0, -1).join(', ')} or ${titles[titles.length - 1]}?`, [], 350);
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
        'I answer questions from the FAI knowledge source: projects, buildings, departments, people and procedures. For example: “How much is a 1-bedroom at 1001 Parkway?”, “How do I request a cash advance?”, “Where is Aeon Center?”, “List the Prestige projects” or “Who is on the 1001 Parkway team?”',
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
      return listPlaybook(kb);
    case 'brand':
      return answerBrand(kb, interpretation);
    case 'person':
      return answerPerson(kb, interpretation.params.personQuery ?? interpretation.normalizedText);
    case 'clarify':
      return answerClarify(kb, interpretation.params.docIds ?? []);
    case 'show_doc':
    case 'doc_field': {
      const doc = kb.docs.find((d) => d.id === interpretation.params.docId);
      if (!doc) return noAnswer();
      const ties = (interpretation.params.docIds ?? []).map((id) => kb.docs.find((d) => d.id === id)).filter((d): d is KnowledgeDoc => Boolean(d));
      return answerField(kb, doc, interpretation.intent === 'show_doc' ? 'overview' : (interpretation.params.field ?? 'overview'), ties);
    }
    case 'search':
      return answerSearch(kb, interpretation.params.query ?? interpretation.normalizedText);
    default:
      return noAnswer();
  }
}

/** Interprets text and generates the response in one step. */
export function processCommand(text: string, ctx: ResponseContext): CommandOutcome {
  const interpretation = interpretCommand(text, ctx);
  const response = generateResponse(interpretation, ctx);
  const answered = response.display !== NO_ANSWER;
  return { interpretation: { ...interpretation, recognized: interpretation.recognized && answered }, response };
}
