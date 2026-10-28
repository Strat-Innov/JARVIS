import { describe, expect, it } from 'vitest';
import { createDemoSuits, PRIMARY_SUIT_ID } from '../data/demoData';
import type { Suit } from '../types/jarvis';
import { durations } from '../utils/time';
import { processCommand, type ResponseContext } from './responseEngine';

const NOW = Date.UTC(2026, 9, 31, 18, 0);
const first = () => 0;

function context(overrides: Partial<ResponseContext> = {}): ResponseContext {
  return { suits: createDemoSuits(NOW), selectedSuitId: PRIMARY_SUIT_ID, partyMode: false, now: NOW, random: first, ...overrides };
}

function withSuit(patch: Partial<Suit>): Suit[] {
  return createDemoSuits(NOW).map((s) => (s.id === PRIMARY_SUIT_ID ? { ...s, ...patch } : s));
}

describe('repair estimates', () => {
  it('answers the Mark XLIII repair query from configured data', () => {
    const { response } = processCommand('JARVIS, how long for the repair for the Mark XLIII?', context());
    expect(response.display).toContain('Mark XLIII');
    expect(response.display).toContain('two hours and forty minutes');
    expect(response.display).toContain('68% complete');
    expect(response.speech).toContain('Mark forty-three');
    expect(response.speech).toContain('68 percent');
  });

  it('reflects edited completion times', () => {
    const suits = withSuit({ repairCompletesAt: new Date(NOW + 25 * durations.MINUTE_MS).toISOString() });
    expect(processCommand('how long for the mark 43', context({ suits })).response.display).toContain('twenty-five minutes');
  });

  it('says the estimate is unavailable when the completion time is missing', () => {
    const suits = withSuit({ repairCompletesAt: null });
    const { display } = processCommand('how long for the mark 43', context({ suits })).response;
    expect(display).toMatch(/estimate is unavailable/);
    expect(display).not.toMatch(/hour|minute/);
  });

  it('does not invent completion when the window has elapsed', () => {
    const suits = withSuit({ repairCompletesAt: new Date(NOW - 1000).toISOString() });
    expect(processCommand('how long for the mark 43', context({ suits })).response.display).toMatch(/has elapsed/);
  });

  it('omits progress when it is not recorded', () => {
    const suits = withSuit({ repairProgress: null });
    expect(processCommand('how long for the mark 43', context({ suits })).response.display).not.toMatch(/% complete/);
  });

  it('reports operational suits without a repair time', () => {
    expect(processCommand('how long for the repair on the mark 42', context()).response.display).toMatch(/fully operational/);
  });
});

describe('missing and unknown data', () => {
  it('reports unavailable power telemetry instead of a number', () => {
    const { display } = processCommand('power level of the mark vii', context()).response;
    expect(display).toBe('Power telemetry for the Mark VII is unavailable.');
  });

  it('does not fabricate data for an unknown suit', () => {
    const { display, actions } = processCommand('how long for the repair on the mark 50', context()).response;
    expect(display).toBe("I'm afraid I have no record of a Mark L, sir.");
    expect(actions).toEqual([]);
  });

  it('gives the standard response for unknown commands with no data', () => {
    const { interpretation, response } = processCommand('order a pizza', context());
    expect(interpretation.recognized).toBe(false);
    expect(response.display).toBe("I'm sorry, sir. That function is not currently available.");
    expect(response.display).not.toMatch(/\d/);
  });

  it('asks for a suit when nothing is selected', () => {
    const { display } = processCommand('run diagnostics', context({ selectedSuitId: null })).response;
    expect(display).toMatch(/Which suit/);
  });
});

describe('actions', () => {
  it('selects the suit when showing it', () => {
    expect(processCommand('show me the hulkbuster', context()).response.actions).toEqual([{ type: 'select-suit', suitId: 'mark-44' }]);
  });

  it('runs diagnostics using configured status and notes', () => {
    const { display, actions } = processCommand('run diagnostics', context()).response;
    expect(display).toContain('Diagnostics report minor warnings.');
    expect(display).toContain('Left repulsor recalibration');
    expect(actions).toContainEqual({ type: 'diagnostics-run', suitId: PRIMARY_SUIT_ID });
  });

  it('issues standby', () => {
    expect(processCommand('go to standby', context()).response.actions).toEqual([{ type: 'standby' }]);
  });
});

describe('party mode', () => {
  it('activates with a boot sequence and can be deactivated', () => {
    const on = processCommand('activate party mode', context()).response;
    expect(on.actions).toEqual([{ type: 'set-party-mode', enabled: true }]);
    expect(on.bootSequence).toBe(true);
    const off = processCommand('deactivate party mode', context({ partyMode: true })).response;
    expect(off.actions).toEqual([{ type: 'set-party-mode', enabled: false }]);
  });

  it('does not change factual repair answers', () => {
    const normal = processCommand('how long for the mark 43', context()).response.display;
    const party = processCommand('how long for the mark 43', context({ partyMode: true })).response.display;
    expect(party).toBe(normal);
  });

  it('keeps diagnostic facts and labels the joke', () => {
    const { display } = processCommand('run diagnostics', context({ partyMode: true })).response;
    expect(display).toContain('Diagnostics report minor warnings.');
    expect(display).toContain('That part is a joke');
  });
});

describe('status report', () => {
  it('summarises the roster from configured data', () => {
    const { display } = processCommand('status report', context()).response;
    expect(display).toContain('4 suits on record: 1 operational, 1 under repair, 1 damaged, 1 offline.');
    expect(display).toContain('Mark XLIII is undergoing repairs, 68% complete');
  });
});
