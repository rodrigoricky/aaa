import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import QuantityAdjustmentPrintDocument, {
  quantityAdjustmentPrintStyles,
} from '../components/QuantityAdjustmentPrintDocument';
import Button from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import Notification from '../components/Notification';
import { useAuth } from '../hooks/useAuth';
import { getProducts, type Product } from '../services/inventory.service';
import {
  createQuantityAdjustment,
  getPrintableQuantityAdjustment,
  getQuantityAdjustment,
  getQuantityAdjustmentMeta,
  postQuantityAdjustment,
  requestQuantityAdjustmentCancellation,
  updateQuantityAdjustment,
  type AdjustmentStatus,
  type QuantityAdjustmentDocument,
  type QuantityAdjustmentMeta,
  type ReferenceType,
} from '../services/quantity-adjustments.service';
import { getApiErrorDetails, getApiErrorMessage } from '../services/api';
import styles from './QuantityAdjustments.module.css';

interface DraftLine {
  rowId: string;
  itemcode: string;
  itemname: string;
  oldQty: number;
  entryMode: 'DELTA' | 'SET';
  inputValue: string;   // raw user input
  itemComment: string;
}

interface ValidationErrors {
  lines?: string;
  byRow: Record<string, { adjustQty?: string; itemComment?: string }>;
}

interface StaleStockItem {
  itemcode: string;
  savedQty: number;
  liveQty: number;
  difference: number;
}

interface StaleStockConflict {
  message: string;
  items: StaleStockItem[];
}

const MAX_QA_LINES = 8;
const MAX_QA_LINES_MESSAGE = 'Maximum of 8 items per Quantity Adjustment.';

function createRowId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function getDisplayStatus(status: AdjustmentStatus | 'OPEN') {
  if (status === 'PENDING_CANCELLATION') return 'Pending Cancellation';
  if (status === 'CANCELLED') return 'Cancelled Entry';
  return status === 'OPEN' ? 'OPEN' : status;
}

function getStatusClass(status: AdjustmentStatus | 'OPEN') {
  if (status === 'POSTED') return styles.statusPosted;
  if (status === 'SAVED') return styles.statusSaved;
  if (status === 'PENDING_CANCELLATION') return styles.statusPendingCancellation;
  if (status === 'CANCELLED') return styles.statusCancelled;
  return styles.statusOpen;
}

function toDraftLines(document: QuantityAdjustmentDocument | null): DraftLine[] {
  if (!document) {
    return [];
  }

  return document.lines.map((line) => ({
    rowId: createRowId(),
    itemcode: line.itemcode,
    itemname: line.itemname,
    oldQty: line.oldQty,
    entryMode: line.entryMode ?? 'DELTA',
    inputValue:
      line.entryMode === 'SET'
        ? String(line.requestedQty)
        : line.adjustQty >= 0
          ? String(line.adjustQty)
          : String(line.adjustQty),
    itemComment: line.itemRemark ?? '',
  }));
}

function computePreview(line: DraftLine): { adjustQty: number | null; newQty: number | null } {
  const raw = line.inputValue.trim();
  if (!raw) return { adjustQty: null, newQty: null };

  if (line.entryMode === 'DELTA') {
    const delta = Number(raw);
    if (!Number.isFinite(delta) || delta === 0) return { adjustQty: null, newQty: null };
    return { adjustQty: delta, newQty: line.oldQty + delta };
  } else {
    const target = Number(raw);
    if (!Number.isFinite(target) || target < 0) return { adjustQty: null, newQty: null };
    return { adjustQty: target - line.oldQty, newQty: target };
  }
}

