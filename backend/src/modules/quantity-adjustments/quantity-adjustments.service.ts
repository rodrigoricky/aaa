import type { ConnectionPool, Transaction } from 'mssql';
import { env } from '../../config/env.js';
import { getSqlPool, sql, withTransaction } from '../../shared/database/sql-server.js';
import {
  badRequest,
  conflict,
  forbidden,
  notFound,
  unprocessable,
} from '../../shared/errors/http-errors.js';
import type {
  AdjustmentStatus,
  AuthenticatedUser,
  PaginatedResult,
  ReferenceType,
} from '../../shared/types/index.js';
import {
  cleanString,
  parseRequiredQuantity,
  toIsoString,
  toNumber,
} from '../../shared/utils/value.js';
import { recordAuditEvent } from '../../utils/audit.js';
import {
  allocateNextNumber,
  generateNextQaNumberInTransaction,
  getNumberingPreview,
} from '../numbering/numbering.service.js';

interface AdjustmentLineInput {
  itemcode: string;
  entryMode: 'DELTA' | 'SET';
  requestedQty: number;
  itemRemark?: string;
}

interface HeaderRow {
  qaId: number;
  qaNo: string;
  transDate: Date;
  refType: ReferenceType;
  refNo: string;
  refSeriesNo: number;
  status: AdjustmentStatus;
  createdBy: number;
  createdByUsername: string;
  createdAt: Date;
  updatedBy: number;
  updatedByUsername: string;
  updatedAt: Date;
  postedBy: number | null;
  postedByUsername: string | null;
  postedAt: Date | null;
  cancellationReason: string | null;
  cancellationRequestedBy: number | null;
  cancellationRequestedByUsername: string | null;
  cancellationRequestedAt: Date | null;
  cancelledBy: number | null;
  cancelledByUsername: string | null;
  cancelledAt: Date | null;
  printCount: number;
  lastPrintedAt: Date | null;
}

interface AdjustmentDetailRow {
  detailId: number;
  lineNo: number;
  itemcode: string;
  itemname: string;
  oldQty: number;
  adjustQty: number;
  newQty: number;
  postedOldQty: number | null;
  postedNewQty: number | null;
  entryMode: string | null;
  requestedQty: number | null;
  itemRemark: string | null;
  updatedAt: Date;
}

interface ItemSnapshotRow {
  itemcode: string;
  itemname: string;
  quantity: number;
}

const MAX_QA_LINES = 8;
const MAX_QA_LINES_MESSAGE = 'Maximum of 8 items per Quantity Adjustment.';
const STALE_STOCK_MESSAGE =
  'Stock changed after this adjustment was saved. Please reload and review before posting.';

interface StaleStockConflictItem {
  itemcode: string;
  savedQty: number;
  liveQty: number;
  difference: number;
}

interface BlockedPostAudit {
  eventType: 'QA_POST_BLOCKED_INVALID_STOCK' | 'QA_POST_BLOCKED_STALE_STOCK';
  qaId: number;
  qaNo: string;
  actor: AuthenticatedUser;
  details: {
    qaNo: string;
    itemcode: string | null;
    savedQty: number | null;
    liveQty: number | null;
    user: string;
    timestamp: string;
    reason: string;
    items: Array<{
      itemcode: string;
      savedQty: number | null;
      liveQty: number | null;
      difference?: number;
      reason?: string;
    }>;
  };
}

function isDraftQaNumber(value: unknown) {
  return cleanString(value).startsWith('DRAFT-');
}

function invalidStockMessage(itemcode: string) {
  return `Item ${itemcode} has no valid current quantity in POS database. Please verify stock before saving/posting.`;
}

function roundQuantity(value: number) {
  return Number(value.toFixed(2));
}

function quantitiesMatch(left: number, right: number) {
  return Math.abs(left - right) < 0.005;
}

function buildBlockedPostAudit(input: {
  eventType: BlockedPostAudit['eventType'];
  header: HeaderRow;
  actor: AuthenticatedUser;
  reason: string;
  items: BlockedPostAudit['details']['items'];
}): BlockedPostAudit {
  const firstItem = input.items[0];
  return {
    eventType: input.eventType,
    qaId: input.header.qaId,
    qaNo: cleanString(input.header.qaNo),
    actor: input.actor,
    details: {
      qaNo: cleanString(input.header.qaNo),
      itemcode: firstItem?.itemcode ?? null,
      savedQty: firstItem?.savedQty ?? null,
      liveQty: firstItem?.liveQty ?? null,
      user: input.actor.username,
      timestamp: new Date().toISOString(),
      reason: input.reason,
      items: input.items,
    },
  };
}

async function recordBlockedPostAudit(input: BlockedPostAudit) {
  const pool = await getSqlPool();
  await recordAuditEvent(pool, {
    eventType: input.eventType,
    entityType: 'QA_HEADER',
    entityId: input.qaId,
    actorUserId: input.actor.id,
    actorUsername: input.actor.username,
    details: input.details,
  });
}

