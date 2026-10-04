IMPORT: everything below (components, types, status meta, ConfirmProvider/useConfirm) from the barrel `components/ui` (from pages/admin: `../../components/ui`). Formatting helpers are NOT in the barrel: import from `../../utils/format`; `cn` from `../../utils/cn`. ConfirmProvider must be mounted once in App.tsx inside the Router (message may contain Links). Icons: pass lucide elements (<Plus />) to leftIcon/rightIcon/icon slots — they are auto-sized to 16px; StatCard/EmptyState take the icon COMPONENT (icon={Store}).

BUTTONS
- Button (forwardRef<HTMLButtonElement>; all <button> props) — variant 'primary'(default)|'secondary'|'ghost'|'danger'|'dangerOutline'|'link'; size 'sm'|'md'(default)|'lg'; loading (spinner replaces leftIcon + disables + aria-busy); leftIcon/rightIcon: ReactNode; fullWidth; type defaults to 'button'.
- IconButton (forwardRef; <button> props) — REQUIRED 'aria-label'; variant 'secondary'|'ghost'(default)|'danger'; size 'sm'(32px)|'md'(36px, default); loading; children = one lucide icon. Wrap in <Tooltip> when meaning is not obvious.
- LinkButton — react-router <Link> styled as Button: to (+ other LinkProps), variant, size, leftIcon, rightIcon, fullWidth, className.
- buttonClasses(variant='primary', size='md', fullWidth?, className?) → class string for ad-hoc anchors.
- Types: ButtonProps, ButtonVariant, ButtonSize, IconButtonProps, IconButtonVariant, IconButtonSize, LinkButtonProps.

FORM CONTROLS
- FormField — { label?, htmlFor?, hint?, error?, required?, className?, children }. error (red, role=alert) replaces hint; required adds red asterisk.
- Input (forwardRef<HTMLInputElement>; <input> props minus size) — invalid?; leftIcon? (adds pl-9); rightElement? (interactive node at right, adds pr-9); inputSize 'sm'|'md'(default); containerClassName? (wrapper used only when an adornment is present).
- Textarea (forwardRef; <textarea> props) — invalid?; inputSize; min-h 96px.
- Select (forwardRef<HTMLSelectElement>; <select> props minus size) — invalid?; selectSize 'sm'|'md'(default); containerClassName?; pass <option> children; chevron built in. Always wrapped in a relative div (use containerClassName="w-40" to size).
- Checkbox (forwardRef<HTMLInputElement>; <input> props minus type/size) — label?: ReactNode (renders clickable label row; className then goes on the row), description?: string, invalid?. Without label renders the bare 16px box.
- SearchInput (controlled) — { value: string; onChange(value: string); onSubmit?(value) on Enter; placeholder='Search…'; inputSize; className; containerClassName (merged with default 'w-full sm:w-64'); id; name; autoFocus; disabled; 'aria-label' }. Shows clear (X) when non-empty; Escape clears.
- Toggle — { checked; onChange(next: boolean); disabled?; label?; description?; size 'sm'|'md'(default); 'aria-label'? (REQUIRED when no label); id?; className? }. role=switch, aria-checked. Use for settings that apply immediately; use Checkbox inside saved forms.
- Types: FormFieldProps, InputProps, TextareaProps, SelectProps, CheckboxProps, SearchInputProps, ControlSize ('sm'|'md'), ToggleProps, ToggleSize.

BADGES
- Badge — { tone 'neutral'(default)|'brand'|'success'|'warning'|'danger'|'info'; dot?; size 'sm'|'md'(default); className?; title?; children }. BADGE_TONE_CLASSES: Record<BadgeTone, string>. Types BadgeProps, BadgeTone, BadgeSize.
- StatusBadge — { kind: 'order'|'payment'|'verification'|'document'|'generic'|'role'|'payout'|'offer'|'notification'|'severity'; value: string|null|undefined; size?; dot? (default true); className? }. Picks label+tone from statusMeta; unknown → humanised neutral; null/'' → '—' (document kind → 'Not uploaded'). Type StatusBadgeProps.

