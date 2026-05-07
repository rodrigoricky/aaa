import { useEffect, useState, useCallback, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAuditLogs, type AuditLog, type AuditLogFilters } from '../services/audit.service';
import Button from '../components/ui/Button';
import Pagination from '../components/ui/Pagination';
import styles from './AuditLogs.module.css';

interface ActionMeta {
  label: string;
  category: 'save' | 'update' | 'post' | 'delete' | 'auth' | 'print' | 'other';
}

const ACTION_META: Record<string, ActionMeta> = {
  ADJUSTMENT_SAVED:    { label: 'Saved',            category: 'save'   },
  ADJUSTMENT_UPDATED:  { label: 'Updated',           category: 'update' },
  ADJUSTMENT_POSTED:   { label: 'Posted',            category: 'post'   },
  ADJUSTMENT_CANCELLATION_REQUESTED: { label: 'Cancel Requested', category: 'update' },
  ADJUSTMENT_CANCELLATION_POSTED:    { label: 'Cancel Posted',    category: 'post'   },
  ADJUSTMENT_PRINTED:  { label: 'Printed',           category: 'print'  },
  LOGIN_SUCCESS:       { label: 'Login',             category: 'auth'   },
  LOGIN_FAILED:        { label: 'Login Failed',      category: 'delete' },
  LOGOUT:              { label: 'Logout',            category: 'auth'   },
  USER_CREATED:        { label: 'User Created',      category: 'save'   },
  USER_UPDATED:        { label: 'User Updated',      category: 'update' },
  USER_STATUS_CHANGED: { label: 'Status Changed',    category: 'update' },
  PASSWORD_RESET:      { label: 'Password Reset',    category: 'update' },
  PERMISSIONS_UPDATED: { label: 'Permissions',       category: 'update' },
  PRODUCT_CREATED:     { label: 'Item Created',      category: 'save'   },
  PRODUCT_UPDATED:     { label: 'Item Updated',      category: 'update' },
  PRODUCT_DELETED:     { label: 'Item Deleted',      category: 'delete' },
};

function getActionMeta(action: string): ActionMeta {
  return ACTION_META[action] ?? { label: action, category: 'other' };
}

const ACTOR_PALETTES = [
  { bg: '#dbeafe', fg: '#1e40af' },
  { bg: '#dcfce7', fg: '#166534' },
  { bg: '#fce7f3', fg: '#9d174d' },
  { bg: '#ffedd5', fg: '#9a3412' },
  { bg: '#ede9fe', fg: '#5b21b6' },
  { bg: '#cffafe', fg: '#155e75' },
  { bg: '#fef9c3', fg: '#713f12' },
  { bg: '#fee2e2', fg: '#991b1b' },
];

function getActorPalette(username: string) {
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = (hash * 31 + username.charCodeAt(i)) & 0xffffffff;
  }
  return ACTOR_PALETTES[Math.abs(hash) % ACTOR_PALETTES.length];
}

function ActorBadge({ username }: { username: string }) {
  const palette = getActorPalette(username);
  const initials = username.slice(0, 2).toUpperCase();
  return (
    <span
      className={styles.actorBadge}
      style={{ background: palette.bg, color: palette.fg }}
      title={username}
    >
      <span className={styles.actorInitials}>{initials}</span>
      <span className={styles.actorName}>{username}</span>
    </span>
  );
}

function flattenForDiff(obj: Record<string, unknown>): Record<string, string> {
  const flat: Record<string, string> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (key === 'permissions') continue;
    if (val === null || typeof val !== 'object') {
      flat[key] = String(val ?? '—');
    } else if (key === 'role' && typeof (val as Record<string, unknown>).name === 'string') {
      flat['role'] = String((val as Record<string, unknown>).name);
    } else {
      flat[key] = JSON.stringify(val);
    }
  }
  return flat;
}

function diffObjects(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): Array<{ key: string; from: string; to: string }> {
  const flatBefore = flattenForDiff(before);
  const flatAfter = flattenForDiff(after);
  const keys = new Set([...Object.keys(flatBefore), ...Object.keys(flatAfter)]);
  const changed: Array<{ key: string; from: string; to: string }> = [];
  for (const key of keys) {
    if (flatBefore[key] === flatAfter[key]) continue;
    changed.push({ key, from: flatBefore[key] ?? '—', to: flatAfter[key] ?? '—' });
  }
  return changed;
}

