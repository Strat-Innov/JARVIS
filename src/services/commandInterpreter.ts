/**
 * Deterministic command interpreter.
 *
 * Normalises recognised speech or typed text, then decides what is being asked: small talk,
 * a list of pages, a page, a specific part of a page, or a free-text search. No LLM, no network,
 * and nothing derived from the input is ever executed.
 */
import type { Brand, DocField, Intent, Interpretation, KnowledgeBase, KnowledgeCategory } from '../types/afaik';
import { lookupDoc, MATCH_SCORE, STOPWORDS, tokenize, withinOneEdit } from './knowledgeSearch';
import { findPeopleByName, portfolioGroups, REGION_BRANDS } from './knowledgeStructure';

export interface InterpreterContext {
  knowledge: KnowledgeBase | null;
  selectedDocId: string | null;
}

/**
 * The wake word "AFAIK", spoken letter by letter. Recognisers return it as "AFAIK", "A.F.A.I.K."
 * or "a f a i k"; text is lowercased with punctuation turned into spaces before matching.
 */
export const WAKE_WORD_PATTERN = /\b(?:afaik|a ?f ?a ?i ?k|a ?fake|uh ?fake)\b/;

const LEADING_FILLER = /^(?:(?:hey|ok|okay|hi|so|um|uh|right|now)\s+)*/;
const WAKE_PREFIX = new RegExp(`^(?:(?:hey|ok|okay|hi)\\s+)?${WAKE_WORD_PATTERN.source}\\s*`);
const WAKE_SUFFIX = new RegExp(`\\s*${WAKE_WORD_PATTERN.source}$`);

