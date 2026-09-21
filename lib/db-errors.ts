/**
 * A feature whose migration has not been applied yet must say so, not crash the page.
 * PGRST205: PostgREST does not know the table · 42P01: Postgres "undefined_table".
 */
export function isMissingTable(error: { code?: string } | null | undefined): boolean {
  return error?.code === "PGRST205" || error?.code === "42P01";
}

/** 42501: row-level security refused the write (policies missing or not matching on this project). */
export function isForbidden(error: { code?: string } | null | undefined): boolean {
  return error?.code === "42501";
}

/** 42703 / PGRST204: the column is not there yet (migration pending). */
export function isMissingColumn(error: { code?: string } | null | undefined): boolean {
  return error?.code === "42703" || error?.code === "PGRST204";
}