interface AdjustmentDetail {
  id: string;
  lineNo: number;
  itemcode: string;
  itemname: string;
  oldQty: number;
  adjustQty: number;
  newQty: number;
  postedOldQty: number | null;
  postedNewQty: number | null;
  entryMode: 'DELTA' | 'SET';
  requestedQty: number;
  itemRemark: string | null;
  updatedAt: string | null;
}

function mapHeader(row: HeaderRow) {
  return {
    id: String(row.qaId),
    qaNo: cleanString(row.qaNo),
    transDate: row.transDate.toISOString(),
    refType: row.refType,
    refNo: row.refNo,
    refSeriesNo: row.refSeriesNo,
    status: row.status,
    createdBy: row.createdByUsername,
    createdAt: row.createdAt.toISOString(),
    updatedBy: row.updatedByUsername,
    updatedAt: row.updatedAt.toISOString(),
    postedBy: row.postedByUsername,
    postedAt: toIsoString(row.postedAt),
    cancellationReason: cleanString(row.cancellationReason) || null,
    cancellationRequestedBy: row.cancellationRequestedByUsername,
    cancellationRequestedAt: toIsoString(row.cancellationRequestedAt),
    cancelledBy: row.cancelledByUsername,
    cancelledAt: toIsoString(row.cancelledAt),
    printCount: row.printCount,
    lastPrintedAt: toIsoString(row.lastPrintedAt),
  };
}

async function getHeaderById(
  executor: ConnectionPool | Transaction,
  qaId: number,
  lock = false
): Promise<HeaderRow | null> {
  const request = executor.request();
  request.input('qaId', sql.BigInt, qaId);

  const lockHint = lock ? 'WITH (UPDLOCK, HOLDLOCK)' : '';
  const result = await request.query(`
    SELECT TOP 1
      qa_id AS qaId,
      qa_no AS qaNo,
      trans_date AS transDate,
      ref_type AS refType,
      ref_no AS refNo,
      ref_series_no AS refSeriesNo,
      status,
      created_by AS createdBy,
      created_by_username AS createdByUsername,
      created_at AS createdAt,
      updated_by AS updatedBy,
      updated_by_username AS updatedByUsername,
      updated_at AS updatedAt,
      posted_by AS postedBy,
      posted_by_username AS postedByUsername,
      posted_at AS postedAt,
      cancellation_reason AS cancellationReason,
      cancellation_requested_by AS cancellationRequestedBy,
      cancellation_requested_by_username AS cancellationRequestedByUsername,
      cancellation_requested_at AS cancellationRequestedAt,
      cancelled_by AS cancelledBy,
      cancelled_by_username AS cancelledByUsername,
      cancelled_at AS cancelledAt,
      print_count AS printCount,
      last_printed_at AS lastPrintedAt
    FROM [${env.UTILITY_SCHEMA}].[qa_header] ${lockHint}
    WHERE qa_id = @qaId
  `);

  return result.recordset[0] ?? null;
}

async function repairDraftQaNumberById(qaId: number) {
  return withTransaction(async (transaction) => {
    const header = await getHeaderById(transaction, qaId, true);
    if (!header) {
      return null;
    }

    const currentQaNo = cleanString(header.qaNo);
    if (currentQaNo && !isDraftQaNumber(currentQaNo)) {
      return currentQaNo;
    }

    const qaNumber = await generateNextQaNumberInTransaction(transaction);

    await transaction
      .request()
      .input('qaId', sql.BigInt, qaId)
      .input('qaNo', sql.NVarChar, qaNumber.value)
      .query(`
        UPDATE [${env.UTILITY_SCHEMA}].[qa_header]
        SET
          qa_no = @qaNo,
          updated_at = SYSUTCDATETIME()
        WHERE qa_id = @qaId
      `);

    return qaNumber.value;
  }, sql.ISOLATION_LEVEL.SERIALIZABLE);
}

async function repairDraftQaNumbers() {
  await withTransaction(async (transaction) => {
    const result = await transaction.request().query(`
      SELECT qa_id AS qaId
      FROM [${env.UTILITY_SCHEMA}].[qa_header] WITH (UPDLOCK, HOLDLOCK)
      WHERE qa_no IS NULL
         OR LTRIM(RTRIM(qa_no)) = N''
         OR qa_no LIKE N'DRAFT-%'
      ORDER BY created_at ASC, qa_id ASC
    `);

    for (const row of result.recordset as Array<{ qaId: number }>) {
      const qaNumber = await generateNextQaNumberInTransaction(transaction);

      await transaction
        .request()
        .input('qaId', sql.BigInt, row.qaId)
        .input('qaNo', sql.NVarChar, qaNumber.value)
        .query(`
          UPDATE [${env.UTILITY_SCHEMA}].[qa_header]
          SET
            qa_no = @qaNo,
            updated_at = SYSUTCDATETIME()
          WHERE qa_id = @qaId
        `);
    }
  }, sql.ISOLATION_LEVEL.SERIALIZABLE);
}

