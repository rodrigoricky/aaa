import { useEffect, useState, useCallback } from 'react';
import {
  getPermissions,
  updateRolePermissions,
  type RolePermissions,
} from '../services/permissions.service';
import Button from '../components/ui/Button';
import { getApiErrorMessage } from '../services/api';
import styles from './Permissions.module.css';


interface PermGroup {
  label: string;
  items: { key: string; label: string; description: string }[];
}

const PERM_GROUPS: PermGroup[] = [
  {
    label: 'Dashboard',
    items: [
      { key: 'dashboardRead', label: 'View Dashboard', description: 'Access the main dashboard and summary metrics.' },
    ],
  },
  {
    label: 'Inventory',
    items: [
      { key: 'inventoryRead', label: 'View Inventory', description: 'Browse and search inventory items.' },
    ],
  },
  {
    label: 'Quantity Adjustments',
    items: [
      { key: 'adjustmentRead',   label: 'View Adjustments',   description: 'View quantity adjustment documents.' },
      { key: 'adjustmentWrite',  label: 'Create / Edit',      description: 'Create and edit draft adjustments.' },
      { key: 'adjustmentPost',   label: 'Post Adjustments',   description: 'Post an adjustment to make it live. Affects actual inventory.' },
      { key: 'adjustmentDelete', label: 'Delete Drafts',      description: 'Delete draft adjustments before posting.' },
    ],
  },
  {
    label: 'Users & Admin',
    items: [
      { key: 'usersRead',         label: 'View Users',         description: 'View the user list.' },
      { key: 'usersWrite',        label: 'Manage Users',       description: 'Create, edit, activate, or deactivate users.' },
      { key: 'permissionsRead',   label: 'View Permissions',   description: 'View role permission settings.' },
      { key: 'permissionsWrite',  label: 'Edit Permissions',   description: 'Modify role permissions.' },
      { key: 'auditRead',         label: 'View Audit Logs',    description: 'Access the audit log history.' },
    ],
  },
];

const ALL_PERM_KEYS = PERM_GROUPS.flatMap((g) => g.items.map((i) => i.key));

const ADMIN_ROLE_NAME = 'Admin';


export default function Permissions() {
  const [roles, setRoles] = useState<RolePermissions[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getPermissions();
      setRoles(data);
      const firstId = data[0]?.roleId ?? null;
      if (firstId !== null) {
        setSelectedRoleId(firstId);
        setDraft({ ...data[0].permissions });
        setSaved({ ...data[0].permissions });
      }
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const selectedRole = roles.find((r) => r.roleId === selectedRoleId);
  const isAdmin = selectedRole?.roleName === ADMIN_ROLE_NAME;

  const hasChanges = Object.keys(draft).some((k) => draft[k] !== saved[k]) ||
    ALL_PERM_KEYS.some((k) => (draft[k] ?? false) !== (saved[k] ?? false));

  const selectRole = (roleId: number) => {
    setSelectedRoleId(roleId);
    const role = roles.find((r) => r.roleId === roleId);
    if (role) {
      setDraft({ ...role.permissions });
      setSaved({ ...role.permissions });
    }
    setSaveSuccess(false);
    setError('');
  };

  const togglePermission = (key: string) => {
    if (isAdmin) return; // Admin is always full-access
    setDraft((prev) => ({ ...prev, [key]: !prev[key] }));
    setSaveSuccess(false);
  };

  const handleSave = async () => {
    if (!selectedRoleId || saving) return;
    setSaving(true);
    setError('');
    setSaveSuccess(false);
    try {
      const updated = await updateRolePermissions(selectedRoleId, draft);
      const newPerms = updated.permissions;
      setSaved({ ...newPerms });
      setDraft({ ...newPerms });
      setRoles((prev) =>
        prev.map((r) => r.roleId === selectedRoleId ? { ...r, permissions: newPerms } : r)
      );
      setSaveSuccess(true);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setDraft({ ...saved });
    setSaveSuccess(false);
    setError('');
  };

  return (
    <div className={styles.page}>
      {/* Sidebar: role list */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>Roles</div>
        <nav>
          {loading
            ? <div className={styles.sidebarLoading}>Loading…</div>
            : roles.map((role) => (
                <button
                  key={role.roleId}
                  className={`${styles.roleItem} ${role.roleId === selectedRoleId ? styles.roleItemActive : ''}`}
                  onClick={() => selectRole(role.roleId)}
                  type="button"
                >
                  <span className={styles.roleItemName}>{role.roleName}</span>
                  {role.roleName === ADMIN_ROLE_NAME && (
                    <span className={styles.adminBadge}>Full</span>
                  )}
                </button>
              ))
          }
        </nav>
      </aside>

      {/* Main panel */}
      <main className={styles.main}>
        {loading ? (
          <div className={styles.loadingState}>Loading permissions…</div>
        ) : !selectedRole ? (
          <div className={styles.loadingState}>Select a role</div>
        ) : (
          <>
            <div className={styles.mainHeader}>
              <div>
                <h2 className={styles.roleTitle}>{selectedRole.roleName}</h2>
                {isAdmin && (
                  <p className={styles.adminNote}>
                    Admin has all permissions and cannot be restricted.
                  </p>
                )}
              </div>
              <div className={styles.headerActions}>
                {hasChanges && !isAdmin && (
                  <>
                    <span className={styles.unsaved}>Unsaved changes</span>
                    <Button variant="ghost" size="sm" onClick={handleReset} disabled={saving}>
                      Reset
                    </Button>
                  </>
                )}
                {saveSuccess && !hasChanges && (
                  <span className={styles.savedMsg}>Saved</span>
                )}
                {error && <span className={styles.errorMsg}>{error}</span>}
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSave}
                  disabled={!hasChanges || isAdmin || saving}
                >
                  {saving ? 'Saving…' : 'Save Changes'}
                </Button>
              </div>
            </div>

            <div className={styles.groups}>
              {PERM_GROUPS.map((group) => (
                <section key={group.label} className={styles.group}>
                  <h3 className={styles.groupLabel}>{group.label}</h3>
                  <div className={styles.permList}>
                    {group.items.map((item) => {
                      const checked = isAdmin ? true : Boolean(draft[item.key]);
                      return (
                        <div
                          key={item.key}
                          className={`${styles.permRow} ${isAdmin ? styles.permRowLocked : ''}`}
                          onClick={() => togglePermission(item.key)}
                          role="checkbox"
                          aria-checked={checked}
                          tabIndex={isAdmin ? -1 : 0}
                          onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') togglePermission(item.key); }}
                        >
                          <div className={styles.permInfo}>
                            <span className={styles.permLabel}>{item.label}</span>
                            <span className={styles.permDesc}>{item.description}</span>
                          </div>
                          <div className={`${styles.toggle} ${checked ? styles.toggleOn : ''} ${isAdmin ? styles.toggleLocked : ''}`}>
                            <div className={styles.toggleThumb} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
