import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';

interface DrawerProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** Side panel for secondary screens (Workshop, Diagnostics, Settings). Full-screen on mobile. */
export function Drawer({ title, onClose, children }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button type="button" aria-label="Close panel" className="absolute inset-0 bg-void/70 backdrop-blur-[2px]" onClick={onClose} tabIndex={-1} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        tabIndex={-1}
        className="hud-panel drawer-enter relative flex h-full w-full max-w-2xl flex-col bg-abyss/95 outline-none"
      >
        <div className="flex items-center justify-between border-b border-arc/15 px-4 py-3 sm:px-6">
          <h2 id="drawer-title" className="font-display text-base font-bold tracking-[0.25em] text-ice uppercase">
            {title}
          </h2>
          <button type="button" className="hud-button p-2!" onClick={onClose} aria-label="Close">
            <X size={18} aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">{children}</div>
      </div>
    </div>
  );
}