async function getDetailsByQaId(executor: ConnectionPool | Transaction, qaId: number) {
  const result = await executor
    .request()
    .input('qaId', sql.BigInt, qaId)
    .query(`
      SELECT
        detail_id AS detailId,
        line_no AS [lineNo],
        itemcode,
        itemname,
        old_qty AS oldQty,
        adjust_qty AS adjustQty,
        new_qty AS newQty,
        posted_old_qty AS postedOldQty,
        posted_new_qty AS postedNewQty,
        entry_mode AS entryMode,
        requested_qty AS requestedQty,
        item_remark AS itemRemark,
        updated_at AS updatedAt
      FROM [${env.UTILITY_SCHEMA}].[qa_detail]
      WHERE qa_id = @qaId
      ORDER BY line_no ASC
    `);

  return (result.recordset as AdjustmentDetailRow[]).map((row) => {
    const mode: 'DELTA' | 'SET' =
      row.entryMode === 'SET' ? 'SET' : 'DELTA';
    const adjustQty = toNumber(row.adjustQty);
    const requestedQty = row.requestedQty != null ? toNumber(row.requestedQty) : adjustQty;
    return {
      id: String(row.detailId),
      lineNo: Number(row.lineNo),
      itemcode: cleanString(row.itemcode),
      itemname: cleanString(row.itemname),
      oldQty: toNumber(row.oldQty),
      adjustQty,
      newQty: toNumber(row.newQty),
      postedOldQty: row.postedOldQty != null ? toNumber(row.postedOldQty) : null,
      postedNewQty: row.postedNewQty != null ? toNumber(row.postedNewQty) : null,
      entryMode: mode,
      requestedQty,
      itemRemark: cleanString(row.itemRemark) || null,
      updatedAt: toIsoString(row.updatedAt),
    };
  });
}

async function getItemRowsByCodes(
  executor: ConnectionPool | Transaction,
  itemcodes: string[],
  lockRows = false,
  onInvalidQuantity?: (itemcode: string, value: unknown) => void
): Promise<Map<string, ItemSnapshotRow>> {
  const uniqueCodes = [...new Set(itemcodes.map((itemcode) => itemcode.trim()))];
  if (uniqueCodes.length === 0) {
    return new Map<string, { itemcode: string; itemname: string; quantity: number }>();
  }

  const request = executor.request();
  const placeholders = uniqueCodes.map((itemcode, index) => {
    const key = `itemcode${index}`;
    request.input(key, sql.NVarChar, itemcode);
    return `@${key}`;
  });

  const lockHint = lockRows ? 'WITH (UPDLOCK, ROWLOCK)' : '';
  const result = await request.query(`
    SELECT
      itemcode,
      itemname,
      end_qty,
      END_QTY_TEMP,
      ASSEMBLY_QTY
    FROM items ${lockHint}
    WHERE itemcode IN (${placeholders.join(', ')})
    ORDER BY itemcode ASC
  `);

  return new Map(
    (result.recordset as Array<Record<string, unknown>>).map((row) => {
      const itemcode = cleanString(row.itemcode);
      let quantity: number;
      try {
        quantity = parseRequiredQuantity(row.end_qty, itemcode);
      } catch (error) {
        onInvalidQuantity?.(itemcode, row.end_qty);
        throw error;
      }

      return [
        itemcode,
        {
          itemcode,
          itemname: cleanString(row.itemname),
          quantity,
        },
      ];
    })
  );
}

function validateLines(lines: AdjustmentLineInput[]) {
  if (lines.length === 0) {
    throw badRequest('At least one adjustment line is required');
  }

  if (lines.length > MAX_QA_LINES) {
    throw badRequest(MAX_QA_LINES_MESSAGE);
  }

  const uniqueCount = new Set(lines.map((line) => line.itemcode.trim())).size;
  if (uniqueCount !== lines.length) {
    throw badRequest('Duplicate item codes are not allowed in a single adjustment');
  }
}

function assertCanRequestCancellation(actor: AuthenticatedUser) {
  if (!['Admin', 'Supervisor', 'Encoder'].includes(actor.role)) {
    throw forbidden('Only Admin, Supervisor, or Encoder can request cancellation');
  }
}

function assertCanFinalizeCancellation(actor: AuthenticatedUser) {
  if (!['Admin', 'Supervisor'].includes(actor.role)) {
    throw forbidden('Only Supervisor or Admin can finalize cancellation');
  }
}

function normalizeCancellationReason(reason: string) {
  const trimmed = cleanString(reason);
  if (!trimmed) {
    throw badRequest('Cancellation reason is required');
  }

  return trimmed;
}

