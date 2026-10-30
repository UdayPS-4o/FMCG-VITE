import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import './godownTransfer.css';

interface Props {
  fromCode: string;
  fromName: string;
  toCode: string;
  toName: string;
  docNo: string;
  itemCount: number;
  onNewTransfer: () => void;
  onViewTransfers: () => void;
}

type Phase = 'load' | 'drive' | 'unload' | 'done';

const TRUCK_START = 110;
const TRUCK_END = 520;

// Same artwork as the approved preview: warehouse → road → warehouse, truck in brand colour.
const TransferSuccess = ({ fromCode, fromName, toCode, toName, docNo, itemCount, onNewTransfer, onViewTransfers }: Props) => {
  const [phase, setPhase] = useState<Phase>('load');

  // Always plays (even with OS "reduce motion" on): the truck trip is the confirmation the user asked for
  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase('drive'), 700),
      setTimeout(() => setPhase('unload'), 700 + 2700),
      setTimeout(() => setPhase('done'), 700 + 2700 + 900),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  const truckX = phase === 'load' ? TRUCK_START : TRUCK_END;
  const cratesVisible = phase === 'load' || phase === 'drive';
  const parked = phase === 'unload' || phase === 'done';

  const statusText = {
    load: `Loading goods at godown ${fromCode}…`,
    drive: `On the way: ${fromCode} → ${toCode}`,
    unload: `Unloading at godown ${toCode}…`,
    done: '',
  }[phase];

  return createPortal(
    <div
      className="gt-overlay fixed inset-0 z-[100000] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Godown transfer saved"
    >
      <div className="gt-sheet w-full sm:w-[min(860px,94vw)] bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl shadow-2xl px-2.5 pt-3.5 pb-6 sm:p-6 text-center">
        <svg className={`gt-scene ${parked ? 'is-parked' : ''} w-full h-auto block rounded-xl overflow-hidden`} viewBox="0 0 800 300">
          <defs>
            <linearGradient id="gt-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" className="gt-sky-top" />
              <stop offset="1" className="gt-sky-bottom" />
            </linearGradient>
          </defs>
          <rect width="800" height="300" fill="url(#gt-sky)" />
          <circle cx="680" cy="60" r="26" fill="#ffd36b" opacity=".9" />
          <g className="gt-cloud" opacity=".5">
            <ellipse cx="80" cy="60" rx="38" ry="12" fill="#fff" />
            <ellipse cx="105" cy="52" rx="24" ry="12" fill="#fff" />
          </g>
          <g className="gt-cloud c2" opacity=".35">
            <ellipse cx="60" cy="95" rx="30" ry="9" fill="#fff" />
          </g>

          {/* hills + road */}
          <path d="M0 200 Q120 150 240 195 T480 190 T800 185 V300 H0Z" fill="#2c6b4a" />
          <rect y="215" width="800" height="55" fill="#2b2b33" />
          <line className="gt-road-dash" x1="0" y1="242" x2="800" y2="242" stroke="#f5d98a" strokeWidth="4" strokeDasharray="22 18" />
          <rect y="270" width="800" height="30" fill="#24573c" />

          {/* From warehouse */}
          <g transform="translate(20,95)">
            <path d="M0 50 L70 10 L140 50 V125 H0Z" fill="#c9cbd6" />
            <path d="M-6 52 L70 6 L146 52" fill="none" stroke="#8b2e2e" strokeWidth="10" strokeLinejoin="round" />
            <rect x="35" y="65" width="70" height="60" fill="#5a5f73" />
            <g stroke="#454a5c" strokeWidth="2">
              <line x1="35" y1="77" x2="105" y2="77" />
              <line x1="35" y1="89" x2="105" y2="89" />
              <line x1="35" y1="101" x2="105" y2="101" />
              <line x1="35" y1="113" x2="105" y2="113" />
            </g>
            <rect x="40" y="28" width="60" height="24" rx="4" fill="#1c1238" />
            <text x="70" y="46" textAnchor="middle" fontSize="17" fontWeight="800" fill="var(--color-brand-400)">{fromCode}</text>
          </g>
          <text x="90" y="292" textAnchor="middle" fontSize="14" fill="#e6fff0">{fromName}</text>

          {/* To warehouse */}
          <g transform="translate(640,95)">
            <path d="M0 50 L70 10 L140 50 V125 H0Z" fill="#c9cbd6" />
            <path d="M-6 52 L70 6 L146 52" fill="none" stroke="#1f5e8b" strokeWidth="10" strokeLinejoin="round" />
            <rect x="35" y="65" width="70" height="60" fill="#2b2f3d" />
            <rect
              className="gt-to-door"
              x="35" y="65" width="70" height="60" fill="#5a5f73"
              style={{ transform: parked ? 'translateY(-54px)' : 'none' }}
            />
            <rect x="40" y="28" width="60" height="24" rx="4" fill="#1c1238" />
            <text x="70" y="46" textAnchor="middle" fontSize="17" fontWeight="800" fill="var(--color-brand-400)">{toCode}</text>
          </g>
          <text x="710" y="292" textAnchor="middle" fontSize="14" fill="#e6fff0">{toName}</text>

          {/* Truck */}
          <g className="gt-truck" style={{ transform: `translateX(${truckX}px)` }}>
            <g className="gt-truck-body">
              <rect x="0" y="160" width="110" height="62" rx="4" fill="var(--color-brand-500)" />
              <text x="55" y="196" textAnchor="middle" fontSize="13" fontWeight="800" fill="#fff">EKTA</text>
              <g className="gt-crates" style={{ opacity: cratesVisible ? 1 : 0 }}>
                <rect x="8" y="146" width="22" height="16" fill="#a8742a" stroke="#6e4a17" />
                <rect x="34" y="146" width="22" height="16" fill="#b9843a" stroke="#6e4a17" />
                <rect x="60" y="146" width="22" height="16" fill="#a8742a" stroke="#6e4a17" />
                <rect x="21" y="132" width="22" height="16" fill="#c49548" stroke="#6e4a17" />
                <rect x="47" y="132" width="22" height="16" fill="#a8742a" stroke="#6e4a17" />
              </g>
              <path d="M112 178 H150 L168 198 V222 H112Z" fill="#e8e8f0" />
              <path d="M120 183 H146 L159 198 H120Z" fill="#7fc4ff" />
              <rect x="164" y="208" width="6" height="6" fill="#ffd36b" />
            </g>
            <g fill="#cfcfe0">
              <circle className="gt-puff" cx="-4" cy="214" r="6" />
              <circle className="gt-puff p2" cx="-4" cy="214" r="6" />
              <circle className="gt-puff p3" cx="-4" cy="214" r="6" />
            </g>
            <g className="gt-wheel">
              <circle cx="28" cy="224" r="13" fill="#15151b" />
              <circle cx="28" cy="224" r="5" fill="#9a9aab" />
              <rect x="26.5" y="212" width="3" height="8" fill="#9a9aab" />
            </g>
            <g className="gt-wheel">
              <circle cx="140" cy="224" r="13" fill="#15151b" />
              <circle cx="140" cy="224" r="5" fill="#9a9aab" />
              <rect x="138.5" y="212" width="3" height="8" fill="#9a9aab" />
            </g>
          </g>
        </svg>

        {phase !== 'done' ? (
          <p className="mt-4 min-h-6 text-base text-gray-500 dark:text-gray-400" aria-live="polite">{statusText}</p>
        ) : (
          <div className="mt-2 flex flex-col items-center gap-2.5" aria-live="polite">
            <svg width="96" height="96" viewBox="0 0 100 100" className="gt-tick">
              <circle cx="50" cy="50" r="45" fill="rgba(34,197,94,.12)" stroke="#22c55e" strokeWidth="6" className="gt-tick-circle" transform="rotate(-90 50 50)" />
              <path d="M30 52 L45 66 L71 37" fill="none" stroke="#22c55e" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" className="gt-tick-mark" />
            </svg>
            <h2 className="m-0 text-2xl font-bold text-green-500">Transfer Saved</h2>
            <p className="m-0 text-gray-500 dark:text-gray-400">
              {docNo} · {itemCount} item{itemCount === 1 ? '' : 's'} moved from {fromCode} → {toCode}
            </p>
            <div className="mt-2 flex w-full sm:w-auto gap-2.5">
              <button
                type="button"
                onClick={onViewTransfers}
                className="flex-1 sm:flex-none px-5 py-3 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                View Transfers
              </button>
              <button
                type="button"
                autoFocus
                onClick={onNewTransfer}
                className="flex-1 sm:flex-none px-5 py-3 rounded-lg bg-brand-500 text-white font-semibold hover:bg-brand-600"
              >
                New Transfer
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default TransferSuccess;
