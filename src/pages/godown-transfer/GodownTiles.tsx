import { forwardRef, useImperativeHandle, useRef } from 'react';
import './godownTransfer.css';

export interface GodownOption {
  GDN_CODE: string;
  GDN_NAME: string;
}

export interface GodownTilesRefHandle {
  focus: () => void;
}

interface Props {
  id: string;
  step: number;
  label: string;
  godowns: GodownOption[];
  value: string;
  onChange: (code: string) => void;
  disabledCodes?: string[];
  hint?: string;
  emptyText?: string;
}

const WarehouseIcon = () => (
  <svg viewBox="0 0 80 62" className="w-[52px] h-[40px] sm:w-[70px] sm:h-[54px] mx-auto mb-1.5" aria-hidden="true">
    <path d="M4 24 L40 4 L76 24 V60 H4Z" fill="#c9cbd6" />
    <path d="M1 25 L40 2 L79 25" fill="none" stroke="var(--color-brand-500)" strokeWidth="5" strokeLinejoin="round" />
    <rect x="22" y="32" width="36" height="28" fill="#5a5f73" />
    <g stroke="#454a5c" strokeWidth="1.5">
      <line x1="22" y1="39" x2="58" y2="39" />
      <line x1="22" y1="46" x2="58" y2="46" />
      <line x1="22" y1="53" x2="58" y2="53" />
    </g>
    <rect className="gt-door" x="22" y="32" width="36" height="9" fill="#3a3f52" />
    <rect x="8" y="46" width="10" height="8" fill="#a8742a" />
    <rect x="62" y="46" width="10" height="8" fill="#a8742a" />
  </svg>
);

const GodownTiles = forwardRef<GodownTilesRefHandle, Props>(({
  id,
  step,
  label,
  godowns,
  value,
  onChange,
  disabledCodes = [],
  hint,
  emptyText = 'No godowns available',
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => {
      const root = containerRef.current;
      if (!root) return;
      const target = root.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')
        || root.querySelector<HTMLButtonElement>('button:not(:disabled)');
      target?.focus();
      target?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    },
  }));

  // Left/Right arrows move between tiles
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const buttons = Array.from(containerRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || []);
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (current === -1) return;
    e.preventDefault();
    const next = buttons[(current + (e.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length];
    next.focus();
    next.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  };

  return (
    <div id={id}>
      <div className="flex items-center gap-2.5 mb-3">
        <span className="w-6 h-6 rounded-full bg-brand-500/15 text-brand-500 grid place-items-center text-xs font-bold">{step}</span>
        <span className="text-base font-semibold text-gray-800 dark:text-white">{label}</span>
        {hint && <span className="text-xs text-gray-500 dark:text-gray-400">{hint}</span>}
      </div>

      {godowns.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">{emptyText}</p>
      ) : (
        <div
          ref={containerRef}
          role="group"
          aria-label={label}
          onKeyDown={handleKeyDown}
          className="gt-tiles flex gap-2.5 sm:gap-3.5 overflow-x-auto snap-x snap-mandatory -mx-4 px-4 pt-1.5 pb-3 sm:mx-0 sm:px-0 sm:flex-wrap sm:overflow-visible"
        >
          {godowns.map((g) => {
            const selected = value === g.GDN_CODE;
            const disabled = disabledCodes.includes(g.GDN_CODE);
            return (
              <button
                key={g.GDN_CODE}
                type="button"
                aria-pressed={selected}
                disabled={disabled}
                title={`${g.GDN_CODE} · ${g.GDN_NAME}`}
                onClick={() => onChange(g.GDN_CODE)}
                className={`gt-tile ${selected ? 'is-selected' : ''} relative snap-start shrink-0 w-[104px] sm:w-[148px] rounded-xl border-2 px-1.5 pt-2.5 pb-2 sm:px-3 sm:pt-3.5 sm:pb-3 text-center
                  bg-gray-50 dark:bg-gray-900 transition-all duration-200 outline-none
                  focus-visible:ring-4 focus-visible:ring-brand-500/30
                  ${selected
                    ? 'border-brand-500 ring-4 ring-brand-500/20 shadow-lg -translate-y-0.5'
                    : 'border-gray-200 dark:border-gray-700 hover:border-brand-300 sm:hover:-translate-y-0.5'}
                  ${disabled ? 'opacity-30 grayscale cursor-not-allowed hover:border-gray-200 hover:translate-y-0' : 'cursor-pointer'}`}
              >
                <span className="gt-check absolute top-2 right-2 w-5 h-5 rounded-full bg-brand-500 text-white text-xs font-black grid place-items-center">✓</span>
                <WarehouseIcon />
                <div className="text-lg sm:text-[22px] leading-none font-extrabold text-brand-500">{g.GDN_CODE}</div>
                <div className="mt-1 text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 truncate">{g.GDN_NAME}</div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});

export default GodownTiles;
