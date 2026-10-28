/** Shared domain types for the AFAIK application. */

export const KNOWLEDGE_CATEGORIES = ['project', 'building', 'department', 'procedure', 'news', 'general'] as const;
export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number];

export interface KnowledgeLink {
  label: string;
  /** Absolute https URL, or null for internal SharePoint paths that only work inside the company network. */
  url: string | null;
}

export interface KnowledgeSection {
  heading: string;
  /** Plain-text lines (markdown list markers removed). */
  lines: string[];
  links: KnowledgeLink[];
}

/** One page of the knowledge base, e.g. a project, a building or a procedure. */
export interface KnowledgeDoc {
  id: string;
  title: string;
  category: KnowledgeCategory;
  /** Lowercased names this page can be referred to by (title, file name, abbreviations). */
  aliases: string[];
  /** First descriptive paragraph, if any. */
  summary: string;
  /** Key–value facts found on the page, e.g. { Status: 'RFO', Location: 'Parkway Avenue' }. */
  facts: Record<string, string>;
  sections: KnowledgeSection[];
  /** SharePoint page file name, e.g. "1001-Parkway.aspx". */
  sourceFile: string;
  /** SharePoint site exactly as stated in the source (never constructed). */
  sharepointSite: string;
  /** Links to other SharePoint pages, grouped under the paragraph they follow (used by Brands and Project Playbook). */
  refGroups: PageRefGroup[];
}

export interface PageRefGroup {
  /** The text paragraph preceding the references ('' if none). */
  context: string;
  /** Referenced page file names, e.g. "CELESTIA.aspx". */
  refs: string[];
}

export const BRANDS = ['Filigree', 'Prestige', 'Aspire'] as const;
export type Brand = (typeof BRANDS)[number];

/** A person listed on a page, e.g. in "Meet The Team". */
export interface PersonEntry {
  name: string;
  title: string | null;
  group: string | null;
  email: string | null;
  docId: string;
}

export interface KnowledgeBase {
  docs: KnowledgeDoc[];
  /** File name the knowledge was loaded from. */
  sourceName: string;
  loadedAt: number;
}

export type AssistantState = 'standby' | 'listening' | 'processing' | 'speaking' | 'error';

export const ACTIVATION_MODES = ['push-to-talk', 'conversation', 'wake-word'] as const;
export type ActivationMode = (typeof ACTIVATION_MODES)[number];

export interface Settings {
  /** SpeechSynthesisVoice.voiceURI, or null to auto-select. */
  voiceURI: string | null;
  rate: number;
  pitch: number;
  speechEnabled: boolean;
  soundEffectsEnabled: boolean;
  activationMode: ActivationMode;
}

export interface SessionState {
  selectedDocId: string | null;
  selectedCategory: KnowledgeCategory;
}

/** What part of a page a question is about. */
export const DOC_FIELDS = [
  'pricing',
  'payment',
  'location',
  'status',
  'units',
  'turnover',
  'amenities',
  'parking',
  'transport',
  'process',
  'requirements',
  'approval_time',
  'documents',
  'team',
  'links',
  'awards',
  'overview',
] as const;
export type DocField = (typeof DOC_FIELDS)[number];

export type Intent =
  | 'greeting'
  | 'help'
  | 'standby'
  | 'time'
  | 'thanks'
  | 'identity'
  | 'list_category'
  | 'list_playbook'
  | 'brand'
  | 'person'
  | 'clarify'
  | 'show_doc'
  | 'doc_field'
  | 'search'
  | 'unknown';

export type InterpretationError = 'empty_input' | 'knowledge_missing' | 'doc_not_found';

/** Output of the deterministic command interpreter. */
export interface Interpretation {
  intent: Intent;
  recognized: boolean;
  rawText: string;
  normalizedText: string;
  params: {
    docId?: string;
    /** True when the page was named in the question (rather than the selected page). */
    docExplicit?: boolean;
    field?: DocField;
    category?: KnowledgeCategory;
    /** Search terms for free-text questions. */
    query?: string;
    /** Other pages that match equally well (conflict check) or candidates for a clarifying question. */
    docIds?: string[];
    brand?: Brand;
    /** Set when the brand was asked as a region (North = Prestige, South = Aspire). */
    region?: 'north' | 'south';
    /** Person-name words for people lookups. */
    personQuery?: string;
  };
  error?: InterpretationError;
}

export type View = 'hud' | 'library' | 'diagnostics' | 'settings';

export type AssistantAction =
  | { type: 'select-doc'; docId: string }
  | { type: 'select-category'; category: KnowledgeCategory }
  | { type: 'standby' };

export interface AssistantResponse {
  /** Text shown on screen. */
  display: string;
  /** Text sent to speech synthesis (shortened and expanded for pronunciation). */
  speech: string;
  actions: AssistantAction[];
  /** Simulated processing time before replying, in ms. */
  processingMs: number;
}

/** A complete command turn: interpretation plus generated response. */
export interface CommandOutcome {
  interpretation: Interpretation;
  response: AssistantResponse;
}

export interface HistoryEntry {
  id: string;
  at: number;
  input: string;
  source: 'voice' | 'text';
  intent: Intent;
  recognized: boolean;
  response: string;
}

export interface ActivityEntry {
  id: string;
  at: number;
  message: string;
}
