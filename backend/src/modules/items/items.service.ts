import { getSqlPool, sql } from '../../shared/database/sql-server.js';
import { methodNotAllowed, notFound } from '../../shared/errors/http-errors.js';
import type { PaginatedResult } from '../../shared/types/index.js';
import {
  cleanString,
  parseRequiredQuantity,
  toIsoString,
  toNumber,
} from '../../shared/utils/value.js';

export const DEFAULT_LOW_STOCK_THRESHOLD = 10;

export function resolveLowStockThreshold(value: unknown) {
  const threshold = toNumber(value);
  return threshold > 0 ? threshold : DEFAULT_LOW_STOCK_THRESHOLD;
}

export function getStockStatus(
  quantity: number,
  lowStockThreshold = DEFAULT_LOW_STOCK_THRESHOLD
): 'In Stock' | 'Low' | 'Out' {
  if (quantity <= 0) return 'Out';
  if (quantity <= lowStockThreshold) return 'Low';
  return 'In Stock';
}

interface ItemRecord {
  id: string;
  name: string;
  sku: string;
  category: string;
  quantity: number;
  price: number;
  status: 'In Stock' | 'Low' | 'Out';
  department: string;
  unitprice: number;
  itemcode: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export async function getItems(query: {
  page: number;
  limit: number;
  search?: string;
  category?: string;
}): Promise<PaginatedResult<ItemRecord>> {
  const page = Math.max(1, query.page);
  const limit = Math.min(100, Math.max(1, query.limit));
  const offset = (page - 1) * limit;
  const search = cleanString(query.search);
  const category = cleanString(query.category);

  const pool = await getSqlPool();
  const request = pool
    .request()
    .input('offset', sql.Int, offset)
    .input('limit', sql.Int, limit)
    .input('category', sql.NVarChar, category || null)
    .input('itemCodeSearch', sql.NVarChar, search ? `${search}%` : null)
    .input('itemNameSearch', sql.NVarChar, search ? `%${search}%` : null);

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

  const rows = result.recordset as Array<Record<string, unknown> & { totalRows?: number }>;
  const total = Number(rows[0]?.totalRows ?? 0);
  const data = rows.map((row) => {
    const itemcode = cleanString(row.itemcode);
    const quantity = parseRequiredQuantity(row.end_qty, itemcode);
    const lowStockThreshold = resolveLowStockThreshold(row.reorder_level);
    const itemname = cleanString(row.itemname);
    const price = toNumber(row.unitprice);

    return {
      id: itemcode,
      name: itemname,
      sku: itemcode,
      category: cleanString(row.category),
      quantity,
      price,
      status: getStockStatus(quantity, lowStockThreshold),
      department: cleanString(row.department),
      unitprice: price,
      itemcode,
      createdAt: toIsoString(row.date_created),
      updatedAt: toIsoString(row.date_modified),
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

export async function getItemById(id: string) {
  const pool = await getSqlPool();
  const result = await pool
    .request()
    .input('itemcode', sql.NVarChar, id)
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
    throw notFound('Item not found');
  }

  const row = result.recordset[0];
  const itemcode = cleanString(row.itemcode);
  const quantity = parseRequiredQuantity(row.end_qty, itemcode);
  const lowStockThreshold = resolveLowStockThreshold(row.reorder_level);
  const price = toNumber(row.unitprice);

  return {
    id: itemcode,
    name: cleanString(row.itemname),
    sku: itemcode,
    category: cleanString(row.category),
    quantity,
    price,
    status: getStockStatus(quantity, lowStockThreshold),
    department: cleanString(row.department),
    unitprice: price,
    itemcode,
    createdAt: toIsoString(row.date_created),
    updatedAt: toIsoString(row.date_modified),
  };
}

export async function getItemSnapshots(itemcodes: string[]) {
  if (itemcodes.length === 0) {
    return new Map<string, { itemcode: string; itemname: string; quantity: number }>();
  }

  const pool = await getSqlPool();
  const request = pool.request();
  const placeholders = itemcodes.map((itemcode, index) => {
    const key = `itemcode${index}`;
    request.input(key, sql.NVarChar, itemcode);
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

  return new Map(
    result.recordset.map((row: Record<string, unknown>) => [
      cleanString(row.itemcode),
      {
        itemcode: cleanString(row.itemcode),
        itemname: cleanString(row.itemname),
        quantity: parseRequiredQuantity(row.end_qty, cleanString(row.itemcode)),
      },
    ])
  );
}

export async function getCategories() {
  const pool = await getSqlPool();
  const result = await pool.request().query(`
    SELECT DISTINCT category
    FROM items
    WHERE category IS NOT NULL AND LTRIM(RTRIM(category)) <> ''
    ORDER BY category ASC
  `);

  return result.recordset
    .map((row: Record<string, unknown>) => cleanString(row.category))
    .filter(Boolean);
}

export async function rejectInventoryWrite() {
  throw methodNotAllowed(
    'Direct inventory writes are disabled. Use the quantity adjustment workflow instead.'
  );
}
