import { useEffect, useState } from 'react';
import { cn } from '../../utils/cn';
import { initials } from '../../utils/format';

export type AvatarSize = 'sm' | 'md' | 'lg';

const SIZE: Record<AvatarSize, string> = {
  sm: 'h-7 w-7 text-xs',
  md: 'h-9 w-9 text-sm',
  lg: 'h-12 w-12 text-base',
};

export interface AvatarProps {
  name?: string | null;
  src?: string | null;
  size?: AvatarSize;
  className?: string;
}

/**
 * Round user/store avatar: the image when one loads, otherwise initials on
 * a light brand background. 28 / 36 / 48px.
 */
export function Avatar({ name, src, size = 'md', className }: AvatarProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const label = name?.trim() || 'User';
  const showImage = Boolean(src) && !failed;

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-brand-100 font-semibold text-brand-800',
        SIZE[size],
        className,
      )}
    >
      {showImage ? (
        <img src={src as string} alt="" className="h-full w-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <span aria-hidden="true">{initials(label)}</span>
      )}
    </span>
  );
}
