# J.A.R.V.I.S. — Halloween Edition

A fan-made, JARVIS-inspired voice assistant for a Halloween costume party. You can talk to it (or type), and it answers in a calm British-style voice using **only the suit data you configure**. The demo suit is the Mark XLIII, and its repair countdown updates live.

- **Client-side only.** React + Vite + TypeScript + Tailwind. There's no backend, database, account or API key.
- **No paid AI.** A deterministic TypeScript command registry handles commands, using the browser's Web Speech APIs.
- Not affiliated with Marvel or Disney. The suit data is fictional and the dialogue is original.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build locally
npm test           # unit tests (command parsing, repair time, validation, persistence)
```

You need Node 20.19 or later.

## Using it

| Try saying (or typing) | What happens |
|---|---|
| "JARVIS, status report." | Roster summary plus the selected suit |
| "How long for the repair for the Mark XLIII?" | Repair ETA from the configured completion time |
| "What's the status of the Mark 43?" | Repair, power and diagnostics |
| "Run diagnostics." / "How much power remains?" | Uses the selected suit unless you name one |
| "Show me the Hulkbuster." | Selects that suit |
| "Activate party mode." / "Deactivate party mode." | Party personality plus an initialization animation |
| "Welcome our guests." · "Tell me a joke." · "What can you do?" · "Go to standby." | Party extras |

You can say suit designations as "Mark XLIII", "Mark 43", "Mark forty-three" or "MK-43", or use the suit's name. If you ask about a suit that doesn't exist, JARVIS says it has no record of it. If a field is empty, JARVIS says that value is **unavailable** and doesn't guess one.

**Workshop** (left panel → Systems) lets you edit each suit's status, progress, completion time, power, diagnostics and notes. You can set the completion time as a date/time or as "time remaining from now". Changes are saved in `localStorage`. **Reset to demo data** restores the defaults, including a fresh 2 h 40 m countdown for the Mark XLIII.

**Settings** lets you choose the voice (any voice on the device), rate and pitch, and test the voice. You can also turn speech and sound effects on or off and pick an activation mode.

### Activation modes

| Mode | Behaviour | Reliability |
|---|---|---|
| Push to talk (default) | Press the mic and say one command | Best |
| Conversation | The mic re-opens after each reply. It stops after silence or "Go to standby" | Good |
| Wake word (experimental) | Listens continuously and responds only to phrases containing "JARVIS" | Chrome/Edge desktop. Occasional misses are expected |

The microphone is only requested after you press the mic button. Recognition always stops while JARVIS speaks, so it never hears itself.

## Browser limitations

- **Speech recognition** works in Chrome, Edge and Safari. It is **not supported in Firefox**, where the text input still works. Chrome and Edge send audio to their cloud recogniser, so they **need an internet connection**.
- The microphone needs **HTTPS** or `localhost`. Vercel provides HTTPS.
- **Voices vary by device.** The app prefers a British male voice ("Microsoft Ryan" in Edge, "Google UK English Male" in Chrome, "Daniel" on Apple devices) and falls back to any English voice. It's a JARVIS-*style* delivery, not the film voice.
- iOS Safari only allows speech after a tap. The first mic or send press unlocks it.
- **Diagnostics → Browser systems check** shows what works on the current device. Run it on the exact laptop and browser you'll use at the party.

## Deploying to Vercel

1. Push this repository to GitHub. It's already set up as a standard Vite project.
2. At <https://vercel.com/new>, choose **Import Git Repository** and select this repo. You may need to grant the Vercel GitHub app access to it first.
3. Vercel detects **Vite** automatically. Keep the defaults:
   - Build command: `npm run build`
   - Output directory: `dist`
   - Install command: `npm install`
   - Environment variables: none
4. Click **Deploy**. Every later push to the production branch redeploys.

The app is a single page with no client-side routes, so no rewrite rules are needed. Alternatively, with the Vercel CLI: `npx vercel` (preview) and `npx vercel --prod`.

## Project structure

```
src/
  components/   Header, JarvisCore (SVG/CSS core), CommandPanel, SuitStatusPanel,
                TelemetryPanel, VoiceControl, CommandHistory, Drawer
  pages/        Workshop, Diagnostics, Settings
  data/         demoData.ts (fictional sample suits), persistence.ts (localStorage)
  services/     commandInterpreter.ts, responseEngine.ts, speechRecognition.ts,
                speechSynthesis.ts, soundEffects.ts
  hooks/        useVoiceAssistant (state machine), useVoices, useNow
  types/        jarvis.ts
  utils/        time.ts, validation.ts
```

The flow is: recognised text → `commandInterpreter` (intent, suit and errors) → `responseEngine` (display text, speakable text and UI actions) → `useVoiceAssistant` (speaks the reply and applies the actions). Randomness only changes phrasing and clearly labelled jokes. It never changes facts.
