import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, Shield, ShieldCheck, ShieldAlert, ShieldOff, Eye, EyeOff } from 'lucide-react';
import {
  createAdmin,
  type Admin,
  getRoleDisplayName,
  getRoleDescription,
  getDefaultPermissions,
  hasPermission
} from '../../services/adminAuthService';
import { CreateAdminSchema } from '../../schemas/admin.schema';
import { getCurrentAdmin } from '../../services/secureAdminAuth';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  EmptyState,
  FormField,
  IconButton,
  Input,
  LinkButton,
  PageHeader
} from '../../components/ui';
import { cn } from '../../utils/cn';
import { humanize } from '../../utils/format';

type FieldName = 'full_name' | 'email' | 'password' | 'confirmPassword';
type FieldErrors = Partial<Record<FieldName, string>>;

// Visual order of the fields; each Input's id equals its FieldName so the
// first invalid control can be focused after a failed submit.
const FIELD_ORDER: FieldName[] = ['full_name', 'email', 'password', 'confirmPassword'];

// Kept in sync with Admin['role'] (4 values); labels/descriptions/permissions
// come from the service so they cannot drift from ROLE_PERMISSIONS.
const ROLES: Array<{ value: Admin['role']; icon: React.ComponentType<{ className?: string }> }> = [
  { value: 'super_admin', icon: ShieldCheck },
  { value: 'admin', icon: Shield },
  { value: 'manager', icon: ShieldAlert },
  { value: 'viewer', icon: Eye }
];

// super_admin's permission list is the single wildcard '*', which used to
// render as a bare "*" chip. "products.*" style entries read as
// "Products: all"; the raw key stays in the chip's title.
function formatPermission(perm: string): string {
  if (perm === '*') return 'All permissions';
  const [resource, action] = perm.split('.');
  if (!action) return humanize(perm);
  return `${humanize(resource)}: ${action === '*' ? 'all' : action.replace(/_/g, ' ')}`;
}

const CreateAdminPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [showPassword, setShowPassword] = useState(false);

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    full_name: '',
    role: 'admin' as Admin['role']
  });

  // Read the session once instead of JSON.parsing storage on every render.
  const currentAdmin = useMemo<Admin | null>(() => getCurrentAdmin(), []);

  // Check permission (all hooks above this early return so hook order is stable)
  if (!currentAdmin || !hasPermission(currentAdmin, 'admins.create')) {
    return (
      <div className="max-w-3xl space-y-6">
        <PageHeader title="Create admin" description="Add a new administrator account." backTo="/admins" backLabel="Admin users" />
        <Card>
          <EmptyState
            icon={ShieldOff}
            title="Access denied"
            description="You do not have permission to create admins. Only super admins can create administrator accounts."
            action={
              <LinkButton to="/admins" variant="secondary">
                Back to admin users
              </LinkButton>
            }
          />
        </Card>
      </div>
    );
  }

  const updateField = (field: FieldName, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (fieldErrors[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  // Show inline errors and move focus to the first invalid field so keyboard
  // and screen-reader users land on the problem instead of staying on Submit.
  const failValidation = (errors: FieldErrors) => {
    setFieldErrors(errors);
    const first = FIELD_ORDER.find((field) => errors[field]);
    if (first) document.getElementById(first)?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setFieldErrors({});

    // Validation (order: required fields -> passwords match -> strength -> name/email -> submit)
    const required: FieldErrors = {};
    if (!formData.full_name.trim()) required.full_name = 'Full name is required.';
    if (!formData.email.trim()) required.email = 'Email address is required.';
    if (!formData.password) required.password = 'Password is required.';
    if (!formData.confirmPassword) required.confirmPassword = 'Please confirm the password.';
    if (Object.keys(required).length > 0) {
      failValidation(required);
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      failValidation({ confirmPassword: 'Passwords do not match.' });
      return;
    }

    // The schema (upper/lower/digit/special-char) was already defined but
    // never actually enforced here — only a bare length check ran, so a
    // password like "aaaaaaaa" was accepted for an admin account.
    const passwordCheck = CreateAdminSchema.shape.password.safeParse(formData.password);
    if (!passwordCheck.success) {
      failValidation({
        password: passwordCheck.error.issues[0]?.message || 'Password does not meet the strength requirements.'
      });
      return;
    }

    // Name and email previously relied on HTML `required`/type=email only, so
    // schema violations surfaced as raw server errors (if at all).
    const nameCheck = CreateAdminSchema.shape.full_name.safeParse(formData.full_name.trim());
    const emailCheck = CreateAdminSchema.shape.email.safeParse(formData.email.trim());
    if (!nameCheck.success || !emailCheck.success) {
      failValidation({
        full_name: nameCheck.success ? undefined : nameCheck.error.issues[0]?.message || 'Invalid name.',
        email: emailCheck.success ? undefined : emailCheck.error.issues[0]?.message || 'Invalid email address.'
      });
      return;
    }

    try {
      setLoading(true);

      // The service lowercases/trims the email and the backend derives
      // created_by from the Bearer token, so neither is set here.
      await createAdmin({
        email: formData.email,
        password: formData.password,
        full_name: formData.full_name.trim(),
        role: formData.role
      });

      // AdminManagementPage reads state.success once and shows it as a toast.
      navigate('/admins', {
        state: { success: `Admin "${formData.full_name.trim()}" created successfully.` }
      });
    } catch (err: any) {
      console.error('Error creating admin:', err);
      // The backend answers 409 "An admin with this email already exists";
      // the raw Postgres "duplicate key" text is matched too in case it leaks through.
      if (/already exists|duplicate/i.test(err?.message || '')) {
        setError('An admin with this email already exists.');
      } else {
        setError(err?.message || 'Failed to create admin. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Roving-tabindex radiogroup: arrow keys move selection between role cards.
  const handleRoleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, current: Admin['role']) => {
    const order = ROLES.map((r) => r.value);
    const idx = order.indexOf(current);
    let next: Admin['role'] | undefined;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = order[(idx + 1) % order.length];
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = order[(idx - 1 + order.length) % order.length];
    if (!next) return;
    e.preventDefault();
    setFormData((prev) => ({ ...prev, role: next as Admin['role'] }));
    document.getElementById(`role-${next}`)?.focus();
  };

  const permissions = getDefaultPermissions(formData.role);

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="Create admin"
        description="Add a new administrator account and choose the role that sets its default permissions."
        backTo="/admins"
        backLabel="Admin users"
      />

      {error && (
        <Alert tone="danger" title="Could not create admin" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        <Card>
          <CardHeader title="Account details" description="Sign-in credentials for the new administrator." />
          <CardBody>
            <div className="grid gap-5 md:grid-cols-2">
              <FormField label="Full name" htmlFor="full_name" required error={fieldErrors.full_name}>
                <Input
                  id="full_name"
                  name="full_name"
                  type="text"
                  value={formData.full_name}
                  onChange={(e) => updateField('full_name', e.target.value)}
                  placeholder="Administrator's full name"
                  autoComplete="off"
                  maxLength={100}
                  required
                  disabled={loading}
                  invalid={!!fieldErrors.full_name}
                />
              </FormField>

              <FormField label="Email address" htmlFor="email" required error={fieldErrors.email}>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  placeholder="admin@example.com"
                  autoComplete="off"
                  maxLength={254}
                  required
                  disabled={loading}
                  invalid={!!fieldErrors.email}
                />
              </FormField>

              <FormField
                label="Password"
                htmlFor="password"
                required
                hint="At least 8 characters, with an uppercase letter, a lowercase letter, a number and a special character."
                error={fieldErrors.password}
              >
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => updateField('password', e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={100}
                  required
                  disabled={loading}
                  invalid={!!fieldErrors.password}
                  className="pr-11"
                  rightElement={
                    <IconButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      aria-pressed={showPassword}
                      onClick={() => setShowPassword((v) => !v)}
                      disabled={loading}
                    >
                      {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                    </IconButton>
                  }
                />
              </FormField>

              <FormField label="Confirm password" htmlFor="confirmPassword" required error={fieldErrors.confirmPassword}>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.confirmPassword}
                  onChange={(e) => updateField('confirmPassword', e.target.value)}
                  autoComplete="new-password"
                  maxLength={100}
                  required
                  disabled={loading}
                  invalid={!!fieldErrors.confirmPassword}
                />
              </FormField>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Role and permissions" description="The role decides which pages and actions the new admin can use." />
          <CardBody className="space-y-5">
            <div className="space-y-1.5">
              <span id="role-label" className="block text-sm font-medium text-gray-700">
                Role
                <span className="ml-0.5 text-red-600" aria-hidden="true">
                  *
                </span>
              </span>
              <div role="radiogroup" aria-labelledby="role-label" aria-required="true" className="grid gap-4 sm:grid-cols-2">
                {ROLES.map(({ value, icon: Icon }) => {
                  const selected = formData.role === value;
                  return (
                    <button
                      key={value}
                      id={`role-${value}`}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      tabIndex={selected ? 0 : -1}
                      disabled={loading}
                      onClick={() => setFormData((prev) => ({ ...prev, role: value }))}
                      onKeyDown={(e) => handleRoleKeyDown(e, value)}
                      className={cn(
                        'flex items-start gap-3 rounded-md border p-4 text-left transition-colors',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
                        'disabled:cursor-not-allowed disabled:opacity-50',
                        selected ? 'border-brand-500 bg-brand-50' : 'border-gray-200 bg-white hover:border-gray-300'
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-md',
                          selected ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-600'
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className={cn('block text-sm font-medium', selected ? 'text-brand-800' : 'text-gray-900')}>
                          {getRoleDisplayName(value)}
                        </span>
                        <span className="mt-0.5 block text-xs text-gray-500">{getRoleDescription(value)}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm font-medium text-gray-900">Default permissions</p>
              <p className="mt-0.5 text-xs text-gray-500">
                {getRoleDisplayName(formData.role)} accounts start with the following permissions:
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {permissions.map((perm) => (
                  <Badge key={perm} tone={perm === '*' ? 'brand' : 'neutral'} title={perm}>
                    {formatPermission(perm)}
                  </Badge>
                ))}
              </div>
            </div>
          </CardBody>
          <CardFooter className="flex items-center justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => navigate('/admins')} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" loading={loading} leftIcon={<Save />}>
              {loading ? 'Creating…' : 'Create admin'}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
};

export default CreateAdminPage;
