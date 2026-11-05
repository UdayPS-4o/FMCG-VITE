import React, { useEffect, useState } from 'react';
import constants from '../../constants';

export interface SalesmanOption {
  value: string; // SM code, e.g. SM003
  name: string;  // salesman name without the code
}

export interface SalesmanStats {
  count: number;
  amount: number;
}

interface SalesmanFilterChipsProps {
  options: SalesmanOption[];
  stats: Record<string, SalesmanStats>; // per SM code, for the rows matching the other filters
  selected: string[];
  onChange: (selected: string[]) => void;
}

// Latest attendance selfie per SM code — fetched once and shared by every table on the page
let avatarRequest: Promise<Record<string, string>> | null = null;
const loadSalesmanAvatars = () => {
  if (!avatarRequest) {
    const token = localStorage.getItem('token');
    avatarRequest = fetch(`${constants.baseURL}/api/attendance/sm-avatars`, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
    })
      .then(res => (res.ok ? res.json() : { avatars: {} }))
      .then(data => (data && data.avatars) || {})
      .catch(() => {
        avatarRequest = null; // allow a retry on the next mount
        return {};
      });
  }
  return avatarRequest;
};

const formatAmount = (amount: number) =>
  `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const SalesmanFilterChips: React.FC<SalesmanFilterChipsProps> = ({ options, stats, selected, onChange }) => {
  const [avatars, setAvatars] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    loadSalesmanAvatars().then(map => { if (active) setAvatars(map); });
    return () => { active = false; };
  }, []);

  if (options.length < 2) return null;

  const toggle = (sm: string) => {
    onChange(selected.includes(sm) ? selected.filter(s => s !== sm) : [...selected, sm]);
  };

  const totalCount = options.reduce((sum, o) => sum + (stats[o.value]?.count || 0), 0);
  const totalAmount = options.reduce((sum, o) => sum + (stats[o.value]?.amount || 0), 0);
  const allSelected = selected.length === 0;

  const chipClass = (isOn: boolean) =>
    `flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-xs transition-colors ${
      isOn
        ? 'border-green-600 bg-green-50 text-green-800 ring-1 ring-green-600 dark:bg-green-900/40 dark:text-green-200'
        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
    }`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className={chipClass(allSelected)} onClick={() => onChange([])} title="Show all salesmen">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-base dark:bg-gray-600">👥</span>
        <span className="flex flex-col items-start leading-tight">
          <span className="font-medium">All</span>
          <span className="text-[11px] opacity-80">{totalCount} · {formatAmount(totalAmount)}</span>
        </span>
      </button>

      {options.map(option => {
        const isOn = selected.includes(option.value);
        const stat = stats[option.value] || { count: 0, amount: 0 };
        const avatar = avatars[option.value];
        return (
          <button
            key={option.value}
            type="button"
            className={chipClass(isOn)}
            onClick={() => toggle(option.value)}
            title={option.name ? `${option.value} (${option.name})` : option.value}
          >
            {avatar ? (
              <img src={avatar} alt="" className="h-8 w-8 rounded-full object-cover" />
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-base dark:bg-gray-600">🧑‍💼</span>
            )}
            <span className="flex flex-col items-start leading-tight">
              <span className="font-medium">
                {option.value}{option.name ? ` · ${option.name}` : ''}
              </span>
              <span className="text-[11px] opacity-80">{stat.count} · {formatAmount(stat.amount)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
};

export default SalesmanFilterChips;
