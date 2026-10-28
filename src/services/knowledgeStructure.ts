/**
 * Structured data derived from the loaded knowledge pages: brand membership (Brands page),
 * the Project Playbook list, and people listed on team sections.
 *
 * Everything here is read from the source; nothing is inferred beyond the configured business rules.
 */
import { BRANDS, type Brand, type KnowledgeBase, type KnowledgeDoc, type PersonEntry } from '../types/afaik';
import { normalizeText } from './knowledgeParser';

/** Configured business rules: North projects = Prestige, South projects = Aspire. */
export const REGION_BRANDS = { north: 'Prestige', south: 'Aspire' } as const satisfies Record<string, Brand>;

const cache = new WeakMap<KnowledgeBase, Derived>();

interface Derived {
  byFile: Map<string, KnowledgeDoc>;
  brandOf: Map<string, Brand>;
  brandDocs: Map<Brand, KnowledgeDoc[]>;
  playbook: KnowledgeDoc[] | null;
  people: PersonEntry[];
}

const fileKey = (file: string) => file.toLowerCase().replace(/\?.*$/, '');

function findPage(kb: KnowledgeBase, file: string): KnowledgeDoc | undefined {
  return kb.docs.find((d) => fileKey(d.sourceFile) === fileKey(file));
}

const GENERIC_GROUP = /^(?:meet the team|the team|our team|team|contacts?|key contacts)$/i;
const NAME_LIKE = /^[A-Z][\w.'’-]*(?:\s+[A-Z][\w.'’-]*){1,5}$/;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;

function parsePeople(doc: KnowledgeDoc): PersonEntry[] {
  const people: PersonEntry[] = [];
  for (const section of doc.sections) {
    for (const line of section.lines) {
      const parts = line.split(/\s+[—–]\s+/).map((p) => p.trim()).filter(Boolean);
      if (parts.length < 2) continue;
      const [name, ...rest] = parts as [string, ...string[]];
      const email = rest.find((p) => EMAIL.test(p))?.match(EMAIL)?.[0] ?? null;
      if (!NAME_LIKE.test(name) || (!email && rest.length < 1)) continue;
      const title = rest.find((p) => !EMAIL.test(p)) ?? null;
      people.push({ name, title, group: GENERIC_GROUP.test(section.heading) || !section.heading ? null : section.heading, email, docId: doc.id });
    }
  }
  return people;
}

function derive(kb: KnowledgeBase): Derived {
  const byFile = new Map(kb.docs.map((d) => [fileKey(d.sourceFile), d]));

  const brandOf = new Map<string, Brand>();
  const brandDocs = new Map<Brand, KnowledgeDoc[]>();
  const brandsPage = kb.docs.find((d) => fileKey(d.sourceFile) === 'brands.aspx');
  for (const group of brandsPage?.refGroups ?? []) {
    const brand = BRANDS.find((b) => new RegExp(`\\b${b}\\b`, 'i').test(group.context));
    if (!brand) continue;
    // Pages linked under the brand paragraph, plus pages the paragraph names by title
    // ("…Prestige developments including … Celestia and The Glades…").
    const context = normalizeText(group.context);
    const named = kb.docs.filter((d) => d.title.length >= 6 && ` ${context} `.includes(` ${normalizeText(d.title)} `));
    for (const doc of [...group.refs.map((r) => findPage(kb, r)), ...named]) {
      if (!doc || brandOf.has(doc.id)) continue;
      brandOf.set(doc.id, brand);
      brandDocs.set(brand, [...(brandDocs.get(brand) ?? []), doc]);
    }
  }

  const playbookPage = kb.docs.find((d) => fileKey(d.sourceFile) === 'project-playbook.aspx');
  const playbook = playbookPage
    ? [...new Set(playbookPage.refGroups.flatMap((g) => g.refs).map((r) => findPage(kb, r)).filter((d): d is KnowledgeDoc => Boolean(d)))]
    : null;

  return { byFile, brandOf, brandDocs, playbook, people: kb.docs.flatMap(parsePeople) };
}

function get(kb: KnowledgeBase): Derived {
  let derived = cache.get(kb);
  if (!derived) {
    derived = derive(kb);
    cache.set(kb, derived);
  }
  return derived;
}

/** The brand a page is listed under on the Brands page, or null when it isn't listed. */
export function brandOfDoc(kb: KnowledgeBase, docId: string): Brand | null {
  return get(kb).brandOf.get(docId) ?? null;
}

export function docsForBrand(kb: KnowledgeBase, brand: Brand): KnowledgeDoc[] {
  return get(kb).brandDocs.get(brand) ?? [];
}

export function brandsPageDoc(kb: KnowledgeBase): KnowledgeDoc | undefined {
  return get(kb).byFile.get('brands.aspx');
}

/** Pages listed in the Project Playbook (FAI projects), or null when the playbook page isn't loaded. */
export function playbookDocs(kb: KnowledgeBase): KnowledgeDoc[] | null {
  return get(kb).playbook;
}

export function playbookPageDoc(kb: KnowledgeBase): KnowledgeDoc | undefined {
  return get(kb).byFile.get('project-playbook.aspx');
}

export function peopleOnDoc(kb: KnowledgeBase, docId: string): PersonEntry[] {
  return get(kb).people.filter((p) => p.docId === docId);
}

/** People whose full name (at least first and last name) appears in the question. */
export function findPeopleByName(kb: KnowledgeBase, question: string): PersonEntry[] {
  const words = new Set(normalizeText(question).split(' '));
  return get(kb).people.filter((p) => {
    const nameWords = normalizeText(p.name)
      .split(' ')
      .filter((w) => w.length >= 3);
    return nameWords.length >= 2 && nameWords.filter((w) => words.has(w)).length >= 2;
  });
}
