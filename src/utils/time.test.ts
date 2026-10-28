import { describe, expect, it } from 'vitest';
import {
  durations,
  formatCountdown,
  formatDurationSpoken,
  getRepairRemainingMs,
  markNumberFromDesignation,
  numberToWords,
  parseMarkNumber,
  romanToNumber,
  toSpeakable,
} from './time';

const { MINUTE_MS, HOUR_MS, DAY_MS } = durations;

describe('repair time remaining', () => {
  const now = Date.UTC(2026, 9, 31, 18, 0, 0);

  it('derives remaining time from the configured completion timestamp', () => {
    const completesAt = new Date(now + 2 * HOUR_MS + 40 * MINUTE_MS).toISOString();
    expect(getRepairRemainingMs(completesAt, now)).toBe(2 * HOUR_MS + 40 * MINUTE_MS);
  });

  it('counts down as time passes', () => {
    const completesAt = new Date(now + HOUR_MS).toISOString();
    expect(formatCountdown(getRepairRemainingMs(completesAt, now) ?? 0)).toBe('01:00:00');
    expect(formatCountdown(getRepairRemainingMs(completesAt, now + 1000) ?? 0)).toBe('00:59:59');
    expect(formatCountdown(getRepairRemainingMs(completesAt, now + 61_000) ?? 0)).toBe('00:58:59');
  });

  it('returns negative values once the window has passed', () => {
    expect(getRepairRemainingMs(new Date(now - 5000).toISOString(), now)).toBe(-5000);
  });

  it('returns null for missing or invalid timestamps', () => {
    expect(getRepairRemainingMs(null, now)).toBeNull();
    expect(getRepairRemainingMs('not a date', now)).toBeNull();
  });
});

describe('formatCountdown', () => {
  it('clamps at zero and shows days', () => {
    expect(formatCountdown(-1)).toBe('00:00:00');
    expect(formatCountdown(DAY_MS + 3 * HOUR_MS + 5000)).toBe('1d 03:00:05');
  });
});

describe('formatDurationSpoken', () => {
  it.each([
    [2 * HOUR_MS + 40 * MINUTE_MS, 'two hours and forty minutes'],
    [2 * HOUR_MS + 40 * MINUTE_MS - 1000, 'two hours and forty minutes'],
    [HOUR_MS, 'one hour'],
    [MINUTE_MS, 'one minute'],
    [30_000, 'less than a minute'],
    [DAY_MS + HOUR_MS + MINUTE_MS, 'one day, one hour and one minute'],
    [9 * HOUR_MS + 15 * MINUTE_MS, 'nine hours and fifteen minutes'],
  ])('%i ms → "%s"', (ms, expected) => {
    expect(formatDurationSpoken(ms)).toBe(expected);
  });
});

describe('numbers and designations', () => {
  it('converts numbers to words', () => {
    expect(numberToWords(43)).toBe('forty-three');
    expect(numberToWords(7)).toBe('seven');
    expect(numberToWords(100)).toBe('one hundred');
  });

  it('parses canonical Roman numerals only', () => {
    expect(romanToNumber('XLIII')).toBe(43);
    expect(romanToNumber('xliv')).toBe(44);
    expect(romanToNumber('IIII')).toBeNull();
  });

  it('parses mark numbers in several forms', () => {
    expect(parseMarkNumber('43')).toBe(43);
    expect(parseMarkNumber('XLIII')).toBe(43);
    expect(parseMarkNumber('forty three')).toBe(43);
    expect(parseMarkNumber('forty-three')).toBe(43);
    expect(markNumberFromDesignation('MK-43')).toBe(43);
    expect(markNumberFromDesignation('Hulkbuster')).toBeNull();
  });

  it('makes designations speakable', () => {
    expect(toSpeakable('The Mark XLIII is at 74% power.')).toBe('The Mark forty-three is at 74 percent power.');
    expect(toSpeakable('I am AFAIK. A.F.A.I.K. is online.')).toBe('I am A. F. A. I. K. A. F. A. I. K. is online.');
  });
});
