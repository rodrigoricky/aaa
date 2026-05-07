import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  getUsers,
  createUser,
  updateUser,
  resetPassword,
  getRoles,
  type User,
  type Role,
  type LegacyUser,
} from '../services/users.service';
import Button from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import Badge from '../components/ui/Badge';
import { getApiErrorMessage } from '../services/api';
import styles from './Users.module.css';

function IconPlus() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function formatLastLogin(value: string | null) {
  if (!value) return '—';

  return new Date(value).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface CreateForm {
  username: string;
  password: string;
  roleId: string;
}

interface CreateErrors {
  username?: string;
  password?: string;
  roleId?: string;
}

interface DisplayUserRow {
  key: string;
  username: string;
  name: string;
  level: string;
  status: string;
  canPost: boolean;
  lastLogin: string | null;
  utilityUser: User | null;
  legacyUser: LegacyUser | null;
}

function validateCreate(data: CreateForm): CreateErrors {
  const errors: CreateErrors = {};
  if (!data.username.trim()) errors.username = 'Username is required';
  else if (!/^[a-zA-Z0-9_]+$/.test(data.username)) errors.username = 'Alphanumeric only';
  else if (data.username.length < 3) errors.username = 'Min 3 characters';

  if (!data.password) errors.password = 'Password is required';

  if (!data.roleId) errors.roleId = 'Role is required';
  return errors;
}

function getLegacyLevel(user: LegacyUser) {
  if (user.isSecurityLevel2) {
    return 'Security Level 2';
  }

  if (user.adjustmentPageAccess) {
    return 'Encoder';
  }

  return user.accessType === 1 ? 'Supervisor' : 'POS User';
}

function getStatusBadge(status: string) {
  if (status === 'Active') {
    return 'success' as const;
  }

  if (status === 'Inactive') {
    return 'neutral' as const;
  }

  return 'warning' as const;
}

function getRoleIdForLegacy(user: LegacyUser): number {
  if (user.isSecurityLevel2) return 5;
  if (user.adjustmentPageAccess) return 3;
  if (user.accessType === 1) return 2;
  return 4;
}

export default function Users() {
  const [utilityUsers, setUtilityUsers] = useState<User[]>([]);
  const [legacyUsers, setLegacyUsers] = useState<LegacyUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [roles, setRoles] = useState<Role[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [provisionLegacy, setProvisionLegacy] = useState<LegacyUser | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [createForm, setCreateForm] = useState<CreateForm>({
    username: '',
    password: '',
    roleId: '',
  });
  const [createErrors, setCreateErrors] = useState<CreateErrors>({});
  const [formLoading, setFormLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwError, setPwError] = useState('');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const result = await getUsers(1, 200);
      setUtilityUsers(result.utility.data);
      setLegacyUsers(result.legacy);
    } catch (error) {
      setLoadError(getApiErrorMessage(error, 'Failed to load users'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    getRoles().then(setRoles).catch(() => {});
  }, []);

  const rows = useMemo<DisplayUserRow[]>(() => {
    const legacyById = new Map(legacyUsers.map((user) => [user.id, user]));
    const linkedLegacyIds = new Set<string>();

    const mergedUtility = utilityUsers.map((user) => {
      const linkedLegacy = user.legacyUserId ? legacyById.get(user.legacyUserId) : undefined;
      if (linkedLegacy) {
        linkedLegacyIds.add(linkedLegacy.id);
      }

      return {
        key: `utility-${user.id}`,
        username: user.username,
        name: linkedLegacy?.fullName ?? user.username,
        level: linkedLegacy ? getLegacyLevel(linkedLegacy) : user.role.name,
        status: user.isActive ? 'Active' : 'Inactive',
        canPost: Boolean(user.permissions?.adjustmentPost),
        lastLogin: user.lastLogin,
        utilityUser: user,
        legacyUser: null,
      };
    });

    const unlinkedLegacy = legacyUsers
      .filter((user) => !linkedLegacyIds.has(user.id))
      .map((user) => ({
        key: `legacy-${user.id}`,
        username: user.username,
        name: user.fullName ?? user.username,
        level: getLegacyLevel(user),
        status: 'Existing',
        canPost: user.isSecurityLevel2,
        lastLogin: null,
        utilityUser: null,
        legacyUser: user,
      }));

    return [...mergedUtility, ...unlinkedLegacy].sort((a, b) =>
      a.username.localeCompare(b.username)
    );
  }, [legacyUsers, utilityUsers]);

  const updateField = (field: keyof CreateForm, value: string) => {
    setCreateForm((prev) => ({ ...prev, [field]: value }));
    if (createErrors[field]) {
      setCreateErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const handleCreate = async () => {
    const errors = validateCreate(createForm);
    if (Object.keys(errors).length > 0) {
      setCreateErrors(errors);
      return;
    }

    setFormLoading(true);
    setSubmitError('');
    try {
      await createUser({
        username: createForm.username.trim(),
        password: createForm.password,
        roleId: parseInt(createForm.roleId, 10),
        legacyUserId: provisionLegacy?.id,
      });
      setCreateOpen(false);
      setProvisionLegacy(null);
      setCreateForm({ username: '', password: '', roleId: '' });
      await fetchUsers();
    } catch (error) {
      setSubmitError(getApiErrorMessage(error, 'Failed to create user'));
    } finally {
      setFormLoading(false);
    }
  };

  const handleProvision = (legacy: LegacyUser) => {
    setProvisionLegacy(legacy);
    setCreateForm({
      username: legacy.username,
      password: '',
      roleId: String(getRoleIdForLegacy(legacy)),
    });
    setCreateErrors({});
    setSubmitError('');
    setCreateOpen(true);
  };

  const handleToggleStatus = async (user: User) => {
    try {
      await updateUser(user.id, { isActive: !user.isActive });
      await fetchUsers();
    } catch {
    }
  };

  const handleRoleChange = async (user: User, roleId: number) => {
    try {
      await updateUser(user.id, { roleId });
      await fetchUsers();
    } catch {
    }
  };

  const openReset = (user: User) => {
    setSelectedUser(user);
    setNewPassword('');
    setPwError('');
    setResetOpen(true);
  };

  const handleResetPassword = async () => {
    if (!selectedUser) return;
    if (!newPassword) {
      setPwError('Password is required');
      return;
    }

    setFormLoading(true);
    try {
      await resetPassword(selectedUser.id, newPassword);
      setResetOpen(false);
    } catch (error) {
      setPwError(getApiErrorMessage(error, 'Failed to reset password'));
    } finally {
      setFormLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <div />
        <Button
          icon={<IconPlus />}
          onClick={() => {
            setProvisionLegacy(null);
            setCreateForm({ username: '', password: '', roleId: '' });
            setCreateErrors({});
            setSubmitError('');
            setCreateOpen(true);
          }}
        >
          Create User
        </Button>
      </div>

      {loadError && <div className={styles.submitError}>{loadError}</div>}

      <div className={styles.card}>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>User</th>
                <th>Name</th>
                <th>Level</th>
                <th>Status</th>
                <th>Can Post</th>
                <th>Last Login</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className={styles.empty}>Loading...</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className={styles.empty}>No users found</td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.key}>
                    <td className={styles.username}>{row.username}</td>
                    <td>{row.name}</td>
                    <td>
                      {row.utilityUser ? (
                        <select
                          className={styles.roleSelect}
                          value={row.utilityUser.role.id}
                          onChange={(event) =>
                            handleRoleChange(row.utilityUser as User, parseInt(event.target.value, 10))
                          }
                        >
                          {roles.map((role) => (
                            <option key={role.id} value={role.id}>
                              {role.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        row.level
                      )}
                    </td>
                    <td>
                      <Badge variant={getStatusBadge(row.status)}>{row.status}</Badge>
                    </td>
                    <td>
                      <Badge variant={row.canPost ? 'success' : 'neutral'}>
                        {row.canPost ? 'Yes' : 'No'}
                      </Badge>
                    </td>
                    <td className={styles.lastLogin}>{formatLastLogin(row.lastLogin)}</td>
                    <td>
                      {row.utilityUser ? (
                        <div className={styles.actions}>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleToggleStatus(row.utilityUser as User)}
                          >
                            {row.utilityUser.isActive ? 'Deactivate' : 'Activate'}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openReset(row.utilityUser as User)}
                          >
                            Reset PW
                          </Button>
                        </div>
                      ) : row.legacyUser ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleProvision(row.legacyUser as LegacyUser)}
                        >
                          Set Up
                        </Button>
                      ) : (
                        <span className={styles.mono}>—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={createOpen}
        onClose={() => { setCreateOpen(false); setProvisionLegacy(null); }}
        title={provisionLegacy ? `Set Up Account — ${provisionLegacy.username}` : 'Create User'}
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button
              variant="secondary"
              onClick={() => { setCreateOpen(false); setProvisionLegacy(null); }}
              disabled={formLoading}
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} loading={formLoading}>
              {provisionLegacy ? 'Set Up Account' : 'Create User'}
            </Button>
          </div>
        }
      >
        <div className={styles.formGrid}>
          <Input
            id="new-username"
            label="Username"
            value={createForm.username}
            onChange={(event) => updateField('username', event.target.value)}
            error={createErrors.username}
            placeholder="alphanumeric_only"
            autoComplete="off"
          />
          <Input
            id="new-password"
            label="Password"
            type="password"
            value={createForm.password}
            onChange={(event) => updateField('password', event.target.value)}
            error={createErrors.password}
            placeholder="Enter password"
            autoComplete="new-password"
          />
          <Select
            id="new-role"
            label="Role"
            value={createForm.roleId}
            onChange={(event) => updateField('roleId', event.target.value)}
            error={createErrors.roleId}
          >
            <option value="">Select a role</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </Select>
          {submitError && <div className={styles.submitError}>{submitError}</div>}
        </div>
      </Modal>

      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title={`Reset Password — ${selectedUser?.username}`}
        size="sm"
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button
              variant="secondary"
              onClick={() => setResetOpen(false)}
              disabled={formLoading}
            >
              Cancel
            </Button>
            <Button onClick={handleResetPassword} loading={formLoading}>
              Reset Password
            </Button>
          </div>
        }
      >
        <Input
          id="reset-pw"
          label="New Password"
          type="password"
          value={newPassword}
          onChange={(event) => {
            setNewPassword(event.target.value);
            if (pwError) setPwError('');
          }}
          error={pwError}
          placeholder="Enter new password"
          autoComplete="new-password"
          autoFocus
        />
      </Modal>
    </div>
  );
}
