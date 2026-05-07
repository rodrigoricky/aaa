import { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Input, Select } from '../components/ui/Input';
import Pagination from '../components/ui/Pagination';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import { useAuth } from '../hooks/useAuth';
import {
  listQuantityAdjustments,
  requestQuantityAdjustmentCancellation,
  type AdjustmentStatus,
  type QuantityAdjustmentListItem,
} from '../services/quantity-adjustments.service';
import { getApiErrorMessage } from '../services/api';
import styles from './QuantityAdjustmentHistory.module.css';

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function getStatusVariant(status: AdjustmentStatus): 'success' | 'warning' | 'danger' | 'info' {
  if (status === 'POSTED') return 'success';
  if (status === 'CANCELLED') return 'danger';
  if (status === 'PENDING_CANCELLATION') return 'info';
  return 'warning';
}

function getStatusLabel(status: AdjustmentStatus) {
  if (status === 'PENDING_CANCELLATION') return 'Pending Cancellation';
  if (status === 'CANCELLED') return 'Cancelled Entry';
  return status;
}

export default function QuantityAdjustmentHistory() {
  const { hasPermission, hasRole } = useAuth();
  const navigate = useNavigate();

  const canAccess = hasPermission('adjustmentPageAccess');
  const canRequestCancellationRole = hasRole('Admin', 'Supervisor', 'Encoder');

  const [documents, setDocuments] = useState<QuantityAdjustmentListItem[]>([]);
  const [listSearch, setListSearch] = useState('');
  const [listStatus, setListStatus] = useState<'' | AdjustmentStatus>('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<QuantityAdjustmentListItem | null>(null);
  const [cancellationReason, setCancellationReason] = useState('');
  const [cancellationReasonError, setCancellationReasonError] = useState('');
  const [cancelLoading, setCancelLoading] = useState(false);

  const actionColumnVisible = canRequestCancellationRole;
  const tableColSpan = actionColumnVisible ? 8 : 7;

  const loadDocuments = useCallback(() => {
    if (!canAccess) return;

    setLoading(true);
    return listQuantityAdjustments({
      page,
      limit: 15,
      search: listSearch || undefined,
      status: listStatus || undefined,
    })
      .then((result) => {
        setDocuments(result.data);
        setTotal(result.total);
        setTotalPages(result.totalPages);
      })
      .catch(() => {
        setDocuments([]);
        setTotal(0);
        setTotalPages(1);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [canAccess, listSearch, listStatus, page]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  if (!canAccess) {
    return <Navigate to="/dashboard" replace />;
  }

  const openCancellationModal = (document: QuantityAdjustmentListItem) => {
    setCancelTarget(document);
    setCancellationReason('');
    setCancellationReasonError('');
  };

  const confirmCancellationRequest = async () => {
    if (!cancelTarget) return;

    const trimmedReason = cancellationReason.trim();
    if (!trimmedReason) {
      setCancellationReasonError('Cancellation reason is required.');
      return;
    }

    setCancelLoading(true);
    setCancellationReasonError('');
    try {
      await requestQuantityAdjustmentCancellation(cancelTarget.id, trimmedReason);
      setCancelTarget(null);
      setCancellationReason('');
      await loadDocuments();
    } catch (error) {
      setCancellationReasonError(getApiErrorMessage(error, 'Failed to request cancellation'));
    } finally {
      setCancelLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.toolbar}>
          <Input
            id="qa-history-search"
            value={listSearch}
            onChange={(event) => {
              setPage(1);
              setListSearch(event.target.value);
            }}
            placeholder="Search QA / ref / item"
          />
          <Select
            id="qa-history-status"
            value={listStatus}
            onChange={(event) => {
              setPage(1);
              setListStatus(event.target.value as '' | AdjustmentStatus);
            }}
          >
            <option value="">All</option>
            <option value="SAVED">Saved</option>
            <option value="POSTED">Posted</option>
            <option value="PENDING_CANCELLATION">Pending Cancellation</option>
            <option value="CANCELLED">Cancelled Entry</option>
          </Select>
        </div>

        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Quantity Adj#</th>
                <th>Date</th>
                <th>Type</th>
                <th>No</th>
                <th>Status</th>
                <th>Items</th>
                <th>User</th>
                {actionColumnVisible && <th>Action</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={tableColSpan} className={styles.empty}>Loading...</td>
                </tr>
              ) : documents.length === 0 ? (
                <tr>
                  <td colSpan={tableColSpan} className={styles.empty}>No transactions found</td>
                </tr>
              ) : (
                documents.map((document) => (
                  <tr
                    key={document.id}
                    className={styles.row}
                    onClick={() => navigate(`/quantity-adjustments?open=${document.id}`)}
                  >
                    <td className={styles.mono}>{document.qaNo || '—'}</td>
                    <td>{formatDate(document.transDate)}</td>
                    <td>{document.refType}</td>
                    <td>{document.refNo}</td>
                    <td>
                      <Badge variant={getStatusVariant(document.status)}>
                        {getStatusLabel(document.status)}
                      </Badge>
                    </td>
                    <td>{document.lineCount}</td>
                    <td>{document.createdBy}</td>
                    {actionColumnVisible && (
                      <td className={styles.rowActions}>
                        {document.status === 'SAVED' && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              openCancellationModal(document);
                            }}
                          >
                            Cancel
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          limit={15}
          onPageChange={setPage}
        />
      </div>

      <Modal
        open={Boolean(cancelTarget)}
        onClose={() => {
          if (!cancelLoading) setCancelTarget(null);
        }}
        title="Cancel Adjustment"
        size="sm"
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button
              variant="secondary"
              onClick={() => setCancelTarget(null)}
              disabled={cancelLoading}
            >
              Close
            </Button>
            <Button
              variant="danger"
              onClick={confirmCancellationRequest}
              loading={cancelLoading}
              disabled={!cancellationReason.trim()}
            >
              Confirm
            </Button>
          </div>
        }
      >
        <div className={styles.cancelReasonField}>
          <label htmlFor="qa-history-cancellation-reason">Cancellation Reason</label>
          <textarea
            id="qa-history-cancellation-reason"
            required
            value={cancellationReason}
            onChange={(event) => {
              setCancellationReason(event.target.value);
              if (event.target.value.trim()) {
                setCancellationReasonError('');
              }
            }}
            onBlur={() => {
              if (!cancellationReason.trim()) {
                setCancellationReasonError('Cancellation reason is required.');
              }
            }}
            placeholder="Enter reason for cancellation"
            rows={5}
            disabled={cancelLoading}
          />
          {cancellationReasonError && (
            <p className={styles.cancelReasonError}>{cancellationReasonError}</p>
          )}
        </div>
      </Modal>
    </div>
  );
}
