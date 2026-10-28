import { CheckCircle2, XCircle } from 'lucide-react';
import { brandsPageDoc, playbookDocs } from '../services/knowledgeStructure';
import type { KnowledgeBase } from '../types/afaik';

export interface BrowserCapabilities {
  recognition: boolean;
  synthesis: boolean;
  secureContext: boolean;
  voiceCount: number;
  storage: boolean;
}

interface DiagnosticsProps {
  knowledge: KnowledgeBase | null;
  capabilities: BrowserCapabilities;
}

function Check({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <li className="flex items-start gap-2">
      {ok ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-ok" aria-label="OK" /> : <XCircle size={18} className="mt-0.5 shrink-0 text-warn" aria-label="Unavailable" />}
      <span>
        <span className="font-semibold">{label}</span>
        <span className="block text-sm text-haze">{detail}</span>
      </span>
    </li>
  );
}

export function Diagnostics({ knowledge, capabilities }: DiagnosticsProps) {
  const playbook = knowledge ? playbookDocs(knowledge) : null;
  const brands = knowledge ? brandsPageDoc(knowledge) : undefined;
  return (
    <div className="space-y-6">
      <section>
        <h3 className="hud-label mb-2">Knowledge source check</h3>
        <ul className="space-y-2.5">
          <Check
            ok={Boolean(knowledge)}
            label="Knowledge file"
            detail={knowledge ? `${knowledge.sourceName} — ${knowledge.docs.length} pages` : 'Not loaded on this device. Open the Library to load it.'}
          />
          {knowledge && (
            <>
              <Check
                ok={Boolean(playbook && playbook.length > 0)}
                label="Project Playbook"
                detail={playbook ? `${playbook.length} projects listed — used for FAI project questions.` : 'Page not found — project lists are unavailable.'}
              />
              <Check
                ok={Boolean(brands)}
                label="Brands page"
                detail={brands ? 'Found — used for Filigree, Prestige and Aspire (North/South) questions.' : 'Page not found — brand questions are unavailable.'}
              />
            </>
          )}
        </ul>
      </section>

      <section>
        <h3 className="hud-label mb-2">Browser systems check</h3>
        <p className="mb-3 text-sm text-haze">Run this on the exact device and browser you will use at the party.</p>
        <ul className="space-y-2.5">
          <Check
            ok={capabilities.recognition}
            label="Speech recognition"
            detail={capabilities.recognition ? 'Available. Chrome and Edge need an internet connection for it.' : 'Not supported here — use the text input, or try Chrome, Edge or Safari.'}
          />
          <Check
            ok={capabilities.secureContext}
            label="Secure context (HTTPS)"
            detail={capabilities.secureContext ? 'OK — the microphone can be requested.' : 'Microphone access requires HTTPS or localhost.'}
          />
          <Check
            ok={capabilities.synthesis && capabilities.voiceCount > 0}
            label="Speech synthesis"
            detail={
              capabilities.synthesis
                ? `${capabilities.voiceCount} voice${capabilities.voiceCount === 1 ? '' : 's'} available on this device.`
                : 'Not supported — responses will be shown as text only.'
            }
          />
          <Check
            ok={capabilities.storage}
            label="Local storage"
            detail={capabilities.storage ? 'Settings and suit data persist in this browser.' : 'Blocked — changes will be lost on refresh.'}
          />
        </ul>
      </section>
    </div>
  );
}
