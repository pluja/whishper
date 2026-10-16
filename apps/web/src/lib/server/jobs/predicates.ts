// Column names stay unqualified, so a query using them must not join another
// table with a kind or state column.
export const IS_MEDIA_PREPARE_JOB = "kind = 'media_prepare'";
export const IS_ACTIVE_JOB = "state in ('queued', 'leased')";