function buildValidation(lines: DraftLine[]): ValidationErrors {
  const errors: ValidationErrors = { byRow: {} };

  if (lines.length === 0) {
    errors.lines = 'Add at least one item.';
  }

  if (lines.length > MAX_QA_LINES) {
    errors.lines = MAX_QA_LINES_MESSAGE;
  }

  lines.forEach((line) => {
    const rowErrors: ValidationErrors['byRow'][string] = {};
    const raw = line.inputValue.trim();

    if (!raw) {
      rowErrors.adjustQty = 'Required';
    } else if (line.entryMode === 'DELTA') {
      const delta = Number(raw);
      if (!Number.isFinite(delta)) rowErrors.adjustQty = 'Enter a number (e.g. +5 or -4)';
      else if (delta === 0) rowErrors.adjustQty = 'Cannot be zero';
    } else {
      const target = Number(raw);
      if (!Number.isFinite(target)) rowErrors.adjustQty = 'Enter a valid quantity (e.g. 10)';
      else if (target < 0) rowErrors.adjustQty = 'Cannot be negative';
    }

    if (line.itemComment.length > 500) {
      rowErrors.itemComment = 'Max 500';
    }

    if (rowErrors.adjustQty || rowErrors.itemComment) {
      errors.byRow[line.rowId] = rowErrors;
    }
  });

  return errors;
}

function hasValidationErrors(errors: ValidationErrors) {
  return Boolean(errors.lines || Object.keys(errors.byRow).length > 0);
}

function getStaleStockConflict(error: unknown): StaleStockConflict | null {
  const status = (error as { response?: { status?: number } })?.response?.status;
  const details = getApiErrorDetails<{ items?: StaleStockItem[] }>(error);

  if (status !== 409 || !details?.items?.length) {
    return null;
  }

  return {
    message: getApiErrorMessage(
      error,
      'Stock changed after this adjustment was saved. Please reload and review before posting.'
    ),
    items: details.items,
  };
}