/** Lowercases, strips punctuation and removes a leading/trailing wake word and filler. */
export function normalizeCommand(text: string): string {
  let s = text
    .toLowerCase()
    .replace(/[‘’']/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // "Ten-oh-one Parkway" is how 1001 Parkway is said.
    .replace(/\b(?:ten|10) ?(?:oh|o|zero|0) ?(?:one|1)\b/g, '1001');
  s = s.replace(WAKE_PREFIX, '').replace(WAKE_SUFFIX, '').trim();
  s = s.replace(LEADING_FILLER, '').replace(/^please\s+|\s+please$/g, '').trim();
  return s;
}

/** True when the text contains the wake word anywhere. */
export function containsWakeWord(text: string): boolean {
  return WAKE_WORD_PATTERN.test(text.toLowerCase().replace(/[^a-z0-9]+/g, ' '));
}

/* ----------------------------------------------------------- small talk */

interface Rule {
  intent: Intent;
  patterns: RegExp[];
}

const SMALL_TALK: Rule[] = [
  { intent: 'standby', patterns: [/^(?:go to )?stand ?by$/, /\bstand down\b/, /\bgo to sleep\b/, /\bthat ?(?:will|ll) be all\b/, /^(?:goodbye|bye|good night|goodnight)$/] },
  { intent: 'help', patterns: [/\bwhat (?:can|else can) you do\b/, /^help$/, /\bhow do i use (?:you|this)\b/, /\bwhat can i ask\b/, /\bcapabilities\b/] },
  { intent: 'identity', patterns: [/\bwho are you\b/, /\bintroduce yourself\b/, /\bwhat are you\b/, /\bwhats your name\b/, /\bwhat is your name\b/] },
  { intent: 'thanks', patterns: [/^(?:thank(?:s| you)(?: very much| so much)?|cheers|great job|good job|well done|nice work)$/] },
  { intent: 'time', patterns: [/^what time is it$/, /^(?:whats|what is) the (?:current )?time$/, /^time$/] },
  {
    intent: 'greeting',
    patterns: [/^(?:hello|hi|hey|yo|greetings|good (?:morning|afternoon|evening|day))$/, /^(?:are you (?:there|awake|online)|you there|wake up|how are you)$/],
  },
];

const GREETING_PREFIX = /^(?:hello|hi|hey|good (?:morning|afternoon|evening|day))\s+/;

/* --------------------------------------------------------- list requests */

const CATEGORY_WORDS: Record<KnowledgeCategory, RegExp> = {
  project: /^(?:projects?|developments?|properties|property|residential|residences|estates?|townships?|condos?|condominiums?)$/,
  building: /^(?:buildings?|offices?|locations?|establishments?|landmarks?|places?|tenants?|locators?)$/,
  department: /^(?:departments?|teams?|groups?|divisions?|units?)$/,
  procedure: /^(?:procedures?|processes|process|forms?|permits?|requests?|guides?|policies)$/,
  news: /^(?:news|events?|announcements?|updates?|features?|stories)$/,
  general: /^(?:tools?|resources?|systems?|apps?|platforms?)$/,
};

const LIST_FILLER = new Set(
  'list show me all the what which are there do you have available our your of can tell about know give a an in on filinvest city fai current any kinds kind types type see'.split(' '),
);

function detectListCategory(normalized: string): KnowledgeCategory | null {
  if (!/^(?:list|show|what|which|all|give|tell)\b/.test(normalized)) return null;
  const words = normalized.split(' ').filter((w) => !LIST_FILLER.has(w));
  if (words.length === 0 || words.length > 2) return null;
  for (const [category, pattern] of Object.entries(CATEGORY_WORDS) as Array<[KnowledgeCategory, RegExp]>) {
    if (words.every((w) => pattern.test(w))) return category;
  }
  return null;
}

/* ------------------------------------------------------- field questions */

/** Ordered: the first matching field wins, so specific phrasings come first. */
const FIELD_PATTERNS: Array<[DocField, RegExp]> = [
  ['approval_time', /\b(?:approval time|turnaround|processing time|how long (?:does|will|is) (?:it|the|approval|processing)|how long to (?:approve|process))/],
  ['parking', /\bparking\b|\bslots?\b/],
  ['transport', /\b(?:shuttle|bus|transport|transportation|commute|fare|loop|jeep|jeepney|terminal schedule)\b/],
  ['payment', /\b(?:payment|payments|pay|downpayment|down payment|installment|instalment|financing|deferred|terms|schemes?|discount)\b/],
  ['pricing', /\b(?:price|prices|pricing|priced|cost|costs|how much|per sqm|per square|lot sizes?|unit sizes?|sqm|cheapest|expensive|budget for)\b/],
  ['amenities', /\b(?:amenities|amenity|facilities|facility|pool|gym|clubhouse|playground)\b/],
  ['units', /\b(?:how many units|number of units|no of units|total units)\b/],
  ['turnover', /\b(?:turnover|turn over|completion date|when (?:will|is) (?:it|this) (?:be )?(?:finished|completed|done|ready))\b/],
  ['status', /\b(?:status|rfo|ready for occupancy|pre ?selling|is it ready)\b/],
  ['requirements', /\b(?:requirements?|required|need to (?:bring|submit|prepare)|what do i need|prerequisites?)\b/],
  ['documents', /\b(?:forms?|documents?|templates?|download)\b/],
  ['team', /\b(?:who|contact|contacts|email|e mail|team|manager|in charge|head of|point person|reach)\b/],
  ['links', /\b(?:website|facebook|instagram|socials?|virtual tour|360|link|links)\b/],
  ['awards', /\b(?:awards?|recognition|certifications?|certified)\b/],
  ['location', /\b(?:where|location|located|address|directions|how (?:do i|to) get (?:there|to))\b/],
  ['process', /\b(?:how (?:do|can|should) (?:i|we)|how to|steps?|process|procedure|apply|file|submit|request)\b/],
  ['overview', /\b(?:what is|whats|tell me about|overview|describe|about|info|information|details)\b/],
];

export function detectField(normalized: string): DocField | null {
  return FIELD_PATTERNS.find(([, pattern]) => pattern.test(normalized))?.[0] ?? null;
}

/** Words that are neither stopwords nor field keywords — i.e. words naming a subject. */
function contentWords(normalized: string): string[] {
  return normalized.split(' ').filter((w) => w && !STOPWORDS.has(w) && !FIELD_PATTERNS.some(([, p]) => p.test(w)));
}

const SHOW_VERBS = /^(?:show(?: me)?|open|display|bring up|pull up|go to|select|load|let me see)\b/;
/** Follow-up phrasings that refer to the page already on screen. */
const DEICTIC = /\b(?:it|its|this|that|there|here|this one|this project|this building|the project|the building)\b/;

/* ------------------------------------------------- guided conversations */

const LIFE_AT_FAI =
  /\blife (?:at|in) (?:fai|the office|work|the company)\b|\b(?:at|in) the office\b|\boffice life\b|\bwork(?:ing)? (?:at|in) fai\b|\b(?:work|company|office) culture\b|\bwhat is it like (?:to work|working)\b|^life at fai$/;
const PORTFOLIO = /\b(?:our|fai|the|your) (?:portfolio|projects)\b|\bproject playbook\b|^(?:portfolio|projects)$|\bfai projects?\b/;

/** Matches a Playbook group name in singular or plural ("Residential", "Office Space"). */
function groupPattern(name: string): RegExp {
  const words = name
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .map((w) => `${w.replace(/s$/, '')}s?`);
  return new RegExp(`\\b${words.join('\\s+')}\\b`);
}

/* ------------------------------------------------------- brand & region */

const BRAND_WORD = /\b(prestige|aspire|filigree)\b/;
const REGION_PROJECTS = /\b(north|south)(?:ern)?\b(?:\s+\w+){0,2}\s+projects?\b|\bprojects?\b(?:\s+\w+){0,3}\s+(?:in the )?(north|south)\b/;
const BRAND_QUESTION = /\b(?:what|which) brand\b|\bbrand of\b|\bunder (?:what|which) brand\b|\bis (?:it|this)\b.*\b(?:prestige|aspire|filigree)\b/;
const REGION_QUESTION = /\b(?:north|south)(?:ern)?\b|\bwhich region\b|\bwhat region\b/;

function brandFromText(normalized: string): Brand | undefined {
  const word = BRAND_WORD.exec(normalized)?.[1];
  return word ? ((word.charAt(0).toUpperCase() + word.slice(1)) as Brand) : undefined;
}

/* ------------------------------------------------------------- interpret */

export function interpretCommand(rawText: string, context: InterpreterContext): Interpretation {
  let normalizedText = normalizeCommand(rawText);
  const base = { rawText, params: {} };

  if (!rawText.trim()) return { ...base, normalizedText, intent: 'unknown', recognized: false, error: 'empty_input' };
  if (!normalizedText) return { ...base, normalizedText, intent: 'greeting', recognized: true };

  const smallTalk = SMALL_TALK.find((r) => r.patterns.some((p) => p.test(normalizedText)));
  if (smallTalk) return { ...base, normalizedText, intent: smallTalk.intent, recognized: true };

  // "Good morning, where is Aeon Center?" — answer the question, skip the pleasantry.
  normalizedText = normalizedText.replace(GREETING_PREFIX, '').trim();
  const ok = (intent: Intent, params: Interpretation['params'] = {}): Interpretation => ({ ...base, normalizedText, intent, recognized: true, params });

  const { knowledge } = context;
  if (!knowledge || knowledge.docs.length === 0) {
    return { ...ok('search', { query: normalizedText }), error: 'knowledge_missing' };
  }

  const regionMatch = REGION_PROJECTS.exec(normalizedText);
  const regionName = (regionMatch?.[1] ?? regionMatch?.[2]) as 'north' | 'south' | undefined;
  const mentionsBrand = BRAND_WORD.test(normalizedText);

  // Life at FAI / office life → ask which department.
  if (LIFE_AT_FAI.test(normalizedText)) return ok('life_at_fai');

  const lookup = lookupDoc(normalizeCommand(rawText), knowledge.docs);
  const exactPage = lookup.match && lookup.match.score >= MATCH_SCORE.exact;

  // Project Playbook groups: "Residentials", "show me the leasing projects".
  if (!exactPage && !mentionsBrand && !regionName) {
    const group = portfolioGroups(knowledge).find((g) => groupPattern(g.name).test(normalizedText));
    if (group) return ok('portfolio_group', { group: group.name });
  }

  // Our portfolio / our projects → ask what they'd like to know (Project Playbook).
  const category = detectListCategory(normalizedText);
  if (!mentionsBrand && !regionName && (category === 'project' || PORTFOLIO.test(normalizedText))) {
    return ok('portfolio');
  }
  if (category) return ok('list_category', { category });

  let match = lookup.match;
  const field = detectField(normalizedText);

  // A single shared word ("capital", "parking") is weak evidence: every subject word in the
  // question must belong to the page's name, and there must be at least one.
  if (match && match.score < MATCH_SCORE.distinctive) {
    const nameTokens = [...new Set(match.doc.aliases.flatMap((a) => tokenize(a)))];
    const inName = (w: string) => {
      const t = tokenize(w)[0] ?? w;
      return nameTokens.includes(t) || nameTokens.some((n) => n.length >= 6 && withinOneEdit(n, t));
    };
    const words = contentWords(normalizedText).filter((w) => !BRAND_WORD.test(w) && !REGION_QUESTION.test(w));
    if (words.length === 0 || !words.every(inName)) match = null;
  }

  // Brand / region lists: "Prestige projects", "north projects".
  if (!match && (regionName || (mentionsBrand && /\b(?:projects?|developments?|properties)\b/.test(normalizedText)))) {
    const brand = regionName ? REGION_BRANDS[regionName] : brandFromText(normalizedText);
    return ok('brand', { ...(brand ? { brand } : {}), ...(regionName ? { region: regionName } : {}) });
  }

  // People: "Who is Ana Cruz?"
  if (!match || field === 'team') {
    if (findPeopleByName(knowledge, normalizedText).length > 0) return ok('person', { personQuery: normalizedText });
  }

  if (match) {
    const docId = match.doc.id;
    const docIds = lookup.ties.map((d) => d.id);
    const extra = docIds.length > 0 ? { docIds } : {};
    const asksRegion = REGION_QUESTION.test(normalizedText) && !field;
    if (BRAND_QUESTION.test(normalizedText) || asksRegion) {
      return ok('brand', { docId, docExplicit: true, ...(asksRegion ? { region: /\bsouth/.test(normalizedText) ? 'south' : 'north' } : {}) });
    }
    if (SHOW_VERBS.test(normalizedText) && (!field || field === 'overview')) return ok('show_doc', { docId, docExplicit: true, ...extra });
    return ok('doc_field', { docId, docExplicit: true, field: field ?? 'overview', ...extra });
  }

  // Several pages share the only name given ("Botanika") — ask one clarifying question.
  if (lookup.candidates.length >= 2) return ok('clarify', { docIds: lookup.candidates.map((d) => d.id), ...(field ? { field } : {}) });

  // Follow-up about the page on screen: "What's the price?", "Where is it?"
  const selected = knowledge.docs.find((d) => d.id === context.selectedDocId);
  const subjectWords = contentWords(normalizedText).filter((w) => !/^(?:units?|bedrooms?|br|one|two|three|1|2|3|studio|lots?)$/.test(w));
  if (selected && field && field !== 'overview' && (DEICTIC.test(normalizedText) || subjectWords.length === 0)) {
    return ok('doc_field', { docId: selected.id, docExplicit: false, field });
  }
  if (selected && BRAND_QUESTION.test(normalizedText) && subjectWords.filter((w) => !BRAND_WORD.test(w)).length === 0) {
    return ok('brand', { docId: selected.id, docExplicit: false });
  }

  return ok('search', { query: normalizedText, ...(field ? { field } : {}) });
}
