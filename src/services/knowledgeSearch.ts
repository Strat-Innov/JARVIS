/**
 * Deterministic retrieval over the knowledge base: page-name matching and BM25 keyword search.
 * No network calls and no generative model — results are always passages from the loaded file.
 */
import type { KnowledgeBase, KnowledgeDoc } from '../types/afaik';
import { normalizeText } from './knowledgeParser';

export const STOPWORDS = new Set(
  (
    'a an the and or of to in on at for from by with about into is are was were be been being am do does did done can could ' +
    'should would will shall may might must have has had i me my we our you your it its this that these those there here what ' +
    'whats which who whom whose when where why how please tell show give find know let lets get got need want like any some ' +
    'all much many more most also just than then so if as not no yes ok okay hey hi afaik'
  ).split(' '),
);

/** Words too common in this knowledge base to identify a page on their own. */
const GENERIC_NAME_WORDS = new Set([
  'the', 'and', 'of', 'building', 'buildings', 'center', 'centre', 'tower', 'towers', 'residences', 'residence', 'inc', 'filinvest',
  'city', 'alabang', 'corporate', 'plaza', 'condominium', 'place', 'park', 'hub', 'retail', 'office', 'news', 'features', 'page',
  'process', 'request', 'requests', 'permit', 'form', 'forms', 'group', 'department', 'development', 'project', 'projects', 'estate',
  'private', 'heights', 'center', 'centre', 'events', 'tools', 'contacts', 'expansion', 'resources', 'supermarket', 'station', 'south',
  'north', 'new', 'support', 'services', 'clearance', 'accountability', 'release', 'guidelines', 'association', 'parking',
]);

