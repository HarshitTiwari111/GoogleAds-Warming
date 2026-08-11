/**
 * Default table order: what the operator created here, newest first.
 *
 * Rows that came only from the synced Google Ads snapshot have no createdAt —
 * they were never created through this app — so they keep their existing order
 * and sit below. A freshly created account or campaign therefore lands at the
 * top of the table where it can be seen, instead of somewhere inside a long
 * synced list.
 *
 * Only the default ordering: clicking a column header still sorts by that
 * column.
 */
export function newestCreatedFirst(rows) {
  return [...rows].sort((a, b) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : null;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : null;

    if (aTime && bTime) return bTime - aTime;
    // Anything created here outranks a synced-only row.
    if (aTime) return -1;
    if (bTime) return 1;
    return 0;
  });
}
