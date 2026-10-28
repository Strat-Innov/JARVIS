import { useEffect, useMemo, useState } from 'react';
import { isSynthesisSupported, loadVoices, pickDefaultVoice, sortVoices } from '../services/speechSynthesis';

export interface VoicesState {
  supported: boolean;
  loading: boolean;
  voices: SpeechSynthesisVoice[];
  /** The configured voice if available on this device, otherwise the best default. */
  activeVoice: SpeechSynthesisVoice | null;
  /** True when a saved voice is not available on this device and a fallback is in use. */
  usingFallback: boolean;
}

export function useVoices(preferredVoiceURI: string | null): VoicesState {
  const supported = isSynthesisSupported();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [loading, setLoading] = useState(supported);

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    const update = () => {
      if (!cancelled) setVoices(sortVoices(window.speechSynthesis.getVoices()));
    };
    void loadVoices().then((loaded) => {
      if (cancelled) return;
      setVoices(sortVoices(loaded));
      setLoading(false);
    });
    // Some browsers add voices later (e.g. network voices in Chrome).
    window.speechSynthesis.addEventListener('voiceschanged', update);
    return () => {
      cancelled = true;
      window.speechSynthesis.removeEventListener('voiceschanged', update);
    };
  }, [supported]);

  return useMemo(() => {
    const saved = preferredVoiceURI ? voices.find((v) => v.voiceURI === preferredVoiceURI) : undefined;
    return {
      supported,
      loading,
      voices,
      activeVoice: saved ?? pickDefaultVoice(voices),
      usingFallback: Boolean(preferredVoiceURI) && !saved && voices.length > 0,
    };
  }, [supported, loading, voices, preferredVoiceURI]);
}
