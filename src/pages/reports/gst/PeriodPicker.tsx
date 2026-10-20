import React, { useState } from 'react';

const MONTHS = ['04', '05', '06', '07', '08', '09', '10', '11', '12', '01', '02', '03'];
const MONTH_NAMES: Record<string, string> = {
  '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr', '05': 'May', '06': 'Jun',
  '07': 'Jul', '08': 'Aug', '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec',
};

const currentFyStart = () => {
  const d = new Date();
  return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
};
const periodsOfFy = (start: number) => MONTHS.map((m) => `${m}${['01', '02', '03'].includes(m) ? start + 1 : start}`);
export const periodLabel = (p: string) => `${MONTH_NAMES[p.slice(0, 2)] || p.slice(0, 2)}-${p.slice(2)}`;
// sort MMYYYY chronologically
export const sortPeriods = (ps: string[]) => [...ps].sort((a, b) => (a.slice(2) + a.slice(0, 2)).localeCompare(b.slice(2) + b.slice(0, 2)));

// Financial year + month selector (multi-select), like the "Select Return Periods" dialog of the VFP viewers
const PeriodPicker: React.FC<{ value: string[]; onChange: (v: string[]) => void }> = ({ value, onChange }) => {
  const [fy, setFy] = useState(currentFyStart());
  const fyOptions = Array.from({ length: 5 }, (_, i) => currentFyStart() - 3 + i);
  const months = periodsOfFy(fy);
  const sel = new Set(value);
  const toggle = (p: string) => onChange(sortPeriods(sel.has(p) ? value.filter((x) => x !== p) : [...value, p]));

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Financial Year</label>
        <select
          value={fy}
          onChange={(e) => setFy(Number(e.target.value))}
          className="rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
        >
          {fyOptions.map((y) => (
            <option key={y} value={y}>
              FY {y}-{String(y + 1).slice(2)}
            </option>
          ))}
        </select>
        <button onClick={() => onChange(sortPeriods([...new Set([...value, ...months])]))} className="rounded bg-gray-200 px-2 py-1 text-xs hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200">
          Select all
        </button>
        <button onClick={() => onChange(value.filter((p) => !months.includes(p)))} className="rounded bg-gray-200 px-2 py-1 text-xs hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200">
          Clear
        </button>
      </div>
      <div className="grid grid-cols-4 gap-1 sm:grid-cols-6 lg:grid-cols-12">
        {months.map((p) => (
          <button
            key={p}
            onClick={() => toggle(p)}
            className={`rounded border px-2 py-1 text-xs ${
              sel.has(p) ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200'
            }`}
          >
            {periodLabel(p)}
          </button>
        ))}
      </div>
      {value.length > 0 && (
        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">Selected: {value.map(periodLabel).join(', ')}</div>
      )}
    </div>
  );
};

export default PeriodPicker;
