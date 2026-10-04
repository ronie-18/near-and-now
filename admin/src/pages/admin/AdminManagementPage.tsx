import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Users,
  Plus,
  Pencil,
  Trash2,
  ShieldCheck,
  ShieldOff,
  RefreshCw,
  UserCheck,
  UserX,
  AlertCircle,
} from 'lucide-react';
import { getAdmins, deleteAdmin, Admin, getRoleDisplayName, hasPermission, hasRole } from '../../services/adminAuthService';
import { getCurrentAdmin } from '../../services/secureAdminAuth';
import {
  PageHeader,
  Button,
  LinkButton,
  IconButton,
  Tooltip,
  Alert,
  Badge,
  Card,
  CardBody,
  FilterBar,
  SearchInput,
  StatCard,
  StatGrid,
  StatusBadge,
  TableContainer,
  Table,
  THead,
  TBody,
  Tr,
  Th,
  Td,
  TableEmptyRow,
  TableSkeletonRows,
  EmptyState,
  useConfirm,
} from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { formatDate } from '../../utils/format';

const TABLE_COLUMNS = 6;

/** Navigation state CreateAdminPage / EditAdminPage send back to this route. */
interface AdminsLocationState {
  success?: string;
}

const AdminManagementPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { showToast } = useToast();

  const [admins, setAdmins] = useState<Admin[]>([]);
  // `loading` covers the first load only; `refreshing` is true for any fetch
  // in flight so a refresh keeps the current roster visible.
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);

  // Monotonic request id so a slow earlier getAdmins() response can never
  // overwrite a newer one (the Refresh button is also disabled mid-fetch).
  const requestIdRef = useRef(0);
  // location.key whose success message has already been shown, so React
  // StrictMode's double effect run cannot toast the same message twice.
  const consumedStateKeyRef = useRef<string | null>(null);

  const currentAdmin: Admin | null = getCurrentAdmin();
  // Admin management has no 'admins.*' entry in ROLE_PERMISSIONS for any role
  // but super_admin (which gets '*') — getAdmins()'s own comment says
  // "super_admin only". Previously this page fetched/rendered the full
  // roster (emails, roles, status, last login) for any logged-in admin,
  // including viewer/manager, before the action-button-level hasPermission
  // checks below ever ran. Gate the page itself, not just its buttons.
  const isSuperAdmin = Boolean(currentAdmin && hasRole(currentAdmin, 'super_admin'));

  const fetchAdmins = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setRefreshing(true);
    setError(null);
    try {
      const data = await getAdmins();
      if (requestId !== requestIdRef.current) return;
      setAdmins(data);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError('Failed to load admins. Please try again.');
      console.error('Error fetching admins:', err);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    if (isSuperAdmin) {
      void fetchAdmins();
    } else {
      setLoading(false);
    }
  }, [isSuperAdmin, fetchAdmins]);

  // CreateAdminPage and EditAdminPage navigate back here with
  // state.success. This page never read it before, so the "created" /
  // "updated" confirmation was silently lost. Show it once, then strip it
  // from history so a reload or back navigation does not repeat it.
  useEffect(() => {
    const message = (location.state as AdminsLocationState | null)?.success;
    if (!message || consumedStateKeyRef.current === location.key) return;
    consumedStateKeyRef.current = location.key;
    showToast(message, 'success');
    navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: null });
  }, [location, navigate, showToast]);

  const handleDeleteAdmin = async (admin: Admin) => {
    // Defense-in-depth: only super_admin reaches this page and super_admin
    // holds '*', so these guards cannot fail in practice. Keep them anyway;
    // the backend enforces the same two rules.
    if (!currentAdmin || !hasPermission(currentAdmin, 'admins.delete')) {
      showToast('You do not have permission to delete admins.', 'error');
      return;
    }

    if (currentAdmin.id === admin.id) {
      showToast('You cannot delete your own account.', 'error');
      return;
    }

    // One delete at a time: ignore clicks while a previous one is in flight.
    if (deleteLoading) return;

    const confirmed = await confirm({
      title: 'Delete admin?',
      message: (
        <>
          <span className="font-medium text-gray-900">{admin.full_name}</span> ({admin.email}) will lose access to
          the admin console immediately. This action cannot be undone.
        </>
      ),
      confirmLabel: 'Delete admin',
      tone: 'danger',
    });
    if (!confirmed) return;

    try {
      setDeleteLoading(admin.id);
      setError(null);
      // deleteAdmin() resolves `false` on HTTP errors instead of throwing,
      // so both the false branch and the catch below are required.
      const deleted = await deleteAdmin(admin.id);

      if (deleted) {
        setAdmins(prev => prev.filter(a => a.id !== admin.id));
        showToast(`"${admin.full_name}" has been deleted.`, 'success');
      } else {
        showToast('Failed to delete admin. Please try again.', 'error');
      }
    } catch (err) {
      showToast('An error occurred while deleting the admin.', 'error');
      console.error('Error deleting admin:', err);
    } finally {
      setDeleteLoading(null);
    }
  };

  const searchLower = searchTerm.toLowerCase();
  // Match the visible role label ("super admin") and status as well as the
  // raw role key, since both are what the table actually shows.
  const filteredAdmins = admins.filter(admin =>
    admin.full_name.toLowerCase().includes(searchLower) ||
    admin.email.toLowerCase().includes(searchLower) ||
    admin.role.toLowerCase().includes(searchLower) ||
    getRoleDisplayName(admin.role).toLowerCase().includes(searchLower) ||
    admin.status.toLowerCase().includes(searchLower)
  );

  // Stats are computed from the full roster, never from the filtered list.
  const stats = {
    total: admins.length,
    superAdmins: admins.filter(a => a.role === 'super_admin').length,
    active: admins.filter(a => a.status === 'active').length,
    inactive: admins.filter(a => a.status === 'inactive').length,
    suspended: admins.filter(a => a.status === 'suspended').length,
  };

  // Redundant inside the super_admin gate, kept as defense-in-depth that
  // tracks ROLE_PERMISSIONS. No UI exists for their false branches.
  const canCreateAdmin = Boolean(currentAdmin && hasPermission(currentAdmin, 'admins.create'));
  const canEditAdmin = Boolean(currentAdmin && hasPermission(currentAdmin, 'admins.edit'));
  const canDeleteAdmin = Boolean(currentAdmin && hasPermission(currentAdmin, 'admins.delete'));

  if (!isSuperAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader title="Admin users" description="Manage administrator accounts and permissions." />
        <Card>
          <EmptyState
            icon={ShieldOff}
            title="Access denied"
            description="Admin management is restricted to super admins. You don't have permission to view the admin roster."
          />
        </Card>
      </div>
    );
  }

  const showSkeleton = loading && admins.length === 0;
  // A failed first load must not fall through to the "create your first
  // admin" empty state.
  const showLoadError = !loading && error !== null && admins.length === 0;
  const adminNoun = admins.length === 1 ? 'admin' : 'admins';

  const retryButton = (
    <Button variant="secondary" size="sm" onClick={() => void fetchAdmins()} loading={refreshing}>
      Retry
    </Button>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin users"
        description="Manage administrator accounts and permissions."
        actions={
          canCreateAdmin ? (
            <LinkButton to="/admins/create" leftIcon={<Plus />}>
              Create admin
            </LinkButton>
          ) : undefined
        }
      />

      {error && (
        <Alert tone="danger" title="Could not load admins" actions={retryButton} onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      <StatGrid>
        <StatCard label="Total admins" value={stats.total} icon={Users} loading={showSkeleton} />
        <StatCard label="Super admins" value={stats.superAdmins} icon={ShieldCheck} loading={showSkeleton} />
        <StatCard label="Active" value={stats.active} icon={UserCheck} loading={showSkeleton} />
        <StatCard
          label="Inactive or suspended"
          value={stats.inactive + stats.suspended}
          hint={`${stats.inactive} inactive, ${stats.suspended} suspended`}
          icon={UserX}
          loading={showSkeleton}
        />
      </StatGrid>

      <Card>
        <CardBody padding="none">
          <FilterBar
            actions={
              <Button
                variant="secondary"
                leftIcon={<RefreshCw />}
                onClick={() => void fetchAdmins()}
                loading={refreshing}
              >
                Refresh
              </Button>
            }
          >
            <SearchInput
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder="Search by name, email, role or status"
              aria-label="Search admins"
              containerClassName="w-full sm:w-80"
            />
            {!showSkeleton && !showLoadError && (
              <span className="text-sm text-gray-500 tabular-nums">
                {searchTerm
                  ? `${filteredAdmins.length} of ${admins.length} ${adminNoun}`
                  : `${admins.length} ${adminNoun}`}
              </span>
            )}
          </FilterBar>

          <TableContainer className="border-0 rounded-none" aria-busy={refreshing || undefined}>
            <Table>
              <THead>
                <Tr>
                  <Th>Admin</Th>
                  <Th>Role</Th>
                  <Th>Status</Th>
                  <Th>Last login</Th>
                  <Th>Created</Th>
                  <Th align="right">Actions</Th>
                </Tr>
              </THead>
              <TBody>
                {showSkeleton ? (
                  <TableSkeletonRows rows={5} cols={TABLE_COLUMNS} />
                ) : showLoadError ? (
                  <TableEmptyRow colSpan={TABLE_COLUMNS}>
                    <EmptyState
                      compact
                      icon={AlertCircle}
                      title="Admins could not be loaded"
                      description="Use Retry above to load the roster again."
                    />
                  </TableEmptyRow>
                ) : filteredAdmins.length === 0 ? (
                  <TableEmptyRow colSpan={TABLE_COLUMNS}>
                    <EmptyState
                      compact
                      icon={Users}
                      title="No admins found"
                      description={searchTerm ? 'Try a different search term.' : 'Create your first admin to get started.'}
                      action={
                        searchTerm ? (
                          <Button variant="secondary" size="sm" onClick={() => setSearchTerm('')}>
                            Clear search
                          </Button>
                        ) : canCreateAdmin ? (
                          <LinkButton to="/admins/create" size="sm" leftIcon={<Plus />}>
                            Create admin
                          </LinkButton>
                        ) : undefined
                      }
                    />
                  </TableEmptyRow>
                ) : (
                  filteredAdmins.map((admin) => {
                    const isSelf = admin.id === currentAdmin?.id;
                    return (
                      <Tr key={admin.id}>
                        <Td>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">{admin.full_name}</span>
                            {isSelf && <Badge size="sm">You</Badge>}
                          </div>
                          <p className="text-xs text-gray-500">{admin.email}</p>
                        </Td>
                        <Td>
                          <StatusBadge kind="role" value={admin.role} />
                        </Td>
                        <Td>
                          <StatusBadge kind="generic" value={admin.status} />
                        </Td>
                        <Td muted nowrap className="tabular-nums">
                          {admin.last_login_at ? formatDate(admin.last_login_at) : 'Never'}
                        </Td>
                        <Td muted nowrap className="tabular-nums">
                          {formatDate(admin.created_at)}
                        </Td>
                        <Td align="right" nowrap>
                          <div className="flex items-center justify-end gap-1">
                            {canEditAdmin && (
                              <Tooltip content="Edit">
                                {/* A real link (not a button + navigate) so the edit page keeps
                                    href / middle-click / link semantics, as in the original.
                                    `!px-0`: the sm button's px-3 would otherwise win over px-0. */}
                                <LinkButton
                                  to={`/admins/edit/${admin.id}`}
                                  variant="ghost"
                                  size="sm"
                                  aria-label={`Edit ${admin.full_name}`}
                                  className="w-8 !px-0"
                                >
                                  <Pencil className="h-4 w-4" aria-hidden="true" />
                                </LinkButton>
                              </Tooltip>
                            )}
                            {/* Self-delete is blocked in the handler too; the
                                UI must simply never offer it. */}
                            {canDeleteAdmin && !isSelf && (
                              <Tooltip content="Delete">
                                <IconButton
                                  aria-label={`Delete ${admin.full_name}`}
                                  size="sm"
                                  className="text-red-600 hover:bg-red-50 hover:text-red-700"
                                  onClick={() => void handleDeleteAdmin(admin)}
                                  loading={deleteLoading === admin.id}
                                  disabled={deleteLoading !== null}
                                >
                                  <Trash2 aria-hidden="true" />
                                </IconButton>
                              </Tooltip>
                            )}
                          </div>
                        </Td>
                      </Tr>
                    );
                  })
                )}
              </TBody>
            </Table>
          </TableContainer>
        </CardBody>
      </Card>
    </div>
  );
};

export default AdminManagementPage;
