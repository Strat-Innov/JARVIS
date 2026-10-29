# A.F.A.I.K. — FAI Knowledge Assistant

AFAIK is a voice-enabled knowledge assistant for Filinvest Alabang Inc. You can ask questions by voice or by typing. It answers **only from the FAI knowledge file loaded on your device**, in a holographic HUD interface with spoken replies.

- **No company data in this repository or website.** Each device loads the knowledge export locally, and it's kept only in that browser's `localStorage`.
- **No AI service or paid API.** Answers come from a deterministic TypeScript engine (page matching, structured facts and keyword search) that quotes the loaded file.
- **Client-side only.** React + Vite + TypeScript + Tailwind, hosted as a static site (Vercel).

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build
npm test           # unit tests (parser, answering rules, zip reading, persistence)
npm run typecheck  # app + tests
```

Then open **Library** (or use the panel on the right) and load the knowledge export. **Load the whole export `.zip`.** AFAIK reads the `…_AI_File.md` content, and also reads the `…_Master_File.md` (raw SharePoint data) for page structure the AI File lacks: the Project Playbook groups (Townships, Residentials, Office Spaces, Commercial Lots, Leasing) with each card's brand label, and the Life at FAI department cards. Only that small summary is kept; the Master File itself is not stored. Loading just the AI File `.md` also works, but without those groups.

## Answering rules

The engine implements the AFAIK agent rules that can be enforced deterministically:

| Rule | Behaviour |
|---|---|
| Configured source only | Every answer quotes the loaded file. There's no general knowledge or web access, and the input is never executed. |
| No answer | Replies exactly: *"This information is not available in the configured knowledge source."* |
| People | Shown as **Name · Title · Group**. Missing fields read *"Not available in source."* |
| References | `Source: <page>.aspx — SharePoint site: <site as stated>`. Page URLs are never constructed from file names. Document links that appear only as SharePoint-relative paths are labelled, not expanded. |
| Conflicts | When same-named pages disagree, both versions are shown under *"The configured sources contain conflicting information"*. |
| Ambiguity | Asks one clarifying question, e.g. *"Did you mean Botanika Tower 1 or Two Botanika?"* |
| Projects | "List the projects" uses the **Project Playbook** (FAI projects). |
| Brands / regions | Brand membership comes from the **Brands** page. North = Prestige, South = Aspire. Regions are never inferred beyond that rule. |
| `&` / `and` | Treated as equivalent. |

Not available in this static build: direct SharePoint/PDF/DOCX retrieval, `event.csv` and the corrections/roster data. Answers come only from the loaded markdown export.

### Guided conversations

When a question is broad, AFAIK asks a follow-up question and offers choices. Tap a choice, or say or type it ("Residentials", "the second one", "number 3").

- **Our projects / our portfolio** → choose a category (Townships, Residentials, Office Spaces, Commercial Lots, Leasing) → choose a project → choose what to know (Pricing, Payment terms, Amenities, Location, Status, Units / lots, Turnover date, People, Links, and so on). Only the details a page actually has are offered.
- **Life at FAI / at the office** → the Life at FAI text from the Home page → choose a department → choose a part of its page (People, "How it feels working…", team functions).
- **Ambiguous names** ("Botanika") → "Did you mean Botanika Tower 1 or Two Botanika?", with both as choices.

### How the export is read

The export often lists several headings back to back (e.g. "Lot Sizes & Pricing", "Amenities", "Standard Payment Schemes") and then all their content in a different order. AFAIK assigns each line to the heading it belongs to (prices, payment terms, amenities, parking). It also:

- reads values listed under a heading ("No of units:" → "280 (Anaheim); 503 (Burbank)");
- keeps multi-offering pages separate (Prominence II's Move-in Ready Townhomes and Terrace Homes each get their own status, prices and payment schemes);
- re-joins lines the export wrapped mid-sentence.

Project areas come from the Project Playbook and Brands pages. Brand labels come from the Brands page, or from the visible label on a Project Playbook card when the Brands page doesn't list the project. Labels SharePoint hides are ignored.

### Example questions

- "How much is a 1-bedroom at 1001 Parkway?" → then "What are the payment terms?" (a follow-up uses the page on screen)
- "How do I request a cash advance?" · "How long is the approval?" · "What forms do I need?"
- "Where is Aeon Center?" · "Shuttle schedule for Aeon Center"
- "Who is on the 1001 Parkway team?" · "Who is <full name>?"
- "List the FAI projects" · "List the Prestige projects" · "What are the north projects?" · "What brand is Celestia?"

## Voice

| Mode | Behaviour |
|---|---|
| Push to talk (default) | Press the mic and ask one question. Most reliable. |
| Conversation | The mic re-opens after each reply. It stops on silence or "go to standby". |
| Wake word (experimental) | Listens continuously for "AFAIK" ("a-fake" or letter by letter) (Chrome/Edge desktop). Expect occasional misses. |

- Speech recognition works in Chrome, Edge and Safari. It isn't available in Firefox, where the text box still works. Chrome and Edge need an internet connection for recognition.
- The microphone requires HTTPS (Vercel provides it) or `localhost`.
- Voices depend on the device. A British English voice is preferred, and you can choose any voice in Settings.
- Pronunciation: **AFAIK** is said "a-fake" (/əˈfeɪk/) by default, "Ah-fah-ick" (/æ fɑː ɪk/), or letter by letter (Settings → Pronunciation). The wake word accepts all three. **1001** is said "ten-oh-one", and "ten-oh-one Parkway" is understood when spoken. The wake word accepts "a-fake" or A-F-A-I-K; because "a fake" is a common phrase, it can occasionally trigger by mistake.
- Spoken answers are shortened. The full answer, with its source reference, is always on screen.
- **Diagnostics** checks the browser's voice support and the loaded knowledge file (Project Playbook and Brands page found).

## Data handling

- The knowledge file is read in the browser with the File API (and `DecompressionStream` for zips). It is never uploaded.
- It is stored under `afaik.knowledge.v1` in that browser's `localStorage` (about 300 KB). **Library → Remove from this device** deletes it.
- `.gitignore` blocks knowledge exports and zips from being committed. Tests use a fictional fixture (`src/test/fixture.ts`).
- Anyone using the hosted site must have the file themselves. The site contains no company content.

## Deploying to Vercel

1. Import the GitHub repository at <https://vercel.com/new>. It's detected as **Vite**.
2. Keep the defaults: build `npm run build`, output `dist`, no environment variables.
3. Deploy. Later pushes to the production branch redeploy automatically.

## Project structure

```
src/
  components/  Header, AfaikCore (SVG/CSS core), KnowledgePanel, DocumentPanel,
               KnowledgeLoader, VoiceControl, CommandHistory, Drawer
  pages/       Library, Diagnostics, Settings
  services/    knowledgeParser    — export markdown → structured pages
               knowledgeSearch    — page matching + BM25 keyword search
               knowledgeStructure — Brands, Project Playbook, people
               knowledgeFile      — .md / .zip reading in the browser
               siteStructure      — Project Playbook groups and Life at FAI cards from the Master File
               commandInterpreter — question → intent, page, field
               responseEngine     — answering rules, references, speech text
               speechRecognition, speechSynthesis, soundEffects
  hooks/       useVoiceAssistant (listen → process → speak), useVoices, useNow
  data/        persistence (localStorage)
  utils/       text (speech formatting), validation (settings)
  test/        fictional fixture
```
