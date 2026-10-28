/**
 * Deterministic command interpreter.
 *
 * Normalises recognised speech or typed text and matches it against an ordered registry of
 * intent patterns. No LLM, no network, and nothing derived from the input is ever executed.
 */
import type { Intent, Interpretation, Suit } from '../types/jarvis';
import { markNumberFromDesignation, numberToRoman, parseMarkNumber } from '../utils/time';

export interface InterpreterContext {
  suits: readonly Suit[];
  selectedSuitId: string | null;
}

/** Common speech-recognition spellings of the wake word. */
export const WAKE_WORD_PATTERN = /\b(?:jarvis|jarvas|jarves|jervis|jarvus|jarvice)\b/;

const LEADING_FILLER = /^(?:(?:hey|ok|okay|hi|so|um|uh|right|now)\s+)*/;
const WAKE_PREFIX = new RegExp(`^(?:(?:hey|ok|okay|hi)\\s+)?${WAKE_WORD_PATTERN.source}\\s*`);
const WAKE_SUFFIX = new RegExp(`\\s*${WAKE_WORD_PATTERN.source}$`);

/** Lowercases, strips punctuation and removes a leading/trailing wake word and filler. */
export function normalizeCommand(text: string): string {
  let s = text
    .toLowerCase()
    .replace(/[‘’']/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  s = s.replace(WAKE_PREFIX, '').replace(WAKE_SUFFIX, '').trim();
  s = s.replace(LEADING_FILLER, '').replace(/^please\s+|\s+please$/g, '').trim();
  return s;
}

/** True when the text contains the wake word anywhere. */
export function containsWakeWord(text: string): boolean {
  return WAKE_WORD_PATTERN.test(text.toLowerCase());
}

const NUMBER_WORD =
  '(?:(?:twenty|thirty|forty|fourty|fifty|sixty|seventy|eighty|ninety)(?:\\s+(?:one|two|three|four|five|six|seven|eight|nine))?' +
  '|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)';
const MARK_REFERENCE = new RegExp(`\\b(?:mark|mk|marc)\\s*(\\d{1,3}|[ivxlc]+|${NUMBER_WORD})\\b`);

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

interface SuitReference {
  suitId?: string;
  /** Canonical form of an unresolved reference, e.g. "Mark L". */
  unresolved?: string;
}

/** Finds a suit mentioned in normalised text by mark number ("mark 43", "mark xliii", "mark forty three") or name. */
export function findSuitReference(normalized: string, suits: readonly Suit[]): SuitReference | null {
  const match = MARK_REFERENCE.exec(normalized);
  const markNumber = match?.[1] ? parseMarkNumber(match[1]) : null;
  if (markNumber !== null) {
    const suit = suits.find(
      (s) => markNumberFromDesignation(s.designation) === markNumber || markNumberFromDesignation(s.name) === markNumber,
    );
    return suit ? { suitId: suit.id } : { unresolved: `Mark ${numberToRoman(markNumber)}` };
  }

  const squashed = squash(normalized);
  const byName = suits.find((s) => {
    const name = squash(s.name);
    const designation = squash(s.designation);
    return (name.length >= 4 && squashed.includes(name)) || (designation.length >= 4 && squashed.includes(designation));
  });
  return byName ? { suitId: byName.id } : null;
}

interface IntentRule {
  intent: Intent;
  patterns: RegExp[];
  easterEgg?: string;
}

/** Ordered registry: the first matching rule wins, so specific phrases come before broad ones. */
const RULES: IntentRule[] = [
  { intent: 'easter_egg', easterEgg: 'self_destruct', patterns: [/\bself destruct/] },
  { intent: 'easter_egg', easterEgg: 'iron_man', patterns: [/\bi am iron ?man\b/, /\bim iron ?man\b/] },
  { intent: 'easter_egg', easterEgg: 'halloween', patterns: [/\btrick or treat\b/, /\bhappy halloween\b/] },
  { intent: 'easter_egg', easterEgg: 'costume', patterns: [/\bhow do i look\b/, /\b(?:rate|like|scan) my costume\b/, /\bwhat do you think of my costume\b/] },
  { intent: 'easter_egg', easterEgg: 'alive', patterns: [/\bare you (?:alive|real|conscious|sentient|human)\b/] },
  { intent: 'easter_egg', easterEgg: 'pod_bay', patterns: [/\bpod bay doors?\b/] },
  { intent: 'easter_egg', easterEgg: 'coffee', patterns: [/\b(?:make|get|fetch|pour) me (?:a |some )?(?:coffee|drink|cocktail|tea|snack)\b/] },
  { intent: 'easter_egg', easterEgg: 'dance', patterns: [/\b(?:can you |do you )?dance\b/, /\bplay (?:some )?music\b/] },
  { intent: 'easter_egg', easterEgg: 'acronym', patterns: [/\bwhat does (?:jarvis|your name) stand for\b/] },
  {
    intent: 'party_off',
    patterns: [
      /\b(?:deactivate|disable|end|stop|cancel|terminate|turn off|shut down|exit|leave|kill)\b.*\bparty\b/,
      /\bparty (?:mode |protocol )?(?:off|over)\b/,
      /\bpartys over\b/,
      /\b(?:normal|standard|regular) (?:mode|operations?)\b/,
    ],
  },
  {
    intent: 'party_on',
    patterns: [
      /\b(?:activate|enable|start|engage|initiate|begin|turn on|launch|commence)\b.*\bparty\b/,
      /\bparty (?:mode|protocol|time)\b/,
      /\blets party\b/,
      /\bparty on\b/,
    ],
  },
  {
    intent: 'standby',
    patterns: [/\bstand ?by\b/, /\bstand down\b/, /\bgo to sleep\b/, /\bthat ?(?:will|ll) be all\b/, /\bgoodnight\b|\bgood night\b/],
  },
  {
    intent: 'help',
    patterns: [
      /\bwhat (?:can|else can) you do\b/,
      /\bwhat do you do\b/,
      /\bhelp\b/,
      /\b(?:list|available|your|what) (?:of )?commands\b/,
      /\bcapabilities\b/,
    ],
  },
  {
    intent: 'welcome_guests',
    patterns: [/\b(?:welcome|greet|say hello to|say hi to|introduce yourself to)\b.*\b(?:guests?|everyone|everybody|people|friends|crowd|room)\b/],
  },
  { intent: 'identity', patterns: [/\bwho are you\b/, /\bintroduce yourself\b/, /\bwhat are you\b/, /\bwhats your name\b/, /\bwhat is your name\b/] },
  {
    intent: 'diagnostics',
    patterns: [/\bdiagnos(?:tic|tics|e|is)\b/, /\b(?:run|perform|start|do) (?:a )?(?:full )?(?:system |systems )?(?:scan|check|systems check)\b/, /\bscan\b/],
  },
  {
    intent: 'repair_estimate',
    patterns: [
      /\bhow long\b/,
      /\beta\b/,
      /\btime (?:remaining|left)\b/,
      /\bwhat time will\b/,
      /\bwhen (?:will|is|does|can|should)\b.*\b(?:ready|done|finished|complete|completed|repaired|fixed|operational|back)\b/,
      /\brepair/,
      /\bfix(?:ed)?\b/,
    ],
  },
  { intent: 'power_level', patterns: [/\bpower\b/, /\bbatter(?:y|ies)\b/, /\benergy\b/, /\bcharge\b/, /\breactor\b/] },
  {
    intent: 'list_suits',
    patterns: [
      /\b(?:list|which|what|all|available) (?:the |of the |of )?(?:suits|armou?rs)\b/,
      /\bsuits (?:are |do (?:i|we) have)/,
      /\bhow many suits\b/,
    ],
  },
  { intent: 'show_suit', patterns: [/\b(?:show|display|bring up|pull up|select|open|switch to|load|let me see)\b/] },
  {
    intent: 'suit_status',
    patterns: [/\bhow (?:is|s) (?:the )?(?:mark|mk|suit)\b/, /\b(?:suit|armou?r) (?:status|report|condition)\b/, /\bcondition\b/],
  },
  {
    intent: 'status_report',
    patterns: [/\bstatus\b/, /\bsitrep\b/, /\breport\b/, /\bhow are (?:we|things) (?:doing|looking)\b/, /\bupdate me\b/, /\bbring me up to speed\b/],
  },
  { intent: 'time', patterns: [/\bwhat time\b/, /\btime is it\b/, /\bcurrent time\b/] },
  { intent: 'joke', patterns: [/\bjoke\b/, /\bmake me laugh\b/, /\bsomething funny\b/, /\bamuse me\b/] },
  { intent: 'thanks', patterns: [/\bthank(?:s| you)\b/, /\bcheers\b/, /\b(?:good|great|nice) (?:job|work)\b/, /\bwell done\b/] },
  {
    intent: 'greeting',
    patterns: [
      /^(?:hello|hi|hey|yo|greetings|good (?:morning|afternoon|evening|day))\b/,
      /\bare you (?:there|awake|online)\b/,
      /\byou there\b/,
      /\bwake up\b/,
      /\bhow are you\b/,
      /\b(?:im|i am) (?:home|back)\b/,
    ],
  },
];

/** Intents that operate on a specific suit. */
const SUIT_INTENTS: ReadonlySet<Intent> = new Set(['suit_status', 'repair_estimate', 'diagnostics', 'power_level', 'show_suit']);

export function interpretCommand(rawText: string, context: InterpreterContext): Interpretation {
  const normalizedText = normalizeCommand(rawText);
  const base = { rawText, normalizedText, params: {} };

  if (!rawText.trim()) {
    return { ...base, intent: 'unknown', recognized: false, error: 'empty_input' };
  }
  // A bare wake word ("JARVIS?") is a greeting.
  if (!normalizedText) {
    return { ...base, intent: 'greeting', recognized: true };
  }

  const rule = RULES.find((r) => r.patterns.some((p) => p.test(normalizedText)));
  const reference = findSuitReference(normalizedText, context.suits);
  let intent: Intent = rule?.intent ?? 'unknown';

  // "What's the status of the Mark XLIII?" is about one suit; "status report" is about everything.
  if (intent === 'status_report' && reference) intent = 'suit_status';
  // A bare suit name ("Mark XLIII?") reads as a status request.
  if (intent === 'unknown' && reference && normalizedText.split(' ').length <= 4) intent = 'suit_status';

  if (intent === 'unknown') {
    return { ...base, intent, recognized: false };
  }

  const interpretation: Interpretation = {
    ...base,
    intent,
    recognized: true,
    params: rule?.easterEgg ? { easterEgg: rule.easterEgg } : {},
  };

  if (SUIT_INTENTS.has(intent)) {
    if (reference?.suitId) {
      interpretation.params = { suitId: reference.suitId, suitExplicit: true };
    } else if (reference?.unresolved) {
      interpretation.params = { suitQuery: reference.unresolved, suitExplicit: true };
      interpretation.error = 'suit_not_found';
    } else if (context.selectedSuitId && context.suits.some((s) => s.id === context.selectedSuitId)) {
      interpretation.params = { suitId: context.selectedSuitId, suitExplicit: false };
    } else {
      interpretation.error = 'suit_not_found';
    }
  }

  return interpretation;
}
