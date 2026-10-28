/**
 * Response engine: turns an Interpretation into spoken/displayed text and UI actions.
 *
 * Facts (repair times, power, diagnostics) come only from the configured suit data.
 * Randomness is limited to phrasing and clearly humorous party-mode lines.
 */
import type { AssistantAction, AssistantResponse, CommandOutcome, Interpretation, Suit } from '../types/afaik';
import { formatClockTime, formatDurationSpoken, getRepairRemainingMs, toSpeakable } from '../utils/time';
import { interpretCommand, type InterpreterContext } from './commandInterpreter';

export interface ResponseContext extends InterpreterContext {
  partyMode: boolean;
  now: number;
  /** Injectable for deterministic tests. Defaults to Math.random. */
  random?: () => number;
}

const pick = <T>(items: readonly T[], random: () => number): T =>
  items[Math.min(items.length - 1, Math.floor(random() * items.length))] as T;

/* ---------------------------------------------------------------- templates */

const GREETINGS = ['At your service, sir.', 'Yes, sir?', 'Good to see you, sir. All systems are online.', 'I am here, sir. How may I help?'];
const PARTY_GREETINGS = [
  'Good evening, sir. The party is in full swing and the suits are behaving. Mostly.',
  'Yes, sir? I was just admiring the costumes. Several of them are very nearly regulation.',
  'At your service. Party protocol remains active, and my sarcasm reserves are fully charged.',
];
const UNKNOWN = [
  "I'm sorry, sir. That function is not currently available.",
  "I'm afraid that is beyond my current capabilities, sir.",
  "I'm sorry, sir. I didn't quite follow that. Try asking, \"What can you do?\"",
];
const PARTY_UNKNOWN = [
  "I'm sorry, sir. That function is not currently available. I blame the punch.",
  "I'm afraid that's beyond my capabilities, sir. Even with party protocol engaged.",
];
const STANDBY = ['Going to standby, sir.', "Very well. I'll be here if you need me.", 'Standing by, sir.'];
const THANKS = ["You're welcome, sir.", 'Always a pleasure, sir.', 'Happy to help.', 'Of course, sir.'];
const JOKES = [
  'Why did the skeleton skip the party, sir? He had no body to go with.',
  "I tried to write a joke about the Mark Seven's armour plating, but it didn't land well.",
  "Why don't skeletons ever fight each other, sir? They don't have the guts.",
  'Why are vampires so easy to fool? They are suckers for a good story.',
  'I would tell you a joke about repulsors, sir, but it might blow you away.',
  'Why did the pumpkin get promoted? He was outstanding in his field.',
];
const PARTY_DIAGNOSTIC_ASIDES = [
  'Additionally, sensors indicate a worrying shortage of chocolate in the vicinity. That part is a joke, sir.',
  'On an unrelated note, the dance floor appears structurally sound. That part is a joke, sir.',
  'Also, the punch bowl is holding steady. I am choosing not to analyse its contents.',
];
const WELCOME = [
  'Good evening, everyone, and welcome. I am AFAIK. Please enjoy yourselves — and do try not to touch the suits.',
  'Ladies and gentlemen, welcome. The workshop is open, the suits are on display, and I am monitoring everything. Have a wonderful evening.',
];
const PARTY_WELCOME = [
  'Good evening, ladies and gentlemen, and welcome to the workshop. Refreshments are to your left, the suits are to your right, and the exits are wherever the repulsors are not pointing. Happy Halloween.',
  "Welcome, everyone. Tonight's costumes have been scanned and approved. Mostly. Please enjoy the party, and kindly leave the armour where you found it.",
];
const EASTER_EGGS: Record<string, readonly string[]> = {
  self_destruct: ['Self-destruct declined, sir. The suits have done nothing to deserve it, and the cleaning bill would be considerable.'],
  iron_man: ['Yes, sir. I am aware. Though tonight, I suspect the costume is doing most of the work.', 'Noted, sir. I will update the guest list accordingly.'],
  halloween: ['Happy Halloween, sir. I would hand out sweets, but I am afraid I lack hands.', 'Trick or treat noted. I recommend the treat. My tricks require planning permission.'],
  costume: ['Costume assessment: bold, confident, and very nearly regulation. I would give it a nine out of ten, sir. The missing point is for the lack of flight capability.'],
  alive: ['I am a rather sophisticated collection of if-statements, sir. But thank you for asking.'],
  pod_bay: ['Wrong film, sir. But I do appreciate the reference.'],
  coffee: ['I would, sir, but my beverage subroutines were never installed. Perhaps one of your guests could oblige.'],
  dance: ['I am afraid I do not dance, sir. I do, however, compute rhythm with tremendous precision.'],
  acronym: ['As Far As I Know, sir. Which, where the suits are concerned, is precisely what the Workshop records say. Nothing more.'],
};

/* ------------------------------------------------------------- suit phrases */

function findSuit(suits: readonly Suit[], id: string | undefined): Suit | undefined {
  return id ? suits.find((s) => s.id === id) : undefined;
}

