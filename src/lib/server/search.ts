import { sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

/**
 * Fuzzy search using pg_trgm similarity (GIN-index-accelerated).
 *
 * Uses `ILIKE` for substring matches + `similarity()` for typo tolerance.
 * Both are accelerated by GIN trigram indexes at scale.
 *
 * We use `similarity() > threshold` instead of the `%` operator because
 * the operator depends on a session-level setting that may not be set
 * on every pooled connection. Explicit threshold is more reliable.
 */
export function fuzzyMatch(column: PgColumn, term: string, threshold = 0.15): SQL {
	return sql`(${column} ILIKE ${'%' + term + '%'} OR similarity(${column}, ${term}) > ${threshold})`;
}

/**
 * Order results by relevance: exact match first, prefix match second, then similarity.
 */
export function fuzzyRank(column: PgColumn, term: string): SQL {
	return sql`(CASE WHEN LOWER(${column}) = LOWER(${term}) THEN 0 WHEN LOWER(${column}) LIKE LOWER(${term}) || '%' THEN 1 ELSE 2 END), similarity(${column}, ${term}) DESC`;
}
