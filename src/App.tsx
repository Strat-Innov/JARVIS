import { useCallback, useEffect, useMemo, useState } from 'react';
import { AfaikCore, STATE_LABELS } from './components/AfaikCore';
import { AnswerText } from './components/AnswerText';
import { CommandHistory } from './components/CommandHistory';
import { DocumentPanel } from './components/DocumentPanel';
import { FollowUpOptions } from './components/FollowUpOptions';
import { Drawer } from './components/Drawer';
import { Header } from './components/Header';
import { KnowledgePanel } from './components/KnowledgePanel';
import { VoiceControl } from './components/VoiceControl';
import { clearStoredKnowledge, loadSession, loadSettings, loadStoredKnowledge, saveSession, saveSettings, saveStoredKnowledge } from './data/persistence';
import { useNow } from './hooks/useNow';
import { useVoiceAssistant } from './hooks/useVoiceAssistant';
import { useVoices } from './hooks/useVoices';
import { Diagnostics, type BrowserCapabilities } from './pages/Diagnostics';
import { Library } from './pages/Library';
import { Settings } from './pages/Settings';
import { readKnowledgeFile } from './services/knowledgeFile';
import { parseKnowledgeMarkdown } from './services/knowledgeParser';
import { brandOfDoc } from './services/knowledgeStructure';
import type { ActivityEntry, AssistantAction, KnowledgeBase, KnowledgeCategory, SessionState, Settings as SettingsModel, View } from './types/afaik';

const MAX_ACTIVITY = 30;
const VIEW_TITLES: Record<Exclude<View, 'hud'>, string> = { library: 'Library', diagnostics: 'Diagnostics', settings: 'Settings' };
const VOICE_TEST_LINE = 'Good day. AFAIK voice systems are online.';

