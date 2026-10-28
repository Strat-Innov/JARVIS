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

/** Raw SharePoint export snippet (the "Master File" format) that must be rejected. */
export const MASTER_FILE_SNIPPET = '<mso:CanvasContent1 msdt:dt="string">&lt;div&gt;';