async function replaceDetails(
  transaction: Transaction,
  qaId: number,
  lines: AdjustmentLineInput[]
) {
  validateLines(lines);

  const itemRows = await getItemRowsByCodes(transaction, lines.map((line) => line.itemcode));

  if (itemRows.size !== lines.length) {
    const missing = lines
      .filter((line) => !itemRows.has(line.itemcode))
      .map((line) => line.itemcode);

    throw unprocessable(invalidStockMessage(missing[0] ?? 'unknown'), { missing });
  }

  await transaction
    .request()
    .input('qaId', sql.BigInt, qaId)
    .query(`
      DELETE FROM [${env.UTILITY_SCHEMA}].[qa_detail]
      WHERE qa_id = @qaId
    `);

  for (const [index, line] of lines.entries()) {
    const item = itemRows.get(line.itemcode) as ItemSnapshotRow | undefined;
    if (!item) {
      throw unprocessable(invalidStockMessage(line.itemcode));
    }

    let adjustQty: number;
    let newQty: number;

    if (line.entryMode === 'SET') {
      newQty = line.requestedQty;
      adjustQty = newQty - item.quantity;
      if (!Number.isFinite(newQty) || newQty < 0) {
        throw badRequest(`Invalid target quantity for item ${line.itemcode}`);
      }
    } else {
      adjustQty = line.requestedQty;
      newQty = item.quantity + adjustQty;
      if (adjustQty === 0) {
        throw badRequest(`Adjustment quantity cannot be zero for item ${line.itemcode}`);
      }
    }

    await transaction
      .request()
      .input('qaId', sql.BigInt, qaId)
      .input('lineIndex', sql.Int, index + 1)
      .input('itemcode', sql.NVarChar, item.itemcode)
      .input('itemname', sql.NVarChar, item.itemname)
      .input('oldQty', sql.Decimal(18, 2), item.quantity)
      .input('adjustQty', sql.Decimal(18, 2), adjustQty)
      .input('newQty', sql.Decimal(18, 2), newQty)
      .input('entryMode', sql.NVarChar, line.entryMode)
      .input('requestedQty', sql.Decimal(18, 2), line.requestedQty)
      .input('itemRemark', sql.NVarChar, line.itemRemark?.trim() || null)
      .query(`
        INSERT INTO [${env.UTILITY_SCHEMA}].[qa_detail] (
          qa_id,
          line_no,
          itemcode,
          itemname,
          old_qty,
          adjust_qty,
          new_qty,
          entry_mode,
          requested_qty,
          item_remark
        )
        VALUES (
          @qaId,
          @lineIndex,
          @itemcode,
          @itemname,
          @oldQty,
          @adjustQty,
          @newQty,
          @entryMode,
          @requestedQty,
          @itemRemark
        )
      `);
  }
}

export async function createQuantityAdjustment(
  input: { refType: ReferenceType; lines: AdjustmentLineInput[] },
  actor: AuthenticatedUser
) {
  return withTransaction(async (transaction) => {
    const qaNumber = await generateNextQaNumberInTransaction(transaction);
    const refNumber = await allocateNextNumber(transaction, input.refType);
    const now = new Date();

    const insertHeaderResult = await transaction
      .request()
      .input('qaNo', sql.NVarChar, qaNumber.value)
      .input('transDate', sql.DateTime2, now)
      .input('refType', sql.NVarChar, input.refType)
      .input('refNo', sql.NVarChar, refNumber.value)
      .input('refSeriesNo', sql.BigInt, refNumber.sequence)
      .input('createdBy', sql.BigInt, actor.id)
      .input('createdByUsername', sql.NVarChar, actor.username)
      .query(`
        INSERT INTO [${env.UTILITY_SCHEMA}].[qa_header] (
          qa_no,
          trans_date,
          ref_type,
          ref_no,
          ref_series_no,
          status,
          created_by,
          created_by_username,
          updated_by,
          updated_by_username
        )
        OUTPUT inserted.qa_id AS qaId
        VALUES (
          @qaNo,
          @transDate,
          @refType,
          @refNo,
          @refSeriesNo,
          'SAVED',
          @createdBy,
          @createdByUsername,
          @createdBy,
          @createdByUsername
        )
      `);

    const qaId = Number(insertHeaderResult.recordset[0].qaId);
    await replaceDetails(transaction, qaId, input.lines);

    await recordAuditEvent(transaction, {
      eventType: 'ADJUSTMENT_SAVED',
      entityType: 'QA_HEADER',
      entityId: qaId,
      actorUserId: actor.id,
      actorUsername: actor.username,
      details: {
        qaNo: qaNumber.value,
        refType: input.refType,
        refNo: refNumber.value,
        lineCount: input.lines.length,
      },
    });

    return getQuantityAdjustmentById(String(qaId), transaction);
  }, sql.ISOLATION_LEVEL.SERIALIZABLE);
}

