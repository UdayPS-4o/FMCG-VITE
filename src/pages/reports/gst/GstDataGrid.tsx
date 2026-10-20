import React, { useEffect, useMemo, useRef, useState } from 'react';
import { downloadText, fmtNum } from './gstApi';

export interface GridColumn {
  key: string;
  label?: string;
  numeric?: boolean;
  total?: boolean; // show a sum in the footer
  filter?: boolean; // Excel-style multi-select filter on this column
  wide?: boolean;
}

type Row = Record<string, any>;

interface Props {
  columns: GridColumn[];
  rows: Row[];
  exportName: string;
  emptyText?: string;
}

const PAGE = 200;
const cellText = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const isProblem = (r: Row) => !!r.MISMATCH && r.MISMATCH !== 'No mismatch';

// Excel-style filter dropdown: search + (Select All) + one checkbox per distinct value
const FilterMenu: React.FC<{
  values: string[];
  selected: Set<string> | null;
  onApply: (sel: Set<string> | null) => void;
  onClose: () => void;
}> = ({ values, selected, onApply, onClose }) => {
  const [search, setSearch] = useState('');
  const [checked, setChecked] = useState<Set<string>>(() => new Set(selected ?? values));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [onClose]);

  const visible = values.filter((v) => !search || v.toUpperCase().includes(search.toUpperCase()));
  const allVisibleChecked = visible.every((v) => checked.has(v));

  const toggleAll = () => {
    const next = new Set(checked);
    visible.forEach((v) => (allVisibleChecked ? next.delete(v) : next.add(v)));
    setChecked(next);
  };
  const apply = () => {
    // with a search active only the visible, ticked values count (same as the VFP filter dialog)
    const picked = search ? visible.filter((v) => checked.has(v)) : values.filter((v) => checked.has(v));
    onApply(!search && picked.length === values.length ? null : new Set(picked));
    onClose();
  };

  return (
    <div
      ref={ref}
      className="absolute z-30 mt-1 w-64 rounded-md border border-gray-200 bg-white p-2 text-left text-xs font-normal normal-case shadow-lg dark:border-gray-600 dark:bg-gray-800"
    >
      <input
        autoFocus
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search..."
        className="mb-2 w-full rounded border border-gray-300 px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
      />
      <label className="flex items-center gap-2 border-b border-gray-200 pb-1 font-semibold text-gray-700 dark:border-gray-600 dark:text-gray-200">
        <input type="checkbox" checked={allVisibleChecked} onChange={toggleAll} />
        (Select All)
      </label>
      <div className="max-h-56 overflow-y-auto py-1">
        {visible.map((v) => (
          <label key={v} className="flex items-center gap-2 py-0.5 text-gray-700 dark:text-gray-200">
            <input
              type="checkbox"
              checked={checked.has(v)}
              onChange={() => {
                const next = new Set(checked);
                if (next.has(v)) next.delete(v);
                else next.add(v);
                setChecked(next);
              }}
            />
            <span className="truncate">{v === '' ? '(Blanks)' : v}</span>
          </label>
        ))}
        {!visible.length && <div className="py-2 text-gray-400">No values</div>}
      </div>
      <div className="flex justify-end gap-2 border-t border-gray-200 pt-2 dark:border-gray-600">
        <button onClick={onClose} className="rounded px-2 py-1 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700">
          Close
        </button>
        <button onClick={apply} className="rounded bg-green-600 px-3 py-1 text-white hover:bg-green-700">
          OK
        </button>
      </div>
    </div>
  );
};

