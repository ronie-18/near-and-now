import {
  forwardRef,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { cn } from '../../utils/cn';

export type ControlSize = 'sm' | 'md';

const CONTROL_BASE =
  'block w-full rounded-md border bg-white text-gray-900 placeholder:text-gray-400 shadow-none ' +
  'focus:outline-none focus:ring-1 disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed';

// Font size lives on the size class (not the base) so `text-xs` on `sm` is not
// overridden by a base `text-sm` later in the generated CSS.
const CONTROL_SIZE: Record<ControlSize, string> = {
  sm: 'h-8 px-2.5 text-xs',
  md: 'h-9 px-3 text-sm',
};

const TEXTAREA_SIZE: Record<ControlSize, string> = {
  sm: 'px-2.5 py-1.5 text-xs',
  md: 'px-3 py-2 text-sm',
};

const CONTROL_STATE = {
  normal: 'border-gray-300 focus:border-brand-500 focus:ring-brand-500',
  invalid: 'border-red-500 focus:border-red-500 focus:ring-red-500',
};

const ADORNMENT = 'pointer-events-none absolute inset-y-0 flex items-center text-gray-400 [&>svg]:h-4 [&>svg]:w-4';

/* ------------------------------------------------------------------ */
/* FormField                                                           */
/* ------------------------------------------------------------------ */

export interface FormFieldProps {
  label?: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * Label + control + hint/error wrapper. Wrap every Input/Select/Textarea in
 * forms so spacing, required marks and validation messages are consistent.
 */
export function FormField({ label, htmlFor, hint, error, required, className, children }: FormFieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label ? (
        <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-700">
          {label}
          {required ? (
            <span className="ml-0.5 text-red-600" aria-hidden="true">
              *
            </span>
          ) : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-gray-500">{hint}</p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Input                                                               */
/* ------------------------------------------------------------------ */

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  invalid?: boolean;
  /** 16px lucide icon rendered inside the field at the left. */
  leftIcon?: ReactNode;
  /** Interactive element (clear button, unit label) rendered at the right. */
  rightElement?: ReactNode;
  inputSize?: ControlSize;
  /** Class for the positioning wrapper used when an adornment is present. */
  containerClassName?: string;
}

/**
 * Single-line text input. Pass `invalid` together with `FormField error` for
 * validation; use `leftIcon` for search/money/phone affordances.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid = false, leftIcon, rightElement, inputSize = 'md', className, containerClassName, ...rest },
  ref,
) {
  const input = (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        CONTROL_BASE,
        CONTROL_SIZE[inputSize],
        invalid ? CONTROL_STATE.invalid : CONTROL_STATE.normal,
        leftIcon ? 'pl-9' : undefined,
        rightElement ? 'pr-9' : undefined,
        className,
      )}
      {...rest}
    />
  );

  if (!leftIcon && !rightElement) return input;

  return (
    <div className={cn('relative', containerClassName)}>
      {leftIcon ? <span className={cn(ADORNMENT, 'left-0 pl-3')}>{leftIcon}</span> : null}
      {input}
      {rightElement ? (
        <span className="absolute inset-y-0 right-0 flex items-center pr-2">{rightElement}</span>
      ) : null}
    </div>
  );
});
Input.displayName = 'Input';

/* ------------------------------------------------------------------ */
/* Textarea                                                            */
/* ------------------------------------------------------------------ */

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
  inputSize?: ControlSize;
}

/** Multi-line text input with the same box styling as `Input`. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid = false, inputSize = 'md', className, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        CONTROL_BASE,
        TEXTAREA_SIZE[inputSize],
        'min-h-[96px]',
        invalid ? CONTROL_STATE.invalid : CONTROL_STATE.normal,
        className,
      )}
      {...rest}
    />
  );
});
Textarea.displayName = 'Textarea';

/* ------------------------------------------------------------------ */
/* Select                                                              */
/* ------------------------------------------------------------------ */

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  invalid?: boolean;
  selectSize?: ControlSize;
  containerClassName?: string;
}

/**
 * Native `<select>` with the shared box styling and a chevron. Pass
 * `<option>` elements as children; prefer this over custom dropdowns for
 * filters and form enums.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { invalid = false, selectSize = 'md', className, containerClassName, children, ...rest },
  ref,
) {
  return (
    <div className={cn('relative', containerClassName)}>
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          CONTROL_BASE,
          CONTROL_SIZE[selectSize],
          'appearance-none pr-9',
          invalid ? CONTROL_STATE.invalid : CONTROL_STATE.normal,
          className,
        )}
        {...rest}
      >
        {children}
      </select>
      <span className={cn(ADORNMENT, 'right-0 pr-3')}>
        <ChevronDown aria-hidden="true" />
      </span>
    </div>
  );
});
Select.displayName = 'Select';

/* ------------------------------------------------------------------ */
/* Checkbox                                                            */
/* ------------------------------------------------------------------ */

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label?: ReactNode;
  description?: string;
  invalid?: boolean;
}

/**
 * Native checkbox in brand colour. With `label` it renders a clickable
 * label row; without it, a bare box (for table select-all cells).
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, description, invalid = false, className, disabled, ...rest },
  ref,
) {
  const box = (
    <input
      ref={ref}
      type="checkbox"
      disabled={disabled}
      aria-invalid={invalid || undefined}
      className={cn(
        'h-4 w-4 shrink-0 cursor-pointer rounded border-gray-300 text-brand-600 accent-brand-600',
        'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-1 disabled:cursor-not-allowed',
        invalid && 'border-red-500',
        !label && className,
      )}
      {...rest}
    />
  );

  if (!label) return box;

  return (
    <label className={cn('flex items-start gap-2.5', disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer', className)}>
      <span className="flex h-5 items-center">{box}</span>
      <span className="min-w-0">
        <span className="block text-sm text-gray-700">{label}</span>
        {description ? <span className="mt-0.5 block text-xs text-gray-500">{description}</span> : null}
      </span>
    </label>
  );
});
Checkbox.displayName = 'Checkbox';

/* ------------------------------------------------------------------ */
/* SearchInput                                                         */
/* ------------------------------------------------------------------ */

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Called with the current value when the user presses Enter. */
  onSubmit?: (value: string) => void;
  placeholder?: string;
  className?: string;
  containerClassName?: string;
  inputSize?: ControlSize;
  id?: string;
  name?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  'aria-label'?: string;
}

/**
 * Controlled search box for FilterBars: magnifier icon, native search
 * semantics and a clear button once there is text.
 */
export function SearchInput({
  value,
  onChange,
  onSubmit,
  placeholder = 'Search…',
  className,
  containerClassName,
  inputSize = 'md',
  id,
  name,
  autoFocus,
  disabled,
  'aria-label': ariaLabel,
}: SearchInputProps) {
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && onSubmit) {
      e.preventDefault();
      onSubmit(value);
    } else if (e.key === 'Escape' && value) {
      onChange('');
    }
  };

  return (
    <Input
      type="search"
      id={id}
      name={name}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      autoFocus={autoFocus}
      disabled={disabled}
      inputSize={inputSize}
      aria-label={ariaLabel ?? placeholder}
      autoComplete="off"
      leftIcon={<Search aria-hidden="true" />}
      rightElement={
        value ? (
          <button
            type="button"
            onClick={() => onChange('')}
            disabled={disabled}
            aria-label="Clear search"
            className="inline-flex h-6 w-6 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null
      }
      className={cn('[&::-webkit-search-cancel-button]:appearance-none', className)}
      containerClassName={cn('w-full sm:w-64', containerClassName)}
    />
  );
}