export async function updateQuantityAdjustment(
  qaId: number,
  input: { lines: AdjustmentLineInput[] },
  actor: AuthenticatedUser
) {
  return withTransaction(async (transaction) => {
    const header = await getHeaderById(transaction, qaId, true);
    if (!header) {
      throw notFound('Quantity adjustment not found');
    }

    if (header.status !== 'SAVED') {
      throw conflict('Only saved quantity adjustments can be edited');
    }

    const before = await getDetailsByQaId(transaction, qaId);

    await transaction
      .request()
      .input('qaId', sql.BigInt, qaId)
      .input('updatedBy', sql.BigInt, actor.id)
      .input('updatedByUsername', sql.NVarChar, actor.username)
      .query(`
        UPDATE [${env.UTILITY_SCHEMA}].[qa_header]
        SET
          updated_by = @updatedBy,
          updated_by_username = @updatedByUsername,
          updated_at = SYSUTCDATETIME()
        WHERE qa_id = @qaId
      `);

    await replaceDetails(transaction, qaId, input.lines);

    const after = await getDetailsByQaId(transaction, qaId);
    await recordAuditEvent(transaction, {
      eventType: 'ADJUSTMENT_UPDATED',
      entityType: 'QA_HEADER',
      entityId: qaId,
      actorUserId: actor.id,
      actorUsername: actor.username,
      details: {
        before,
        after,
      },
    });

    return getQuantityAdjustmentById(String(qaId), transaction);
  }, sql.ISOLATION_LEVEL.SERIALIZABLE);
}