LAYOUT / CONTENT
- Card (div props + className) — white, border-gray-200, rounded-md, no shadow.
- CardHeader — { title?: ReactNode; description?: ReactNode; actions? (right-aligned); className?; children? (replaces the title block) }.
- CardBody (div props) — padding 'none'|'sm'(p-4)|'md'(p-5, default). Use padding="none" when wrapping FilterBar/TableContainer/Pagination.
- CardFooter (div props) — grey bar px-5 py-3 border-t, rounded-b-md. Form actions go here (Cancel secondary + Save primary).
- PageHeader — { title: string; description?: string; actions?: ReactNode; breadcrumbs?: { label: string; to?: string }[]; backTo?: string; backLabel='Back'; className?; children? (row under the title, e.g. <Tabs/>) }. mb-6, renders the page <h1>.
- StatCard — { label: string; value: ReactNode; hint?: string; icon?: ComponentType<{className?}>; delta?: { value: string; direction 'up'|'down'|'flat'; label?: string } (ONLY from real comparison data); to?: string (renders Link); onClick?() (renders button, use for quick filters); active? (brand ring + aria-pressed); loading? (skeleton bar); className? }.
- StatGrid — { columns 2|3|4(default)|5|6; className?; children }. Responsive grid gap-4.
- DescriptionList — { items: { label: string; value: ReactNode; fullWidth?; className? }[]; columns 1|2(default)|3; className? }. Empty/null value renders '—'.
- FilterBar — { children; actions? (pushed right via ml-auto); className? }. flex-wrap toolbar with border-b; place as first child of a Card (CardBody padding="none") above TableContainer.
- EmptyState — { icon?: ComponentType (default Inbox); title: string; description?: string; action?: ReactNode; compact? (py-8 vs py-16); className? }.
- Types: CardProps, CardHeaderProps, CardBodyProps, CardFooterProps, CardPadding, PageHeaderProps, Breadcrumb, StatCardProps, StatGridProps, StatGridColumns, StatDelta, DeltaDirection, DescriptionListProps, DescriptionItem, DescriptionColumns, FilterBarProps, EmptyStateProps.

TABLE (all accept native element props + className)
- TableContainer (overflow-x-auto, bordered, rounded-md; pass className="border-0 rounded-none" when inside a Card), Table (min-w-full text-sm), THead (bg-gray-50), TBody.
- Tr — { clickable? (hover bg + pointer; pair with onClick); selected? (bg-brand-50) }.
- Th — { align 'left'(default)|'right'|'center' }; uppercase xs header, scope=col.
- Td — { align; muted? (gray-500); nowrap? }. Add className="tabular-nums" for numbers.
- TableEmptyRow — { colSpan: number; children } → put <EmptyState compact … /> inside.
- TableSkeletonRows — { rows: number; cols: number } → render inside TBody while loading.
- Pagination — { page: number (1-based); pageSize: number; total: number; onPageChange(page: number); pageSizeOptions?: number[]; onPageSizeChange?(size: number); className? }. Shows "Showing a–b of N" (or "No results"), Prev/Next IconButtons, ≤5 numbered buttons (active = solid brand). Clamps page into range and, when total>0 and the given page is out of range, calls onPageChange(clampedPage) so parent state resyncs. Place directly after TableContainer inside the Card. Keep pageSize ∈ pageSizeOptions.
- Types: TableContainerProps, TableProps, THeadProps, TBodyProps, TrProps, ThProps, TdProps, TableEmptyRowProps, TableSkeletonRowsProps, CellAlign, PaginationProps.

OVERLAYS
- Modal — { open: boolean; onClose(); title?: string; description?: string; size 'sm'(max-w-sm)|'md'(max-w-lg, default)|'lg'(2xl)|'xl'(4xl)|'full'(6xl); footer?: ReactNode (right-aligned grey bar: put Cancel/Save Buttons here); children; closeOnOverlay=true; initialFocusRef?: RefObject<HTMLElement>; labelledBy?: string (id of your own heading when no title); className?; bodyClassName? }. Portal to body, Escape closes, body scroll lock + restore, focus trap + restore, role=dialog aria-modal, close IconButton in header when title given. Types ModalProps, ModalSize.
- ConfirmDialog — { open; title: string; message: ReactNode; confirmLabel='Confirm'; cancelLabel='Cancel'; tone 'primary'(default)|'danger' (danger shows AlertTriangle in red box + danger Button); loading?; onConfirm(): void|Promise<void> (button spins until the promise settles); onCancel() }. Prefer useConfirm. Types ConfirmDialogProps, ConfirmTone.
- ConfirmProvider ({ children }) — mount once in App.tsx. useConfirm(): (opts: { title: string; message: ReactNode; confirmLabel?; cancelLabel?; tone?: 'danger'|'primary' }) => Promise<boolean>. Resolves true on confirm, false on cancel/Escape/backdrop. Usage: `const confirm = useConfirm(); if (!(await confirm({ title: 'Delete product?', message: 'This cannot be undone.', confirmLabel: 'Delete', tone: 'danger' }))) return; await doIt(); showToast('Deleted', 'success');`. A second confirm() while one is open resolves the first false. Types ConfirmOptions, ConfirmFn.
- DropdownMenu — { trigger: ReactElement (MUST accept onClick/aria-* — use <IconButton aria-label="Actions"><MoreHorizontal/></IconButton> or <Button>; do not wrap the trigger in Tooltip); align 'left'|'right'(default); children; className?; menuClassName? }. Closes on outside click, Escape, or item select.
- DropdownItem — { onSelect(); icon?: ReactNode; tone 'default'|'danger'; disabled?; className?; children }.
- DropdownSeparator — { className? }.
- Tooltip — { content: string; side 'top'(default)|'right'|'bottom'|'left'; className?; children }. Pure CSS on hover/focus-within; wrap IconButtons and collapsed sidebar items. Empty content renders children only.
- Alert — { tone: 'info'|'success'|'warning'|'danger' (REQUIRED); title?: string; children?; actions?: ReactNode (e.g. <Button variant="secondary" size="sm" onClick={reload}>Retry</Button>); onDismiss?(); className? }. role=alert for warning/danger, status otherwise.
- Types: DropdownMenuProps, DropdownItemProps, DropdownAlign, DropdownItemTone, TooltipProps, TooltipSide, AlertProps, AlertTone.

