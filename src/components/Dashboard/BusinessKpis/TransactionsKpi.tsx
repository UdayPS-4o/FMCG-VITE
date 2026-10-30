import React, { useMemo, useState } from 'react';
import {
  CountUp,
  EmptyState,
  KpiCard,
  DaysInput,
  RANGE_KEYS,
  RangeData,
  RangeKey,
  SearchBox,
  Segmented,
  inr,
  inrCompact,
  shortDate,
  rangeLabel,
  useKpiData,
  useRangeDays,
} from './shared';

export type TransactionKpiId = 'sales' | 'cash' | 'cheque' | 'due';

interface TxnRow {
  date: string;
  billNo?: string;
  billDate?: string;
  voucher?: string;
  party: string;
  remark?: string;
  amount: number;
  cash?: boolean;
}

const CASH_COLOR = '#16a34a';
const CREDIT_COLOR = '#f97316';

interface Props {
  id: TransactionKpiId;
  title: string;
  color: string;
  icon: React.ReactNode;
}

const TransactionsKpi: React.FC<Props> = ({ id, title, color, icon }) => {
  const [days, setDays] = useRangeDays(id);
  const { data, loading, error } = useKpiData<RangeData<TxnRow>>(id, days);
  const [range, setRange] = useState<RangeKey>('today');
  const [query, setQuery] = useState('');

  const bucket = data?.[range];
  const rows = useMemo(() => {
    const list = bucket?.rows ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) =>
      [r.party, r.remark, r.billNo, r.voucher].some((v) => v && v.toLowerCase().includes(q))
    );
  }, [bucket, query]);

  const split = useMemo(() => {
    if (id !== 'sales' || !bucket) return null;
    const cash = bucket.rows.filter((r) => r.cash).reduce((s, r) => s + r.amount, 0);
    return { cash, credit: bucket.total - cash };
  }, [id, bucket]);

  const refLabel = id === 'due' ? 'Bill' : id === 'sales' ? 'Bill No' : 'Voucher';
  const dateLabel = id === 'due' ? 'Due' : 'Date';
  const countNoun = id === 'sales' || id === 'due' ? 'bills' : 'receipts';

  return (
    <KpiCard
      title={title}
      color={color}
      icon={icon}
      loading={loading}
      error={error}
      hasData={!!data}
      subtitle={id === 'due' ? 'Unpaid bills falling due' : id === 'sales' ? 'Bills raised' : 'Receipts collected'}
    >
      <Segmented
        value={range}
        onChange={setRange}
        color={color}
        options={RANGE_KEYS.map((k) => ({
          key: k,
          label: k === 'lastN' ? <DaysInput days={days} onChange={setDays} onFocus={() => setRange('lastN')} /> : rangeLabel(k, days),
          badge: data?.[k].count ?? 0,
        }))}
      />

      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-3xl font-bold tracking-tight" style={{ color }}>
            <CountUp value={bucket?.total ?? 0} format={inr} />
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            <CountUp value={bucket?.count ?? 0} /> {countNoun} · {rangeLabel(range, days).toLowerCase()}
          </div>
        </div>
        {split && bucket && bucket.total > 0 && (
          <div className="min-w-[180px] flex-1 sm:max-w-[260px]">
            <div className="mb-1 flex justify-between text-[11px] font-medium">
              <span style={{ color: CASH_COLOR }}>Cash <CountUp value={split.cash} format={inrCompact} /></span>
              <span style={{ color: CREDIT_COLOR }}>Credit <CountUp value={split.credit} format={inrCompact} /></span>
            </div>
            <div className="kpi-bar-grow flex h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
              <div className="kpi-width-anim" style={{ width: `${(split.cash / bucket.total) * 100}%`, background: CASH_COLOR }} />
              <div className="kpi-width-anim" style={{ width: `${(split.credit / bucket.total) * 100}%`, background: CREDIT_COLOR }} />
            </div>
          </div>
        )}
      </div>

      {(bucket?.count ?? 0) > 0 && (
        <div className="mt-3">
          <SearchBox value={query} onChange={setQuery} placeholder="Search party, bill, remark…" />
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState text={query ? 'No matching entries' : `No ${countNoun} for ${rangeLabel(range, days).toLowerCase()}`} />
      ) : (
        <div className="mt-3 max-h-80 min-h-0 flex-1 overflow-auto rounded-xl border border-gray-100 dark:border-gray-800">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-[1] bg-gray-50 text-[11px] tracking-wide text-gray-500 uppercase dark:bg-gray-900 dark:text-gray-400">
              <tr>
                <th className="px-3 py-2 text-left font-medium">{dateLabel}</th>
                <th className="px-3 py-2 text-left font-medium">{refLabel}</th>
                <th className="px-3 py-2 text-left font-medium">{id === 'cash' || id === 'cheque' ? 'Party / Remark' : 'Party'}</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {rows.map((r, i) => (
                <tr key={`${r.billNo || r.voucher}-${r.date}-${i}`} className="hover:bg-gray-50 dark:hover:bg-white/[0.03]">
                  <td className="px-3 py-2 whitespace-nowrap text-gray-500 dark:text-gray-400">{shortDate(r.date)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5 font-medium text-gray-700 dark:text-gray-200">
                      {id === 'sales' && (
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: r.cash ? CASH_COLOR : CREDIT_COLOR }}
                          title={r.cash ? 'Cash bill' : 'Credit bill'}
                        />
                      )}
                      {r.billNo || r.voucher}
                    </span>
                    {id === 'due' && r.billDate && (
                      <div className="text-[10px] text-gray-400">billed {shortDate(r.billDate)}</div>
                    )}
                  </td>
                  <td className="max-w-[16rem] px-3 py-2">
                    <div className="truncate text-gray-700 dark:text-gray-200" title={r.party || r.remark}>
                      {r.party || r.remark || '—'}
                    </div>
                    {r.party && r.remark && (
                      <div className="truncate text-[11px] text-gray-400" title={r.remark}>
                        {r.remark}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold whitespace-nowrap text-gray-800 dark:text-white/90">
                    {inr(r.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </KpiCard>
  );
};

export default TransactionsKpi;