export async function postQuantityAdjustment(qaId: number, actor: AuthenticatedUser) {
  let blockedPostAudit: BlockedPostAudit | null = null;

  try {
    return await withTransaction(async (transaction) => {
      const header = await getHeaderById(transaction, qaId, true);
      if (!header) {
        throw notFound('Quantity adjustment not found');
      }

      if (header.status === 'PENDING_CANCELLATION') {
        return finalizeQuantityAdjustmentCancellation(transaction, header, actor);
      }

      if (header.status === 'POSTED') {
        throw conflict('Quantity adjustment is already posted');
      }

      if (header.status === 'CANCELLED') {
        throw conflict('Cancelled quantity adjustments cannot be posted');
      }

      if (header.status !== 'SAVED') {
        throw conflict('Only saved quantity adjustments can be posted');
      }

      const details = (await getDetailsByQaId(transaction, qaId)) as AdjustmentDetail[];
      if (details.length === 0) {
        throw unprocessable('Cannot post an empty quantity adjustment');
      }

      if (details.length > MAX_QA_LINES) {
        throw badRequest(MAX_QA_LINES_MESSAGE);
      }

      const invalidItems: BlockedPostAudit['details']['items'] = [];
      let itemRows: Map<string, ItemSnapshotRow>;
      try {
        itemRows = await getItemRowsByCodes(
          transaction,
          details.map((detail: AdjustmentDetail) => detail.itemcode),
          true,
          (itemcode) => {
            const savedDetail = details.find((detail) => detail.itemcode === itemcode);
            invalidItems.push({
              itemcode,
              savedQty: savedDetail?.oldQty ?? null,
              liveQty: null,
              reason: invalidStockMessage(itemcode),
            });
          }
        );
      } catch (error) {
        if (invalidItems.length > 0) {
          blockedPostAudit = buildBlockedPostAudit({
            eventType: 'QA_POST_BLOCKED_INVALID_STOCK',
            header,
            actor,
            reason: 'Invalid live stock quantity',
            items: invalidItems,
          });
        }
        throw error;
      }

      const missingItems = details
        .filter((detail) => !itemRows.has(detail.itemcode))
        .map((detail) => ({
          itemcode: detail.itemcode,
          savedQty: detail.oldQty,
          liveQty: null,
          reason: invalidStockMessage(detail.itemcode),
        }));

      if (missingItems.length > 0) {
        blockedPostAudit = buildBlockedPostAudit({
          eventType: 'QA_POST_BLOCKED_INVALID_STOCK',
          header,
          actor,
          reason: 'Missing item in POS database',
          items: missingItems,
        });
        throw unprocessable(invalidStockMessage(missingItems[0].itemcode), {
          missing: missingItems.map((item) => item.itemcode),
        });
      }

      const staleItems: StaleStockConflictItem[] = [];
      for (const detail of details) {
        const currentItem = itemRows.get(detail.itemcode) as ItemSnapshotRow;
        const savedQty = roundQuantity(detail.oldQty);
        const liveQty = roundQuantity(currentItem.quantity);

        if (!quantitiesMatch(savedQty, liveQty)) {
          staleItems.push({
            itemcode: detail.itemcode,
            savedQty,
            liveQty,
            difference: roundQuantity(liveQty - savedQty),
          });
        }
      }

      if (staleItems.length > 0) {
        blockedPostAudit = buildBlockedPostAudit({
          eventType: 'QA_POST_BLOCKED_STALE_STOCK',
          header,
          actor,
          reason: STALE_STOCK_MESSAGE,
          items: staleItems,
        });
        throw conflict(STALE_STOCK_MESSAGE, { items: staleItems });
      }

      const qaNumber = isDraftQaNumber(header.qaNo)
        ? await generateNextQaNumberInTransaction(transaction)
        : { value: header.qaNo };

      let inventoryRowsInserted = 0;

      for (const detail of details) {
        const currentItem = itemRows.get(detail.itemcode) as ItemSnapshotRow;
        const currentQty = currentItem.quantity;
        const newQty =
          detail.entryMode === 'SET'
            ? detail.requestedQty
            : currentQty + detail.adjustQty;
        const legacyUserId = (actor.legacyUserId ?? actor.username).slice(0, 10);
        const legacyRefNo = `${header.refType}-${header.refNo}`.slice(0, 10);
        const visibleQaNo = cleanString(qaNumber.value);
        const legacyBatchNo = visibleQaNo.slice(-10);

        await transaction
          .request()
          .input('detailId', sql.BigInt, Number(detail.id))
          .input('postedOldQty', sql.Decimal(18, 2), currentQty)
          .input('postedNewQty', sql.Decimal(18, 2), newQty)
          .query(`
            UPDATE [${env.UTILITY_SCHEMA}].[qa_detail]
            SET
              posted_old_qty = @postedOldQty,
              posted_new_qty = @postedNewQty,
              new_qty = @postedNewQty,
              updated_at = SYSUTCDATETIME()
            WHERE detail_id = @detailId
          `);

        await transaction
          .request()
          .input('itemcode', sql.NVarChar, detail.itemcode)
          .input('newQty', sql.Decimal(18, 2), newQty)
          .input('adjustQty', sql.Decimal(18, 2), detail.adjustQty)
          .input('modifiedBy', sql.NVarChar, actor.username.slice(0, 12))
          .query(`
            UPDATE items
            SET
              end_qty = @newQty,
              END_QTY_TEMP = @newQty,
              ASSEMBLY_QTY = @newQty,
              adjustment = ISNULL(adjustment, 0) + @adjustQty,
              modified_by = @modifiedBy,
              date_modified = GETDATE()
            WHERE itemcode = @itemcode
          `);

        await transaction
          .request()
          .input('transDate', sql.DateTime, header.transDate)
          .input('qty', sql.Decimal(18, 2), detail.adjustQty)
          .input('userid', sql.Char(10), legacyUserId)
          .input('posted', sql.Numeric(18, 0), 1)
          .input('remarks', sql.NVarChar, detail.itemRemark?.slice(0, 50) ?? null)
          .input('endQty', sql.Decimal(18, 2), newQty)
          .input('balance', sql.Decimal(18, 2), currentQty)
          .input('newQty', sql.Decimal(18, 2), newQty)
          .input('itemname', sql.NVarChar, detail.itemname)
          .input('machineId', sql.NVarChar, 'UTILITY')
          .input('sync', sql.TinyInt, 0)
          .input('batchNo', sql.NVarChar, legacyBatchNo)
          .input('refNo', sql.Char(10), legacyRefNo)
          .input('itemcode', sql.NVarChar, detail.itemcode)
          .query(`
            INSERT INTO inventory_adjustment (
              trans_date,
              qty,
              userid,
              posted,
              remarks,
              end_qty,
              balance,
              new_qty,
              itemname,
              machine_id,
              sync,
              BATCH_NO,
              ref_no,
              itemcode
            )
            VALUES (
              @transDate,
              @qty,
              @userid,
              @posted,
              @remarks,
              @endQty,
              @balance,
              @newQty,
              @itemname,
              @machineId,
              @sync,
              @batchNo,
              @refNo,
              @itemcode
            )
          `);

        inventoryRowsInserted += 1;
      }

      await transaction
        .request()
        .input('qaId', sql.BigInt, qaId)
        .input('qaNo', sql.NVarChar, cleanString(qaNumber.value))
        .input('postedBy', sql.BigInt, actor.id)
        .input('postedByUsername', sql.NVarChar, actor.username)
        .query(`
          UPDATE [${env.UTILITY_SCHEMA}].[qa_header]
          SET
            qa_no = @qaNo,
            status = 'POSTED',
            posted_by = @postedBy,
            posted_by_username = @postedByUsername,
            posted_at = SYSUTCDATETIME(),
            updated_by = @postedBy,
            updated_by_username = @postedByUsername,
            updated_at = SYSUTCDATETIME()
          WHERE qa_id = @qaId
        `);

      await transaction
        .request()
        .input('qaId', sql.BigInt, qaId)
        .input('postedBy', sql.BigInt, actor.id)
        .input('inventoryRowsInserted', sql.Int, inventoryRowsInserted)
        .query(`
          INSERT INTO [${env.UTILITY_SCHEMA}].[qa_posting_log] (
            qa_id,
            inventory_rows_inserted,
            posted_by
          )
          VALUES (@qaId, @inventoryRowsInserted, @postedBy)
        `);

      await recordAuditEvent(transaction, {
        eventType: 'ADJUSTMENT_POSTED',
        entityType: 'QA_HEADER',
        entityId: qaId,
        actorUserId: actor.id,
        actorUsername: actor.username,
        details: {
          lineCount: details.length,
          qaNo: cleanString(qaNumber.value),
        },
      });

      return getQuantityAdjustmentById(String(qaId), transaction);
    }, sql.ISOLATION_LEVEL.SERIALIZABLE);
  } catch (error) {
    if (blockedPostAudit) {
      await recordBlockedPostAudit(blockedPostAudit).catch((auditError: unknown) => {
        console.error('Failed to record blocked QA post audit event:', auditError);
      });
    }
    throw error;
  }
}

