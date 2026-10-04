import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { cn } from '../../utils/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dangerOutline' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

const BASE =
  'inline-flex items-center justify-center gap-2 font-medium rounded-md border transition-colors ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ' +
  'disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 border-brand-600 text-white hover:bg-brand-700 hover:border-brand-700',
  secondary: 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50',
  ghost: 'bg-transparent border-transparent text-gray-600 hover:bg-gray-100 hover:text-gray-900',
  danger: 'bg-red-600 border-red-600 text-white hover:bg-red-700',
  dangerOutline: 'bg-white border-red-300 text-red-700 hover:bg-red-50',
  link: 'border-transparent bg-transparent text-brand-700 hover:underline h-auto px-0',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-9 px-4 text-sm',
  lg: 'h-10 px-5 text-sm',
};

// The link variant has no box, so it only takes the font size from the size
// scale (its own h-auto/px-0 would otherwise lose to h-9/px-4 in CSS order).
const LINK_SIZE: Record<ButtonSize, string> = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-sm',
};

/** Shared class builder so Button, LinkButton and ad-hoc anchors look identical. */
export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  fullWidth?: boolean,
  className?: string,
): string {
  return cn(
    BASE,
    VARIANT[variant],
    variant === 'link' ? LINK_SIZE[size] : SIZE[size],
    fullWidth && 'w-full',
    className,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner in place of the left icon and disables the button. */
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
}

/**
 * Standard action button. Use `primary` for the one main action on a view,
 * `secondary` for everything else, `ghost` for toolbars, `danger` for
 * destructive confirmations and `link` for inline text actions.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    leftIcon,
    rightIcon,
    fullWidth,
    className,
    disabled,
    type = 'button',
    children,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses(variant, size, fullWidth, className)}
      {...rest}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : leftIcon ? (
        <span className="inline-flex shrink-0 [&>svg]:h-4 [&>svg]:w-4" aria-hidden="true">
          {leftIcon}
        </span>
      ) : null}
      {children}
      {rightIcon ? (
        <span className="inline-flex shrink-0 [&>svg]:h-4 [&>svg]:w-4" aria-hidden="true">
          {rightIcon}
        </span>
      ) : null}
    </button>
  );
});
Button.displayName = 'Button';

export type IconButtonVariant = 'secondary' | 'ghost' | 'danger';
export type IconButtonSize = 'sm' | 'md';

const ICON_SIZE: Record<IconButtonSize, string> = {
  sm: 'h-8 w-8',
  md: 'h-9 w-9',
};

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: icon-only buttons have no visible text. */
  'aria-label': string;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  loading?: boolean;
}

/**
 * Square icon-only button for toolbars, table rows, modal close and
 * pagination. Always pass `aria-label`; wrap in `Tooltip` when the meaning is
 * not obvious.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { variant = 'ghost', size = 'md', loading = false, className, disabled, type = 'button', children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(BASE, VARIANT[variant], ICON_SIZE[size], 'p-0 [&>svg]:h-4 [&>svg]:w-4', className)}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : children}
    </button>
  );
});
IconButton.displayName = 'IconButton';

export interface LinkButtonProps extends Omit<LinkProps, 'className'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
  className?: string;
}

/**
 * A react-router `Link` styled exactly like `Button`. Use for navigation
 * actions in page headers ("Add product") so they stay real links.
 */
export function LinkButton({
  variant = 'primary',
  size = 'md',
  leftIcon,
  rightIcon,
  fullWidth,
  className,
  children,
  ...rest
}: LinkButtonProps) {
  return (
    <Link className={buttonClasses(variant, size, fullWidth, className)} {...rest}>
      {leftIcon ? (
        <span className="inline-flex shrink-0 [&>svg]:h-4 [&>svg]:w-4" aria-hidden="true">
          {leftIcon}
        </span>
      ) : null}
      {children}
      {rightIcon ? (
        <span className="inline-flex shrink-0 [&>svg]:h-4 [&>svg]:w-4" aria-hidden="true">
          {rightIcon}
        </span>
      ) : null}
    </Link>
  );
}
