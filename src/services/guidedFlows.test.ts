import { describe, expect, it } from 'vitest';
import { FIXTURE_MARKDOWN, FIXTURE_STRUCTURE, MASTER_FILE_FIXTURE, QUIRKS_MARKDOWN } from '../test/fixture';
import type { FollowUpOption, KnowledgeDoc } from '../types/afaik';
import { parseKnowledgeMarkdown } from './knowledgeParser';
import { NO_ANSWER, processCommand, resolveFollowUp, type ResponseContext } from './responseEngine';
import { extractSiteStructure } from './siteStructure';

const kb = parseKnowledgeMarkdown(`${FIXTURE_MARKDOWN}\n---\n${QUIRKS_MARKDOWN}`, 'fixture.md', 0, FIXTURE_STRUCTURE);
const doc = (id: string): KnowledgeDoc => {
  const d = kb.docs.find((x) => x.id === id);
  if (!d) throw new Error(`missing ${id}`);
  return d;
};
const section = (id: string, heading: string) => doc(id).sections.filter((s) => s.heading === heading);

/** Drives a conversation, carrying follow-up options and the selected page between turns. */
function conversation() {
  let selectedDocId: string | null = null;
  let pendingOptions: FollowUpOption[] = [];
  return (text: string) => {
    const ctx: ResponseContext = { knowledge: kb, selectedDocId, now: 0, random: () => 0, pendingOptions };
    const outcome = processCommand(text, ctx);
    for (const a of outcome.response.actions) if (a.type === 'select-doc') selectedDocId = a.docId;
    pendingOptions = outcome.response.followUp?.options ?? [];
    return { ...outcome, options: pendingOptions.map((o) => o.label) };
  };
}

describe('export quirks', () => {
  it('assigns grouped headings their own content regardless of order', () => {
    expect(section('nova-ridge', 'Lot Sizes & Pricing')[0]?.lines).toEqual(['Lot sizes: 200 – 400 sqm', 'Price range: P5M – P9M']);
    expect(section('nova-ridge', 'Standard Payment Schemes')[0]?.lines).toEqual([
      'Cash:',
      '100% payment; with 5% discount',
      'Installment:',
      '10% downpayment; 90% final lumpsum payable after 24 mos',
    ]);
    // "Parking Lot" is an amenity here, not parking pricing.
    expect(section('nova-ridge', 'Amenities')[0]?.lines).toEqual(['Clubhouse', 'Parking Lot', 'Jogging Path']);
  });

  it('collects fact values listed on the following lines', () => {
    expect(doc('nova-ridge').facts).toMatchObject({ Lots: '120', 'Turnover date': '2020 (Phase 1); 2024 (Phase 2)' });
  });

  it('labels repeated sections and differing facts by variant', () => {
    const headings = doc('zenith').sections.map((s) => s.heading);
    expect(headings).toContain('Lot Sizes & Pricing — Ready Homes');
    expect(headings).toContain('Lot Sizes & Pricing — Future Homes');
    expect(section('zenith', 'Lot Sizes & Pricing — Future Homes')[0]?.lines).toEqual(['Price range: ₱30M–₱40M']);
    expect(doc('zenith').facts).toMatchObject({ 'Status (Ready Homes)': 'RFO', 'Status (Future Homes)': 'Pre-Selling', Location: 'Test Town' });
  });

  it('re-joins list items the export wrapped mid-sentence', () => {
    expect(section('orbit-mall', 'Parking')[0]?.lines).toEqual(['Capacity: The mall features two basement levels with a total of 300 slots.']);
    expect(doc('orbit-mall').facts.Units).toBe('80 shops');
  });

  it('uses the page name when the first heading is not the title', () => {
    expect(doc('credits').title).toBe('Credits');
  });

  it('classes Project Playbook pages as projects and departments by page', () => {
    expect(doc('orion-heights').category).toBe('project');
    expect(doc('finance').category).toBe('department');
  });
});

describe('Master File structure', () => {
  it('reads card groups, visible labels and links in visual order', () => {
    expect(extractSiteStructure(MASTER_FILE_FIXTURE)).toEqual({
      portfolio: [
        {
          name: 'Townships',
          items: [
            { title: 'Alpha City', sourceFile: 'ALPHA-CITY.aspx', label: 'Filigree', x: 0, y: 2 },
            // Hidden descriptions are ignored.
            { title: 'Beta City', sourceFile: 'BETA-CITY.aspx', label: null, x: 24, y: 2 },
          ],
        },
      ],
      departments: [],
    });
  });

  it('returns null when the pages are absent', () => {
    expect(extractSiteStructure('# nothing')).toBeNull();
  });
});