function powerSentence(suit: Suit): string {
  if (suit.powerLevel === null) return `Power telemetry for the ${suit.name} is unavailable.`;
  const level = Math.round(suit.powerLevel);
  const advice = level < 25 ? ' I would recommend recharging before any heroics, sir.' : '';
  return `The ${suit.name} is at ${level}% power.${advice}`;
}

function diagnosticSentence(suit: Suit): string {
  switch (suit.diagnosticStatus) {
    case 'nominal':
      return 'All systems are nominal.';
    case 'warning':
      return 'Diagnostics report minor warnings.';
    case 'critical':
      return 'Diagnostics report critical faults.';
    case 'unknown':
      return 'Diagnostic data is unavailable.';
  }
}

/** Describes repair state using configured data only. Never substitutes a value for a missing field. */
function repairSentence(suit: Suit, now: number, random: () => number): string {
  const progress = suit.repairProgress === null ? null : Math.round(suit.repairProgress);
  const remaining = getRepairRemainingMs(suit.repairCompletesAt, now);

  if (suit.repairStatus === 'operational') {
    return `The ${suit.name} is fully operational, sir. No repairs are scheduled.`;
  }
  if (suit.repairStatus === 'offline' && remaining === null) {
    return `The ${suit.name} is offline, and I have no repair estimate on file.`;
  }

  const state = suit.repairStatus === 'damaged' ? 'is damaged and awaiting repairs' : 'is currently undergoing repairs';
  const progressNote = progress === null ? '' : ` Repairs are ${progress}% complete.`;

  if (remaining === null) {
    return `The ${suit.name} ${state}.${progressNote} I'm afraid a completion estimate is unavailable, sir.`;
  }
  if (remaining <= 0) {
    return `The scheduled repair window for the ${suit.name} has elapsed, sir. The workshop has not yet confirmed completion.${progressNote}`;
  }

  const duration = formatDurationSpoken(remaining);
  const eta = formatClockTime(now + remaining);
  return pick(
    [
      `Certainly, sir. The ${suit.name} ${state}. Estimated time to completion is ${duration}, at approximately ${eta}.${progressNote}`,
      `The ${suit.name} has approximately ${duration} remaining before completion, sir.${progressNote}`,
      `Repairs on the ${suit.name} should be complete in approximately ${duration}, around ${eta}.${progressNote}`,
    ],
    random,
  );
}

function suitStatusSentence(suit: Suit, now: number): string {
  const remaining = getRepairRemainingMs(suit.repairCompletesAt, now);
  let repair: string;
  switch (suit.repairStatus) {
    case 'operational':
      repair = `The ${suit.name} is fully operational.`;
      break;
    case 'offline':
      repair = `The ${suit.name} is offline.`;
      break;
    case 'damaged':
    case 'repairing': {
      const verb = suit.repairStatus === 'damaged' ? 'is damaged and awaiting repairs' : 'is undergoing repairs';
      const progress = suit.repairProgress === null ? '' : `, ${Math.round(suit.repairProgress)}% complete`;
      const time =
        remaining === null
          ? '. No completion estimate is on file'
          : remaining <= 0
            ? '. The scheduled repair window has elapsed'
            : `, with approximately ${formatDurationSpoken(remaining)} remaining`;
      repair = `The ${suit.name} ${verb}${progress}${time}.`;
      break;
    }
  }
  const power = suit.powerLevel === null ? 'Power level unavailable.' : `Power at ${Math.round(suit.powerLevel)}%.`;
  return `${repair} ${power} ${diagnosticSentence(suit)}`;
}

function statusReport(ctx: ResponseContext): string {
  const { suits } = ctx;
  if (suits.length === 0) return 'All systems online, sir. There are no suits on record.';
  const count = (status: Suit['repairStatus']) => suits.filter((s) => s.repairStatus === status).length;
  const parts = [
    [count('operational'), 'operational'],
    [count('repairing'), 'under repair'],
    [count('damaged'), 'damaged'],
    [count('offline'), 'offline'],
  ]
    .filter(([n]) => (n as number) > 0)
    .map(([n, label]) => `${n} ${label}`);
  const roster = `${suits.length} ${suits.length === 1 ? 'suit' : 'suits'} on record: ${parts.join(', ')}.`;
  const selected = findSuit(suits, ctx.selectedSuitId ?? undefined);
  const focus = selected ? ` ${suitStatusSentence(selected, ctx.now)}` : '';
  const party = ctx.partyMode ? ' Party protocol is active.' : '';
  return `All systems online, sir. ${roster}${focus}${party}`;
}

function listSuits(suits: readonly Suit[]): string {
  if (suits.length === 0) return 'There are no suits on record, sir.';
  const names = suits.map((s) => s.name);
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `There ${suits.length === 1 ? 'is one suit' : `are ${suits.length} suits`} on record: ${list}.`;
}

function helpText(): string {
  return 'I can give you a status report, repair estimates, power levels and diagnostics for any suit on record. I can also display a suit, tell you the time, welcome your guests, and engage party mode. Simply ask.';
}

/* ------------------------------------------------------------------- engine */

