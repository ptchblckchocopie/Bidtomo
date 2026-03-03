import type { Pool } from 'pg';

interface DateRange {
  from: string;
  to: string;
}

export async function getOverviewStats(pool: Pool, range: DateRange) {
  const { rows: [stats] } = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM users)::int AS "totalUsers",
      (SELECT COUNT(DISTINCT session_id) FROM user_events WHERE created_at >= NOW() - INTERVAL '7 days')::int AS "activeUsers7d",
      (SELECT COUNT(*) FROM products)::int AS "totalProducts",
      (SELECT COUNT(*) FROM products WHERE status = 'sold')::int AS "productsSold",
      (SELECT COUNT(*) FROM user_events WHERE "eventType" = 'bid_placed' AND created_at >= $1 AND created_at <= $2)::int AS "totalBids",
      (SELECT COUNT(*) FROM user_events WHERE "eventType" = 'search' AND created_at >= $1 AND created_at <= $2)::int AS "totalSearches"
  `, [range.from, range.to]);

  return stats;
}

export async function getTimeSeries(pool: Pool, range: DateRange) {
  const { rows } = await pool.query(`
    SELECT
      d::date AS date,
      COALESCE(SUM(CASE WHEN e."eventType" = 'register' THEN 1 ELSE 0 END), 0)::int AS registrations,
      COALESCE(SUM(CASE WHEN e."eventType" = 'bid_placed' THEN 1 ELSE 0 END), 0)::int AS bids,
      COALESCE(SUM(CASE WHEN e."eventType" = 'product_view' THEN 1 ELSE 0 END), 0)::int AS "productViews",
      COALESCE(SUM(CASE WHEN e."eventType" = 'search' THEN 1 ELSE 0 END), 0)::int AS searches,
      COALESCE(SUM(CASE WHEN e."eventType" = 'product_sold' THEN 1 ELSE 0 END), 0)::int AS "productsSold"
    FROM generate_series($1::date, $2::date, '1 day'::interval) d
    LEFT JOIN user_events e ON e.created_at::date = d::date
      AND e."eventType" IN ('register', 'bid_placed', 'product_view', 'search', 'product_sold')
    GROUP BY d::date
    ORDER BY d::date
  `, [range.from, range.to]);

  return {
    labels: rows.map((r: any) => r.date.toISOString().slice(0, 10)),
    registrations: rows.map((r: any) => r.registrations),
    bids: rows.map((r: any) => r.bids),
    productViews: rows.map((r: any) => r.productViews),
    searches: rows.map((r: any) => r.searches),
    productsSold: rows.map((r: any) => r.productsSold),
  };
}

export async function getTopSearchKeywords(pool: Pool, range: DateRange) {
  const { rows } = await pool.query(`
    SELECT
      metadata->>'query' AS keyword,
      COUNT(*)::int AS count
    FROM user_events
    WHERE "eventType" = 'search'
      AND metadata->>'query' IS NOT NULL
      AND metadata->>'query' != ''
      AND created_at >= $1 AND created_at <= $2
    GROUP BY metadata->>'query'
    ORDER BY count DESC
    LIMIT 10
  `, [range.from, range.to]);

  return rows;
}

export async function getTopViewedProducts(pool: Pool, range: DateRange) {
  const { rows } = await pool.query(`
    SELECT
      (e.metadata->>'productId')::int AS id,
      COALESCE(p.title, 'Deleted Product') AS title,
      COUNT(*)::int AS views
    FROM user_events e
    LEFT JOIN products p ON p.id = (e.metadata->>'productId')::int
    WHERE e."eventType" = 'product_view'
      AND e.metadata->>'productId' IS NOT NULL
      AND e.created_at >= $1 AND e.created_at <= $2
    GROUP BY (e.metadata->>'productId')::int, p.title
    ORDER BY views DESC
    LIMIT 10
  `, [range.from, range.to]);

  return rows;
}

export async function getTopSoldProducts(pool: Pool, range: DateRange) {
  const { rows } = await pool.query(`
    SELECT
      p.id,
      p.title,
      COUNT(*)::int AS sales
    FROM transactions t
    JOIN transactions_rels tr ON tr.parent_id = t.id AND tr.path = 'product'
    JOIN products p ON p.id = tr.products_id
    WHERE t.created_at >= $1 AND t.created_at <= $2
    GROUP BY p.id, p.title
    ORDER BY sales DESC
    LIMIT 10
  `, [range.from, range.to]);

  return rows;
}

export async function getEventBreakdown(pool: Pool, range: DateRange) {
  const { rows } = await pool.query(`
    SELECT
      "eventType",
      COUNT(*)::int AS count
    FROM user_events
    WHERE created_at >= $1 AND created_at <= $2
    GROUP BY "eventType"
    ORDER BY count DESC
  `, [range.from, range.to]);

  return rows;
}