// Read-only grid used by the GSTR-1 / GSTR-2B viewers: column filters, red rows for mismatches,
// footer totals and CSV export of the filtered rows.
const GstDataGrid: React.FC<Props> = ({ columns, rows, exportName, emptyText }) => {
  const [filters, setFilters] = useState<Record<string, Set<string> | null>>({});
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
  }, [rows, filters]);

  const filtered = useMemo(
    () => rows.filter((r) => Object.entries(filters).every(([k, sel]) => !sel || sel.has(cellText(r[k])))),
    [rows, filters],
  );

  const distinct = (key: string) => {
    // values offered for a column respect the other columns' filters
    const others = rows.filter((r) => Object.entries(filters).every(([k, sel]) => k === key || !sel || sel.has(cellText(r[k]))));
    return [...new Set(others.map((r) => cellText(r[key])))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  };

  const activeFilters = Object.values(filters).filter(Boolean).length;
  const pageRows = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const problems = filtered.filter(isProblem).length;

  const exportCsv = () => {
    const esc = (v: unknown) => {
      const s = cellText(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [columns.map((c) => c.key).join(','), ...filtered.map((r) => columns.map((c) => esc(r[c.key])).join(','))];
    downloadText(exportName, lines.join('\n'));
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
        <span className="text-gray-600 dark:text-gray-300">
          {filtered.length} of {rows.length} rows
          {problems > 0 && <span className="ml-2 font-semibold text-red-600">· {problems} mismatched</span>}
        </span>
        {activeFilters > 0 && (
          <button onClick={() => setFilters({})} className="rounded bg-amber-700 px-2 py-1 text-xs text-white hover:bg-amber-800">
            Reset filters ({activeFilters})
          </button>
        )}
        <button onClick={exportCsv} disabled={!filtered.length} className="ml-auto rounded bg-green-700 px-3 py-1 text-xs font-semibold text-white hover:bg-green-800 disabled:opacity-50">
          Export CSV
        </button>
      </div>

      <div className="max-h-[65vh] overflow-auto rounded border border-gray-200 dark:border-gray-700">
        <table className="min-w-full text-xs">
          <thead className="sticky top-0 z-20 bg-gray-100 dark:bg-gray-700">
            <tr>
              {columns.map((c) => {
                const active = !!filters[c.key];
                return (
                  <th key={c.key} className={`relative whitespace-nowrap px-2 py-2 font-semibold text-gray-700 dark:text-gray-200 ${c.numeric ? 'text-right' : 'text-left'}`}>
                    <div className={`flex items-center gap-1 ${c.numeric ? 'justify-end' : ''}`}>
                      <span>{c.label || c.key}</span>
                      {c.filter && (
                        <button
                          onClick={() => setOpenFilter(openFilter === c.key ? null : c.key)}
                          title="Filter"
                          className={`rounded px-1 ${active ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                        >
                          ▾{active ? ` (${filters[c.key]!.size})` : ''}
                        </button>
                      )}
                    </div>
                    {openFilter === c.key && (
                      <FilterMenu
                        values={distinct(c.key)}
                        selected={filters[c.key] ?? null}
                        onApply={(sel) => setFilters((f) => ({ ...f, [c.key]: sel }))}
                        onClose={() => setOpenFilter(null)}
                      />
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r, i) => (
              <tr
                key={i}
                className={
                  isProblem(r)
                    ? 'bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100'
                    : r.MISMATCH === 'No mismatch'
                      ? 'bg-green-50 dark:bg-green-900/20 dark:text-gray-100'
                      : 'odd:bg-white even:bg-gray-50 dark:odd:bg-gray-800 dark:even:bg-gray-900 dark:text-gray-100'
                }
              >
                {columns.map((c) => (
                  <td key={c.key} className={`border-t border-gray-100 px-2 py-1 dark:border-gray-700 ${c.numeric ? 'text-right tabular-nums' : ''} ${c.wide ? 'min-w-[16rem]' : 'whitespace-nowrap'}`}>
                    {c.numeric ? fmtNum(r[c.key], c.key === 'QTY' ? 3 : 2) : cellText(r[c.key])}
                  </td>
                ))}
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-6 text-center text-gray-500">
                  {emptyText || 'No rows'}
                </td>
              </tr>
            )}
          </tbody>
          {filtered.length > 0 && columns.some((c) => c.total) && (
            <tfoot className="sticky bottom-0 bg-green-50 font-semibold dark:bg-green-900">
              <tr>
                {columns.map((c, i) => (
                  <td key={c.key} className={`px-2 py-2 dark:text-green-100 ${c.numeric ? 'text-right tabular-nums' : ''}`}>
                    {c.total ? fmtNum(filtered.reduce((s, r) => s + (Number(r[c.key]) || 0), 0)) : i === 0 ? 'TOTAL' : ''}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {pages > 1 && (
        <div className="mt-2 flex items-center justify-end gap-2 text-xs text-gray-600 dark:text-gray-300">
          <button disabled={page === 0} onClick={() => setPage(page - 1)} className="rounded border px-2 py-1 disabled:opacity-40 dark:border-gray-600">
            Prev
          </button>
          Page {page + 1} / {pages}
          <button disabled={page >= pages - 1} onClick={() => setPage(page + 1)} className="rounded border px-2 py-1 disabled:opacity-40 dark:border-gray-600">
            Next
          </button>
        </div>
      )}
    </div>
  );
};

export default GstDataGrid;
