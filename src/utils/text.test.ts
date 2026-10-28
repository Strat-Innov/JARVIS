import { describe, expect, it } from 'vitest';
import { linesToSentences, numberToWords, toSpeakable, truncateForSpeech } from './text';

describe('toSpeakable', () => {
  it('reads pesos, ranges, sizes and bedrooms naturally', () => {
    expect(toSpeakable('1-BR Unit 52–60 sqm ₱14.4M–₱19.1M')).toBe('one-bedroom Unit 52 to 60 square metres 14.4 million to 19.1 million pesos');
    expect(toSpeakable('Price/sqm ₱301.0k')).toBe('Price per square metre 301 thousand pesos');
    expect(toSpeakable('Standard Rate: PHP 20.00')).toBe('Standard Rate: 20 pesos');
    expect(toSpeakable('payable over 48 mos; 10% discount')).toBe('payable over 48 months; 10 percent discount');
    expect(toSpeakable('Status: RFO')).toBe('Status: ready for occupancy');
  });

  it('drops emails and URLs and spells the assistant name', () => {
    expect(toSpeakable('Ana Cruz — Manager — ana.cruz@example.com')).toBe('Ana Cruz, Manager');
    expect(toSpeakable('See https://example.com/x now')).toBe('See now');
    expect(toSpeakable('I am AFAIK.')).toBe('I am A. F. A. I. K.');
  });
});

describe('speech helpers', () => {
  it('truncates at a sentence boundary', () => {
    const text = `${'Alpha beta gamma. '.repeat(30)}`;
    const { text: short, truncated } = truncateForSpeech(text, 100);
    expect(truncated).toBe(true);
    expect(short.endsWith('.')).toBe(true);
    expect(short.length).toBeLessThanOrEqual(100);
  });

  it('joins list lines into sentences', () => {
    expect(linesToSentences(['Lap Pool', 'Gym.', ''])).toBe('Lap Pool. Gym.');
  });

  it('converts numbers to words', () => {
    expect(numberToWords(43)).toBe('forty-three');
    expect(numberToWords(100)).toBe('one hundred');
  });
});
