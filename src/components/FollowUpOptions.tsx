import type { FollowUp, FollowUpOption } from '../types/afaik';

interface FollowUpOptionsProps {
  followUp: FollowUp | null;
  disabled: boolean;
  onChoose: (option: FollowUpOption) => void;
}

/** The choices offered by the latest answer — tap one, or say it ("Residentials", "the second one"). */
export function FollowUpOptions({ followUp, disabled, onChoose }: FollowUpOptionsProps) {
  if (!followUp || followUp.options.length === 0) return null;
  return (
    <div className="w-full max-w-3xl" role="group" aria-label={followUp.prompt || 'Choose an option'}>
      <ul className="flex max-h-40 flex-wrap justify-center gap-1.5 overflow-y-auto px-1 lg:max-h-24">
        {followUp.options.map((option, i) => (
          <li key={`${option.label}-${i}`}>
            <button type="button" className="hud-button px-2.5! py-1! text-sm" disabled={disabled} onClick={() => onChoose(option)}>
              <span className="font-mono text-xs text-haze">{i + 1}</span>
              {option.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