describe('guided conversations', () => {
  it('portfolio → category → project → detail', () => {
    const say = conversation();
    const portfolio = say('What are our projects?');
    expect(portfolio.interpretation.intent).toBe('portfolio');
    expect(portfolio.response.display).toContain('What would you like to know? Choose a category.');
    expect(portfolio.options).toEqual(['Residentials', 'Leasing']);

    const group = say('Residentials');
    expect(group.interpretation).toMatchObject({ intent: 'portfolio_group', params: { group: 'Residentials' } });
    // Visual order (top-to-bottom, left-to-right) with visible brand labels.
    expect(group.response.display).toContain('• Zenith Homes — Aspire\n• Nova Ridge — Prestige');
    expect(group.options).toEqual(['Zenith Homes', 'Nova Ridge']);

    const project = say('the second one');
    expect(project.interpretation.params).toMatchObject({ docId: 'nova-ridge', field: 'overview' });
    expect(project.response.display).toContain('What would you like to know about Nova Ridge?');
    expect(project.options).toEqual(expect.arrayContaining(['Pricing', 'Payment terms', 'Amenities']));

    const amenities = say('Amenities');
    expect(amenities.response.display).toContain('Clubhouse');
    expect(amenities.response.display).not.toContain('discount');
    expect(amenities.response.display).toContain('Anything else about Nova Ridge?');
  });

  it('Life at FAI → department → section', () => {
    const say = conversation();
    const life = say('What is it like at the office?');
    expect(life.interpretation.intent).toBe('life_at_fai');
    expect(life.response.display).toContain('Work. Learn. Test.');
    expect(life.response.display).toContain('Which department would you like to know about?');
    expect(life.options).toEqual(['Finance Department']);

    const dept = say('Finance');
    expect(dept.interpretation.params).toMatchObject({ docId: 'finance', field: 'overview' });
    expect(dept.options).toEqual(expect.arrayContaining(['People', 'How It Feels Working in Finance at Test Co']));

    const people = say('People');
    expect(people.response.display).toContain('Name: Cara D. Evans · Title: Finance Head · Group: FINANCE LEADS');
  });

  it('answers variant facts per variant', () => {
    const say = conversation();
    say('Tell me about Zenith Homes');
    const status = say('Status');
    expect(status.response.display).toContain('Status (Ready Homes): RFO');
    expect(status.response.display).toContain('Status (Future Homes): Pre-Selling');
  });

  it('cites the Project Playbook card for brands the Brands page does not list', () => {
    const { display } = processCommand('What brand is Nova Ridge?', { knowledge: kb, selectedDocId: null, now: 0 }).response;
    expect(display).toContain('Nova Ridge is listed under Prestige on its Project Playbook card.');
  });

  it('turns clarifying questions into options', () => {
    const say = conversation();
    const clarify = say('Where is Lyrium?');
    expect(clarify.options).toEqual(['Lyrium Tower 1', 'Two Lyrium']);
    expect(say('Two Lyrium').interpretation.params).toMatchObject({ docId: 'two-lyrium', field: 'location' });
  });

  it('still answers unrelated questions while options are pending', () => {
    const say = conversation();
    say('What are our projects?');
    expect(say('What is the capital of France?').response.display).toBe(NO_ANSWER);
  });
});

describe('resolveFollowUp', () => {
  const options: FollowUpOption[] = ['Townships', 'Residentials', 'Office Spaces'].map((label) => ({ label, text: label, intent: 'portfolio_group', params: { group: label } }));

  it('matches labels, partial labels and ordinals', () => {
    expect(resolveFollowUp('Residentials', options)?.label).toBe('Residentials');
    expect(resolveFollowUp('AFAIK, office spaces please', options)?.label).toBe('Office Spaces');
    expect(resolveFollowUp('the third one', options)?.label).toBe('Office Spaces');
    expect(resolveFollowUp('2', options)?.label).toBe('Residentials');
    expect(resolveFollowUp('last', options)?.label).toBe('Office Spaces');
  });

  it('does not guess', () => {
    expect(resolveFollowUp('pizza', options)).toBeNull();
    expect(resolveFollowUp('number 9', options)).toBeNull();
  });
});