function DetailsView({ details, action }: { details: Record<string, unknown> | null; action: string }) {
  const [expanded, setExpanded] = useState(false);

  if (!details) return <span className={styles.null}>—</span>;

  const category = getActionMeta(action).category;

  if (category === 'save' || category === 'update' || category === 'post') {
    const rawBefore = details.before;
    const rawAfter = details.after;

    if (rawBefore != null && rawAfter != null) {
      if (Array.isArray(rawBefore) && Array.isArray(rawAfter)) {
        const before = rawBefore as Record<string, unknown>[];
        const after = rawAfter as Record<string, unknown>[];
        return (
          <div className={styles.diffBlock}>
            <button
              className={styles.expandBtn}
              onClick={() => setExpanded((x) => !x)}
              type="button"
            >
              {expanded ? '▾ Hide diff' : '▸ Show diff'} ({after.length} line{after.length !== 1 ? 's' : ''})
            </button>
            {expanded && (
              <div className={styles.diffTable}>
                {after.map((line, i) => {
                  const prev = before[i];
                  return (
                    <div key={i} className={styles.diffRow}>
                      <span className={styles.diffLine}>#{(line.lineNo as number) ?? i + 1}</span>
                      <span className={styles.diffItem}>{String(line.itemcode ?? '')}</span>
                      {prev && String(prev.adjustQty) !== String(line.adjustQty) && (
                        <span className={styles.diffChange}>
                          <s className={styles.diffOld}>{Number(prev.adjustQty ?? 0).toFixed(2)}</s>
                          {' → '}
                          <strong className={Number(line.adjustQty ?? 0) >= 0 ? styles.diffPos : styles.diffNeg}>
                            {Number(line.adjustQty ?? 0) >= 0 ? '+' : ''}{Number(line.adjustQty ?? 0).toFixed(2)}
                          </strong>
                        </span>
                      )}
                      {!prev && (
                        <span className={styles.diffChange}>
                          <strong className={Number(line.adjustQty ?? 0) >= 0 ? styles.diffPos : styles.diffNeg}>
                            {Number(line.adjustQty ?? 0) >= 0 ? '+' : ''}{Number(line.adjustQty ?? 0).toFixed(2)}
                          </strong>
                          {' → '}
                          <span>{Number(line.newQty ?? 0).toFixed(2)}</span>
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      }

      if (typeof rawBefore === 'object' && !Array.isArray(rawBefore)) {
        const changed = diffObjects(
          rawBefore as Record<string, unknown>,
          rawAfter as Record<string, unknown>
        );
        if (changed.length === 0) {
          return <span className={styles.null}>No changes</span>;
        }
        return (
          <div className={styles.keyValueBlock}>
            {changed.slice(0, 4).map(({ key, from, to }) => (
              <span key={key} className={styles.kvPair}>
                <span className={styles.kvKey}>{key}</span>
                <span className={styles.kvVal}>
                  <s className={styles.diffOld}>{from}</s>{' → '}<strong>{to}</strong>
                </span>
              </span>
            ))}
            {changed.length > 4 && (
              <span className={styles.kvMore}>+{changed.length - 4} more</span>
            )}
          </div>
        );
      }
    }

    const simpleKeys = ['qaNo', 'refType', 'refNo', 'lineCount', 'role', 'username'];
    const filtered = Object.entries(details).filter(([k]) => simpleKeys.includes(k));
    if (filtered.length > 0) {
      return (
        <div className={styles.keyValueBlock}>
          {filtered.map(([k, v]) => (
            <span key={k} className={styles.kvPair}>
              <span className={styles.kvKey}>{k}</span>
              <span className={styles.kvVal}>{String(v ?? '—')}</span>
            </span>
          ))}
        </div>
      );
    }
  }

  if (category === 'auth') {
    const role = details.role ? String(details.role) : null;
    return (
      <span className={styles.authDetail}>
        {role ? <span className={styles.rolePill}>{role}</span> : null}
      </span>
    );
  }

  const entries = Object.entries(details).filter(([, v]) => typeof v !== 'object' || v === null);
  if (entries.length === 0) {
    return (
      <button className={styles.expandBtn} onClick={() => setExpanded((x) => !x)} type="button">
        {expanded ? '▾ Hide' : '▸ Raw'}
        {expanded && (
          <pre className={styles.rawJson}>{JSON.stringify(details, null, 2)}</pre>
        )}
      </button>
    );
  }

  return (
    <div className={styles.keyValueBlock}>
      {entries.slice(0, 4).map(([k, v]) => (
        <span key={k} className={styles.kvPair}>
          <span className={styles.kvKey}>{k}</span>
          <span className={styles.kvVal}>{String(v ?? '—')}</span>
        </span>
      ))}
      {entries.length > 4 && <span className={styles.kvMore}>+{entries.length - 4} more</span>}
    </div>
  );
}

const QA_NAVIGABLE_ACTIONS = new Set([
  'ADJUSTMENT_SAVED',
  'ADJUSTMENT_UPDATED',
  'ADJUSTMENT_POSTED',
  'ADJUSTMENT_PRINTED',
]);

function getQaNavTarget(log: AuditLog): string | null {
  if (log.entityType === 'QA_HEADER' && log.entityId && QA_NAVIGABLE_ACTIONS.has(log.action)) {
    return `/quantity-adjustments?open=${log.entityId}`;
  }
  return null;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function ActionTag({ action }: { action: string }) {
  const meta = getActionMeta(action);
  return (
    <span className={`${styles.actionTag} ${styles[`cat_${meta.category}`]}`}>
      {meta.label}
    </span>
  );
}

export default function AuditLogs() {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const LIMIT = 20;

  const [filters, setFilters] = useState<AuditLogFilters>({});
  const [appliedFilters, setAppliedFilters] = useState<AuditLogFilters>({});

  const hasFilters = Object.values(appliedFilters).some(Boolean);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getAuditLogs(page, LIMIT, appliedFilters);
      setLogs(result.data);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    } catch {
      setLogs([]);
      setTotal(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }, [page, appliedFilters]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const handleApply = (e: FormEvent) => {
    e.preventDefault();
    const active: AuditLogFilters = {};
    if (filters.dateFrom) active.dateFrom = filters.dateFrom;
    if (filters.dateTo) active.dateTo = filters.dateTo;
    if (filters.actor?.trim()) active.actor = filters.actor.trim();
    if (filters.action) active.action = filters.action;
    setAppliedFilters(active);
    setPage(1);
  };

  const handleClear = () => {
    setFilters({});
    setAppliedFilters({});
    setPage(1);
  };

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <form onSubmit={handleApply} className={styles.filterBar}>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>From</label>
            <input
              type="date"
              className={styles.filterInput}
              value={filters.dateFrom ?? ''}
              onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
            />
          </div>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>To</label>
            <input
              type="date"
              className={styles.filterInput}
              value={filters.dateTo ?? ''}
              onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
            />
          </div>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Actor</label>
            <input
              type="text"
              className={styles.filterInput}
              placeholder="Username"
              value={filters.actor ?? ''}
              onChange={(e) => setFilters((f) => ({ ...f, actor: e.target.value }))}
            />
          </div>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Action</label>
            <select
              className={styles.filterSelect}
              value={filters.action ?? ''}
              onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))}
            >
              <option value="">All actions</option>
              {Object.entries(ACTION_META).map(([key, meta]) => (
                <option key={key} value={key}>{meta.label}</option>
              ))}
            </select>
          </div>
          <div className={styles.filterActions}>
            <Button type="submit" variant="secondary" size="md">Filter</Button>
            {hasFilters && (
              <Button type="button" variant="ghost" size="md" onClick={handleClear}>Clear</Button>
            )}
          </div>
        </form>
      </div>

      <div className={styles.card}>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.colTimestamp}>Timestamp</th>
                <th className={styles.colAction}>Action</th>
                <th className={styles.colEntity}>Entity</th>
                <th className={styles.colActor}>Actor</th>
                <th className={styles.colDetails}>Details</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className={styles.empty}>Loading...</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={5} className={styles.empty}>No audit logs found</td></tr>
              ) : (
                logs.map((log) => {
                  const navTarget = getQaNavTarget(log);
                  return (
                  <tr
                    key={log.id}
                    className={`${styles.row} ${navTarget ? styles.rowClickable : ''}`}
                    onClick={navTarget ? () => navigate(navTarget) : undefined}
                    title={navTarget ? 'Open quantity adjustment' : undefined}
                  >
                    <td className={styles.timestamp}>{formatDateTime(log.createdAt)}</td>
                    <td><ActionTag action={log.action} /></td>
                    <td>
                      <div className={styles.entityCell}>
                        <span className={styles.entityType}>{log.entityType}</span>
                        {log.entityId && (
                          <span className={styles.entityId}>#{log.entityId}</span>
                        )}
                      </div>
                    </td>
                    <td>
                      {log.actorUsername ? (
                        <ActorBadge username={log.actorUsername} />
                      ) : (
                        <span className={styles.null}>—</span>
                      )}
                    </td>
                    <td>
                      <DetailsView details={log.details} action={log.action} />
                    </td>
                  </tr>
                );
                })
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          limit={LIMIT}
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}