function stem(token: string): string {
  if (token.length > 4 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

export function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(' ')
    .filter((t) => t && !STOPWORDS.has(t))
    .map(stem);
}

/* ------------------------------------------------------------ page lookup */

export interface DocMatch {
  doc: KnowledgeDoc;
  /** Higher is a more specific match: ≥100 exact name, ≥50 all distinctive words, ≥30 one unique word. */
  score: number;
}

export const MATCH_SCORE = { exact: 100, distinctive: 50, uniqueWord: 30 } as const;

/**
 * Finds the page a question names, e.g. "1001 Parkway", "cash advance (CA)" or "Aeon".
 * Exact alias phrases win; otherwise every distinctive word of a page name must appear.
 */
export interface DocLookup {
  match: DocMatch | null;
  /** Other pages matching exactly as well as `match` (e.g. two pages with the same title). */
  ties: KnowledgeDoc[];
  /** Pages sharing the only distinctive word given ("botanika") — ask which one was meant. */
  candidates: KnowledgeDoc[];
}

/**
 * Finds the page a question names, e.g. "1001 Parkway", "cash advance (CA)" or "Aeon".
 * Exact alias phrases win; then pages whose distinctive name words all appear; then a single
 * distinctive word that names exactly one page (tolerating one typo in longer words).
 */
export function lookupDoc(text: string, docs: readonly KnowledgeDoc[]): DocLookup {
  const padded = ` ${normalizeText(text)} `;
  const words = new Set(padded.trim().split(' '));
  const scores = new Map<KnowledgeDoc, number>();
  const raise = (doc: KnowledgeDoc, score: number) => {
    if (score > (scores.get(doc) ?? 0)) scores.set(doc, score);
  };

  for (const doc of docs) {
    for (const alias of doc.aliases) {
      if (padded.includes(` ${alias} `)) {
        raise(doc, MATCH_SCORE.exact + alias.length);
        continue;
      }
      const distinctive = alias.split(' ').filter((w) => !GENERIC_NAME_WORDS.has(w));
      if (distinctive.length > 0 && distinctive.join('').length >= 4 && distinctive.every((w) => words.has(w))) {
        raise(doc, MATCH_SCORE.distinctive + distinctive.join(' ').length);
      }
    }
  }

  const candidates = new Set<KnowledgeDoc>();
  const owners = distinctiveWordOwners(docs);
  for (const word of words) {
    if (word.length < 5 || STOPWORDS.has(word)) continue;
    for (const [candidate, owned] of owners) {
      if (candidate !== word && !(word.length >= 6 && candidate.length >= 6 && withinOneEdit(word, candidate))) continue;
      if (owned.size === 1) {
        const [only] = owned;
        if (only) raise(only, MATCH_SCORE.uniqueWord + candidate.length);
      } else if (owned.size <= 4) {
        for (const d of owned) candidates.add(d);
      }
    }
  }

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  if (!top) return { match: null, ties: [], candidates: [...candidates] };
  const ties = ranked.filter(([d, sc]) => sc === top[1] && d !== top[0]).map(([d]) => d);
  return { match: { doc: top[0], score: top[1] }, ties, candidates: [] };
}

/** Convenience wrapper returning only the best match. */
export function findDocInText(text: string, docs: readonly KnowledgeDoc[]): DocMatch | null {
  return lookupDoc(text, docs).match;
}

const ownerCache = new WeakMap<readonly KnowledgeDoc[], Map<string, Set<KnowledgeDoc>>>();

/** Maps each distinctive alias word to the pages that use it. */
function distinctiveWordOwners(docs: readonly KnowledgeDoc[]): Map<string, Set<KnowledgeDoc>> {
  const cached = ownerCache.get(docs);
  if (cached) return cached;
  const owners = new Map<string, Set<KnowledgeDoc>>();
  for (const doc of docs) {
    const docWords = new Set(doc.aliases.flatMap((a) => a.split(' ')).filter((w) => w.length >= 5 && !GENERIC_NAME_WORDS.has(w) && !STOPWORDS.has(w)));
    for (const w of docWords) owners.set(w, new Set([...(owners.get(w) ?? []), doc]));
  }
  ownerCache.set(docs, owners);
  return owners;
}

/** True when a and b differ by at most one insertion, deletion or substitution. */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (a.length > b.length) i += 1;
    else if (b.length > a.length) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/* ------------------------------------------------------------------ BM25 */

interface IndexEntry {
  docIndex: number;
  /** -1 for the page summary. */
  sectionIndex: number;
  terms: Map<string, number>;
  length: number;
}

interface SearchIndex {
  entries: IndexEntry[];
  docFreq: Map<string, number>;
  avgLength: number;
}

const indexCache = new WeakMap<KnowledgeBase, SearchIndex>();

function countTerms(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
  return counts;
}

function buildIndex(kb: KnowledgeBase): SearchIndex {
  const entries: IndexEntry[] = [];
  kb.docs.forEach((doc, docIndex) => {
    // Title words are repeated so passages from the right page rank first.
    const titleTokens = tokenize(doc.title);
    const boost = [...titleTokens, ...titleTokens];
    const add = (sectionIndex: number, text: string) => {
      const tokens = [...boost, ...tokenize(text)];
      if (tokens.length > boost.length) entries.push({ docIndex, sectionIndex, terms: countTerms(tokens), length: tokens.length });
    };
    add(-1, `${doc.summary} ${Object.entries(doc.facts).map(([k, v]) => `${k} ${v}`).join(' ')}`);
    doc.sections.forEach((section, i) => add(i, `${section.heading} ${section.heading} ${section.lines.join(' ')}`));
  });

  const docFreq = new Map<string, number>();
  for (const entry of entries) for (const term of entry.terms.keys()) docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
  const avgLength = entries.reduce((sum, e) => sum + e.length, 0) / Math.max(1, entries.length);
  return { entries, docFreq, avgLength };
}

function getIndex(kb: KnowledgeBase): SearchIndex {
  let index = indexCache.get(kb);
  if (!index) {
    index = buildIndex(kb);
    indexCache.set(kb, index);
  }
  return index;
}

export interface SearchHit {
  doc: KnowledgeDoc;
  /** -1 means the page summary/facts. */
  sectionIndex: number;
  score: number;
  /** Fraction of the query's terms found in the passage (0–1). */
  coverage: number;
}

const K1 = 1.2;
const B = 0.75;

/** Ranks passages for a free-text query. Returns at most one hit per page. */
export function searchKnowledge(kb: KnowledgeBase, query: string, limit = 5): SearchHit[] {
  const terms = [...new Set(tokenize(query))];
  if (terms.length === 0) return [];
  const { entries, docFreq, avgLength } = getIndex(kb);
  const n = entries.length;

  const scored = entries
    .map((entry) => {
      let score = 0;
      let matched = 0;
      for (const term of terms) {
        const tf = entry.terms.get(term);
        if (!tf) continue;
        matched += 1;
        const df = docFreq.get(term) ?? 0;
        const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
        score += idf * ((tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * entry.length) / avgLength)));
      }
      return { entry, score, coverage: matched / terms.length };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  const seen = new Set<number>();
  const hits: SearchHit[] = [];
  for (const s of scored) {
    if (seen.has(s.entry.docIndex)) continue;
    seen.add(s.entry.docIndex);
    const doc = kb.docs[s.entry.docIndex];
    if (doc) hits.push({ doc, sectionIndex: s.entry.sectionIndex, score: s.score, coverage: s.coverage });
    if (hits.length >= limit) break;
  }
  return hits;
}