async function finalizeQuantityAdjustmentCancellation(
  transaction: Transaction,
  header: HeaderRow,
  actor: AuthenticatedUser
) {
  assertCanFinalizeCancellation(actor);

  const updateResult = await transaction
    .request()
    .input('qaId', sql.BigInt, header.qaId)
    .input('cancelledBy', sql.BigInt, actor.id)
    .input('cancelledByUsername', sql.NVarChar, actor.username)
    .query(`
      UPDATE [${env.UTILITY_SCHEMA}].[qa_header]
      SET
        status = N'CANCELLED',
        cancelled_by = @cancelledBy,
        cancelled_by_username = @cancelledByUsername,
        cancelled_at = SYSUTCDATETIME(),
        updated_by = @cancelledBy,
        updated_by_username = @cancelledByUsername,
        updated_at = SYSUTCDATETIME()
      OUTPUT inserted.cancelled_at AS cancelledAt
      WHERE qa_id = @qaId
        AND status = N'PENDING_CANCELLATION'
    `);

  if (updateResult.rowsAffected[0] !== 1) {
    throw conflict('Quantity adjustment is no longer pending cancellation');
  }

  await transaction
    .request()
    .input('qaId', sql.BigInt, header.qaId)
    .input('cancelledBy', sql.BigInt, actor.id)
    .input('notes', sql.NVarChar, 'Cancellation finalized')
    .query(`
      IF NOT EXISTS (
        SELECT 1
        FROM [${env.UTILITY_SCHEMA}].[qa_posting_log]
        WHERE qa_id = @qaId
      )
      BEGIN
        INSERT INTO [${env.UTILITY_SCHEMA}].[qa_posting_log] (
          qa_id,
          inventory_rows_inserted,
          posted_by,
          notes
        )
        VALUES (@qaId, 0, @cancelledBy, @notes);
      END
    `);

  const cancelledAt = updateResult.recordset[0]?.cancelledAt as Date | undefined;

  await recordAuditEvent(transaction, {
    eventType: 'ADJUSTMENT_CANCELLATION_POSTED',
    entityType: 'QA_HEADER',
    entityId: header.qaId,
    actorUserId: actor.id,
    actorUsername: actor.username,
    details: {
      qaNo: cleanString(header.qaNo),
      user: actor.username,
      timestamp: toIsoString(cancelledAt) ?? new Date().toISOString(),
      reason: cleanString(header.cancellationReason),
      oldStatus: header.status,
      newStatus: 'CANCELLED',
    },
  });

  return getQuantityAdjustmentById(String(header.qaId), transaction);
}

export async function requestQuantityAdjustmentCancellation(
  qaId: number,
  reason: string,
  actor: AuthenticatedUser
) {
  assertCanRequestCancellation(actor);
  const trimmedReason = normalizeCancellationReason(reason);

  return withTransaction(async (transaction) => {
    const header = await getHeaderById(transaction, qaId, true);
    if (!header) {
      throw notFound('Quantity adjustment not found');
    }

    if (header.status === 'PENDING_CANCELLATION') {
      throw conflict('Quantity adjustment is already pending cancellation');
    }

    if (header.status === 'CANCELLED') {
      throw conflict('Cancelled quantity adjustments cannot be cancelled again');
    }

    if (header.status !== 'SAVED') {
      throw conflict('Only saved quantity adjustments can be requested for cancellation');
    }

    const updateResult = await transaction
      .request()
      .input('qaId', sql.BigInt, qaId)
      .input('reason', sql.NVarChar(sql.MAX), trimmedReason)
      .input('requestedBy', sql.BigInt, actor.id)
      .input('requestedByUsername', sql.NVarChar, actor.username)
      .query(`
        UPDATE [${env.UTILITY_SCHEMA}].[qa_header]
        SET
          status = N'PENDING_CANCELLATION',
          cancellation_reason = @reason,
          cancellation_requested_by = @requestedBy,
          cancellation_requested_by_username = @requestedByUsername,
          cancellation_requested_at = SYSUTCDATETIME(),
          updated_by = @requestedBy,
          updated_by_username = @requestedByUsername,
          updated_at = SYSUTCDATETIME()
        OUTPUT inserted.cancellation_requested_at AS cancellationRequestedAt
        WHERE qa_id = @qaId
          AND status = N'SAVED'
      `);

    if (updateResult.rowsAffected[0] !== 1) {
      throw conflict('Quantity adjustment is no longer saved');
    }

    const requestedAt = updateResult.recordset[0]?.cancellationRequestedAt as Date | undefined;

    await recordAuditEvent(transaction, {
      eventType: 'ADJUSTMENT_CANCELLATION_REQUESTED',
      entityType: 'QA_HEADER',
      entityId: qaId,
      actorUserId: actor.id,
      actorUsername: actor.username,
      details: {
        qaNo: cleanString(header.qaNo),
        user: actor.username,
        timestamp: toIsoString(requestedAt) ?? new Date().toISOString(),
        reason: trimmedReason,
        oldStatus: header.status,
        newStatus: 'PENDING_CANCELLATION',
      },
    });

    return getQuantityAdjustmentById(String(qaId), transaction);
  }, sql.ISOLATION_LEVEL.SERIALIZABLE);
}

