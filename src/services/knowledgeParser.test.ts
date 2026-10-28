import { describe, expect, it } from 'vitest';
import { FIXTURE_MARKDOWN } from '../test/fixture';
import { parseKnowledgeMarkdown, tidyTitle } from './knowledgeParser';

const kb = parseKnowledgeMarkdown(FIXTURE_MARKDOWN, 'fixture.md', 0);
const doc = (id: string) => {
  const d = kb.docs.find((x) => x.id === id);
  if (!d) throw new Error(`missing ${id}`);
  return d;
};

describe('parseKnowledgeMarkdown', () => {
  it('splits pages on --- separators', () => {
    expect(kb.docs.map((d) => d.id)).toEqual([
      'orion-heights',
      'lyrium-tower-1',
      'two-lyrium',
      'vega-center',
      'vega',
      'petty-fund-pf',
      'brands',
      'project-playbook',
    ]);
  });

  it('extracts title, summary, facts and source metadata', () => {
    const orion = doc('orion-heights');
    expect(orion.title).toBe('Orion Heights Residences');
    expect(orion.summary).toMatch(/^Orion Heights Residences is a fictional/);
    expect(orion.facts).toMatchObject({ Status: 'RFO', Location: 'Example Avenue, Test District', Units: '250', 'Turnover date': '2030' });
    expect(orion.sourceFile).toBe('ORION-HEIGHTS.aspx');
    expect(orion.sharepointSite).toBe('https://example.sharepoint.com/sites/TestKB');
    expect(orion.category).toBe('project');
  });

  it('drops navigation sections and keeps content sections', () => {
    const headings = doc('orion-heights').sections.map((s) => s.heading);
    expect(headings).not.toContain('Quick Links');
    expect(headings).not.toContain('Chat with AFAIK Agent');
    expect(headings).not.toContain('Source');
    expect(headings).toContain('Amenities');
  });

  it('keeps external URLs but never expands SharePoint-relative links', () => {
    const socials = doc('orion-heights').sections.find((s) => s.heading === 'Socials & Websites');
    expect(socials?.links).toEqual([{ label: 'Orion Heights - Facebook', url: 'https://www.facebook.com/example-orion/' }]);
    const docs = doc('petty-fund-pf').sections.find((s) => /related documents/i.test(s.heading));
    expect(docs?.links).toEqual([{ label: 'PF Form', url: null }]);
  });

  it('reads Location headings as facts and categorises buildings and procedures', () => {
    expect(doc('vega-center').facts.Location).toBe('Sample Street, North Test District');
    expect(doc('vega-center').category).toBe('building');
    expect(doc('petty-fund-pf').category).toBe('procedure');
    expect(doc('petty-fund-pf').facts['Approval time']).toBe('2 to 3 working days.');
  });

  it('records page references grouped under their paragraph', () => {
    expect(doc('brands').refGroups).toEqual([
      { context: 'Filigree is the fictional luxury brand used in tests.', refs: ['ORION-HEIGHTS.aspx'] },
      { context: 'As a fictional high-end arm, the company stewards the Prestige brand, including Two Lyrium.', refs: ['LYRIUM-TOWER-1.aspx'] },
    ]);
    expect(doc('project-playbook').refGroups[0]?.refs).toEqual(['ORION-HEIGHTS.aspx', 'LYRIUM-TOWER-1.aspx']);
  });

  it('builds aliases including abbreviations', () => {
    expect(doc('petty-fund-pf').aliases).toEqual(expect.arrayContaining(['petty fund request', 'petty fund', 'pf']));
  });

  it('rejects files with no pages', () => {
    expect(() => parseKnowledgeMarkdown('hello', 'x.md')).toThrow(/No knowledge pages/);
  });
});

describe('tidyTitle', () => {
  it('title-cases all-caps titles but keeps acronyms', () => {
    expect(tidyTitle('ORION HEIGHTS RESIDENCES')).toBe('Orion Heights Residences');
    expect(tidyTitle('TWO LYRA')).toBe('Two Lyra');
    expect(tidyTitle('AFAIK REQUEST')).toBe('AFAIK Request');
    expect(tidyTitle('Perks&Benefits')).toBe('Perks & Benefits');
    expect(tidyTitle('Filinvest-Emegency-Contacts')).toBe('Filinvest Emegency Contacts');
  });
});