FEEDBACK / NAVIGATION
- Spinner — { size 'sm'(16px)|'md'(24px, default)|'lg'(32px); className?; label='Loading' } → brand Loader2, role=status.
- PageLoader — { label?: string; className? } → centred py-24 spinner + optional grey label. Use for Suspense fallback, auth check, first page load.
- Skeleton — { className } (e.g. 'h-4 w-32'); the only animate-pulse.
- Tabs<T extends string> — { value: T; onChange(v: T); items: { value: T; label: string; count?: number; icon?: ReactNode; disabled? }[]; className?; 'aria-label'? }. Underline tabs; count renders as neutral Badge. Generic so useState<'pending'|'approved'|'all'> needs no cast.
- SegmentedControl<T extends string> — { value: T; onChange(v: T); items: { value: T; label; icon?; disabled? }[]; size 'sm'(default)|'md'; className?; 'aria-label'? }. Bordered button group for 7d/30d/90d.
- Avatar — { name?: string|null; src?: string|null; size 'sm'(28px)|'md'(36px, default)|'lg'(48px); className? }. Image when it loads, else initials on brand-100; role=img.
- Types: SpinnerProps, SpinnerSize, PageLoaderProps, SkeletonProps, TabsProps, TabItem, SegmentedControlProps, SegmentedControlItem, AvatarProps, AvatarSize.

STATUS META (utils/statusMeta.ts; all re-exported from the barrel). Each fn(value: string|null|undefined) → { label: string; tone: BadgeTone }; case-insensitive; unknown → { humanize(value), 'neutral' }; empty → '—'.
- orderStatusMeta — placed, confirmed, preparing(warning), ready, assigned→'Rider assigned', picking_up, picked_up, shipped→'Out for delivery', delivered(success), cancelled(danger); plus raw DB aliases pending_at_store, store_accepted, preparing_order, ready_for_pickup, delivery_partner_assigned, order_picked_up, in_transit, order_delivered, order_cancelled.
- paymentStatusMeta — pending, authorized (warning); paid (success); failed, cancelled (danger); refunded, partially_refunded (neutral); refund_required, unpaid (warning).
- verificationStatusMeta — pending, pending_verification, under_review, submitted, incomplete (warning); approved, verified, active (success); inactive, offboarded (neutral); rejected, suspended, deleted (danger). Use for stores, riders, product submissions, profile change requests, reviews.
- documentStatusMeta — pending→'Pending review', approved, rejected, expired, missing; null/'' → 'Not uploaded'.
- genericStatusMeta — active/'Active', inactive/'Inactive', suspended, deleted, approved, rejected, pending, draft, published, open(warning), closed, resolved, in_progress, online, offline, enabled, disabled, hidden, visible, reactivated, success, error, failed, failure, completed, paid, unread(brand), read.
- roleMeta — super_admin(brand), admin(info), manager(success), viewer(neutral); also customer, shopkeeper, store, rider, delivery_partner→'Rider'.
- payoutStatusMeta — pending, processing, paid, failed, cancelled.
- offerStatusMeta + deriveOfferStatus(isActive: boolean, validUntil?: string|null, validFrom?: string|null, now?: number) → OfferStatus 'active'|'inactive'|'scheduled'|'expired' (coupons have no status column).
- notificationTypeMeta — all 24 admin_notifications.type values (new_order, order_delivered, order_cancelled, refund_required, new_user, product_updated, store_added, store_status_changed, store_image_added/removed, owner_photo_updated, verification_submitted, document_uploaded/removed, rider_verification_submitted, rider_document_uploaded/removed, rider_status_changed, rider_profile_photo_updated, rider_vehicle_photo_updated, profile_change_request, support_message, admin_review_action, system).
- severityMeta — low(neutral), medium(info), high(warning), critical(danger) for security_events.severity.
- statusMetaFor(kind: StatusKind, value) — dispatcher used by StatusBadge. humanize('picking_up') → 'Picking up'.
- Types: StatusMeta, StatusKind, OfferStatus.

FORMAT HELPERS (utils/format.ts — import directly, not from the barrel): formatCurrency(v, { paise?: boolean; compact?: boolean }) → '₹1,23,456' (paise → '₹1,234.50'); formatNumber(v) → '12,345'; formatDate(iso) → '04 Oct 2026'; formatDateTime(iso) → '04 Oct 2026, 14:05'; formatTime(iso) → '14:05'; timeAgo(iso, now?) → 'just now'|'5m ago'|'3h ago'|'2d ago'|date; humanize(s); initials(name, fallback='AD'); shortId(id, length=8) → 'abcdef12…'. All accept null/undefined and return '—' (or 0 for numbers). cn(...parts: (string|false|null|undefined)[]) in utils/cn.ts.