export async function getQuantityAdjustmentById(
  qaId: string,
  executor?: ConnectionPool | Transaction
) {
  const parsedId = Number(qaId);
  if (!executor) {
    await repairDraftQaNumberById(parsedId);
  }
  const connection = executor ?? (await getSqlPool());
  const header = await getHeaderById(connection, parsedId);
  if (!header) {
    throw notFound('Quantity adjustment not found');
  }

  const details = await getDetailsByQaId(connection, parsedId);
  return {
    ...mapHeader(header),
    lines: details,
  };
}

export async function listQuantityAdjustments(query: {
  page: number;
  limit: number;
  search?: string;
  status?: AdjustmentStatus;
}): Promise<PaginatedResult<object>> {
  await repairDraftQaNumbers();

  const page = Math.max(1, query.page);
  const limit = Math.min(100, Math.max(1, query.limit));
  const offset = (page - 1) * limit;
  const search = cleanString(query.search);
  const pool = await getSqlPool();
  const result = await pool
    .request()
    .input('offset', sql.Int, offset)
    .input('limit', sql.Int, limit)
    .input('search', sql.NVarChar, search ? `%${search}%` : null)
    .input('status', sql.NVarChar, query.status ?? null)
    .query(`
      SELECT
        h.qa_id AS qaId,
        h.qa_no AS qaNo,
        h.trans_date AS transDate,
        h.ref_type AS refType,
        h.ref_no AS refNo,
        h.status,
        h.created_by_username AS createdBy,
        h.created_at AS createdAt,
        h.posted_at AS postedAt,
        COUNT(d.detail_id) AS lineCount,
        COUNT(*) OVER() AS totalRows
      FROM [${env.UTILITY_SCHEMA}].[qa_header] h
      LEFT JOIN [${env.UTILITY_SCHEMA}].[qa_detail] d
        ON d.qa_id = h.qa_id
      WHERE
        (@status IS NULL OR h.status = @status)
        AND (
          @search IS NULL
          OR h.qa_no LIKE @search
          OR h.ref_no LIKE @search
          OR EXISTS (
            SELECT 1
            FROM [${env.UTILITY_SCHEMA}].[qa_detail] sd
            WHERE sd.qa_id = h.qa_id
              AND (sd.itemcode LIKE @search OR sd.itemname LIKE @search)
          )
        )
      GROUP BY
        h.qa_id,
        h.qa_no,
        h.trans_date,
        h.ref_type,
        h.ref_no,
        h.status,
        h.created_by_username,
        h.created_at,
        h.posted_at
      ORDER BY h.created_at DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

  const rows = result.recordset as Array<Record<string, unknown> & { totalRows?: number }>;
  const total = Number(rows[0]?.totalRows ?? 0);

  return {
    data: rows.map((row: Record<string, unknown>) => ({
      id: String(row.qaId),
      qaNo: cleanString(row.qaNo),
      transDate: toIsoString(row.transDate),
      refType: cleanString(row.refType),
      refNo: cleanString(row.refNo),
      status: cleanString(row.status),
      createdBy: cleanString(row.createdBy),
      createdAt: toIsoString(row.createdAt),
      postedAt: toIsoString(row.postedAt),
      lineCount: Number(row.lineCount ?? 0),
    })),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export async function markQuantityAdjustmentPrinted(qaId: number, actor: AuthenticatedUser) {
  await withTransaction(async (transaction) => {
    const header = await getHeaderById(transaction, qaId, true);
    if (!header) {
      throw notFound('Quantity adjustment not found');
    }

    if (header.status !== 'POSTED') {
      throw conflict('Only posted quantity adjustments can be printed');
    }

    await transaction
      .request()
      .input('qaId', sql.BigInt, qaId)
      .query(`
        UPDATE [${env.UTILITY_SCHEMA}].[qa_header]
        SET
          print_count = print_count + 1,
          last_printed_at = SYSUTCDATETIME(),
          updated_at = SYSUTCDATETIME()
        WHERE qa_id = @qaId
      `);

    await transaction
      .request()
      .input('qaId', sql.BigInt, qaId)
      .input('printedBy', sql.BigInt, actor.id)
      .query(`
        INSERT INTO [${env.UTILITY_SCHEMA}].[qa_print_log] (
          qa_id,
          printed_by
        )
        VALUES (@qaId, @printedBy)
      `);

    await recordAuditEvent(transaction, {
      eventType: 'ADJUSTMENT_PRINTED',
      entityType: 'QA_HEADER',
      entityId: qaId,
      actorUserId: actor.id,
      actorUsername: actor.username,
      details: {
        qaNo: header.qaNo,
      },
    });
  });
}

export async function getQuantityAdjustmentMeta() {
  const previews = await getNumberingPreview();

  return {
    serverDate: new Date().toISOString(),
    nextQaNo: previews.QA,
    nextRefNumbers: {
      DM: previews.DM,
      CM: previews.CM,
    },
  };
}
