import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Normalizes DD-MM-YYYY, DD/MM/YYYY, YYYY-MM-DD and ISO timestamps to a YYYY-MM-DD key
export const toDateKey = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  let m = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return null;
};

const formatKey = (year: number, monthIndex: number, day: number) =>
  `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

interface DateFilterCalendarProps {
  anchorEl: HTMLElement;
  availableDates: Set<string>; // YYYY-MM-DD keys present in the table
  selectedDates: string[];     // YYYY-MM-DD keys
  onChange: (dates: string[]) => void;
  onClose: () => void;
}

const DateFilterCalendar: React.FC<DateFilterCalendarProps> = ({
  anchorEl,
  availableDates,
  selectedDates,
  onChange,
  onClose,
}) => {
  const popupRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  // Start on the month of the latest selected date, else the latest date in the table
  const [viewMonth, setViewMonth] = useState<{ year: number; month: number }>(() => {
    const source = selectedDates.length > 0 ? selectedDates : Array.from(availableDates);
    const latest = [...source].sort().pop();
    if (latest) {
      const [y, m] = latest.split('-').map(Number);
      return { year: y, month: m - 1 };
    }
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  // Rendered in a portal with fixed positioning so the table's overflow doesn't clip it
  useLayoutEffect(() => {
    const updatePosition = () => {
      const rect = anchorEl.getBoundingClientRect();
      const width = popupRef.current?.offsetWidth || 280;
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
      setPosition({ top: rect.bottom + 6, left });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [anchorEl]);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popupRef.current?.contains(target) || anchorEl.contains(target)) return;
      onClose();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [anchorEl, onClose]);

  const toggleDate = (key: string) => {
    onChange(selectedDates.includes(key)
      ? selectedDates.filter(d => d !== key)
      : [...selectedDates, key].sort());
  };

  const shiftMonth = (delta: number) => {
    setViewMonth(({ year, month }) => {
      const d = new Date(year, month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  const { year, month } = viewMonth;
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return createPortal(
    <div
      ref={popupRef}
      className="fixed z-50 w-[280px] rounded-lg border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-800"
      style={{ top: position.top, left: position.left }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          className="rounded px-2 py-1 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
          aria-label="Previous month"
        >
          ‹
        </button>
        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {MONTHS[month]} {year}
        </span>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          className="rounded px-2 py-1 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {WEEKDAYS.map(d => (
          <div key={d} className="py-1 font-medium text-gray-500 dark:text-gray-400">{d}</div>
        ))}
        {cells.map((day, idx) => {
          if (day === null) return <div key={`blank-${idx}`} />;
          const key = formatKey(year, month, day);
          const isAvailable = availableDates.has(key);
          const isSelected = selectedDates.includes(key);
          let cls = 'cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500';
          if (isSelected) {
            cls = 'bg-green-600 text-white font-semibold ring-2 ring-green-700 hover:bg-green-700';
          } else if (isAvailable) {
            cls = 'bg-green-100 text-green-800 font-medium hover:bg-green-200 dark:bg-green-900/40 dark:text-green-300';
          }
          return (
            <button
              key={key}
              type="button"
              disabled={!isAvailable && !isSelected}
              onClick={() => toggleDate(key)}
              className={`rounded py-1.5 ${cls}`}
            >
              {day}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-gray-200 pt-2 dark:border-gray-700">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {selectedDates.length > 0 ? `${selectedDates.length} date(s) selected` : 'Click dates to filter'}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onChange([])}
            disabled={selectedDates.length === 0}
            className="rounded px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 disabled:opacity-40 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-brand-500 px-3 py-1 text-xs text-white hover:bg-brand-600"
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default DateFilterCalendar;
