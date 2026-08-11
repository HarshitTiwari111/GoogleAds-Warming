import { useMemo, useState } from 'react';
import { ChevronUp, ChevronDown, Search } from 'lucide-react';

/**
 * Sortable, filterable table used by the Accounts and Campaigns pages.
 *
 * Columns are declared as:
 *   { key, label, sortable?, filterable?, filterType?: 'select',
 *     filterOptions?: [{ value, label }], render?: (row) => node }
 *
 * Filtering and sorting are client-side over the rows passed in. Columns with
 * a `render` still filter and sort on the underlying `row[key]` value, so a
 * formatted cell (e.g. "$250") sorts numerically rather than as text.
 *
 * Pass `selectable` with `selectedIds` + `onSelectionChange` to get a checkbox
 * column. The header checkbox acts on the rows currently visible after
 * filtering, not the whole data set, so "select all" never quietly picks up
 * rows the operator has filtered away.
 */
export default function DataTable({
  columns,
  data,
  loading,
  emptyMessage = 'No data found',
  actions,
  selectable = false,
  selectedIds = [],
  onSelectionChange,
  rowId = (row) => row._id,
}) {
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState({ key: null, direction: null });

  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }));
  const clearFilters = () => setFilters({});

  // asc -> desc -> unsorted, so a column can be returned to its natural order.
  const toggleSort = (key) =>
    setSort((prev) => {
      if (prev.key !== key) return { key, direction: 'asc' };
      if (prev.direction === 'asc') return { key, direction: 'desc' };
      return { key: null, direction: null };
    });

  const rows = useMemo(() => {
    let result = [...(data || [])];

    for (const [key, value] of Object.entries(filters)) {
      if (!value) continue;
      const col = columns.find((c) => c.key === key);
      const needle = value.toLowerCase();

      result = result.filter((row) => {
        // A column may match on more than its own key — e.g. an account row
        // searchable by name or customer id — via filterValue.
        const raw = col?.filterValue ? col.filterValue(row) : row[key];

        // Array cells (device, country) are matched per element. Stringifying
        // them gave "mobile,desktop", which an exact select match never hit.
        const candidates = (Array.isArray(raw) ? raw : [raw])
          .filter((v) => v !== null && v !== undefined && v !== '')
          .map((v) => String(v).toLowerCase());

        if (!candidates.length) return false;

        return col?.filterType === 'select'
          ? candidates.some((c) => c === needle)
          : candidates.some((c) => c.includes(needle));
      });
    }

    if (sort.key && sort.direction) {
      const dir = sort.direction === 'asc' ? 1 : -1;
      result.sort((a, b) => {
        const av = a[sort.key] ?? '';
        const bv = b[sort.key] ?? '';
        if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
        return String(av).toLowerCase().localeCompare(String(bv).toLowerCase()) * dir;
      });
    }

    return result;
  }, [data, filters, sort, columns]);

  const filterableColumns = columns.filter((c) => c.filterable);
  const hasActiveFilter = Object.values(filters).some(Boolean);

  const selected = new Set(selectedIds);
  const visibleIds = rows.map(rowId);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  // Distinguishes "some" from "all" so the header box can show a dash.
  const someVisibleSelected = visibleIds.some((id) => selected.has(id));

  const toggleAll = () => {
    if (!onSelectionChange) return;
    onSelectionChange(
      allVisibleSelected
        ? selectedIds.filter((id) => !visibleIds.includes(id))
        : [...new Set([...selectedIds, ...visibleIds])]
    );
  };

  const toggleRow = (id) => {
    if (!onSelectionChange) return;
    onSelectionChange(selected.has(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  };

  const colSpan = columns.length + (selectable ? 1 : 0);

  return (
    <div className="panel-card dt-card">
      {(filterableColumns.length > 0 || actions) && (
        <div className="dt-toolbar">
          {filterableColumns.map((col) =>
            col.filterType === 'select' ? (
              <select
                key={col.key}
                className="dt-filter-select"
                value={filters[col.key] || ''}
                onChange={(e) => setFilter(col.key, e.target.value)}
              >
                <option value="">{col.label}: All</option>
                {(col.filterOptions || []).map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            ) : (
              <div key={col.key} className="dt-filter-search">
                <Search size={15} />
                <input
                  type="text"
                  value={filters[col.key] || ''}
                  onChange={(e) => setFilter(col.key, e.target.value)}
                  placeholder={col.filterPlaceholder || `Search ${col.label.toLowerCase()}...`}
                />
              </div>
            )
          )}

          {hasActiveFilter && (
            <button type="button" className="dt-clear-btn" onClick={clearFilters}>
              Clear
            </button>
          )}

          {actions && <div className="dt-actions">{actions}</div>}
        </div>
      )}

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              {selectable && (
                <th className="dt-select-cell">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    ref={(el) => {
                      // Indeterminate is a DOM property, not an attribute.
                      if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected;
                    }}
                    onChange={toggleAll}
                    aria-label="Select all rows"
                  />
                </th>
              )}
              {columns.map((col) => (
                <th key={col.key}>
                  {col.sortable ? (
                    <button type="button" className="dt-sort-btn" onClick={() => toggleSort(col.key)}>
                      {col.label}
                      <span className="dt-sort-icons">
                        <ChevronUp size={11} className={sort.key === col.key && sort.direction === 'asc' ? 'dt-sort-on' : undefined} />
                        <ChevronDown size={11} className={sort.key === col.key && sort.direction === 'desc' ? 'dt-sort-on' : undefined} />
                      </span>
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="empty-row" colSpan={colSpan}>Loading…</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="empty-row" colSpan={colSpan}>{emptyMessage}</td>
              </tr>
            ) : (
              rows.map((row, i) => {
                const id = rowId(row);
                const isSelected = selected.has(id);
                return (
                  <tr key={id || row.customerId || i} className={isSelected ? 'dt-row-selected' : undefined}>
                    {selectable && (
                      <td className="dt-select-cell">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleRow(id)}
                          aria-label={`Select row ${i + 1}`}
                        />
                      </td>
                    )}
                    {columns.map((col) => (
                      <td key={col.key}>{col.render ? col.render(row) : row[col.key]}</td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