export default function QuantityAdjustments() {
  const { hasPermission, hasRole } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const canAccess = hasPermission('adjustmentPageAccess');
  const canCreate = hasPermission('adjustmentSave');
  const canEdit = hasPermission('adjustmentEdit');
  const canPost = hasPermission('adjustmentPost');
  const canPrint = hasPermission('adjustmentPrint');

  const [meta, setMeta] = useState<QuantityAdjustmentMeta | null>(null);
  const [currentDocument, setCurrentDocument] = useState<QuantityAdjustmentDocument | null>(null);
  const [draftRefType, setDraftRefType] = useState<ReferenceType>('DM');
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({ byRow: {} });
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [printLoading, setPrintLoading] = useState(false);
  const [loadingDocumentId, setLoadingDocumentId] = useState<string | null>(null);
  const [postConfirmOpen, setPostConfirmOpen] = useState(false);
  const [staleStockConflict, setStaleStockConflict] = useState<StaleStockConflict | null>(null);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');
  const [cancellationReasonError, setCancellationReasonError] = useState('');
  const [cancelLoading, setCancelLoading] = useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const [itemSearch, setItemSearch] = useState('');
  const [itemResults, setItemResults] = useState<Product[]>([]);
  const [itemSearchLoading, setItemSearchLoading] = useState(false);
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false);
  const [printPreviewError, setPrintPreviewError] = useState('');
  const [printDocument, setPrintDocument] = useState<QuantityAdjustmentDocument | null>(null);
  const [printingDocument, setPrintingDocument] = useState(false);
  const itemSearchRef = useRef<HTMLInputElement>(null);
  const printPreviewRef = useRef<HTMLDivElement>(null);

  const [notification, setNotification] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  const openId = searchParams.get('open');
  const isExistingDocument = Boolean(currentDocument?.id);
  const isSaved = currentDocument?.status === 'SAVED';
  const isPosted = currentDocument?.status === 'POSTED';
  const isPendingCancellation = currentDocument?.status === 'PENDING_CANCELLATION';
  const canRequestCancellation =
    Boolean(currentDocument?.id) && isSaved && hasRole('Admin', 'Supervisor', 'Encoder');
  const canFinalizeCancellation =
    Boolean(currentDocument?.id) && isPendingCancellation && canPost && hasRole('Admin', 'Supervisor');
  const canPostSavedAdjustment = Boolean(currentDocument?.id) && isSaved && canPost;
  const canPrintPostedAdjustment = Boolean(currentDocument?.id) && isPosted && canPrint;
  const isEditable = isExistingDocument ? Boolean(isSaved && canEdit) : canCreate;
  const rawStatus = currentDocument?.status ?? 'OPEN';
  const displayedStatus = getDisplayStatus(rawStatus);
  const displayedQaNo = currentDocument?.qaNo || meta?.nextQaNo || 'Auto';
  const displayedDate = currentDocument?.transDate || meta?.serverDate || new Date().toISOString();
  const displayedRefType = currentDocument?.refType || draftRefType;
  const displayedRefNo = currentDocument?.refNo || meta?.nextRefNumbers[draftRefType] || 'Auto';
  const focusItemSearch = useCallback(() => {
    const input = itemSearchRef.current;
    if (!isEditable || !input || input.disabled || document.querySelector('[role="dialog"]')) {
      return;
    }

    input.focus();
  }, [isEditable]);

  const totalAdjustment = useMemo(
    () =>
      draftLines.reduce((sum, line) => {
        const preview = computePreview(line);
        return sum + (preview.adjustQty ?? 0);
      }, 0),
    [draftLines]
  );

  const loadMeta = useCallback(async () => {
    const result = await getQuantityAdjustmentMeta();
    setMeta(result);
  }, []);

  const loadDocument = useCallback(async (id: string) => {
    setLoadingDocumentId(id);
    setFormError('');
    try {
      const document = await getQuantityAdjustment(id);
      setCurrentDocument(document);
      setDraftRefType(document.refType);
      setDraftLines(toDraftLines(document));
      setValidationErrors({ byRow: {} });
      setIsDirty(false);
      setItemSearch('');
      setItemResults([]);
      setStaleStockConflict(null);
    } catch {
      setNotification({
        message: 'Failed to load adjustment',
        type: 'error',
      });
    } finally {
      setLoadingDocumentId(null);
    }
  }, []);

  useEffect(() => {
    if (!canAccess) return;
    loadMeta().catch(() => {});
  }, [canAccess, loadMeta]);

  useEffect(() => {
    if (!canAccess || !openId) return;
    if (currentDocument?.id === openId || loadingDocumentId === openId) {
      return;
    }

    loadDocument(openId).catch(() => {});
  }, [canAccess, currentDocument?.id, loadDocument, loadingDocumentId, openId]);

  useEffect(() => {
    if (!isEditable) {
      setItemResults([]);
      return;
    }

    const trimmed = itemSearch.trim();
    if (trimmed.length < 1) {
      setItemResults([]);
      return;
    }

    const timer = window.setTimeout(() => {
      setItemSearchLoading(true);
      getProducts({ page: 1, limit: 8, search: trimmed })
        .then((result) => setItemResults(result.data))
        .catch(() => {
          setItemResults([]);
        })
        .finally(() => {
          setItemSearchLoading(false);
        });
    }, 150);

    return () => window.clearTimeout(timer);
  }, [isEditable, itemSearch]);

  useEffect(() => {
    if (!isEditable) return;

    const frame = window.requestAnimationFrame(() => {
      focusItemSearch();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [focusItemSearch, isEditable, loadingDocumentId]);

  if (!canAccess) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleNewClick = () => {
    if (isDirty) {
      setDiscardConfirmOpen(true);
    } else {
      resetDraft();
    }
  };

  const resetDraft = () => {
    setCurrentDocument(null);
    setDraftRefType('DM');
    setDraftLines([]);
    setValidationErrors({ byRow: {} });
    setFormError('');
    setItemSearch('');
    setItemResults([]);
    setCancelConfirmOpen(false);
    setStaleStockConflict(null);
    setCancellationReason('');
    setCancellationReasonError('');
    setSearchParams({}, { replace: true });
    setIsDirty(false);
    loadMeta().catch(() => {});
  };

  const addItem = (item: Product) => {
    if (draftLines.length >= MAX_QA_LINES) {
      setNotification({
        message: MAX_QA_LINES_MESSAGE,
        type: 'info',
      });
      return;
    }

    if (draftLines.some((line) => line.itemcode === item.itemcode)) {
      setNotification({
        message: `${item.itemcode} already added`,
        type: 'info',
      });
      return;
    }

    setDraftLines((prev) => [
      ...prev,
      {
        rowId: createRowId(),
        itemcode: item.itemcode,
        itemname: item.name,
        oldQty: item.quantity,
        entryMode: 'DELTA',
        inputValue: '',
        itemComment: '',
      },
    ]);
    setIsDirty(true);
    setValidationErrors((prev) => ({ ...prev, lines: undefined }));
    setItemSearch('');
    setItemResults([]);
    window.requestAnimationFrame(() => {
      focusItemSearch();
    });
  };

  const updateLine = (rowId: string, field: 'inputValue' | 'itemComment' | 'entryMode', value: string) => {
    setDraftLines((prev) =>
      prev.map((line) => (line.rowId === rowId ? { ...line, [field]: value } : line))
    );
    setIsDirty(true);
    if (field !== 'entryMode') {
      setValidationErrors((prev) => {
        if (!prev.byRow[rowId]) return prev;
        return {
          ...prev,
          byRow: {
            ...prev.byRow,
            [rowId]: {
              ...prev.byRow[rowId],
              adjustQty: undefined,
              itemComment: undefined,
            },
          },
        };
      });
    }
  };

  const removeLine = (rowId: string) => {
    setDraftLines((prev) => prev.filter((line) => line.rowId !== rowId));
    setIsDirty(true);
  };

  const saveDocument = async () => {
    const isNewDoc = !currentDocument?.id;
    if (isNewDoc ? !canCreate : !canEdit) {
      setFormError('You do not have permission to perform this action.');
      return;
    }

    const errors = buildValidation(draftLines);
    setValidationErrors(errors);
    setFormError('');

    if (hasValidationErrors(errors)) {
      return;
    }

    const payload = {
      lines: draftLines.map((line) => ({
        itemcode: line.itemcode,
        entryMode: line.entryMode,
        requestedQty: Number(line.inputValue),
        itemRemark: line.itemComment.trim() || undefined,
      })),
    };

    setFormLoading(true);
    try {
      const result = currentDocument?.id
        ? await updateQuantityAdjustment(currentDocument.id, payload)
        : await createQuantityAdjustment({
            refType: draftRefType,
            lines: payload.lines,
          });

      setCurrentDocument(result);
      setDraftRefType(result.refType);
      setDraftLines(toDraftLines(result));
      setValidationErrors({ byRow: {} });
      setIsDirty(false);
      setStaleStockConflict(null);
      setSearchParams({ open: result.id }, { replace: true });
      await loadMeta().catch(() => {});
      setNotification({
        message: currentDocument?.id ? 'Saved changes.' : 'Adjustment saved.',
        type: 'success',
      });
    } catch (error) {
      setFormError(getApiErrorMessage(error, 'Failed to save adjustment'));
    } finally {
      setFormLoading(false);
    }
  };

  const confirmPost = async () => {
    if (!canPost) return;
    if (!currentDocument?.id) return;

    setFormLoading(true);
    setFormError('');
    try {
      const result = await postQuantityAdjustment(currentDocument.id);
      setCurrentDocument(result);
      setDraftLines(toDraftLines(result));
      setPostConfirmOpen(false);
      setStaleStockConflict(null);
      setNotification({
        message: result.status === 'CANCELLED' ? 'Cancellation posted.' : 'Adjustment posted.',
        type: 'success',
      });
    } catch (error) {
      const staleStock = getStaleStockConflict(error);
      if (staleStock) {
        setPostConfirmOpen(false);
        setStaleStockConflict(staleStock);
        setFormError(staleStock.message);
      } else {
        setFormError(getApiErrorMessage(error, 'Failed to post adjustment'));
      }
    } finally {
      setFormLoading(false);
    }
  };

  const reloadStaleAdjustment = async () => {
    if (!currentDocument?.id) {
      setStaleStockConflict(null);
      return;
    }

    await loadDocument(currentDocument.id);
    setStaleStockConflict(null);
  };

  const openCancellationModal = () => {
    setCancellationReason('');
    setCancellationReasonError('');
    setCancelConfirmOpen(true);
  };

  const confirmCancellationRequest = async () => {
    if (!currentDocument?.id || !canRequestCancellation) return;

    const trimmedReason = cancellationReason.trim();
    if (!trimmedReason) {
      setCancellationReasonError('Cancellation reason is required.');
      return;
    }

    setCancelLoading(true);
    setCancellationReasonError('');
    setFormError('');
    try {
      const result = await requestQuantityAdjustmentCancellation(currentDocument.id, trimmedReason);
      setCurrentDocument(result);
      setDraftLines(toDraftLines(result));
      setCancelConfirmOpen(false);
      setCancellationReason('');
      setIsDirty(false);
      setNotification({
        message: 'Cancellation requested.',
        type: 'success',
      });
    } catch (error) {
      setCancellationReasonError(getApiErrorMessage(error, 'Failed to request cancellation'));
    } finally {
      setCancelLoading(false);
    }
  };

  const handlePrint = async () => {
    if (!canPrintPostedAdjustment) return;
    if (!currentDocument?.id) return;

    setPrintPreviewOpen(true);
    setPrintLoading(true);
    setPrintPreviewError('');
    setPrintDocument(null);
    try {
      const result = await getPrintableQuantityAdjustment(currentDocument.id);
      setCurrentDocument(result);
      setPrintDocument(result);
    } catch (error) {
      setPrintPreviewError(getApiErrorMessage(error, 'Failed to generate print preview'));
      setNotification({
        message: getApiErrorMessage(error, 'Failed to print adjustment'),
        type: 'error',
      });
    } finally {
      setPrintLoading(false);
    }
  };

  const handlePrintHtmlDocument = useCallback(async () => {
    if (!printDocument || !printPreviewRef.current) {
      return;
    }

    setPrintingDocument(true);
    try {
      const printWindow = window.open('', '_blank', 'width=900,height=700');
      if (!printWindow) {
        throw new Error('Popup blocked');
      }

      printWindow.document.open();
      printWindow.document.write(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${printDocument.qaNo || 'Quantity Adjustment'}</title>
    <style>${quantityAdjustmentPrintStyles}</style>
  </head>
  <body>${printPreviewRef.current.innerHTML}</body>
</html>`);
      printWindow.document.close();

      printWindow.focus();
      printWindow.onload = () => {
        printWindow.focus();
        printWindow.print();
        window.setTimeout(() => {
          printWindow.close();
        }, 300);
      };
    } catch (error) {
      setNotification({
        message: getApiErrorMessage(error, 'Failed to print document'),
        type: 'error',
      });
    } finally {
      setPrintingDocument(false);
    }
  }, [printDocument]);

  return (
    <div className={styles.page}>
      {notification && (
        <Notification
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification(null)}
        />
      )}

      <div className={styles.screenHeader}>
        <h2 className={styles.screenTitle}>
          QUANTITY ADJUSTMENT <span className={styles.screenDash}>-</span>{' '}
          <span className={getStatusClass(rawStatus)}>{displayedStatus}</span>
        </h2>
        {canCreate && (
          <Button variant="secondary" size="md" onClick={handleNewClick}>New</Button>
        )}
      </div>

      <div className={styles.card}>
        <div className={styles.docGrid}>
          <div className={styles.docField}>
            <span className={styles.docLabel}>Quantity Adj#</span>
            <strong className={styles.docValue}>
              {openId && loadingDocumentId === openId ? 'Loading...' : displayedQaNo}
            </strong>
          </div>
          <div className={styles.docField}>
            <span className={styles.docLabel}>Type</span>
            <Select
              id="qa-ref-type"
              value={displayedRefType}
              disabled={isExistingDocument || !canCreate}
              onChange={(event) => setDraftRefType(event.target.value as ReferenceType)}
            >
              <option value="DM">DM</option>
              <option value="CM">CM</option>
            </Select>
          </div>
          <div className={styles.docField}>
            <span className={styles.docLabel}>{displayedRefType} No</span>
            <strong className={styles.docValue}>{displayedRefNo}</strong>
          </div>
          <div className={styles.docField}>
            <span className={styles.docLabel}>Date</span>
            <strong className={styles.docValue}>{formatDate(displayedDate)}</strong>
          </div>
        </div>

        {formError && <div className={styles.errorBanner}>{formError}</div>}
        {validationErrors.lines && <div className={styles.errorBanner}>{validationErrors.lines}</div>}
        {currentDocument?.cancellationReason && (
          <div className={styles.cancellationPanel}>
            <span className={styles.docLabel}>Cancellation Reason</span>
            <p>{currentDocument.cancellationReason}</p>
            <span>
              Requested by {currentDocument.cancellationRequestedBy ?? '—'}
              {currentDocument.cancellationRequestedAt
                ? ` on ${formatDate(currentDocument.cancellationRequestedAt)}`
                : ''}
              {currentDocument.cancelledBy
                ? ` · Posted by ${currentDocument.cancelledBy}`
                : ''}
            </span>
          </div>
        )}

        {isEditable && (
          <div className={styles.searchStrip}>
            <Input
              id="qa-item-search"
              ref={itemSearchRef}
              value={itemSearch}
              onChange={(event) => setItemSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && itemResults[0] && draftLines.length < MAX_QA_LINES) {
                  event.preventDefault();
                  addItem(itemResults[0]);
                }
              }}
              placeholder="Barcode / description"
              autoComplete="off"
              disabled={draftLines.length >= MAX_QA_LINES}
            />
            {draftLines.length >= MAX_QA_LINES && (
              <span className={styles.searchState}>{MAX_QA_LINES_MESSAGE}</span>
            )}
            {itemSearchLoading && <span className={styles.searchState}>Searching...</span>}
          </div>
        )}

        {isEditable && itemSearch.trim().length >= 1 && (
          <div className={styles.searchResults}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Barcode / Item</th>
                  <th>Description</th>
                  <th>Qty</th>
                </tr>
              </thead>
              <tbody>
                {itemResults.length === 0 ? (
                  <tr>
                    <td colSpan={3} className={styles.emptyInline}>No items found</td>
                  </tr>
                ) : (
                  itemResults.map((item) => (
                    <tr
                      key={item.id}
                      className={styles.resultRow}
                      onClick={() => addItem(item)}
                    >
                      <td className={styles.mono}>{item.itemcode}</td>
                      <td>{item.name}</td>
                      <td>{item.quantity.toFixed(2)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className={styles.gridWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Barcode / Item</th>
                <th>Description</th>
                <th>Current Qty</th>
                <th>Mode</th>
                <th>Input</th>
                <th>New Qty</th>
                <th>Comment</th>
                {isEditable && <th></th>}
              </tr>
            </thead>
            <tbody>
              {draftLines.length === 0 ? (
                <tr>
                  <td colSpan={isEditable ? 8 : 7} className={styles.empty}>
                    No items
                  </td>
                </tr>
              ) : (
                draftLines.map((line) => {
                  const rowErrors = validationErrors.byRow[line.rowId];
                  const preview = computePreview(line);

                  return (
                    <tr key={line.rowId}>
                      <td className={styles.mono}>{line.itemcode}</td>
                      <td className={styles.itemName}>{line.itemname}</td>
                      <td>{line.oldQty.toFixed(2)}</td>
                      <td>
                        {isEditable ? (
                          <select
                            className={styles.modeSelect}
                            value={line.entryMode}
                            onChange={(e) => updateLine(line.rowId, 'entryMode', e.target.value)}
                            title="Adjust (+/−) adds or subtracts from current qty. Set exact replaces it."
                          >
                            <option value="DELTA">Adjust (+/−)</option>
                            <option value="SET">Set exact qty</option>
                          </select>
                        ) : (
                          <span className={styles.modeBadge}>
                            {line.entryMode === 'SET' ? 'Set exact' : 'Adjust'}
                          </span>
                        )}
                      </td>
                      <td>
                        {isEditable ? (
                          <>
                            <input
                              className={`${styles.cellInput} ${rowErrors?.adjustQty ? styles.cellInputError : ''}`}
                              type="text"
                              inputMode="numeric"
                              value={line.inputValue}
                              placeholder={line.entryMode === 'DELTA' ? 'e.g. +5 or −4' : 'e.g. 10'}
                              onChange={(e) => updateLine(line.rowId, 'inputValue', e.target.value)}
                            />
                            {rowErrors?.adjustQty && (
                              <div className={styles.cellError}>{rowErrors.adjustQty}</div>
                            )}
                          </>
                        ) : (
                          <span className={styles.mono}>
                            {line.entryMode === 'SET'
                              ? line.inputValue
                              : Number(line.inputValue) >= 0
                                ? `+${line.inputValue}`
                                : line.inputValue}
                          </span>
                        )}
                      </td>
                      <td>
                        {preview.newQty != null ? (
                          <span
                            className={
                              preview.adjustQty! > 0
                                ? styles.previewPos
                                : preview.adjustQty! < 0
                                  ? styles.previewNeg
                                  : ''
                            }
                          >
                            {preview.newQty.toFixed(2)}
                          </span>
                        ) : (
                          <span className={styles.previewEmpty}>—</span>
                        )}
                      </td>
                      <td>
                        {isEditable ? (
                          <>
                            <input
                              className={`${styles.cellInput} ${rowErrors?.itemComment ? styles.cellInputError : ''}`}
                              type="text"
                              value={line.itemComment}
                              onChange={(e) => updateLine(line.rowId, 'itemComment', e.target.value)}
                              maxLength={500}
                            />
                            {rowErrors?.itemComment && (
                              <div className={styles.cellError}>{rowErrors.itemComment}</div>
                            )}
                          </>
                        ) : (
                          line.itemComment || '—'
                        )}
                      </td>
                      {isEditable && (
                        <td>
                          <button
                            className={styles.removeBtn}
                            type="button"
                            onClick={() => removeLine(line.rowId)}
                            aria-label={`Remove ${line.itemcode}`}
                          >
                            ×
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className={styles.footerBar}>
          <div className={styles.summaryBlock}>
            <span>Lines: {draftLines.length}{draftLines.length >= MAX_QA_LINES ? <span className={styles.maxLines}> (max)</span> : null}</span>
            <span>Net Adjust: {totalAdjustment >= 0 ? '+' : ''}{totalAdjustment.toFixed(2)}</span>
          </div>
          <div className={styles.actionButtons}>
            {isEditable && (
              <Button onClick={saveDocument} loading={formLoading}>
                Save
              </Button>
            )}
            {canRequestCancellation && (
              <Button
                variant="secondary"
                onClick={openCancellationModal}
                disabled={formLoading || cancelLoading}
              >
                Cancel
              </Button>
            )}
            {(canPostSavedAdjustment || canFinalizeCancellation) && (
              <Button variant="danger" onClick={() => setPostConfirmOpen(true)} disabled={formLoading}>
                Post
              </Button>
            )}
            {canPrintPostedAdjustment && (
              <Button variant="secondary" onClick={handlePrint} loading={printLoading}>
                Print
              </Button>
            )}
          </div>
        </div>
      </div>

      <Modal
        open={printPreviewOpen}
        onClose={() => {
          setPrintPreviewOpen(false);
          setPrintPreviewError('');
        }}
        title={`Print Preview — ${printDocument?.qaNo ?? currentDocument?.qaNo ?? 'Quantity Adjustment'}`}
        size="lg"
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button
              variant="secondary"
              onClick={() => {
                setPrintPreviewOpen(false);
                setPrintPreviewError('');
              }}
            >
              Close
            </Button>
            {printDocument && (
              <Button variant="secondary" onClick={handlePrintHtmlDocument} loading={printingDocument}>
                Print
              </Button>
            )}
          </div>
        }
      >
        <div className={styles.printPreviewBody}>
          {printLoading ? (
            <div className={styles.printPreviewState}>Generating 8.5 x 5.5 print preview...</div>
          ) : printPreviewError ? (
            <div className={styles.printPreviewState}>{printPreviewError}</div>
          ) : printDocument ? (
            <div ref={printPreviewRef} className={styles.printMarkupFrame}>
              <QuantityAdjustmentPrintDocument documentData={printDocument} preview />
            </div>
          ) : (
            <div className={styles.printPreviewState}>No records to print.</div>
          )}
        </div>
      </Modal>

      <Modal
        open={discardConfirmOpen}
        onClose={() => setDiscardConfirmOpen(false)}
        title="Discard Changes"
        size="sm"
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setDiscardConfirmOpen(false)}>
              Keep Editing
            </Button>
            <Button variant="danger" onClick={() => { setDiscardConfirmOpen(false); resetDraft(); }}>
              Discard
            </Button>
          </div>
        }
      >
        <p className={styles.confirmText}>
          You have unsaved changes. Discard this draft and start a new quantity adjustment?
        </p>
      </Modal>

      <Modal
        open={postConfirmOpen}
        onClose={() => setPostConfirmOpen(false)}
        title={isPendingCancellation ? 'Post Cancellation' : 'Post Adjustment'}
        size="sm"
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setPostConfirmOpen(false)} disabled={formLoading}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmPost} loading={formLoading}>
              Post
            </Button>
          </div>
        }
      >
        <p className={styles.confirmText}>
          {isPendingCancellation ? (
            <>
              Post this cancellation? The entry will become <strong>Cancelled Entry</strong> and remain visible as a historical record.
            </>
          ) : (
            <>
              Post this quantity adjustment? This will make the inventory changes <strong>live</strong> and update the actual stock records. The document will be locked and cannot be edited after posting.
            </>
          )}
        </p>
      </Modal>

      <Modal
        open={Boolean(staleStockConflict)}
        onClose={() => setStaleStockConflict(null)}
        title="Stock Changed"
        size="md"
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setStaleStockConflict(null)}>
              Close
            </Button>
            <Button onClick={reloadStaleAdjustment} loading={loadingDocumentId === currentDocument?.id}>
              Reload Adjustment
            </Button>
          </div>
        }
      >
        <div className={styles.staleStockPanel}>
          <p className={styles.confirmText}>{staleStockConflict?.message}</p>
          <table className={styles.staleStockTable}>
            <thead>
              <tr>
                <th>Item Code</th>
                <th>Saved Qty</th>
                <th>Live Qty</th>
                <th>Difference</th>
              </tr>
            </thead>
            <tbody>
              {staleStockConflict?.items.map((item) => (
                <tr key={item.itemcode}>
                  <td className={styles.mono}>{item.itemcode}</td>
                  <td>{item.savedQty.toFixed(2)}</td>
                  <td>{item.liveQty.toFixed(2)}</td>
                  <td>{item.difference.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>

      <Modal
        open={cancelConfirmOpen}
        onClose={() => {
          if (!cancelLoading) setCancelConfirmOpen(false);
        }}
        title="Cancel Adjustment"
        size="sm"
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button
              variant="secondary"
              onClick={() => setCancelConfirmOpen(false)}
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
          <label htmlFor="qa-cancellation-reason">Cancellation Reason</label>
          <textarea
            id="qa-cancellation-reason"
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
