/**
 * Shared UI primitives for the admin panel. Import from here, never from
 * the individual files, so pages stay decoupled from the folder layout.
 */
export {
  Button,
  IconButton,
  LinkButton,
  buttonClasses,
  type ButtonProps,
  type ButtonVariant,
  type ButtonSize,
  type IconButtonProps,
  type IconButtonVariant,
  type IconButtonSize,
  type LinkButtonProps,
} from './Button';

export {
  FormField,
  Input,
  Textarea,
  Select,
  Checkbox,
  SearchInput,
  type FormFieldProps,
  type InputProps,
  type TextareaProps,
  type SelectProps,
  type CheckboxProps,
  type SearchInputProps,
  type ControlSize,
} from './Input';

export { Toggle, type ToggleProps, type ToggleSize } from './Toggle';

export { Badge, BADGE_TONE_CLASSES, type BadgeProps, type BadgeTone, type BadgeSize } from './Badge';

export { StatusBadge, type StatusBadgeProps } from './StatusBadge';

export {
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  type CardProps,
  type CardHeaderProps,
  type CardBodyProps,
  type CardFooterProps,
  type CardPadding,
} from './Card';

export { PageHeader, type PageHeaderProps, type Breadcrumb } from './PageHeader';

export {
  StatCard,
  StatGrid,
  type StatCardProps,
  type StatGridProps,
  type StatGridColumns,
  type StatDelta,
  type DeltaDirection,
} from './StatCard';

export {
  TableContainer,
  Table,
  THead,
  TBody,
  Tr,
  Th,
  Td,
  TableEmptyRow,
  TableSkeletonRows,
  type TableContainerProps,
  type TableProps,
  type THeadProps,
  type TBodyProps,
  type TrProps,
  type ThProps,
  type TdProps,
  type TableEmptyRowProps,
  type TableSkeletonRowsProps,
  type CellAlign,
} from './Table';

export { Pagination, type PaginationProps } from './Pagination';

export { Modal, type ModalProps, type ModalSize } from './Modal';

export { ConfirmDialog, type ConfirmDialogProps, type ConfirmTone } from './ConfirmDialog';

// The provider/hook live in context/ but pages reach for them with the
// dialog primitives, so they are re-exported here too.
export { ConfirmProvider, useConfirm, type ConfirmOptions, type ConfirmFn } from '../../context/ConfirmContext';

export { Alert, type AlertProps, type AlertTone } from './Alert';

export { EmptyState, type EmptyStateProps } from './EmptyState';

export { Spinner, PageLoader, Skeleton, type SpinnerProps, type SpinnerSize, type PageLoaderProps, type SkeletonProps } from './Spinner';

export {
  Tabs,
  SegmentedControl,
  type TabsProps,
  type TabItem,
  type SegmentedControlProps,
  type SegmentedControlItem,
} from './Tabs';

export {
  DropdownMenu,
  DropdownItem,
  DropdownSeparator,
  type DropdownMenuProps,
  type DropdownItemProps,
  type DropdownAlign,
  type DropdownItemTone,
} from './Dropdown';

export { Tooltip, type TooltipProps, type TooltipSide } from './Tooltip';

export { Avatar, type AvatarProps, type AvatarSize } from './Avatar';

export { DescriptionList, type DescriptionListProps, type DescriptionItem, type DescriptionColumns } from './DescriptionList';

export { FilterBar, type FilterBarProps } from './FilterBar';

// Status vocabularies live in utils but are re-exported here because pages
// reach for them together with StatusBadge.
export {
  orderStatusMeta,
  paymentStatusMeta,
  verificationStatusMeta,
  documentStatusMeta,
  genericStatusMeta,
  roleMeta,
  payoutStatusMeta,
  offerStatusMeta,
  deriveOfferStatus,
  notificationTypeMeta,
  severityMeta,
  statusMetaFor,
  humanize,
  type StatusMeta,
  type StatusKind,
  type OfferStatus,
} from '../../utils/statusMeta';
