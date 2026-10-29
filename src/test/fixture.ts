/**
 * FICTIONAL test fixture in the same format as the knowledge export ("AI File").
 * All names, prices, people and emails are invented. Real company data must never be committed.
 */
export const FIXTURE_MARKDOWN = `# KNOWLEDGE-TEST000001

- Learn more

# ORION HEIGHTS RESIDENCES

Orion Heights Residences is a fictional residential tower used for automated tests, with landscaped decks and a sky garden.

## Development Details

- Status: RFO
- Location: Example Avenue, Test District
- No of units: 250
- Turnover date: 2030

## Units & Pricing

## Parking & Pricing

1-BR Unit

40–50 sqm
₱10.0M–₱12.5M

Single Slot

₱1.20M

## Standard Payment Schemes

Cash:

95% payment; with 10% discount.

## Amenities

- Lap Pool
- Gym

## Socials & Websites

- [Orion Heights - Facebook](https://www.facebook.com/example-orion/)

## Meet The Team

- Ana B. Cruz — Senior Vice President - Residences — ana.cruz@example.com

## Marketing

- Ben C. Diaz — Marketing Manager — ben.diaz@example.com

## Quick Links

- [Home Page](/sites/TestKB/SitePages/Home.aspx)

## Chat with AFAIK Agent

## Source

- Source file: ORION-HEIGHTS.aspx
- SharePoint site: https://example.sharepoint.com/sites/TestKB
- Page layout: Article
- Generator: 1.1.0

---

# LYRIUM TOWER 1

## Development Details

- Status: Pre-selling
- Location: Lyrium Lane, Test District

## Source

- Source file: LYRIUM-TOWER-1.aspx
- SharePoint site: https://example.sharepoint.com/sites/TestKB

---

# TWO LYRIUM

## Development Details

- Status: RFO

## Source

- Source file: TWO-LYRIUM.aspx
- SharePoint site: https://example.sharepoint.com/sites/TestKB

---

# Vega Center

## Overview:

Vega Center is a fictional office building used for automated tests, located in the Test District business zone.

## Transportation Hub

Test Loop Shuttle
Operation Schedule:
Mon - Fri 06:00 AM to 08:00 PM

Standard Rate:
PHP 15.00

## Location: Sample Street, North Test District

## Source

- Source file: VEGA-CENTER.aspx
- SharePoint site: /sites/TestKB

---

# Vega Center

## Overview:

A second page about Vega Center with a different shuttle.

## Transportation Hub

Other Loop Shuttle

## Source

- Source file: VEGA.aspx
- SharePoint site: /sites/TestKB

---

# PETTY FUND REQUEST

## Purpose

A fictional procedure for requesting a small fund in advance of an approved business activity.

## How to Process

1. Submit the request form.
2. Receive the fund after approval.
3. Liquidate within 5 days.

## Related Documents

## RELATED DOCUMENTS

- [PF Form](/sites/TestKB/Shared%20Documents/PF%20Form.pdf)

## Approval Time

2 to 3 working days.

## Source

- Source file: Petty-Fund-(PF).aspx
- SharePoint site: https://example.sharepoint.com/sites/TestKB

---

# Brands

Filigree is the fictional luxury brand used in tests.

- /sites/TestKB/SitePages/ORION-HEIGHTS.aspx

As a fictional high-end arm, the company stewards the Prestige brand, including Two Lyrium.

- /sites/TestKB/SitePages/LYRIUM-TOWER-1.aspx

Aspire developments are fictional township projects.

## Source

- Source file: Brands.aspx
- SharePoint site: https://example.sharepoint.com/sites/TestKB

---

# Project-Playbook

- /sites/TestKB/SitePages/ORION-HEIGHTS.aspx

- /sites/TestKB/SitePages/LYRIUM-TOWER-1.aspx?Mode=Edit

## Source

- Source file: Project-Playbook.aspx
- SharePoint site: /sites/TestKB
`;

/** FICTIONAL pages exercising export quirks: grouped empty headings, variants, wrapped lines, odd titles. */
export const QUIRKS_MARKDOWN = `# NOVA RIDGE

Nova Ridge is a fictional hillside estate used to test grouped headings in the knowledge export.

## Development Details

- Status: RFO
- No of lots: 120
- Turnover date:
- 2020 (Phase 1)
- 2024 (Phase 2)

## Lot Sizes & Pricing

## Standard Payment Schemes

## Amenities

Cash:

100% payment; with 5% discount

Installment:

10% downpayment; 90% final lumpsum payable after 24 mos

- Lot sizes: 200 – 400 sqm
- Price range: P5M – P9M

- Clubhouse
- Parking Lot
- Jogging Path

## Source

- Source file: NOVA-RIDGE.aspx
- SharePoint site: /sites/TestKB

---

# ZENITH HOMES

Zenith Homes is a fictional enclave with two offerings, used to test variant sections in the export.

## Ready Homes

- Status: RFO
- Location: Test Town

## Future Homes

- Status: Pre-Selling
- Location: Test Town

## Lot Sizes & Pricing

## Standard Payment Scheme

- Price range: ₱10M–₱20M

Cash:

100% payment; with 10% discount

## Lot Sizes & Pricing

## Standard Payment Scheme

- Price range: ₱30M–₱40M

Cash:

100% payment; with 5% discount

## Source

- Source file: ZENITH.aspx
- SharePoint site: /sites/TestKB

---

# ORBIT MALL

## Development Details

- Location: Orbit Avenue
- Total Number of Units: 80 shops

## Parking

- Capacity: The mall features two
- basement levels with a total of 300 slots.

## Source

- Source file: ORBIT-MALL.aspx
- SharePoint site: /sites/TestKB

---

# Monkey: Test Person

Thanks to the fictional volunteers who helped build this test knowledge base.

## Source

- Source file: Credits.aspx
- SharePoint site: /sites/TestKB

---

# Home

## Life at FAI

Work. Learn. Test.
Life at the test company is where fictional culture comes to life, with programmes and stories for everyone.

## Source

- Source file: Home.aspx
- SharePoint site: /sites/TestKB

---

# Finance

Finance is a fictional department page used for testing the Life at FAI flow and department follow-ups.

## How It Feels Working in Finance at Test Co

Numbers with purpose, in a fictional team.

## FINANCE LEADS

- Cara D. Evans — Finance Head — cara.evans@example.com

## Source

- Source file: FINANCE.aspx
- SharePoint site: /sites/TestKB
`;

