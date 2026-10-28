import { Mic, MicOff, SendHorizontal, Square } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { VoiceAssistant } from '../hooks/useVoiceAssistant';
import type { ActivationMode } from '../types/jarvis';

interface VoiceControlProps {
  assistant: VoiceAssistant;
  activationMode: ActivationMode;
}

const START_LABELS: Record<ActivationMode, string> = {
  'push-to-talk': 'Push to talk',
  conversation: 'Start conversation',
  'wake-word': 'Listen for “JARVIS”',
};

export function VoiceControl({ assistant, activationMode }: VoiceControlProps) {
  const [text, setText] = useState('');
  const { state, micOn, recognitionSupported } = assistant;
  const busy = state === 'processing' || state === 'speaking';

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim() || busy) return;
    assistant.submitText(text);
    setText('');
  };

  return (
    <div className="flex w-full max-w-xl flex-col items-center gap-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={assistant.toggleListening}
          aria-pressed={micOn}
          aria-label={micOn ? 'Turn microphone off' : START_LABELS[activationMode]}
          className={`group relative flex h-16 w-16 items-center justify-center rounded-full border-2 transition-all sm:h-20 sm:w-20 ${
            micOn
              ? 'border-arc-bright bg-arc/25 text-white shadow-[0_0_30px_rgba(103,232,249,0.55)]'
              : 'border-arc/50 bg-arc/10 text-arc-bright hover:border-arc-bright hover:bg-arc/20'
          } ${recognitionSupported ? '' : 'opacity-60'}`}
        >
          {micOn ? <MicOff size={30} aria-hidden /> : <Mic size={30} aria-hidden />}
        </button>
        {state === 'speaking' && (
          <button type="button" className="hud-button" onClick={assistant.interrupt}>
            <Square size={14} aria-hidden /> Stop speaking
          </button>
        )}
      </div>
      <p className="hud-label text-center">{micOn ? 'Microphone on — press to stop' : START_LABELS[activationMode]}</p>

      <form onSubmit={onSubmit} className="flex w-full gap-2" aria-label="Type a command">
        <label htmlFor="command-input" className="sr-only">
          Command
        </label>
        <input
          id="command-input"
          className="hud-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={recognitionSupported ? 'Or type a command…' : 'Type a command, e.g. “Status report”'}
          autoComplete="off"
          enterKeyHint="send"
        />
        <button type="submit" className="hud-button shrink-0" disabled={busy || !text.trim()} aria-label="Send command">
          <SendHorizontal size={18} aria-hidden />
        </button>
      </form>
    </div>
  );
}
