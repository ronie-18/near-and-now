import { useId } from 'react';
import { cn } from '../../utils/cn';

export type ToggleSize = 'sm' | 'md';

export interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: string;
  description?: string;
  size?: ToggleSize;
  'aria-label'?: string;
  id?: string;
  className?: string;
}

const TRACK: Record<ToggleSize, string> = {
  sm: 'h-4 w-7',
  md: 'h-5 w-9',
};

// The track has a 2px transparent border, so its content box is 4px smaller
// than the outer size: md 36x20 → 32x16, sm 28x16 → 24x12. The thumb fills the
// content height and travels (content width − thumb width): 16px / 12px.
const THUMB: Record<ToggleSize, { base: string; on: string; off: string }> = {
  sm: { base: 'h-3 w-3', on: 'translate-x-3', off: 'translate-x-0' },
  md: { base: 'h-4 w-4', on: 'translate-x-4', off: 'translate-x-0' },
};

/**
 * On/off switch for boolean settings that apply immediately (store online,
 * coupon active, feature flags). Use `Checkbox` inside forms that are saved
 * with a button instead.
 */
export function Toggle({
  checked,
  onChange,
  disabled = false,
  label,
  description,
  size = 'md',
  'aria-label': ariaLabel,
  id,
  className,
}: ToggleProps) {
  const autoId = useId();
  const switchId = id ?? autoId;
  const descriptionId = description ? `${switchId}-description` : undefined;

  const control = (
    <button
      type="button"
      role="switch"
      id={switchId}
      aria-checked={checked}
      aria-label={label ? undefined : ariaLabel}
      aria-describedby={descriptionId}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        TRACK[size],
        checked ? 'bg-brand-600' : 'bg-gray-300',
        !label && className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none inline-block rounded-full bg-white shadow-sm transition-transform',
          THUMB[size].base,
          checked ? THUMB[size].on : THUMB[size].off,
        )}
      />
    </button>
  );

  if (!label) return control;

  return (
    <div className={cn('flex items-start gap-3', className)}>
      {control}
      <div className="min-w-0">
        <label
          htmlFor={switchId}
          className={cn('block text-sm font-medium text-gray-700', disabled ? 'cursor-not-allowed' : 'cursor-pointer')}
        >
          {label}
        </label>
        {description ? (
          <p id={descriptionId} className="mt-0.5 text-xs text-gray-500">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}
