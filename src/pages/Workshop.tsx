import { Plus, RotateCcw, Save, Timer, Trash2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { REPAIR_LABELS, DIAGNOSTIC_LABELS } from '../components/suitDisplay';
import { DIAGNOSTIC_STATUSES, REPAIR_STATUSES, type DiagnosticStatus, type RepairStatus, type Suit } from '../types/jarvis';
import { durations, formatCountdown, getRepairRemainingMs, isoToLocalInput, localInputToIso } from '../utils/time';
import { hasErrors, validateSuit, type SuitFieldErrors } from '../utils/validation';

interface WorkshopProps {
  suits: Suit[];
  selectedSuitId: string | null;
  now: number;
  onSelectSuit: (id: string) => void;
  onSaveSuit: (suit: Suit) => void;
  onDeleteSuit: (id: string) => void;
  onResetDemo: () => void;
}

/** Form state keeps numeric fields as strings so "empty" can mean "unknown". */
interface Draft {
  id: string;
  isNew: boolean;
  name: string;
  designation: string;
  repairStatus: RepairStatus;
  repairProgress: string;
  repairCompletesAt: string;
  powerLevel: string;
  diagnosticStatus: DiagnosticStatus;
  notes: string;
  fictional: boolean;
}

const NEW_ID = '__new__';

function toDraft(suit: Suit): Draft {
  return {
    id: suit.id,
    isNew: false,
    name: suit.name,
    designation: suit.designation,
    repairStatus: suit.repairStatus,
    repairProgress: suit.repairProgress === null ? '' : String(suit.repairProgress),
    repairCompletesAt: isoToLocalInput(suit.repairCompletesAt),
    powerLevel: suit.powerLevel === null ? '' : String(suit.powerLevel),
    diagnosticStatus: suit.diagnosticStatus,
    notes: suit.notes,
    fictional: suit.fictional,
  };
}

function blankDraft(): Draft {
  return {
    id: NEW_ID,
    isNew: true,
    name: '',
    designation: '',
    repairStatus: 'operational',
    repairProgress: '',
    repairCompletesAt: '',
    powerLevel: '',
    diagnosticStatus: 'unknown',
    notes: '',
    fictional: false,
  };
}

const parsePercent = (value: string): number | null => (value.trim() === '' ? null : Number(value));

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'suit';
}

function fromDraft(draft: Draft, existing: Suit[]): Suit {
  let id = draft.id;
  if (draft.isNew) {
    const base = slugify(draft.designation || draft.name);
    id = base;
    for (let i = 2; existing.some((s) => s.id === id); i += 1) id = `${base}-${i}`;
  }
  return {
    id,
    name: draft.name.trim(),
    designation: draft.designation.trim(),
    repairStatus: draft.repairStatus,
    repairProgress: parsePercent(draft.repairProgress),
    // An entered but unparsable date stays as the raw string so validation reports it.
    repairCompletesAt: draft.repairCompletesAt ? (localInputToIso(draft.repairCompletesAt) ?? draft.repairCompletesAt) : null,
    powerLevel: parsePercent(draft.powerLevel),
    diagnosticStatus: draft.diagnosticStatus,
    notes: draft.notes.trim(),
    fictional: draft.fictional,
  };
}

function Field({ label, error, hint, children, htmlFor }: { label: string; error?: string; hint?: string; children: ReactNode; htmlFor: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-sm font-semibold text-haze">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-sm text-crit">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-haze/80">{hint}</p>
      )}
    </div>
  );
}

