import { useCallback, useEffect, useMemo, useState } from 'react';
import { CommandHistory } from './components/CommandHistory';
import { CommandPanel } from './components/CommandPanel';
import { Drawer } from './components/Drawer';
import { Header } from './components/Header';
import { JarvisCore, STATE_LABELS } from './components/JarvisCore';
import { SuitStatusPanel } from './components/SuitStatusPanel';
import { TelemetryPanel } from './components/TelemetryPanel';
import { VoiceControl } from './components/VoiceControl';
import { loadSession, loadSettings, loadSuits, resetSuits, saveSession, saveSettings, saveSuits } from './data/persistence';
import { useNow } from './hooks/useNow';
import { useVoiceAssistant } from './hooks/useVoiceAssistant';
import { useVoices } from './hooks/useVoices';
import { Diagnostics, type BrowserCapabilities } from './pages/Diagnostics';
import { Settings } from './pages/Settings';
import { Workshop } from './pages/Workshop';
import type { ActivityEntry, AssistantAction, SessionState, Settings as SettingsModel, Suit, View } from './types/jarvis';

const MAX_ACTIVITY = 30;
const VIEW_TITLES: Record<Exclude<View, 'hud'>, string> = { workshop: 'Workshop', diagnostics: 'Diagnostics', settings: 'Settings' };
const VOICE_TEST_LINE = 'Good evening, sir. Voice systems are online. The Mark XLIII awaits your inspection.';