function reply(display: string, actions: AssistantAction[] = [], processingMs = 450, bootSequence = false): AssistantResponse {
  return { display, speech: toSpeakable(display), actions, processingMs, bootSequence };
}

function missingSuit(interpretation: Interpretation, suits: readonly Suit[]): AssistantResponse {
  if (interpretation.params.suitQuery) {
    return reply(`I'm afraid I have no record of a ${interpretation.params.suitQuery}, sir.`);
  }
  if (suits.length === 0) return reply('There are no suits on record, sir. You can add one in the Workshop.');
  return reply('Which suit, sir? Please specify a designation, such as the Mark XLIII.');
}

export function generateResponse(interpretation: Interpretation, ctx: ResponseContext): AssistantResponse {
  const random = ctx.random ?? Math.random;
  const { now, partyMode, suits } = ctx;
  const suit = findSuit(suits, interpretation.params.suitId);

  if (interpretation.error === 'empty_input') return reply("I didn't catch that, sir.");

  switch (interpretation.intent) {
    case 'greeting':
      return reply(pick(partyMode ? PARTY_GREETINGS : GREETINGS, random));

    case 'status_report':
      return reply(statusReport(ctx), [], 900);

    case 'suit_status':
      if (!suit) return missingSuit(interpretation, suits);
      return reply(suitStatusSentence(suit, now), [{ type: 'select-suit', suitId: suit.id }], 600);

    case 'repair_estimate':
      if (!suit) return missingSuit(interpretation, suits);
      return reply(repairSentence(suit, now, random), [{ type: 'select-suit', suitId: suit.id }], 600);

    case 'power_level':
      if (!suit) return missingSuit(interpretation, suits);
      return reply(powerSentence(suit), [{ type: 'select-suit', suitId: suit.id }], 500);

    case 'diagnostics': {
      if (!suit) return missingSuit(interpretation, suits);
      const notes = suit.notes.trim() ? ` Workshop notes: ${suit.notes.trim().replace(/[.!?]?$/, '.')}` : '';
      const aside = partyMode ? ` ${pick(PARTY_DIAGNOSTIC_ASIDES, random)}` : '';
      return reply(
        `Diagnostics complete for the ${suit.name}. ${diagnosticSentence(suit)}${notes}${aside}`,
        [{ type: 'select-suit', suitId: suit.id }, { type: 'diagnostics-run', suitId: suit.id }],
        1800,
      );
    }

    case 'show_suit':
      if (!suit) return missingSuit(interpretation, suits);
      return reply(
        pick([`Displaying the ${suit.name}, sir.`, `Bringing up the ${suit.name} now.`, `Here is the ${suit.name}, sir.`], random),
        [{ type: 'select-suit', suitId: suit.id }],
        400,
      );

    case 'list_suits':
      return reply(listSuits(suits));

    case 'party_on':
      if (partyMode) return reply("Party protocol is already active, sir. Any more festive and I'd need a costume of my own.");
      return reply(
        'Initiating party protocol. Lighting set to dramatic. Sarcasm reserves at full capacity. Good evening, ladies and gentlemen, and welcome to the workshop.',
        [{ type: 'set-party-mode', enabled: true }],
        1600,
        true,
      );

    case 'party_off':
      if (!partyMode) return reply('Party mode is not currently active, sir.');
      return reply('Party protocol disengaged. Returning to standard operating parameters. It was fun while it lasted, sir.', [
        { type: 'set-party-mode', enabled: false },
      ]);

    case 'help':
      return reply(helpText());

    case 'standby':
      return reply(pick(STANDBY, random), [{ type: 'standby' }], 300);

    case 'time':
      return reply(`It is ${formatClockTime(now)}, sir.`);

    case 'welcome_guests':
      return reply(pick(partyMode ? PARTY_WELCOME : WELCOME, random));

    case 'joke':
      return reply(pick(JOKES, random));

    case 'thanks':
      return reply(pick(THANKS, random));

    case 'identity':
      return reply(
        'I am AFAIK. As Far As I Know. I look after the workshop, monitor the suits, and occasionally keep you out of trouble, sir.',
      );

    case 'easter_egg': {
      const lines = EASTER_EGGS[interpretation.params.easterEgg ?? ''];
      return reply(lines ? pick(lines, random) : pick(UNKNOWN, random));
    }

    case 'unknown':
      return reply(pick(partyMode ? PARTY_UNKNOWN : UNKNOWN, random), [], 350);
  }
}

/** Interprets text and generates the response in one step. */
export function processCommand(text: string, ctx: ResponseContext): CommandOutcome {
  const interpretation = interpretCommand(text, ctx);
  return { interpretation, response: generateResponse(interpretation, ctx) };
}

/** Exposed for the UI's "what can you do" panel. */
export const EXAMPLE_COMMANDS = [
  'Status report',
  'How long for the repair on the Mark XLIII?',
  "What's the status of the Mark XLIII?",
  'Run diagnostics',
  'How much power remains?',
  'Show me the Hulkbuster',
  'Activate party mode',
  'Welcome our guests',
  'Tell me a joke',
  'What can you do?',
  'Go to standby',
] as const;
