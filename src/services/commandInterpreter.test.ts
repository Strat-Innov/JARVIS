import { describe, expect, it } from 'vitest';
import { createDemoSuits, PRIMARY_SUIT_ID } from '../data/demoData';
import { containsWakeWord, interpretCommand, normalizeCommand } from './commandInterpreter';

const suits = createDemoSuits(Date.UTC(2026, 9, 31, 18, 0));
const ctx = { suits, selectedSuitId: PRIMARY_SUIT_ID };
const intentOf = (text: string) => interpretCommand(text, ctx).intent;

describe('normalizeCommand', () => {
  it('strips punctuation, case and a leading or trailing wake word', () => {
    expect(normalizeCommand('JARVIS, status report.')).toBe('status report');
    expect(normalizeCommand('Hey Jarvis — what’s the time?')).toBe('whats the time');
    expect(normalizeCommand('Status report, JARVIS')).toBe('status report');
  });

  it('keeps the wake word when it is part of the sentence', () => {
    expect(normalizeCommand('What does Jarvis stand for?')).toBe('what does jarvis stand for');
  });
});

describe('containsWakeWord', () => {
  it('detects common recognitions of the wake word', () => {
    expect(containsWakeWord('ok Jarvis run diagnostics')).toBe(true);
    expect(containsWakeWord('Jervis are you there')).toBe(true);
    expect(containsWakeWord('run diagnostics')).toBe(false);
  });
});

describe('interpretCommand — required commands', () => {
  it.each([
    ['JARVIS, status report.', 'status_report'],
    ['How long for the repair for the Mark XLIII?', 'repair_estimate'],
    ["What's the status of the Mark XLIII?", 'suit_status'],
    ['Run diagnostics.', 'diagnostics'],
    ['How much power remains?', 'power_level'],
    ['Show me the Mark XLIII.', 'show_suit'],
    ['Activate party mode.', 'party_on'],
    ['Deactivate party mode.', 'party_off'],
    ['What can you do?', 'help'],
    ['Go to standby.', 'standby'],
  ])('"%s" → %s', (text, intent) => {
    const result = interpretCommand(text, ctx);
    expect(result.intent).toBe(intent);
    expect(result.recognized).toBe(true);
  });
});

describe('interpretCommand — phrasing variations', () => {
  it.each([
    ['When will the Mark 43 be ready?', 'repair_estimate'],
    ['ETA on the mark forty three', 'repair_estimate'],
    ['Time remaining on repairs', 'repair_estimate'],
    ['How are the repairs coming along', 'repair_estimate'],
    ['Battery level', 'power_level'],
    ['Perform a full system scan', 'diagnostics'],
    ['Bring up the Hulkbuster', 'show_suit'],
    ['Turn off party mode', 'party_off'],
    ["Let's party", 'party_on'],
    ['Stand down', 'standby'],
    ['That will be all', 'standby'],
    ['Welcome our guests', 'welcome_guests'],
    ['Say hello to everyone', 'welcome_guests'],
    ['Tell me a joke', 'joke'],
    ['What time is it?', 'time'],
    ['Good evening Jarvis', 'greeting'],
    ['Jarvis', 'greeting'],
    ['Which suits do we have?', 'list_suits'],
    ['I am Iron Man', 'easter_egg'],
    ['Happy Halloween!', 'easter_egg'],
    ['Mark XLIII?', 'suit_status'],
  ])('"%s" → %s', (text, intent) => {
    expect(intentOf(text)).toBe(intent);
  });
});

describe('interpretCommand — suit resolution', () => {
  it.each(['Mark XLIII', 'mark 43', 'Mark forty-three', 'MK-43', 'mark forty three', 'mk43'])(
    'resolves "%s" to the Mark XLIII',
    (designation) => {
      const result = interpretCommand(`How long for the repair on the ${designation}?`, { suits, selectedSuitId: 'mark-42' });
      expect(result.params.suitId).toBe('mark-43');
      expect(result.params.suitExplicit).toBe(true);
    },
  );

  it('resolves suits by name', () => {
    expect(interpretCommand('Hulkbuster power level', ctx).params.suitId).toBe('mark-44');
  });

  it('falls back to the selected suit when none is named', () => {
    const result = interpretCommand('How long until repairs are done?', { suits, selectedSuitId: 'mark-44' });
    expect(result.params).toEqual({ suitId: 'mark-44', suitExplicit: false });
  });

  it('reports an unknown designation instead of substituting another suit', () => {
    const result = interpretCommand('Status of the Mark 50', ctx);
    expect(result.error).toBe('suit_not_found');
    expect(result.params.suitId).toBeUndefined();
    expect(result.params.suitQuery).toBe('Mark L');
  });

  it('distinguishes Mark VIII from Mark VII', () => {
    expect(interpretCommand('status of the mark viii', ctx).error).toBe('suit_not_found');
    expect(interpretCommand('status of the mark vii', ctx).params.suitId).toBe('mark-7');
  });
});

describe('interpretCommand — unrecognised input', () => {
  it('marks unknown commands as unrecognised', () => {
    const result = interpretCommand('Order a pizza to the roof', ctx);
    expect(result.intent).toBe('unknown');
    expect(result.recognized).toBe(false);
  });

  it('flags empty input', () => {
    expect(interpretCommand('   ', ctx).error).toBe('empty_input');
  });
});
