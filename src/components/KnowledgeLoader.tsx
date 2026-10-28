import { FileUp, Loader2, ShieldCheck } from 'lucide-react';
import { useRef, useState } from 'react';

interface KnowledgeLoaderProps {
  onLoad: (file: File) => Promise<void>;
  compact?: boolean;
}

/** File picker for the knowledge export. The file is read in the browser and never uploaded. */
export function KnowledgeLoader({ onLoad, compact = false }: KnowledgeLoaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      await onLoad(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The file could not be read.');
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept=".md,.markdown,.txt,.zip,text/markdown,application/zip"
        className="sr-only"
        id={compact ? 'knowledge-file-compact' : 'knowledge-file'}
        onChange={(e) => void pick(e.target.files?.[0])}
      />
      <button type="button" className="hud-button" disabled={loading} onClick={() => inputRef.current?.click()}>
        {loading ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <FileUp size={16} aria-hidden />}
        {loading ? 'Reading file…' : 'Load knowledge file (.md or .zip)'}
      </button>
      {!compact && (
        <p className="flex items-start gap-2 text-xs text-haze">
          <ShieldCheck size={14} className="mt-0.5 shrink-0 text-ok" aria-hidden />
          Read on this device only. The file is stored in this browser's local storage and is never uploaded or added to the website.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-warn">
          {error}
        </p>
      )}
    </div>
  );
}