export function Workshop({ suits, selectedSuitId, now, onSelectSuit, onSaveSuit, onDeleteSuit, onResetDemo }: WorkshopProps) {
  const initial = suits.find((s) => s.id === selectedSuitId) ?? suits[0];
  const [draft, setDraft] = useState<Draft>(() => (initial ? toDraft(initial) : blankDraft()));
  const [errors, setErrors] = useState<SuitFieldErrors>({});
  const [saved, setSaved] = useState(false);
  const [hours, setHours] = useState('2');
  const [minutes, setMinutes] = useState('40');

  // Follow selection changes made elsewhere (e.g. by voice) unless creating a new suit.
  useEffect(() => {
    if (draft.isNew || selectedSuitId === draft.id) return;
    const suit = suits.find((s) => s.id === selectedSuitId);
    if (suit) {
      setDraft(toDraft(suit));
      setErrors({});
    }
  }, [selectedSuitId]);

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setSaved(false);
  };

  const openSuit = (suit: Suit) => {
    setDraft(toDraft(suit));
    setErrors({});
    setSaved(false);
    onSelectSuit(suit.id);
  };

  const save = () => {
    const suit = fromDraft(draft, suits);
    const fieldErrors = validateSuit(suit, suits);
    setErrors(fieldErrors);
    if (hasErrors(fieldErrors)) return;
    onSaveSuit(suit);
    setDraft(toDraft(suit));
    setSaved(true);
  };

  const applyDuration = () => {
    const h = Number(hours || 0);
    const m = Number(minutes || 0);
    if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || m < 0 || h + m === 0) {
      setErrors((e) => ({ ...e, repairCompletesAt: 'Enter a positive number of hours and/or minutes.' }));
      return;
    }
    const iso = new Date(Date.now() + h * durations.HOUR_MS + m * durations.MINUTE_MS).toISOString();
    update('repairCompletesAt', isoToLocalInput(iso));
    setErrors(({ repairCompletesAt: _cleared, ...rest }) => rest);
  };

  const remove = () => {
    if (draft.isNew) return;
    if (!window.confirm(`Delete ${draft.name || 'this suit'}? This cannot be undone (except by resetting demo data).`)) return;
    onDeleteSuit(draft.id);
    const next = suits.find((s) => s.id !== draft.id);
    setDraft(next ? toDraft(next) : blankDraft());
    setErrors({});
  };

  const reset = () => {
    if (!window.confirm('Reset all suits to the demo data? Your edits will be lost.')) return;
    onResetDemo();
    setErrors({});
    setSaved(false);
  };

  // After a reset, reload the draft from the new data.
  useEffect(() => {
    if (draft.isNew) return;
    const suit = suits.find((s) => s.id === draft.id);
    if (!suit) {
      const first = suits[0];
      setDraft(first ? toDraft(first) : blankDraft());
    }
  }, [suits]);

  const previewIso = draft.repairCompletesAt ? localInputToIso(draft.repairCompletesAt) : null;
  const previewRemaining = getRepairRemainingMs(previewIso, now);
  const err = (key: keyof Suit) => ({ 'aria-invalid': Boolean(errors[key]), 'aria-describedby': errors[key] ? `suit-${key}-error` : undefined });

  return (
    <div className="space-y-5">
      <p className="text-sm text-haze">
        Configure the data JARVIS reports. All values are simulated; JARVIS only speaks what is configured here and says “unavailable” for
        empty fields. Changes are saved in this browser.
      </p>

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Suits">
        {suits.map((s) => (
          <button key={s.id} type="button" role="tab" aria-selected={draft.id === s.id} aria-current={draft.id === s.id} className="hud-button text-sm" onClick={() => openSuit(s)}>
            {s.name}
          </button>
        ))}
        <button
          type="button"
          role="tab"
          aria-selected={draft.isNew}
          aria-current={draft.isNew}
          className="hud-button text-sm"
          onClick={() => {
            setDraft(blankDraft());
            setErrors({});
            setSaved(false);
          }}
        >
          <Plus size={14} aria-hidden /> New suit
        </button>
      </div>

      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        noValidate
      >
        <Field label="Display name" htmlFor="suit-name" error={errors.name}>
          <input id="suit-name" className="hud-input" value={draft.name} onChange={(e) => update('name', e.target.value)} {...err('name')} />
        </Field>
        <Field label="Designation" htmlFor="suit-designation" error={errors.designation} hint="e.g. Mark XLIII — used for voice matching">
          <input id="suit-designation" className="hud-input" value={draft.designation} onChange={(e) => update('designation', e.target.value)} {...err('designation')} />
        </Field>

        <Field label="Repair status" htmlFor="suit-repairStatus" error={errors.repairStatus}>
          <select id="suit-repairStatus" className="hud-input" value={draft.repairStatus} onChange={(e) => update('repairStatus', e.target.value as RepairStatus)}>
            {REPAIR_STATUSES.map((s) => (
              <option key={s} value={s}>
                {REPAIR_LABELS[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Repair progress (%)" htmlFor="suit-repairProgress" error={errors.repairProgress} hint="Leave empty if unknown">
          <input
            id="suit-repairProgress"
            className="hud-input"
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            value={draft.repairProgress}
            onChange={(e) => update('repairProgress', e.target.value)}
            {...err('repairProgress')}
          />
        </Field>

        <div className="space-y-2 sm:col-span-2">
          <Field
            label="Estimated repair completion"
            htmlFor="suit-repairCompletesAt"
            error={errors.repairCompletesAt}
            hint={
              previewRemaining === null
                ? 'Leave empty if no estimate is available'
                : previewRemaining > 0
                  ? `Counts down from now: ${formatCountdown(previewRemaining)} remaining`
                  : 'This time has already passed'
            }
          >
            <div className="flex gap-2">
              <input
                id="suit-repairCompletesAt"
                className="hud-input"
                type="datetime-local"
                value={draft.repairCompletesAt}
                onChange={(e) => update('repairCompletesAt', e.target.value)}
                {...err('repairCompletesAt')}
              />
              <button type="button" className="hud-button shrink-0 text-sm" onClick={() => update('repairCompletesAt', '')}>
                Clear
              </button>
            </div>
          </Field>
          <div className="flex flex-wrap items-end gap-2 border border-arc/10 bg-arc/5 p-2">
            <span className="flex items-center gap-1.5 self-center text-sm text-haze">
              <Timer size={15} aria-hidden /> Or set time remaining:
            </span>
            <label className="flex items-center gap-1 text-sm">
              <input className="hud-input w-16!" type="number" min={0} inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value)} aria-label="Hours" />h
            </label>
            <label className="flex items-center gap-1 text-sm">
              <input className="hud-input w-16!" type="number" min={0} max={59} inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} aria-label="Minutes" />m
            </label>
            <button type="button" className="hud-button text-sm" onClick={applyDuration}>
              Apply from now
            </button>
          </div>
        </div>

        <Field label="Power level (%) — simulated" htmlFor="suit-powerLevel" error={errors.powerLevel} hint="Leave empty if unknown">
          <input
            id="suit-powerLevel"
            className="hud-input"
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            value={draft.powerLevel}
            onChange={(e) => update('powerLevel', e.target.value)}
            {...err('powerLevel')}
          />
        </Field>
        <Field label="Diagnostic status" htmlFor="suit-diagnosticStatus" error={errors.diagnosticStatus}>
          <select
            id="suit-diagnosticStatus"
            className="hud-input"
            value={draft.diagnosticStatus}
            onChange={(e) => update('diagnosticStatus', e.target.value as DiagnosticStatus)}
          >
            {DIAGNOSTIC_STATUSES.map((s) => (
              <option key={s} value={s}>
                {DIAGNOSTIC_LABELS[s]}
              </option>
            ))}
          </select>
        </Field>

        <div className="sm:col-span-2">
          <Field label="Notes (read out during diagnostics)" htmlFor="suit-notes" error={errors.notes}>
            <textarea id="suit-notes" className="hud-input min-h-20" value={draft.notes} maxLength={280} onChange={(e) => update('notes', e.target.value)} {...err('notes')} />
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <button type="submit" className="hud-button">
            <Save size={16} aria-hidden /> {draft.isNew ? 'Add suit' : 'Save changes'}
          </button>
          {!draft.isNew && (
            <button type="button" className="hud-button text-crit" onClick={remove}>
              <Trash2 size={16} aria-hidden /> Delete
            </button>
          )}
          <span role="status" className="text-sm text-ok">
            {saved ? 'Saved.' : ''}
          </span>
          {hasErrors(errors) && <span className="text-sm text-crit">Please fix the highlighted fields.</span>}
        </div>
      </form>

      <div className="border-t border-arc/15 pt-4">
        <button type="button" className="hud-button text-sm" onClick={reset}>
          <RotateCcw size={16} aria-hidden /> Reset to demo data
        </button>
        <p className="mt-2 text-xs text-haze">Demo suits are fictional sample data. Reset sets the Mark XLIII to 2 h 40 m remaining from now.</p>
      </div>
    </div>
  );
}