function storageAvailable(): boolean {
  try {
    const key = '__jarvis_probe__';
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

export default function App() {
  const now = useNow(1000);
  const [suits, setSuits] = useState<Suit[]>(() => loadSuits());
  const [settings, setSettings] = useState<SettingsModel>(() => loadSettings());
  const [session, setSession] = useState<SessionState>(() => loadSession());
  const [view, setView] = useState<View>('hud');
  const [activity, setActivity] = useState<ActivityEntry[]>(() => [newEntry('J.A.R.V.I.S. online. All systems initialised.')]);
  const [diagnosticRuns, setDiagnosticRuns] = useState<Record<string, number>>({});

  useEffect(() => void saveSuits(suits), [suits]);
  useEffect(() => void saveSettings(settings), [settings]);
  useEffect(() => void saveSession(session), [session]);

  // Keep the selection valid if the selected suit is deleted.
  const selectedSuit = suits.find((s) => s.id === session.selectedSuitId) ?? suits[0];
  const selectedSuitId = selectedSuit?.id ?? null;

  const log = useCallback((message: string) => setActivity((a) => [newEntry(message), ...a].slice(0, MAX_ACTIVITY)), []);
  const suitName = useCallback((id: string) => suits.find((s) => s.id === id)?.name ?? 'suit', [suits]);

  const selectSuit = useCallback((suitId: string) => setSession((s) => ({ ...s, selectedSuitId: suitId })), []);

  const handleAction = useCallback(
    (action: AssistantAction) => {
      switch (action.type) {
        case 'select-suit':
          selectSuit(action.suitId);
          break;
        case 'set-party-mode':
          setSession((s) => ({ ...s, partyMode: action.enabled }));
          log(action.enabled ? 'Party protocol engaged.' : 'Party protocol disengaged.');
          break;
        case 'standby':
          log('Entered standby.');
          break;
        case 'diagnostics-run':
          setDiagnosticRuns((d) => ({ ...d, [action.suitId]: Date.now() }));
          log(`Diagnostics run on ${suitName(action.suitId)}.`);
          break;
      }
    },
    [log, selectSuit, suitName],
  );

  const voices = useVoices(settings.voiceURI);
  const assistant = useVoiceAssistant({
    suits,
    selectedSuitId,
    partyMode: session.partyMode,
    settings,
    voice: voices.activeVoice,
    onAction: handleAction,
  });
  const busy = assistant.state === 'processing' || assistant.state === 'speaking';

  const saveSuit = useCallback(
    (suit: Suit) => {
      setSuits((list) => (list.some((s) => s.id === suit.id) ? list.map((s) => (s.id === suit.id ? suit : s)) : [...list, suit]));
      selectSuit(suit.id);
      log(`Workshop records updated for ${suit.name}.`);
    },
    [log, selectSuit],
  );
  const deleteSuit = useCallback(
    (id: string) => {
      log(`${suitName(id)} removed from the roster.`);
      setSuits((list) => list.filter((s) => s.id !== id));
    },
    [log, suitName],
  );
  const resetDemo = useCallback(() => {
    const demo = resetSuits();
    setSuits(demo);
    setDiagnosticRuns({});
    if (demo[0]) selectSuit(demo[0].id);
    log('Suit data reset to demo configuration.');
  }, [log, selectSuit]);

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
      : assistant.recognitionSupported
        ? { label: 'ONLINE', tone: 'ok' as const }
        : { label: 'TEXT MODE', tone: 'warn' as const };

  const micStatus = !assistant.recognitionSupported
    ? 'Voice input unavailable — type commands'
    : assistant.wakeArmed
      ? 'Wake word armed — say “JARVIS”'
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
      : assistant.responseText || 'Good evening. J.A.R.V.I.S. is online. Press the microphone or type a command to begin.';

  return (
    <div className="mx-auto flex min-h-dvh max-w-[1920px] flex-col gap-3 p-2 sm:p-3 lg:h-dvh lg:p-4">
      <Header now={now} availability={availability} partyMode={session.partyMode} onOpenSettings={() => setView('settings')} />

      <main className="grid flex-1 gap-3 lg:min-h-0 lg:grid-cols-[minmax(240px,300px)_minmax(0,1fr)_minmax(270px,340px)]">
        <aside className="order-3 min-w-0 lg:order-1 lg:overflow-y-auto" aria-label="Controls">
          <CommandPanel
            suits={suits}
            selectedSuitId={selectedSuitId}
            partyMode={session.partyMode}
            view={view}
            busy={busy}
            onSelectSuit={selectSuit}
            onCommand={assistant.submitText}
            onNavigate={setView}
          />
        </aside>

        <section className="order-1 flex min-h-0 min-w-0 flex-col items-center justify-center gap-2 py-2 lg:order-2 lg:overflow-y-auto lg:gap-3" aria-label="JARVIS">
          <div className="w-[min(78vw,340px)] sm:w-[min(60vw,420px)] lg:w-[max(180px,min(100%,calc(100dvh-35rem),620px))] lg:shrink-0">
            <JarvisCore state={assistant.state} pulse={assistant.speechPulse} booting={assistant.booting} partyMode={session.partyMode} />
          </div>
          <p
            className={`font-display text-xs tracking-[0.4em] uppercase ${assistant.state === 'error' ? 'text-warn' : 'text-arc-bright'}`}
            aria-live="polite"
          >
            {assistant.wakeArmed && assistant.state === 'standby' ? 'Awaiting wake word' : STATE_LABELS[assistant.state]}
          </p>
          <p
            className={`min-h-[2.6em] max-w-3xl px-2 text-center text-lg leading-snug sm:text-xl lg:text-2xl ${assistant.state === 'error' ? 'text-warn' : 'text-ice'}`}
            aria-live="polite"
          >
            {displayText}
          </p>
          {assistant.state !== 'error' && assistant.errorMessage && <p className="text-sm text-warn">{assistant.errorMessage}</p>}
          <VoiceControl assistant={assistant} activationMode={settings.activationMode} />
        </section>

        <aside className="order-2 flex min-w-0 flex-col gap-3 lg:order-3 lg:overflow-y-auto" aria-label="Suit telemetry">
          <SuitStatusPanel suit={selectedSuit} now={now} />
          <TelemetryPanel suit={selectedSuit} activity={activity} lastDiagnosticAt={selectedSuitId ? diagnosticRuns[selectedSuitId] : undefined} />
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
          {view === 'workshop' && (
            <Workshop
              suits={suits}
              selectedSuitId={selectedSuitId}
              now={now}
              onSelectSuit={selectSuit}
              onSaveSuit={saveSuit}
              onDeleteSuit={deleteSuit}
              onResetDemo={resetDemo}
            />
          )}
          {view === 'diagnostics' && <Diagnostics suits={suits} now={now} busy={busy} capabilities={capabilities} onCommand={assistant.submitText} />}
          {view === 'settings' && (
            <Settings
              settings={settings}
              voices={voices}
              recognitionSupported={assistant.recognitionSupported}
              busy={busy}
              onChange={setSettings}
              onTestVoice={() => void assistant.speakText(VOICE_TEST_LINE)}
              onOpenWorkshop={() => setView('workshop')}
              onResetDemo={resetDemo}
            />
          )}
        </Drawer>
      )}
    </div>
  );
}