function storageAvailable(): boolean {
  try {
    const key = '__afaik_probe__';
    window.localStorage.setItem(key, '1');
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

const newEntry = (message: string): ActivityEntry => ({
  id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
  at: Date.now(),
  message,
});

/** Restores the knowledge file saved in this browser, if any. */
function restoreKnowledge(): KnowledgeBase | null {
  const stored = loadStoredKnowledge();
  if (!stored) return null;
  try {
    return parseKnowledgeMarkdown(stored.markdown, stored.sourceName, stored.loadedAt, stored.structure ?? null);
  } catch (error) {
    console.warn('[afaik] Saved knowledge file could not be parsed', error);
    return null;
  }
}

export default function App() {
  const now = useNow(1000);
  const [knowledge, setKnowledge] = useState<KnowledgeBase | null>(restoreKnowledge);
  const [persisted, setPersisted] = useState(true);
  const [settings, setSettings] = useState<SettingsModel>(() => loadSettings());
  const [session, setSession] = useState<SessionState>(() => loadSession());
  const [view, setView] = useState<View>('hud');
  const [activity, setActivity] = useState<ActivityEntry[]>(() => [
    newEntry(knowledge ? `AFAIK online. Knowledge source: ${knowledge.docs.length} pages.` : 'AFAIK online. No knowledge source loaded.'),
  ]);

  useEffect(() => void saveSettings(settings), [settings]);
  useEffect(() => void saveSession(session), [session]);

  const selectedDoc = knowledge?.docs.find((d) => d.id === session.selectedDocId);
  const log = useCallback((message: string) => setActivity((a) => [newEntry(message), ...a].slice(0, MAX_ACTIVITY)), []);

  const selectDoc = useCallback(
    (docId: string) => {
      const doc = knowledge?.docs.find((d) => d.id === docId);
      setSession((s) => ({ ...s, selectedDocId: docId, selectedCategory: doc?.category ?? s.selectedCategory }));
    },
    [knowledge],
  );
  const selectCategory = useCallback((category: KnowledgeCategory) => setSession((s) => ({ ...s, selectedCategory: category })), []);

  const handleAction = useCallback(
    (action: AssistantAction) => {
      switch (action.type) {
        case 'select-doc':
          selectDoc(action.docId);
          break;
        case 'select-category':
          selectCategory(action.category);
          break;
        case 'standby':
          log('Entered standby.');
          break;
      }
    },
    [log, selectCategory, selectDoc],
  );

  const voices = useVoices(settings.voiceURI);
  const assistant = useVoiceAssistant({
    knowledge,
    selectedDocId: selectedDoc?.id ?? null,
    settings,
    voice: voices.activeVoice,
    onAction: handleAction,
  });
  const busy = assistant.state === 'processing' || assistant.state === 'speaking';
  const { playBootSequence } = assistant;

  const loadKnowledgeFile = useCallback(
    async (file: File) => {
      const { markdown, sourceName, structure } = await readKnowledgeFile(file);
      const kb = parseKnowledgeMarkdown(markdown, sourceName, Date.now(), structure ?? null);
      const saved = saveStoredKnowledge({ markdown, sourceName, loadedAt: kb.loadedAt, structure: structure ?? null });
      setPersisted(saved);
      setKnowledge(kb);
      setSession((s) => ({ ...s, selectedDocId: null }));
      log(`Knowledge source loaded: ${sourceName} (${kb.docs.length} pages)${saved ? '' : ' — not saved; reload needed after refresh'}.`);
      playBootSequence();
    },
    [log, playBootSequence],
  );

  const clearKnowledge = useCallback(() => {
    clearStoredKnowledge();
    setKnowledge(null);
    setSession((s) => ({ ...s, selectedDocId: null }));
    log('Knowledge source removed from this device.');
  }, [log]);

  const closeDrawer = useCallback(() => setView('hud'), []);

  const capabilities: BrowserCapabilities = useMemo(
    () => ({
      recognition: assistant.recognitionSupported,
      synthesis: voices.supported,
      secureContext: typeof window !== 'undefined' && window.isSecureContext,
      voiceCount: voices.voices.length,
      storage: storageAvailable(),
    }),
    [assistant.recognitionSupported, voices.supported, voices.voices.length],
  );

  const availability =
    assistant.state === 'error'
      ? { label: 'ATTENTION', tone: 'warn' as const }
      : !knowledge
        ? { label: 'NO SOURCE', tone: 'warn' as const }
        : assistant.recognitionSupported
          ? { label: 'ONLINE', tone: 'ok' as const }
          : { label: 'TEXT MODE', tone: 'warn' as const };

  const micStatus = !assistant.recognitionSupported
    ? 'Voice input unavailable — type questions'
    : assistant.wakeArmed
      ? 'Wake word armed — say “AFAIK”'
      : assistant.micOn
        ? 'Microphone on'
        : 'Microphone off';
  const voiceStatus = !settings.speechEnabled
    ? 'Spoken responses off'
    : !voices.supported
      ? 'Speech output unsupported'
      : voices.activeVoice
        ? `${voices.activeVoice.name} (${voices.activeVoice.lang})`
        : voices.loading
          ? 'Loading voices…'
          : 'System default voice';

  const displayText =
    assistant.state === 'error' && assistant.errorMessage
      ? assistant.errorMessage
      : assistant.responseText ||
        (knowledge
          ? 'AFAIK is online. Ask about FAI projects, buildings, departments, people or procedures.'
          : 'AFAIK is online. Load the FAI knowledge file to begin — open the Library or use the panel on the right.');

  // Multi-line answers (tables, lists, people) get a scrollable, left-aligned answer panel and a smaller core.
  const structured = displayText.includes('\n') || displayText.length > 240;

  return (
    <div className="mx-auto flex min-h-dvh max-w-[1920px] flex-col gap-3 p-2 sm:p-3 lg:h-dvh lg:p-4">
      <Header
        now={now}
        availability={availability}
        knowledgeLabel={knowledge ? `${knowledge.docs.length} pages` : null}
        onOpenSettings={() => setView('settings')}
      />

      <main className="grid flex-1 gap-3 lg:min-h-0 lg:grid-cols-[minmax(250px,300px)_minmax(0,1fr)_minmax(290px,380px)]">
        <aside className="order-3 min-w-0 lg:order-1 lg:min-h-0 lg:overflow-y-auto" aria-label="Knowledge navigation">
          <KnowledgePanel
            knowledge={knowledge}
            selectedDocId={selectedDoc?.id ?? null}
            category={session.selectedCategory}
            view={view}
            busy={busy}
            onSelectCategory={selectCategory}
            onSelectDoc={selectDoc}
            onCommand={assistant.submitText}
            onNavigate={setView}
          />
        </aside>

        <section
          className={`order-1 flex min-h-0 min-w-0 flex-col items-center gap-2 py-2 lg:order-2 lg:gap-3 ${structured ? 'justify-start' : 'justify-center'}`}
          aria-label="AFAIK"
        >
          {structured ? (
            // Long answers: a compact header so the answer gets the space.
            <div className="flex w-full max-w-3xl shrink-0 items-center gap-3">
              <div className="w-12 shrink-0 sm:w-14">
                <AfaikCore state={assistant.state} pulse={assistant.speechPulse} booting={assistant.booting} />
              </div>
              <p className={`font-display text-xs tracking-[0.35em] uppercase ${assistant.state === 'error' ? 'text-warn' : 'text-arc-bright'}`} aria-live="polite">
                {assistant.wakeArmed && assistant.state === 'standby' ? 'Awaiting wake word' : STATE_LABELS[assistant.state]}
              </p>
            </div>
          ) : (
            <>
              <div className="w-[min(70vw,300px)] shrink-0 sm:w-[min(50vw,360px)] lg:w-[max(160px,min(100%,calc(100dvh-36rem),520px))]">
                <AfaikCore state={assistant.state} pulse={assistant.speechPulse} booting={assistant.booting} />
              </div>
              <p className={`font-display text-xs tracking-[0.4em] uppercase ${assistant.state === 'error' ? 'text-warn' : 'text-arc-bright'}`} aria-live="polite">
                {assistant.wakeArmed && assistant.state === 'standby' ? 'Awaiting wake word' : STATE_LABELS[assistant.state]}
              </p>
            </>
          )}
          <div
            className={`w-full max-w-3xl leading-relaxed [overflow-wrap:anywhere] ${assistant.state === 'error' ? 'text-warn' : 'text-ice'} ${
              structured
                ? 'hud-panel max-h-[65dvh] overflow-x-hidden overflow-y-auto px-4 py-3 text-left text-[0.95rem] sm:text-base lg:max-h-none lg:min-h-[8rem] lg:flex-1'
                : 'px-2 text-center text-base whitespace-pre-line sm:text-lg lg:text-xl'
            }`}
            aria-live="polite"
            tabIndex={structured ? 0 : undefined}
          >
            {structured ? <AnswerText text={displayText} /> : displayText.replace(/^# /, '')}
          </div>
          {assistant.state !== 'error' && assistant.errorMessage && <p className="text-sm text-warn">{assistant.errorMessage}</p>}
          <FollowUpOptions followUp={assistant.followUp} disabled={busy} onChoose={assistant.chooseOption} />
          <VoiceControl assistant={assistant} activationMode={settings.activationMode} compact={structured} />
        </section>

        <aside className="order-2 min-w-0 lg:order-3 lg:min-h-0 lg:overflow-y-auto" aria-label="Selected page">
          <DocumentPanel
            doc={selectedDoc}
            brand={knowledge && selectedDoc ? brandOfDoc(knowledge, selectedDoc.id) : null}
            hasKnowledge={Boolean(knowledge)}
            activity={activity}
            onLoadKnowledge={loadKnowledgeFile}
          />
        </aside>
      </main>

      <CommandHistory
        history={assistant.history}
        interimTranscript={assistant.interimTranscript}
        lastInput={assistant.lastInput}
        micStatus={micStatus}
        voiceStatus={voiceStatus}
      />

      {view !== 'hud' && (
        <Drawer title={VIEW_TITLES[view]} onClose={closeDrawer}>
          {view === 'library' && (
            <Library
              knowledge={knowledge}
              persisted={persisted}
              onLoad={loadKnowledgeFile}
              onClear={clearKnowledge}
              onOpenDoc={(id) => {
                selectDoc(id);
                setView('hud');
              }}
            />
          )}
          {view === 'diagnostics' && <Diagnostics knowledge={knowledge} capabilities={capabilities} />}
          {view === 'settings' && (
            <Settings
              settings={settings}
              voices={voices}
              recognitionSupported={assistant.recognitionSupported}
              busy={busy}
              onChange={setSettings}
              onTestVoice={() => void assistant.speakText(VOICE_TEST_LINE)}
              onOpenLibrary={() => setView('library')}
            />
          )}
        </Drawer>
      )}
    </div>
  );
}