/** A fictional SiteStructure, as extracted from a Master File. */
export const FIXTURE_STRUCTURE = {
  portfolio: [
    { name: 'Residentials', items: [
      { title: 'Nova Ridge', sourceFile: 'NOVA-RIDGE.aspx', label: 'Prestige', x: 24, y: 1 },
      { title: 'Zenith Homes', sourceFile: 'ZENITH.aspx', label: 'Aspire', x: 0, y: 1 },
    ] },
    { name: 'Leasing', items: [{ title: 'Orbit', sourceFile: 'ORBIT-MALL.aspx', label: null, x: 0, y: 1 }] },
  ],
  departments: [{ title: 'Finance Department', sourceFile: 'FINANCE.aspx' }],
};

/** A minimal, entity-encoded Master File with one Project Playbook card group (fictional). */
export const MASTER_FILE_FIXTURE = [
  '# TEST — ASPx Codebase Master File',
  '',
  '## Project-Playbook.aspx',
  '<div data-sp-canvascontrol="" data-sp-canvasdataversion="1.0" data-sp-controldata="&#123;&quot;zoneGroupMetadata&quot;&#58;&#123;&quot;type&quot;&#58;1,&quot;displayName&quot;&#58;&quot;Townships&quot;&#125;,&quot;flexibleLayoutPosition&quot;&#58;&#123;&quot;lg&quot;&#58;&#123;&quot;x&quot;&#58;24,&quot;y&quot;&#58;2&#125;&#125;&#125;"><div data-sp-webpartdata="&#123;&quot;instanceId&quot;&#58;&quot;a1&quot;,&quot;title&quot;&#58;&quot;Editorial card&quot;,&quot;serverProcessedContent&quot;&#58;&#123;&quot;htmlStrings&quot;&#58;&#123;&quot;headline&quot;&#58;&quot;&lt;h4&gt;&lt;strong&gt;Beta City&lt;/strong&gt;&lt;/h4&gt;&quot;,&quot;description&quot;&#58;&quot;&lt;p&gt;Prestige&lt;/p&gt;&quot;&#125;,&quot;links&quot;&#58;&#123;&quot;callToAction.linkUrl&quot;&#58;&quot;/sites/TestKB/SitePages/BETA-CITY.aspx?Mode=Edit&quot;&#125;&#125;,&quot;properties&quot;&#58;&#123;&quot;hideDescription&quot;&#58;true&#125;&#125;"></div></div>',
  '<div data-sp-canvascontrol="" data-sp-canvasdataversion="1.0" data-sp-controldata="&#123;&quot;zoneGroupMetadata&quot;&#58;&#123;&quot;type&quot;&#58;1,&quot;displayName&quot;&#58;&quot;Townships&quot;&#125;,&quot;flexibleLayoutPosition&quot;&#58;&#123;&quot;lg&quot;&#58;&#123;&quot;x&quot;&#58;0,&quot;y&quot;&#58;2&#125;&#125;&#125;"><div data-sp-webpartdata="&#123;&quot;instanceId&quot;&#58;&quot;a2&quot;,&quot;title&quot;&#58;&quot;Editorial card&quot;,&quot;serverProcessedContent&quot;&#58;&#123;&quot;htmlStrings&quot;&#58;&#123;&quot;headline&quot;&#58;&quot;&lt;h4&gt;&lt;strong&gt;Alpha City&lt;/strong&gt;&lt;/h4&gt;&quot;,&quot;description&quot;&#58;&quot;&lt;p&gt;&lt;strong&gt;Filigree&lt;/strong&gt;&lt;/p&gt;&quot;&#125;,&quot;links&quot;&#58;&#123;&quot;callToAction.linkUrl&quot;&#58;&quot;/sites/TestKB/SitePages/ALPHA-CITY.aspx&quot;&#125;&#125;,&quot;properties&quot;&#58;&#123;&#125;&#125;"></div></div>',
  '',
  '## Other.aspx',
  'nothing here',
].join('\n');

/** Raw SharePoint export snippet (the "Master File" format) that must be rejected. */
export const MASTER_FILE_SNIPPET = '<mso:CanvasContent1 msdt:dt="string">&lt;div&gt;';
