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

export interface PortfolioItem {
  /** Card headline, e.g. "The Crib". */
  title: string;
  /** Page the card links to, e.g. "The-Crib-Alabang.aspx". */
  sourceFile: string;
  /** Visible card description (the brand label on Residentials), or null when hidden/absent. */
  label: string | null;
  x: number;
  y: number;
}

/** A Project Playbook accordion group: Townships, Residentials, Office Spaces, Commercial Lots, Leasing. */
export interface PortfolioGroup {
  name: string;
  items: PortfolioItem[];
}

/** A "Know More" department card on the Life at FAI page. */
export interface DepartmentCard {
  title: string;
  sourceFile: string | null;
}

/** Navigation structure read from the raw SharePoint export (Master File). */
export interface SiteStructure {
  portfolio: PortfolioGroup[];
  departments: DepartmentCard[];
}

export interface KnowledgeBase {
  docs: KnowledgeDoc[];
  /** Present when the Master File was available at load time. */
  structure?: SiteStructure | null;
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
  /** How AFAIK says its own name: "a-fake", "Ah-fah-ick" or letter by letter. */
  nameStyle: 'word' | 'phonetic' | 'letters';
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
  | 'portfolio'
  | 'portfolio_group'
  | 'life_at_fai'
  | 'doc_section'
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
    /** Project Playbook group name for portfolio_group. */
    group?: string;
    /** Section index for doc_section. */
    sectionIndex?: number;
  };
  error?: InterpretationError;
}

export type View = 'hud' | 'library' | 'diagnostics' | 'settings';

export type AssistantAction =
  | { type: 'select-doc'; docId: string }
  | { type: 'select-category'; category: KnowledgeCategory }
  | { type: 'standby' };

/** A choice offered after an answer; picking it runs the preset interpretation directly. */
export interface FollowUpOption {
  label: string;
  /** Shown as the user's input when chosen. */
  text: string;
  intent: Intent;
  params: Interpretation['params'];
}

export interface FollowUp {
  prompt: string;
  options: FollowUpOption[];
}

export interface AssistantResponse {
  /** Text shown on screen. */
  display: string;
  /** Text sent to speech synthesis (shortened and expanded for pronunciation). */
  speech: string;
  actions: AssistantAction[];
  /** Simulated processing time before replying, in ms. */
  processingMs: number;
  /** A follow-up question with choices (e.g. "Which department?"). */
  followUp?: FollowUp;
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
