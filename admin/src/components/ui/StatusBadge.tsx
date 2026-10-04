import { Badge, type BadgeSize } from './Badge';
import { statusMetaFor, type StatusKind } from '../../utils/statusMeta';

export interface StatusBadgeProps {
  /** Which vocabulary `value` belongs to; picks the label/tone table. */
  kind: StatusKind;
  value: string | null | undefined;
  size?: BadgeSize;
  /** Leading dot, on by default so colour reads at a glance in tables. */
  dot?: boolean;
  className?: string;
}

/**
 * Badge for domain statuses (order, payment, verification, document, role,
 * payout, offer, notification type, security severity, or generic). Unknown
 * values render a humanised neutral badge instead of raw snake_case.
 */
export function StatusBadge({ kind, value, size = 'md', dot = true, className }: StatusBadgeProps) {
  const meta = statusMetaFor(kind, value);
  return (
    <Badge tone={meta.tone} size={size} dot={dot} className={className} title={value ?? undefined}>
      {meta.label}
    </Badge>
  );
}
