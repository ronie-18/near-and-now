import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Eye, Lock, Mail, Save, Shield, ShieldAlert, ShieldCheck, User } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  FormField,
  Input,
  LinkButton,
  PageHeader,
  PageLoader,
  SegmentedControl,
  StatusBadge,
  genericStatusMeta,
} from '../../components/ui';
import { cn } from '../../utils/cn';
import {
  getAdminById,
  updateAdmin,
  Admin,
  UpdateAdminData,
  getRoleDisplayName,
  getRoleDescription,
  getDefaultPermissions,
  hasPermission,
} from '../../services/adminAuthService';
import { UpdateAdminSchema } from '../../schemas/admin.schema';
import { getCurrentAdmin } from '../../services/secureAdminAuth';

type FieldKey = 'full_name' | 'email' | 'password' | 'confirmPassword';
type FieldErrors = Partial<Record<FieldKey, string>>;

const ROLES: Array<{ value: Admin['role']; icon: typeof Shield }> = [
  { value: 'super_admin', icon: ShieldCheck },
  { value: 'admin', icon: Shield },
  { value: 'manager', icon: ShieldAlert },
  { value: 'viewer', icon: Eye },
];

const STATUSES: Admin['status'][] = ['active', 'inactive', 'suspended'];

const PASSWORD_HINT =
  'Leave blank to keep the current password. If set: min. 8 characters, with at least one ' +
  'uppercase, lowercase, number, and special character.';

const EditAdminPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [admin, setAdmin] = useState<Admin | null>(null);
  // Bumped by the Retry button so a failed load can be re-attempted in place.
  const [reloadKey, setReloadKey] = useState(0);

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    full_name: '',
    role: 'admin' as Admin['role'],
    status: 'active' as Admin['status']
  });

  const currentAdmin: Admin | null = getCurrentAdmin();

  // Check permission
  const canEdit = !!currentAdmin && hasPermission(currentAdmin, 'admins.edit');

  // Editing your own account: the backend (admin.controller.ts updateAdmin)
  // refuses role !== super_admin, status !== active, and a password change
  // without oldPassword (that flow lives in SettingsPage). Previously the
  // controls were fully interactive and the user only learnt on submit, so
  // the role/status pickers are locked and the password fields hidden here.
  const isSelf = !!currentAdmin && currentAdmin.id === id;

  useEffect(() => {
    // Unauthorised users never see the form; do not fire the fetch for them.
    if (!canEdit) {
      setLoading(false);
      return;
    }

    if (!id) {
      setError('Invalid admin ID.');
      setLoading(false);
      return;
    }

    // Reset when the id changes (/admins/edit/A -> /admins/edit/B) so the
    // previous admin's form is never shown against the new URL, and drop
    // out-of-order responses via the cancelled flag.
    let cancelled = false;
    setLoading(true);
    setError(null);
    setAdmin(null);
    setFieldErrors({});

    const fetchAdmin = async () => {
      try {
        const data = await getAdminById(id);
        if (cancelled) return;
        if (!data) {
          // getAdminById resolves to null only when no such row exists; load
          // failures throw and are handled by the catch below.
          setError('Admin not found.');
          return;
        }

        setAdmin(data);
        setFormData({
          email: data.email,
          password: '',
          confirmPassword: '',
          full_name: data.full_name,
          role: data.role,
          status: data.status
        });
      } catch (err) {
        if (cancelled) return;
        console.error('Error fetching admin:', err);
        setError('Failed to load admin details.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchAdmin();

    return () => {
      cancelled = true;
    };
  }, [id, canEdit, reloadKey]);

  if (!canEdit) {
    return (
      <div className="max-w-3xl space-y-6">
        <PageHeader title="Edit admin" backTo="/admins" backLabel="Admin users" />
        <Alert
          tone="danger"
          title="You do not have permission to edit admins."
          actions={
            <LinkButton to="/admins" variant="secondary" size="sm">
              Back to admin users
            </LinkButton>
          }
        />
      </div>
    );
  }

  const updateField = (key: FieldKey, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    if (fieldErrors[key]) {
      setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Enter in a field can re-submit while the button is already spinning.
    if (saving) return;
    setError(null);
    setFieldErrors({});

    if (!id) return;

    // Validation
    const fullName = formData.full_name.trim();
    const email = formData.email.trim();
    const nextErrors: FieldErrors = {};

    // UpdateAdminSchema was imported but only its password rule was ever
    // applied client-side. Email now goes through the schema; the name uses
    // the schema's length bounds (2-100) but deliberately NOT its
    // letters-only regex: the backend never enforces it, so names already
    // saved with hyphens/apostrophes would otherwise become uneditable here.
    const emailCheck = UpdateAdminSchema.shape.email.unwrap().safeParse(email);
    if (!emailCheck.success) {
      nextErrors.email = emailCheck.error.issues[0]?.message || 'Invalid email address';
    }
    if (fullName.length < 2) {
      nextErrors.full_name = 'Name must be at least 2 characters';
    } else if (fullName.length > 100) {
      nextErrors.full_name = 'Name is too long';
    }

    if (!isSelf && formData.password) {
      if (formData.password !== formData.confirmPassword) {
        nextErrors.confirmPassword = 'Passwords do not match.';
      }

      // Same schema as CreateAdminPage — was already defined but never
      // actually enforced here either, only a bare length check.
      const passwordCheck = UpdateAdminSchema.shape.password.unwrap().safeParse(formData.password);
      if (!passwordCheck.success) {
        nextErrors.password = passwordCheck.error.issues[0]?.message || 'Password does not meet the strength requirements.';
      }
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }

    try {
      setSaving(true);

      const updates: UpdateAdminData = {
        email,
        full_name: fullName
      };

      // Self-edit: role/status are locked in the UI and the backend rejects
      // any change to them for the caller, so leave them undefined
      // (= unchanged) instead of echoing values the server may refuse.
      if (!isSelf) {
        updates.role = formData.role;
        updates.status = formData.status;
      }

      // Only included when set so "leave blank to keep current" keeps working.
      if (!isSelf && formData.password) {
        updates.password = formData.password;
      }

      await updateAdmin(id, updates);

      // AdminManagementPage reads state.success once and shows it as a toast
      // (same contract as CreateAdminPage); the list page used to ignore it.
      navigate('/admins', {
        state: { success: `Admin "${fullName}" updated successfully.` }
      });
    } catch (err) {
      console.error('Error updating admin:', err);
      // Backend already maps 23505 to a readable "already exists" message.
      setError(err instanceof Error && err.message ? err.message : 'Failed to update admin. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const header = (
    <PageHeader
      title="Edit admin"
      description="Update administrator details, role and status."
      backTo="/admins"
      backLabel="Admin users"
      actions={
        admin ? (
          <>
            <StatusBadge kind="role" value={admin.role} />
            <StatusBadge kind="generic" value={admin.status} />
          </>
        ) : undefined
      }
    />
  );

  if (loading) {
    return (
      <div className="max-w-3xl space-y-6">
        {header}
        <PageLoader label="Loading admin details" />
      </div>
    );
  }

  if (error && !admin) {
    return (
      <div className="max-w-3xl space-y-6">
        {header}
        <Alert
          tone="danger"
          title={error}
          actions={
            <>
              {/* Nothing to retry without an id in the URL. */}
              {id ? (
                <Button variant="secondary" size="sm" onClick={() => setReloadKey((k) => k + 1)}>
                  Retry
                </Button>
              ) : null}
              <LinkButton to="/admins" variant="secondary" size="sm">
                Back to admin users
              </LinkButton>
            </>
          }
        />
      </div>
    );
  }

  const lockRoleAndStatus = saving || isSelf;

  return (
    <div className="max-w-3xl space-y-6">
      {header}

      {error ? (
        <Alert tone="danger" title="Could not save changes" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      ) : null}

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        {/* Account details */}
        <Card>
          <CardHeader title="Account details" description="Name and sign-in email for this administrator." />
          <CardBody>
            <div className="grid gap-5 md:grid-cols-2">
              <FormField label="Full name" htmlFor="admin-full-name" required error={fieldErrors.full_name}>
                <Input
                  id="admin-full-name"
                  name="full_name"
                  type="text"
                  autoComplete="name"
                  value={formData.full_name}
                  onChange={(e) => updateField('full_name', e.target.value)}
                  leftIcon={<User aria-hidden="true" />}
                  placeholder="Full name"
                  invalid={!!fieldErrors.full_name}
                  required
                  disabled={saving}
                />
              </FormField>

              <FormField label="Email address" htmlFor="admin-email" required error={fieldErrors.email}>
                <Input
                  id="admin-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={formData.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  leftIcon={<Mail aria-hidden="true" />}
                  placeholder="name@company.com"
                  invalid={!!fieldErrors.email}
                  required
                  disabled={saving}
                />
              </FormField>
            </div>
          </CardBody>
        </Card>

        {/* Password */}
        <Card>
          <CardHeader
            title="Password"
            description={
              isSelf
                ? 'Your own password is changed from Settings.'
                : 'Optionally set a new password for this administrator.'
            }
          />
          <CardBody>
            {isSelf ? (
              <Alert tone="info">
                Changing your own password requires your current password. Use{' '}
                <Link to="/settings" className="font-medium underline">
                  Settings
                </Link>{' '}
                to change it.
              </Alert>
            ) : (
              <div className="grid gap-5 md:grid-cols-2">
                <FormField label="New password" htmlFor="admin-password" hint={PASSWORD_HINT} error={fieldErrors.password}>
                  <Input
                    id="admin-password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    value={formData.password}
                    onChange={(e) => updateField('password', e.target.value)}
                    leftIcon={<Lock aria-hidden="true" />}
                    placeholder="Leave blank to keep current"
                    minLength={8}
                    invalid={!!fieldErrors.password}
                    disabled={saving}
                  />
                </FormField>

                {/* Confirm field only appears once a new password is being typed. */}
                {formData.password ? (
                  <FormField label="Confirm new password" htmlFor="admin-confirm-password" error={fieldErrors.confirmPassword}>
                    <Input
                      id="admin-confirm-password"
                      name="confirmPassword"
                      type="password"
                      autoComplete="new-password"
                      value={formData.confirmPassword}
                      onChange={(e) => updateField('confirmPassword', e.target.value)}
                      leftIcon={<Lock aria-hidden="true" />}
                      placeholder="Repeat the new password"
                      invalid={!!fieldErrors.confirmPassword}
                      disabled={saving}
                    />
                  </FormField>
                ) : null}
              </div>
            )}
          </CardBody>
        </Card>

        {/* Role and status */}
        <Card>
          <CardHeader title="Role and status" description="Controls what this administrator can see and do." />
          <CardBody className="space-y-6">
            {isSelf ? (
              <Alert tone="warning" title="You are editing your own account">
                Your role must stay {getRoleDisplayName('super_admin')} and your account must stay active, so these options are locked.
              </Alert>
            ) : null}

            {/* Role */}
            <fieldset>
              <legend className="text-sm font-medium text-gray-700">
                Role
                <span className="ml-0.5 text-red-600" aria-hidden="true">
                  *
                </span>
              </legend>
              <div className="mt-2 grid gap-3 md:grid-cols-2">
                {ROLES.map(({ value, icon: Icon }) => {
                  const selected = formData.role === value;
                  return (
                    <label
                      key={value}
                      className={cn(
                        'relative flex items-start gap-3 rounded-md border p-4 transition-colors',
                        selected ? 'border-brand-500 bg-brand-50' : 'border-gray-200 bg-white',
                        lockRoleAndStatus ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
                        !lockRoleAndStatus && !selected && 'hover:border-gray-300',
                      )}
                    >
                      <input
                        type="radio"
                        name="role"
                        value={value}
                        checked={selected}
                        disabled={lockRoleAndStatus}
                        onChange={() => setFormData((prev) => ({ ...prev, role: value }))}
                        className="peer sr-only"
                      />
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 rounded-md peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500 peer-focus-visible:ring-offset-2"
                      />
                      <span
                        className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-md',
                          selected ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-500',
                        )}
                      >
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0">
                        <span className={cn('block text-sm font-medium', selected ? 'text-brand-800' : 'text-gray-900')}>
                          {getRoleDisplayName(value)}
                        </span>
                        <span className="mt-0.5 block text-xs text-gray-500">{getRoleDescription(value)}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {/* Status */}
            <fieldset>
              <legend className="text-sm font-medium text-gray-700">
                Status
                <span className="ml-0.5 text-red-600" aria-hidden="true">
                  *
                </span>
              </legend>
              <SegmentedControl<Admin['status']>
                aria-label="Status"
                size="md"
                className="mt-2"
                value={formData.status}
                onChange={(status) => setFormData((prev) => ({ ...prev, status }))}
                items={STATUSES.map((value) => ({
                  value,
                  label: genericStatusMeta(value).label,
                  disabled: lockRoleAndStatus,
                }))}
              />
            </fieldset>

            {/* Permissions preview (same presentation as CreateAdminPage) */}
            <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm font-medium text-gray-900">Default permissions</p>
              <p className="mt-0.5 text-xs text-gray-500">The {getRoleDisplayName(formData.role)} role includes:</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {getDefaultPermissions(formData.role).map((perm) => (
                  <Badge key={perm} tone={perm === '*' ? 'brand' : 'neutral'} title={perm}>
                    {perm === '*' ? 'All permissions' : perm}
                  </Badge>
                ))}
              </div>
            </div>
          </CardBody>

          <CardFooter className="flex items-center justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => navigate('/admins')} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving} leftIcon={<Save aria-hidden="true" />}>
              Save changes
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
};

export default EditAdminPage;
