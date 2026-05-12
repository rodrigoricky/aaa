"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createQuantityAdjustment = createQuantityAdjustment;
exports.updateQuantityAdjustment = updateQuantityAdjustment;
exports.postQuantityAdjustment = postQuantityAdjustment;
exports.requestQuantityAdjustmentCancellation = requestQuantityAdjustmentCancellation;
exports.getQuantityAdjustmentById = getQuantityAdjustmentById;
exports.listQuantityAdjustments = listQuantityAdjustments;
exports.markQuantityAdjustmentPrinted = markQuantityAdjustmentPrinted;
exports.getQuantityAdjustmentMeta = getQuantityAdjustmentMeta;
const env_js_1 = require("../../config/env.js");
const sql_server_js_1 = require("../../shared/database/sql-server.js");
const http_errors_js_1 = require("../../shared/errors/http-errors.js");
const value_js_1 = require("../../shared/utils/value.js");
const audit_js_1 = require("../../utils/audit.js");
const numbering_service_js_1 = require("../numbering/numbering.service.js");
const inventory_adjustment_calculator_js_1 = require("./inventory-adjustment-calculator.js");
const inventory_adjustment_service_js_1 = require("./inventory-adjustment.service.js");
const MAX_QA_LINES = 8;
const MAX_QA_LINES_MESSAGE = 'Maximum of 8 items per Quantity Adjustment.';
const STALE_STOCK_MESSAGE = 'Stock changed after this adjustment was saved. Please reload and review before posting.';
function isDraftQaNumber(value) {
    return (0, value_js_1.cleanString)(value).startsWith('DRAFT-');
}
function invalidStockMessage(itemcode) {
    return `Item ${itemcode} has no valid current quantity in POS database. Please verify stock before saving/posting.`;
}
function roundQuantity(value) {
    return Number(value.toFixed(2));
}
function quantitiesMatch(left, right) {
    return Math.abs(left - right) < 0.005;
}
function buildBlockedPostAudit(input) {
    const firstItem = input.items[0];
    return {
        eventType: input.eventType,
        qaId: input.header.qaId,
        qaNo: (0, value_js_1.cleanString)(input.header.qaNo),
        actor: input.actor,
        details: {
            qaNo: (0, value_js_1.cleanString)(input.header.qaNo),
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
async function recordBlockedPostAudit(input) {
    const pool = await (0, sql_server_js_1.getSqlPool)();
    await (0, audit_js_1.recordAuditEvent)(pool, {
        eventType: input.eventType,
        entityType: 'QA_HEADER',
        entityId: input.qaId,
        actorUserId: input.actor.id,
        actorUsername: input.actor.username,
        details: input.details,
    });
}
function mapHeader(row) {
    return {
        id: String(row.qaId),
        qaNo: (0, value_js_1.cleanString)(row.qaNo),
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
        postedAt: (0, value_js_1.toIsoString)(row.postedAt),
        cancellationReason: (0, value_js_1.cleanString)(row.cancellationReason) || null,
        cancellationRequestedBy: row.cancellationRequestedByUsername,
        cancellationRequestedAt: (0, value_js_1.toIsoString)(row.cancellationRequestedAt),
        cancelledBy: row.cancelledByUsername,
        cancelledAt: (0, value_js_1.toIsoString)(row.cancelledAt),
        printCount: row.printCount,
        lastPrintedAt: (0, value_js_1.toIsoString)(row.lastPrintedAt),
    };
}
async function getHeaderById(executor, qaId, lock = false) {
    const request = executor.request();
    request.input('qaId', sql_server_js_1.sql.BigInt, qaId);
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
    FROM [${env_js_1.env.UTILITY_SCHEMA}].[qa_header] ${lockHint}
    WHERE qa_id = @qaId
  `);
    return result.recordset[0] ?? null;
}
async function repairDraftQaNumberById(qaId) {
    return (0, sql_server_js_1.withTransaction)(async (transaction) => {
        const header = await getHeaderById(transaction, qaId, true);
        if (!header) {
            return null;
        }
        const currentQaNo = (0, value_js_1.cleanString)(header.qaNo);
        if (currentQaNo && !isDraftQaNumber(currentQaNo)) {
            return currentQaNo;
        }
        const qaNumber = await (0, numbering_service_js_1.generateNextQaNumberInTransaction)(transaction);
        await transaction
            .request()
            .input('qaId', sql_server_js_1.sql.BigInt, qaId)
            .input('qaNo', sql_server_js_1.sql.NVarChar, qaNumber.value)
            .query(`
        UPDATE [${env_js_1.env.UTILITY_SCHEMA}].[qa_header]
        SET
          qa_no = @qaNo,
          updated_at = SYSUTCDATETIME()
        WHERE qa_id = @qaId
      `);
        return qaNumber.value;
    }, sql_server_js_1.sql.ISOLATION_LEVEL.SERIALIZABLE);
}
async function repairDraftQaNumbers() {
    await (0, sql_server_js_1.withTransaction)(async (transaction) => {
        const result = await transaction.request().query(`
      SELECT qa_id AS qaId
      FROM [${env_js_1.env.UTILITY_SCHEMA}].[qa_header] WITH (UPDLOCK, HOLDLOCK)
      WHERE qa_no IS NULL
         OR LTRIM(RTRIM(qa_no)) = N''
         OR qa_no LIKE N'DRAFT-%'
      ORDER BY created_at ASC, qa_id ASC
    `);
        for (const row of result.recordset) {
            const qaNumber = await (0, numbering_service_js_1.generateNextQaNumberInTransaction)(transaction);
            await transaction
                .request()
                .input('qaId', sql_server_js_1.sql.BigInt, row.qaId)
                .input('qaNo', sql_server_js_1.sql.NVarChar, qaNumber.value)
                .query(`
          UPDATE [${env_js_1.env.UTILITY_SCHEMA}].[qa_header]
          SET
            qa_no = @qaNo,
            updated_at = SYSUTCDATETIME()
          WHERE qa_id = @qaId
        `);
        }
    }, sql_server_js_1.sql.ISOLATION_LEVEL.SERIALIZABLE);
}
async function getDetailsByQaId(executor, qaId) {
    const result = await executor
        .request()
        .input('qaId', sql_server_js_1.sql.BigInt, qaId)
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
      FROM [${env_js_1.env.UTILITY_SCHEMA}].[qa_detail]
      WHERE qa_id = @qaId
      ORDER BY line_no ASC
    `);
    return result.recordset.map((row) => {
        const mode = row.entryMode === 'SET' ? 'SET' : 'DELTA';
        const adjustQty = (0, value_js_1.toNumber)(row.adjustQty);
        const requestedQty = row.requestedQty != null ? (0, value_js_1.toNumber)(row.requestedQty) : adjustQty;
        return {
            id: String(row.detailId),
            lineNo: Number(row.lineNo),
            itemcode: (0, value_js_1.cleanString)(row.itemcode),
            itemname: (0, value_js_1.cleanString)(row.itemname),
            oldQty: (0, value_js_1.toNumber)(row.oldQty),
            adjustQty,
            newQty: (0, value_js_1.toNumber)(row.newQty),
            postedOldQty: row.postedOldQty != null ? (0, value_js_1.toNumber)(row.postedOldQty) : null,
            postedNewQty: row.postedNewQty != null ? (0, value_js_1.toNumber)(row.postedNewQty) : null,
            entryMode: mode,
            requestedQty,
            itemRemark: (0, value_js_1.cleanString)(row.itemRemark) || null,
            updatedAt: (0, value_js_1.toIsoString)(row.updatedAt),
        };
    });
}
async function getItemRowsByCodes(executor, itemcodes, lockRows = false, onInvalidQuantity) {
    const uniqueCodes = [...new Set(itemcodes.map((itemcode) => itemcode.trim()))];
    if (uniqueCodes.length === 0) {
        return new Map();
    }
    const request = executor.request();
    const placeholders = uniqueCodes.map((itemcode, index) => {
        const key = `itemcode${index}`;
        request.input(key, sql_server_js_1.sql.NVarChar, itemcode);
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
    return new Map(result.recordset.map((row) => {
        const itemcode = (0, value_js_1.cleanString)(row.itemcode);
        let quantity;
        try {
            quantity = (0, value_js_1.parseRequiredQuantity)(row.end_qty, itemcode);
        }
        catch (error) {
            onInvalidQuantity?.(itemcode, row.end_qty);
            throw error;
        }
        return [
            itemcode,
            {
                itemcode,
                itemname: (0, value_js_1.cleanString)(row.itemname),
                quantity,
            },
        ];
    }));
}
function validateLines(lines) {
    if (lines.length === 0) {
        throw (0, http_errors_js_1.badRequest)('At least one adjustment line is required');
    }
    if (lines.length > MAX_QA_LINES) {
        throw (0, http_errors_js_1.badRequest)(MAX_QA_LINES_MESSAGE);
    }
    const uniqueCount = new Set(lines.map((line) => line.itemcode.trim())).size;
    if (uniqueCount !== lines.length) {
        throw (0, http_errors_js_1.badRequest)('Duplicate item codes are not allowed in a single adjustment');
    }
}
function assertCanRequestCancellation(actor) {
    if (!['Admin', 'Supervisor', 'Encoder'].includes(actor.role)) {
        throw (0, http_errors_js_1.forbidden)('Only Admin, Supervisor, or Encoder can request cancellation');
    }
}
function assertCanFinalizeCancellation(actor) {
    if (!['Admin', 'Supervisor'].includes(actor.role)) {
        throw (0, http_errors_js_1.forbidden)('Only Supervisor or Admin can finalize cancellation');
    }
}
function normalizeCancellationReason(reason) {
    const trimmed = (0, value_js_1.cleanString)(reason);
    if (!trimmed) {
        throw (0, http_errors_js_1.badRequest)('Cancellation reason is required');
    }
    return trimmed;
}
async function replaceDetails(transaction, qaId, lines) {
    validateLines(lines);
    const itemRows = await getItemRowsByCodes(transaction, lines.map((line) => line.itemcode));
    if (itemRows.size !== lines.length) {
        const missing = lines
            .filter((line) => !itemRows.has(line.itemcode))
            .map((line) => line.itemcode);
        throw (0, http_errors_js_1.unprocessable)(invalidStockMessage(missing[0] ?? 'unknown'), { missing });
    }
    await transaction
        .request()
        .input('qaId', sql_server_js_1.sql.BigInt, qaId)
        .query(`
      DELETE FROM [${env_js_1.env.UTILITY_SCHEMA}].[qa_detail]
      WHERE qa_id = @qaId
    `);
    for (const [index, line] of lines.entries()) {
        const item = itemRows.get(line.itemcode);
        if (!item) {
            throw (0, http_errors_js_1.unprocessable)(invalidStockMessage(line.itemcode));
        }
        let adjustQty;
        let newQty;
        if (line.entryMode === 'SET') {
            newQty = line.requestedQty;
            adjustQty = newQty - item.quantity;
            if (!Number.isFinite(newQty) || newQty < 0) {
                throw (0, http_errors_js_1.badRequest)(`Invalid target quantity for item ${line.itemcode}`);
            }
            const calculation = (0, inventory_adjustment_calculator_js_1.calculateInventoryAdjustment)(item.quantity, adjustQty, line.itemcode);
            adjustQty = calculation.adjustmentQty;
            newQty = calculation.finalStock;
        }
        else {
            adjustQty = (0, inventory_adjustment_calculator_js_1.normalizeAdjustmentQty)(line.requestedQty, line.itemcode);
            newQty = (0, inventory_adjustment_calculator_js_1.calculateInventoryAdjustment)(item.quantity, adjustQty, line.itemcode).finalStock;
        }
        await transaction
            .request()
            .input('qaId', sql_server_js_1.sql.BigInt, qaId)
            .input('lineIndex', sql_server_js_1.sql.Int, index + 1)
            .input('itemcode', sql_server_js_1.sql.NVarChar, item.itemcode)
            .input('itemname', sql_server_js_1.sql.NVarChar, item.itemname)
            .input('oldQty', sql_server_js_1.sql.Decimal(18, 2), item.quantity)
            .input('adjustQty', sql_server_js_1.sql.Decimal(18, 2), adjustQty)
            .input('newQty', sql_server_js_1.sql.Decimal(18, 2), newQty)
            .input('entryMode', sql_server_js_1.sql.NVarChar, line.entryMode)
            .input('requestedQty', sql_server_js_1.sql.Decimal(18, 2), line.requestedQty)
            .input('itemRemark', sql_server_js_1.sql.NVarChar, line.itemRemark?.trim() || null)
            .query(`
        INSERT INTO [${env_js_1.env.UTILITY_SCHEMA}].[qa_detail] (
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
async function createQuantityAdjustment(input, actor) {
    return (0, sql_server_js_1.withTransaction)(async (transaction) => {
        const qaNumber = await (0, numbering_service_js_1.generateNextQaNumberInTransaction)(transaction);
        const refNumber = await (0, numbering_service_js_1.allocateNextNumber)(transaction, input.refType);
        const now = new Date();
        const insertHeaderResult = await transaction
            .request()
            .input('qaNo', sql_server_js_1.sql.NVarChar, qaNumber.value)
            .input('transDate', sql_server_js_1.sql.DateTime2, now)
            .input('refType', sql_server_js_1.sql.NVarChar, input.refType)
            .input('refNo', sql_server_js_1.sql.NVarChar, refNumber.value)
            .input('refSeriesNo', sql_server_js_1.sql.BigInt, refNumber.sequence)
            .input('createdBy', sql_server_js_1.sql.BigInt, actor.id)
            .input('createdByUsername', sql_server_js_1.sql.NVarChar, actor.username)
            .query(`
        INSERT INTO [${env_js_1.env.UTILITY_SCHEMA}].[qa_header] (
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
        await (0, audit_js_1.recordAuditEvent)(transaction, {
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
    }, sql_server_js_1.sql.ISOLATION_LEVEL.SERIALIZABLE);
}
async function updateQuantityAdjustment(qaId, input, actor) {
    return (0, sql_server_js_1.withTransaction)(async (transaction) => {
        const header = await getHeaderById(transaction, qaId, true);
        if (!header) {
            throw (0, http_errors_js_1.notFound)('Quantity adjustment not found');
        }
        if (header.status !== 'SAVED') {
            throw (0, http_errors_js_1.conflict)('Only saved quantity adjustments can be edited');
        }
        const before = await getDetailsByQaId(transaction, qaId);
        await transaction
            .request()
            .input('qaId', sql_server_js_1.sql.BigInt, qaId)
            .input('updatedBy', sql_server_js_1.sql.BigInt, actor.id)
            .input('updatedByUsername', sql_server_js_1.sql.NVarChar, actor.username)
            .query(`
        UPDATE [${env_js_1.env.UTILITY_SCHEMA}].[qa_header]
        SET
          updated_by = @updatedBy,
          updated_by_username = @updatedByUsername,
          updated_at = SYSUTCDATETIME()
        WHERE qa_id = @qaId
      `);
        await replaceDetails(transaction, qaId, input.lines);
        const after = await getDetailsByQaId(transaction, qaId);
        await (0, audit_js_1.recordAuditEvent)(transaction, {
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
    }, sql_server_js_1.sql.ISOLATION_LEVEL.SERIALIZABLE);
}
async function postQuantityAdjustment(qaId, actor) {
    let blockedPostAudit = null;
    try {
        return await (0, sql_server_js_1.withTransaction)(async (transaction) => {
            const header = await getHeaderById(transaction, qaId, true);
            if (!header) {
                throw (0, http_errors_js_1.notFound)('Quantity adjustment not found');
            }
            if (header.status === 'PENDING_CANCELLATION') {
                return finalizeQuantityAdjustmentCancellation(transaction, header, actor);
            }
            if (header.status === 'POSTED') {
                throw (0, http_errors_js_1.conflict)('Quantity adjustment is already posted');
            }
            if (header.status === 'CANCELLED') {
                throw (0, http_errors_js_1.conflict)('Cancelled quantity adjustments cannot be posted');
            }
            if (header.status !== 'SAVED') {
                throw (0, http_errors_js_1.conflict)('Only saved quantity adjustments can be posted');
            }
            const details = (await getDetailsByQaId(transaction, qaId));
            if (details.length === 0) {
                throw (0, http_errors_js_1.unprocessable)('Cannot post an empty quantity adjustment');
            }
            if (details.length > MAX_QA_LINES) {
                throw (0, http_errors_js_1.badRequest)(MAX_QA_LINES_MESSAGE);
            }
            const invalidItems = [];
            let itemRows;
            try {
                itemRows = await getItemRowsByCodes(transaction, details.map((detail) => detail.itemcode), true, (itemcode) => {
                    const savedDetail = details.find((detail) => detail.itemcode === itemcode);
                    invalidItems.push({
                        itemcode,
                        savedQty: savedDetail?.oldQty ?? null,
                        liveQty: null,
                        reason: invalidStockMessage(itemcode),
                    });
                });
            }
            catch (error) {
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
                throw (0, http_errors_js_1.unprocessable)(invalidStockMessage(missingItems[0].itemcode), {
                    missing: missingItems.map((item) => item.itemcode),
                });
            }
            const staleItems = [];
            for (const detail of details) {
                const currentItem = itemRows.get(detail.itemcode);
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
                throw (0, http_errors_js_1.conflict)(STALE_STOCK_MESSAGE, { items: staleItems });
            }
            const qaNumber = isDraftQaNumber(header.qaNo)
                ? await (0, numbering_service_js_1.generateNextQaNumberInTransaction)(transaction)
                : { value: header.qaNo };
            let inventoryRowsInserted = 0;
            for (const detail of details) {
                const legacyUserId = (actor.legacyUserId ?? actor.username).slice(0, 10);
                const legacyRefNo = `${header.refType}-${header.refNo}`.slice(0, 10);
                const visibleQaNo = (0, value_js_1.cleanString)(qaNumber.value);
                const legacyBatchNo = visibleQaNo.slice(-10);
                const postedAdjustment = await (0, inventory_adjustment_service_js_1.adjustInventory)(transaction, {
                    itemcode: detail.itemcode,
                    itemname: detail.itemname,
                    adjustmentQty: detail.adjustQty,
                    transDate: header.transDate,
                    remarks: detail.itemRemark,
                    legacyUserId,
                    legacyRefNo,
                    legacyBatchNo,
                    modifiedBy: actor.username.slice(0, 12),
                });
                await transaction
                    .request()
                    .input('detailId', sql_server_js_1.sql.BigInt, Number(detail.id))
                    .input('postedOldQty', sql_server_js_1.sql.Decimal(18, 2), postedAdjustment.oldBalance)
                    .input('postedNewQty', sql_server_js_1.sql.Decimal(18, 2), postedAdjustment.finalStock)
                    .query(`
            UPDATE [${env_js_1.env.UTILITY_SCHEMA}].[qa_detail]
            SET
              posted_old_qty = @postedOldQty,
              posted_new_qty = @postedNewQty,
              new_qty = @postedNewQty,
              updated_at = SYSUTCDATETIME()
            WHERE detail_id = @detailId
          `);
                inventoryRowsInserted += 1;
            }
            await transaction
                .request()
                .input('qaId', sql_server_js_1.sql.BigInt, qaId)
                .input('qaNo', sql_server_js_1.sql.NVarChar, (0, value_js_1.cleanString)(qaNumber.value))
                .input('postedBy', sql_server_js_1.sql.BigInt, actor.id)
                .input('postedByUsername', sql_server_js_1.sql.NVarChar, actor.username)
                .query(`
          UPDATE [${env_js_1.env.UTILITY_SCHEMA}].[qa_header]
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
                .input('qaId', sql_server_js_1.sql.BigInt, qaId)
                .input('postedBy', sql_server_js_1.sql.BigInt, actor.id)
                .input('inventoryRowsInserted', sql_server_js_1.sql.Int, inventoryRowsInserted)
                .query(`
          INSERT INTO [${env_js_1.env.UTILITY_SCHEMA}].[qa_posting_log] (
            qa_id,
            inventory_rows_inserted,
            posted_by
          )
          VALUES (@qaId, @inventoryRowsInserted, @postedBy)
        `);
            await (0, audit_js_1.recordAuditEvent)(transaction, {
                eventType: 'ADJUSTMENT_POSTED',
                entityType: 'QA_HEADER',
                entityId: qaId,
                actorUserId: actor.id,
                actorUsername: actor.username,
                details: {
                    lineCount: details.length,
                    qaNo: (0, value_js_1.cleanString)(qaNumber.value),
                },
            });
            return getQuantityAdjustmentById(String(qaId), transaction);
        }, sql_server_js_1.sql.ISOLATION_LEVEL.SERIALIZABLE);
    }
    catch (error) {
        if (blockedPostAudit) {
            await recordBlockedPostAudit(blockedPostAudit).catch((auditError) => {
                console.error('Failed to record blocked QA post audit event:', auditError);
            });
        }
        throw error;
    }
}
async function finalizeQuantityAdjustmentCancellation(transaction, header, actor) {
    assertCanFinalizeCancellation(actor);
    const updateResult = await transaction
        .request()
        .input('qaId', sql_server_js_1.sql.BigInt, header.qaId)
        .input('cancelledBy', sql_server_js_1.sql.BigInt, actor.id)
        .input('cancelledByUsername', sql_server_js_1.sql.NVarChar, actor.username)
        .query(`
      UPDATE [${env_js_1.env.UTILITY_SCHEMA}].[qa_header]
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
        throw (0, http_errors_js_1.conflict)('Quantity adjustment is no longer pending cancellation');
    }
    await transaction
        .request()
        .input('qaId', sql_server_js_1.sql.BigInt, header.qaId)
        .input('cancelledBy', sql_server_js_1.sql.BigInt, actor.id)
        .input('notes', sql_server_js_1.sql.NVarChar, 'Cancellation finalized')
        .query(`
      IF NOT EXISTS (
        SELECT 1
        FROM [${env_js_1.env.UTILITY_SCHEMA}].[qa_posting_log]
        WHERE qa_id = @qaId
      )
      BEGIN
        INSERT INTO [${env_js_1.env.UTILITY_SCHEMA}].[qa_posting_log] (
          qa_id,
          inventory_rows_inserted,
          posted_by,
          notes
        )
        VALUES (@qaId, 0, @cancelledBy, @notes);
      END
    `);
    const cancelledAt = updateResult.recordset[0]?.cancelledAt;
    await (0, audit_js_1.recordAuditEvent)(transaction, {
        eventType: 'ADJUSTMENT_CANCELLATION_POSTED',
        entityType: 'QA_HEADER',
        entityId: header.qaId,
        actorUserId: actor.id,
        actorUsername: actor.username,
        details: {
            qaNo: (0, value_js_1.cleanString)(header.qaNo),
            user: actor.username,
            timestamp: (0, value_js_1.toIsoString)(cancelledAt) ?? new Date().toISOString(),
            reason: (0, value_js_1.cleanString)(header.cancellationReason),
            oldStatus: header.status,
            newStatus: 'CANCELLED',
        },
    });
    return getQuantityAdjustmentById(String(header.qaId), transaction);
}
async function requestQuantityAdjustmentCancellation(qaId, reason, actor) {
    assertCanRequestCancellation(actor);
    const trimmedReason = normalizeCancellationReason(reason);
    return (0, sql_server_js_1.withTransaction)(async (transaction) => {
        const header = await getHeaderById(transaction, qaId, true);
        if (!header) {
            throw (0, http_errors_js_1.notFound)('Quantity adjustment not found');
        }
        if (header.status === 'PENDING_CANCELLATION') {
            throw (0, http_errors_js_1.conflict)('Quantity adjustment is already pending cancellation');
        }
        if (header.status === 'CANCELLED') {
            throw (0, http_errors_js_1.conflict)('Cancelled quantity adjustments cannot be cancelled again');
        }
        if (header.status !== 'SAVED') {
            throw (0, http_errors_js_1.conflict)('Only saved quantity adjustments can be requested for cancellation');
        }
        const updateResult = await transaction
            .request()
            .input('qaId', sql_server_js_1.sql.BigInt, qaId)
            .input('reason', sql_server_js_1.sql.NVarChar(sql_server_js_1.sql.MAX), trimmedReason)
            .input('requestedBy', sql_server_js_1.sql.BigInt, actor.id)
            .input('requestedByUsername', sql_server_js_1.sql.NVarChar, actor.username)
            .query(`
        UPDATE [${env_js_1.env.UTILITY_SCHEMA}].[qa_header]
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
            throw (0, http_errors_js_1.conflict)('Quantity adjustment is no longer saved');
        }
        const requestedAt = updateResult.recordset[0]?.cancellationRequestedAt;
        await (0, audit_js_1.recordAuditEvent)(transaction, {
            eventType: 'ADJUSTMENT_CANCELLATION_REQUESTED',
            entityType: 'QA_HEADER',
            entityId: qaId,
            actorUserId: actor.id,
            actorUsername: actor.username,
            details: {
                qaNo: (0, value_js_1.cleanString)(header.qaNo),
                user: actor.username,
                timestamp: (0, value_js_1.toIsoString)(requestedAt) ?? new Date().toISOString(),
                reason: trimmedReason,
                oldStatus: header.status,
                newStatus: 'PENDING_CANCELLATION',
            },
        });
        return getQuantityAdjustmentById(String(qaId), transaction);
    }, sql_server_js_1.sql.ISOLATION_LEVEL.SERIALIZABLE);
}
async function getQuantityAdjustmentById(qaId, executor) {
    const parsedId = Number(qaId);
    if (!executor) {
        await repairDraftQaNumberById(parsedId);
    }
    const connection = executor ?? (await (0, sql_server_js_1.getSqlPool)());
    const header = await getHeaderById(connection, parsedId);
    if (!header) {
        throw (0, http_errors_js_1.notFound)('Quantity adjustment not found');
    }
    const details = await getDetailsByQaId(connection, parsedId);
    return {
        ...mapHeader(header),
        lines: details,
    };
}
async function listQuantityAdjustments(query) {
    await repairDraftQaNumbers();
    const page = Math.max(1, query.page);
    const limit = Math.min(100, Math.max(1, query.limit));
    const offset = (page - 1) * limit;
    const search = (0, value_js_1.cleanString)(query.search);
    const pool = await (0, sql_server_js_1.getSqlPool)();
    const result = await pool
        .request()
        .input('offset', sql_server_js_1.sql.Int, offset)
        .input('limit', sql_server_js_1.sql.Int, limit)
        .input('search', sql_server_js_1.sql.NVarChar, search ? `%${search}%` : null)
        .input('status', sql_server_js_1.sql.NVarChar, query.status ?? null)
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
      FROM [${env_js_1.env.UTILITY_SCHEMA}].[qa_header] h
      LEFT JOIN [${env_js_1.env.UTILITY_SCHEMA}].[qa_detail] d
        ON d.qa_id = h.qa_id
      WHERE
        (@status IS NULL OR h.status = @status)
        AND (
          @search IS NULL
          OR h.qa_no LIKE @search
          OR h.ref_no LIKE @search
          OR EXISTS (
            SELECT 1
            FROM [${env_js_1.env.UTILITY_SCHEMA}].[qa_detail] sd
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
    const rows = result.recordset;
    const total = Number(rows[0]?.totalRows ?? 0);
    return {
        data: rows.map((row) => ({
            id: String(row.qaId),
            qaNo: (0, value_js_1.cleanString)(row.qaNo),
            transDate: (0, value_js_1.toIsoString)(row.transDate),
            refType: (0, value_js_1.cleanString)(row.refType),
            refNo: (0, value_js_1.cleanString)(row.refNo),
            status: (0, value_js_1.cleanString)(row.status),
            createdBy: (0, value_js_1.cleanString)(row.createdBy),
            createdAt: (0, value_js_1.toIsoString)(row.createdAt),
            postedAt: (0, value_js_1.toIsoString)(row.postedAt),
            lineCount: Number(row.lineCount ?? 0),
        })),
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
    };
}
async function markQuantityAdjustmentPrinted(qaId, actor) {
    await (0, sql_server_js_1.withTransaction)(async (transaction) => {
        const header = await getHeaderById(transaction, qaId, true);
        if (!header) {
            throw (0, http_errors_js_1.notFound)('Quantity adjustment not found');
        }
        if (header.status !== 'POSTED') {
            throw (0, http_errors_js_1.conflict)('Only posted quantity adjustments can be printed');
        }
        await transaction
            .request()
            .input('qaId', sql_server_js_1.sql.BigInt, qaId)
            .query(`
        UPDATE [${env_js_1.env.UTILITY_SCHEMA}].[qa_header]
        SET
          print_count = print_count + 1,
          last_printed_at = SYSUTCDATETIME(),
          updated_at = SYSUTCDATETIME()
        WHERE qa_id = @qaId
      `);
        await transaction
            .request()
            .input('qaId', sql_server_js_1.sql.BigInt, qaId)
            .input('printedBy', sql_server_js_1.sql.BigInt, actor.id)
            .query(`
        INSERT INTO [${env_js_1.env.UTILITY_SCHEMA}].[qa_print_log] (
          qa_id,
          printed_by
        )
        VALUES (@qaId, @printedBy)
      `);
        await (0, audit_js_1.recordAuditEvent)(transaction, {
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
async function getQuantityAdjustmentMeta() {
    const previews = await (0, numbering_service_js_1.getNumberingPreview)();
    return {
        serverDate: new Date().toISOString(),
        nextQaNo: previews.QA,
        nextRefNumbers: {
            DM: previews.DM,
            CM: previews.CM,
        },
    };
}
