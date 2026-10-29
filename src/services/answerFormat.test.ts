import { describe, expect, it } from 'vitest';
import { FIXTURE_MARKDOWN } from '../test/fixture';
import { externalLinks, friendlyLinkName, keyFacts, pairLines } from './answerFormat';
import { parseKnowledgeMarkdown } from './knowledgeParser';
import { processCommand } from './responseEngine';

describe('pairLines', () => {
  it('joins unit labels with their size and price', () => {
    expect(pairLines(['1-BR Unit', '40–50 sqm', '₱10.0M–₱12.5M', 'Price/sqm', '₱250.0k', 'Single Slot', '₱1.20M'])).toEqual([
      '1-BR Unit: 40–50 sqm, ₱10.0M–₱12.5M',
      'Price/sqm: ₱250.0k',
      'Single Slot: ₱1.20M',
    ]);
  });

  it('joins payment labels with their terms, and lists several options as sub-items', () => {
    expect(pairLines(['Cash:', '95% payment; with 10% discount.', 'Deferred:', '30% downpayment over 24 mos', '10% downpayment over 24 mos'])).toEqual([
      'Cash: 95% payment; with 10% discount.',
      'Deferred:',
      '  – 30% downpayment over 24 mos',
      '  – 10% downpayment over 24 mos',
    ]);
  });

  it('leaves plain lists unchanged', () => {
    expect(pairLines(['Lap Pool', 'Gym', 'Lot sizes: 200 – 400 sqm'])).toEqual(['Lap Pool', 'Gym', 'Lot sizes: 200 – 400 sqm']);
  });
});

describe('links and key facts', () => {
  it('names links by their destination', () => {
    expect(friendlyLinkName({ label: 'X | City - Facebook', url: 'https://www.facebook.com/x/' })).toBe('Facebook');
    expect(friendlyLinkName({ label: 'Tour', url: 'https://exsight360.com/tours/x/' })).toBe('360° virtual tour');
    expect(friendlyLinkName({ label: 'Official', url: 'https://www.example.com/x' })).toBe('Website (example.com)');
    expect(friendlyLinkName({ label: 'PF Form', url: null })).toBe('PF Form');
  });

  it('picks the key facts in priority order', () => {
    const kb = parseKnowledgeMarkdown(FIXTURE_MARKDOWN, 'f.md', 0);
    const orion = kb.docs.find((d) => d.id === 'orion-heights');
    if (!orion) throw new Error('missing');
    expect(keyFacts(orion).map(([k]) => k)).toEqual(['Status', 'Location', 'Units', 'Turnover date']);
    expect(externalLinks(orion).map((l) => l.url)).toEqual(['https://www.facebook.com/example-orion/']);
  });
});

describe('page brief', () => {
  const kb = parseKnowledgeMarkdown(FIXTURE_MARKDOWN, 'f.md', 0);
  const ask = (q: string) => processCommand(q, { knowledge: kb, selectedDocId: null, now: 0 }).response;

  it('gives a structured overview from the page content', () => {
    const { display } = ask('Tell me about Orion Heights');
    expect(display).toContain('# Orion Heights Residences');
    expect(display).toContain('## Key details\n• Brand: Filigree\n• Status: RFO');
    expect(display).toContain('## Pricing\nUnits & Pricing:\n• 1-BR Unit: 40–50 sqm, ₱10.0M–₱12.5M\nParking & Pricing:\n• Single Slot: ₱1.20M');
    expect(display).toContain('## Payment terms\n• Cash: 95% payment; with 10% discount.');
    expect(display).toContain('## Amenities\nLap Pool · Gym');
  });

  it('lists links by name with their URLs', () => {
    expect(ask('Links for Orion Heights').display).toContain('• Facebook — https://www.facebook.com/example-orion/');
  });
});
