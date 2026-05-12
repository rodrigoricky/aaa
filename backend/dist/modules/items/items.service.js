"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_LOW_STOCK_THRESHOLD = void 0;
exports.resolveLowStockThreshold = resolveLowStockThreshold;
exports.getStockStatus = getStockStatus;
exports.getItems = getItems;
exports.getItemById = getItemById;
exports.getItemSnapshots = getItemSnapshots;
exports.getCategories = getCategories;
exports.rejectInventoryWrite = rejectInventoryWrite;
const sql_server_js_1 = require("../../shared/database/sql-server.js");
const http_errors_js_1 = require("../../shared/errors/http-errors.js");
const value_js_1 = require("../../shared/utils/value.js");
exports.DEFAULT_LOW_STOCK_THRESHOLD = 10;
function resolveLowStockThreshold(value) {
    const threshold = (0, value_js_1.toNumber)(value);
    return threshold > 0 ? threshold : exports.DEFAULT_LOW_STOCK_THRESHOLD;
}
function getStockStatus(quantity, lowStockThreshold = exports.DEFAULT_LOW_STOCK_THRESHOLD) {
    if (quantity <= 0)
        return 'Out';
    if (quantity <= lowStockThreshold)
        return 'Low';
    return 'In Stock';
}
async function getItems(query) {
    const page = Math.max(1, query.page);
    const limit = Math.min(100, Math.max(1, query.limit));
    const offset = (page - 1) * limit;
    const search = (0, value_js_1.cleanString)(query.search);
    const category = (0, value_js_1.cleanString)(query.category);
    const pool = await (0, sql_server_js_1.getSqlPool)();
    const request = pool
        .request()
        .input('offset', sql_server_js_1.sql.Int, offset)
        .input('limit', sql_server_js_1.sql.Int, limit)
        .input('category', sql_server_js_1.sql.NVarChar, category || null)
        .input('itemCodeSearch', sql_server_js_1.sql.NVarChar, search ? `${search}%` : null)
        .input('itemNameSearch', sql_server_js_1.sql.NVarChar, search ? `%${search}%` : null);
    const result = await request.query(`
    WITH filtered AS (
      SELECT
        itemcode,
        itemname,
        department,
        category,
        unitprice,
        end_qty,
        reorder_level,
        date_created,
        date_modified
      FROM items
      WHERE
        (@category IS NULL OR category = @category)
        AND (
          @itemCodeSearch IS NULL
          OR itemcode LIKE @itemCodeSearch
          OR itemname LIKE @itemNameSearch
        )
    )
    SELECT
      itemcode,
      itemname,
      department,
      category,
      unitprice,
      end_qty,
      reorder_level,
      date_created,
      date_modified,
      COUNT(*) OVER() AS totalRows
    FROM filtered
    ORDER BY itemcode ASC
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
  `);
    const rows = result.recordset;
    const total = Number(rows[0]?.totalRows ?? 0);
    const data = rows.map((row) => {
        const itemcode = (0, value_js_1.cleanString)(row.itemcode);
        const quantity = (0, value_js_1.parseRequiredQuantity)(row.end_qty, itemcode);
        const lowStockThreshold = resolveLowStockThreshold(row.reorder_level);
        const itemname = (0, value_js_1.cleanString)(row.itemname);
        const price = (0, value_js_1.toNumber)(row.unitprice);
        return {
            id: itemcode,
            name: itemname,
            sku: itemcode,
            category: (0, value_js_1.cleanString)(row.category),
            quantity,
            price,
            status: getStockStatus(quantity, lowStockThreshold),
            department: (0, value_js_1.cleanString)(row.department),
            unitprice: price,
            itemcode,
            createdAt: (0, value_js_1.toIsoString)(row.date_created),
            updatedAt: (0, value_js_1.toIsoString)(row.date_modified),
        };
    });
    return {
        data,
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
    };
}
async function getItemById(id) {
    const pool = await (0, sql_server_js_1.getSqlPool)();
    const result = await pool
        .request()
        .input('itemcode', sql_server_js_1.sql.NVarChar, id)
        .query(`
      SELECT TOP 1
        itemcode,
        itemname,
        department,
        category,
        unitprice,
        end_qty,
        reorder_level,
        date_created,
        date_modified
      FROM items
      WHERE itemcode = @itemcode
    `);
    if (result.recordset.length === 0) {
        throw (0, http_errors_js_1.notFound)('Item not found');
    }
    const row = result.recordset[0];
    const itemcode = (0, value_js_1.cleanString)(row.itemcode);
    const quantity = (0, value_js_1.parseRequiredQuantity)(row.end_qty, itemcode);
    const lowStockThreshold = resolveLowStockThreshold(row.reorder_level);
    const price = (0, value_js_1.toNumber)(row.unitprice);
    return {
        id: itemcode,
        name: (0, value_js_1.cleanString)(row.itemname),
        sku: itemcode,
        category: (0, value_js_1.cleanString)(row.category),
        quantity,
        price,
        status: getStockStatus(quantity, lowStockThreshold),
        department: (0, value_js_1.cleanString)(row.department),
        unitprice: price,
        itemcode,
        createdAt: (0, value_js_1.toIsoString)(row.date_created),
        updatedAt: (0, value_js_1.toIsoString)(row.date_modified),
    };
}
async function getItemSnapshots(itemcodes) {
    if (itemcodes.length === 0) {
        return new Map();
    }
    const pool = await (0, sql_server_js_1.getSqlPool)();
    const request = pool.request();
    const placeholders = itemcodes.map((itemcode, index) => {
        const key = `itemcode${index}`;
        request.input(key, sql_server_js_1.sql.NVarChar, itemcode);
        return `@${key}`;
    });
    const result = await request.query(`
    SELECT
      itemcode,
      itemname,
      end_qty
    FROM items
    WHERE itemcode IN (${placeholders.join(', ')})
  `);
    return new Map(result.recordset.map((row) => [
        (0, value_js_1.cleanString)(row.itemcode),
        {
            itemcode: (0, value_js_1.cleanString)(row.itemcode),
            itemname: (0, value_js_1.cleanString)(row.itemname),
            quantity: (0, value_js_1.parseRequiredQuantity)(row.end_qty, (0, value_js_1.cleanString)(row.itemcode)),
        },
    ]));
}
async function getCategories() {
    const pool = await (0, sql_server_js_1.getSqlPool)();
    const result = await pool.request().query(`
    SELECT DISTINCT category
    FROM items
    WHERE category IS NOT NULL AND LTRIM(RTRIM(category)) <> ''
    ORDER BY category ASC
  `);
    return result.recordset
        .map((row) => (0, value_js_1.cleanString)(row.category))
        .filter(Boolean);
}
async function rejectInventoryWrite() {
    throw (0, http_errors_js_1.methodNotAllowed)('Direct inventory writes are disabled. Use the quantity adjustment workflow instead.');
}
