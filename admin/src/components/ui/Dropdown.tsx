import {
  cloneElement,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { cn } from '../../utils/cn';

interface DropdownContextValue {
  close: () => void;
}

const DropdownContext = createContext<DropdownContextValue | null>(null);

export type DropdownAlign = 'left' | 'right';

export interface DropdownMenuProps {
  /** The element that opens the menu; usually an `IconButton` or `Button`. */
  trigger: ReactNode;
  align?: DropdownAlign;
  children: ReactNode;
  className?: string;
  menuClassName?: string;
}

interface TriggerInjectedProps {
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  'aria-haspopup'?: 'menu';
  'aria-expanded'?: boolean;
  'aria-controls'?: string;
}

/**
 * Click-to-open action menu (row actions, header user menu). Closes on
 * outside click, Escape, or after any `DropdownItem` is selected.
 */
export function DropdownMenu({ trigger, align = 'right', children, className, menuClassName }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const injected: TriggerInjectedProps = {
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    'aria-controls': open ? menuId : undefined,
  };

  const triggerElement = isValidElement<TriggerInjectedProps>(trigger) ? (
    cloneElement(trigger, {
      ...injected,
      onClick: (event: MouseEvent<HTMLElement>) => {
        trigger.props.onClick?.(event);
        if (!event.defaultPrevented) setOpen((value) => !value);
      },
    })
  ) : (
    <button type="button" {...injected} onClick={() => setOpen((value) => !value)}>
      {trigger}
    </button>
  );

  return (
    <div ref={rootRef} className={cn('relative inline-block', className)}>
      {triggerElement}
      {open ? (
        <DropdownContext.Provider value={{ close }}>
          <div
            id={menuId}
            role="menu"
            className={cn(
              'absolute z-40 mt-1 min-w-[180px] rounded-lg border border-gray-200 bg-white py-1 shadow-popover',
              align === 'right' ? 'right-0' : 'left-0',
              menuClassName,
            )}
          >
            {children}
          </div>
        </DropdownContext.Provider>
      ) : null}
    </div>
  );
}

export type DropdownItemTone = 'default' | 'danger';

export interface DropdownItemProps {
  onSelect: () => void;
  icon?: ReactNode;
  tone?: DropdownItemTone;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}

const ITEM_TONE: Record<DropdownItemTone, string> = {
  default: 'text-gray-700 hover:bg-gray-50',
  danger: 'text-red-600 hover:bg-red-50',
};

/** One action inside a `DropdownMenu`; the menu closes after it runs. */
export function DropdownItem({ onSelect, icon, tone = 'default', disabled = false, className, children }: DropdownItemProps) {
  const context = useContext(DropdownContext);

  const handleClick = () => {
    if (disabled) return;
    onSelect();
    context?.close();
  };

  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={handleClick}
      className={cn(
        'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
        'focus:outline-none focus-visible:bg-gray-50',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent',
        ITEM_TONE[tone],
        className,
      )}
    >
      {icon ? (
        <span className="inline-flex shrink-0 [&>svg]:h-4 [&>svg]:w-4" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  );
}

/** Thin rule between groups of `DropdownItem`s. */
export function DropdownSeparator({ className }: { className?: string }) {
  return <div role="separator" className={cn('my-1 border-t border-gray-200', className)} />;
}
