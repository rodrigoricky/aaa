import { env } from '../../config/env.js';
import { getSqlPool } from '../../shared/database/sql-server.js';

function toVisibleQaNumber(value: unknown) {
  const qaNo = String(value ?? '').trim();
  return qaNo.startsWith('DRAFT-') ? '' : qaNo;
}

export async function getDashboardStats() {
  const pool = await getSqlPool();

  const [itemsResult, adjustmentsResult, todayAdjustmentsResult, usersResult] = await Promise.all([
    pool.request().query(`
      SELECT
        COUNT(*) AS totalItems,
        SUM(CASE WHEN end_qty <= 0 THEN 1 ELSE 0 END) AS outOfStockCount,
        SUM(
          CASE
            WHEN end_qty > 0
              AND end_qty <= CASE WHEN ISNULL(reorder_level, 0) > 0 THEN reorder_level ELSE 10 END
            THEN 1
            ELSE 0
          END
        ) AS lowStockCount,
        SUM(
          CASE
            WHEN end_qty > CASE WHEN ISNULL(reorder_level, 0) > 0 THEN reorder_level ELSE 10 END
            THEN 1
            ELSE 0
          END
        ) AS inStockCount,
        SUM(CASE WHEN end_qty < 0 THEN 1 ELSE 0 END) AS negativeStockCount
      FROM items
    `),
    pool.request().query(`
      SELECT COUNT(*) AS totalAdjustments
      FROM [${env.UTILITY_SCHEMA}].[qa_header]
    `),
    pool.request().query(`
      SELECT COUNT(*) AS todayAdjustments
      FROM [${env.UTILITY_SCHEMA}].[qa_header]
      WHERE CAST(trans_date AS DATE) = CAST(GETDATE() AS DATE)
    `),
    pool.request().query(`
      SELECT COUNT(*) AS totalUsers
      FROM [${env.UTILITY_SCHEMA}].[app_users]
    `),
  ]);

  return {
    totalItems: Number(itemsResult.recordset[0]?.totalItems ?? 0),
    inStockCount: Number(itemsResult.recordset[0]?.inStockCount ?? 0),
    lowStockCount: Number(itemsResult.recordset[0]?.lowStockCount ?? 0),
    outOfStockCount: Number(itemsResult.recordset[0]?.outOfStockCount ?? 0),
    negativeStockCount: Number(itemsResult.recordset[0]?.negativeStockCount ?? 0),
    totalAdjustments: Number(adjustmentsResult.recordset[0]?.totalAdjustments ?? 0),
    todayAdjustments: Number(todayAdjustmentsResult.recordset[0]?.todayAdjustments ?? 0),
    totalUsers: Number(usersResult.recordset[0]?.totalUsers ?? 0),
  };
}

export async function getSalesTrend() {
  const pool = await getSqlPool();
  const result = await pool.request().query(`
    WITH days AS (
      SELECT CAST(DATEADD(DAY, -6, CAST(GETDATE() AS DATE)) AS DATE) AS trend_date
      UNION ALL
      SELECT DATEADD(DAY, 1, trend_date)
      FROM days
      WHERE trend_date < CAST(GETDATE() AS DATE)
    ),
    grouped AS (
      SELECT
        CAST(trans_date AS DATE) AS trend_date,
        COUNT(*) AS adjustment_count
      FROM [${env.UTILITY_SCHEMA}].[qa_header]
      WHERE CAST(trans_date AS DATE) >= DATEADD(DAY, -6, CAST(GETDATE() AS DATE))
      GROUP BY CAST(trans_date AS DATE)
    )
    SELECT
      CONVERT(VARCHAR(10), days.trend_date, 23) AS [date],
      ISNULL(grouped.adjustment_count, 0) AS adjustments
    FROM days
    LEFT JOIN grouped
      ON grouped.trend_date = days.trend_date
    ORDER BY days.trend_date ASC
    OPTION (MAXRECURSION 7)
  `);

  return result.recordset.map((row: Record<string, unknown>) => ({
    date: String(row.date),
    adjustments: Number(row.adjustments ?? 0),
  }));
}

export async function getRecentTransactions() {
  const pool = await getSqlPool();
  const result = await pool.request().query(`
    SELECT TOP 10
      h.qa_id AS id,
      h.qa_no AS qaNo,
      h.ref_type AS refType,
      h.ref_no AS refNo,
      h.status AS status,
      h.created_by_username AS createdBy,
      h.trans_date AS createdAt,
      COUNT(d.detail_id) AS lineCount
    FROM [${env.UTILITY_SCHEMA}].[qa_header] h
    LEFT JOIN [${env.UTILITY_SCHEMA}].[qa_detail] d
      ON d.qa_id = h.qa_id
    GROUP BY
      h.qa_id,
      h.qa_no,
      h.ref_type,
      h.ref_no,
      h.status,
      h.created_by_username,
      h.trans_date
    ORDER BY h.qa_id DESC
  `);

  return result.recordset.map((row: Record<string, unknown>) => ({
    id: String(row.id),
    qaNo: toVisibleQaNumber(row.qaNo),
    refType: String(row.refType),
    refNo: String(row.refNo),
    status: String(row.status),
    createdBy: String(row.createdBy),
    lineCount: Number(row.lineCount ?? 0),
    createdAt: new Date(String(row.createdAt)).toISOString(),
  }));
}
