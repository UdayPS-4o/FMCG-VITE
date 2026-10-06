import React, { useMemo, useState } from 'react';
import Chart from 'react-apexcharts';
import { ApexOptions } from 'apexcharts';
import { BarChart3, LineChart } from 'lucide-react';
import { EmptyState, KpiCard, Segmented, escapeHtml, inr, inrAxis, inrCompact, useKpiData } from './shared';

interface CompanyAmount {
  company: string;
  amount: number;
}
interface TrendData {
  months: string[];
  monthly: {
    fy: string;
    values: number[];
    total: number;
    companies: CompanyAmount[][];
    totalCompanies: CompanyAmount[];
  };
  yearly: { fy: string; values: number[]; total: number; companies: CompanyAmount[][] }[];
}

const YEAR_COLORS = ['#cbd5e1', '#94a3b8', '#8b5cf6'];

const tooltipHtml = (title: string, companies: CompanyAmount[] | undefined, total: number, color: string) => {
  const rows = (companies ?? [])
    .map(
      (c) =>
        `<tr><td style="padding:2px 12px 2px 0;white-space:nowrap">${escapeHtml(c.company)}</td>` +
        `<td style="padding:2px 0;text-align:right;font-weight:600;color:#facc15">${inr(c.amount)}</td></tr>`
    )
    .join('');
  return (
    `<div style="background:rgba(15,23,42,.96);color:#fff;padding:10px 12px;border-radius:10px;font-size:11px;min-width:220px">` +
    `<div style="display:flex;align-items:center;gap:6px;font-weight:600;font-size:12px;margin-bottom:6px">` +
    `<span style="width:8px;height:8px;border-radius:2px;background:${color}"></span>${escapeHtml(title)}</div>` +
    `<table style="width:100%;border-collapse:collapse">${rows}` +
    `<tr style="border-top:1px solid #475569"><td style="padding-top:5px;color:#cbd5e1;font-weight:700">TOTAL</td>` +
    `<td style="padding-top:5px;text-align:right;font-weight:700;color:#4ade80">${inr(total)}</td></tr></table></div>`
  );
};

const TrendKpi: React.FC<{ title: string; color: string; icon: React.ReactNode }> = ({ title, color, icon }) => {
  const { data, loading, error } = useKpiData<TrendData>('trend');
  const [tab, setTab] = useState<'monthly' | 'yearly'>('monthly');
  const [yearlyType, setYearlyType] = useState<'bar' | 'line'>('bar');

  const monthlyOptions: ApexOptions | null = useMemo(() => {
    if (!data) return null;
    return {
      chart: { type: 'bar', fontFamily: 'Outfit, sans-serif', toolbar: { show: false } },
      colors: [color],
      plotOptions: { bar: { columnWidth: '55%', borderRadius: 6, borderRadiusApplication: 'end', dataLabels: { position: 'top' } } },
      dataLabels: {
        enabled: true,
        formatter: (v: number) => (v > 0 ? `${(v / 1e5).toFixed(1)}L` : ''),
        offsetY: -18,
        style: { fontSize: '10px', colors: ['#64748b'], fontWeight: 500 },
      },
      grid: { borderColor: '#e2e8f040', strokeDashArray: 4 },
      xaxis: { categories: data.months, axisBorder: { show: false }, axisTicks: { show: false }, labels: { style: { colors: '#64748b' } } },
      yaxis: { labels: { formatter: (v: number) => inrAxis(v), style: { colors: '#94a3b8' } } },
      fill: { type: 'gradient', gradient: { shade: 'light', type: 'vertical', opacityFrom: 1, opacityTo: 0.75, stops: [0, 100] } },
      tooltip: {
        custom: ({ dataPointIndex }: { dataPointIndex: number }) =>
          tooltipHtml(
            `${data.months[dataPointIndex]} · FY ${data.monthly.fy}`,
            data.monthly.companies[dataPointIndex],
            data.monthly.values[dataPointIndex],
            color
          ),
      },
    };
  }, [data, color]);

  const yearlyOptions: ApexOptions | null = useMemo(() => {
    if (!data) return null;
    return {
      chart: { type: yearlyType, fontFamily: 'Outfit, sans-serif', toolbar: { show: false } },
      colors: YEAR_COLORS,
      plotOptions: { bar: { columnWidth: '70%', borderRadius: 4, borderRadiusApplication: 'end' } },
      stroke: yearlyType === 'line' ? { width: 3, curve: 'smooth' } : { width: 0 },
      markers: { size: yearlyType === 'line' ? 4 : 0, hover: { size: 6 } },
      dataLabels: { enabled: false },
      legend: { position: 'top', horizontalAlign: 'right', fontSize: '12px', labels: { colors: '#64748b' } },
      grid: { borderColor: '#e2e8f040', strokeDashArray: 4 },
      xaxis: { categories: data.months, axisBorder: { show: false }, axisTicks: { show: false }, labels: { style: { colors: '#64748b' } } },
      yaxis: { labels: { formatter: (v: number) => inrAxis(v), style: { colors: '#94a3b8' } } },
      tooltip: {
        shared: false,
        intersect: yearlyType === 'bar',
        custom: ({ seriesIndex, dataPointIndex }: { seriesIndex: number; dataPointIndex: number }) => {
          const y = data.yearly[seriesIndex];
          return tooltipHtml(
            `${data.months[dataPointIndex]} · FY ${y.fy}`,
            y.companies[dataPointIndex],
            y.values[dataPointIndex],
            YEAR_COLORS[seriesIndex]
          );
        },
      },
    };
  }, [data, yearlyType]);

  const cur = data?.yearly[data.yearly.length - 1];
  const prev = data?.yearly[data.yearly.length - 2];
  // Compare completed months of the current FY against the same months of the previous FY
  const month = new Date().getMonth() + 1;
  const completedMonths = month >= 4 ? month - 4 : month + 8;
  const sumMonths = (values?: number[]) => (values ?? []).slice(0, completedMonths).reduce((s, v) => s + v, 0);
  const curCompleted = sumMonths(cur?.values);
  const prevCompleted = sumMonths(prev?.values);
  const growth = completedMonths > 0 && prevCompleted > 0 ? ((curCompleted - prevCompleted) / prevCompleted) * 100 : null;
  const growthPeriod = completedMonths > 0 && data ? `${data.months[0]}–${data.months[completedMonths - 1]}` : '';

  return (
    <KpiCard
      title={title}
      color={color}
      icon={icon}
      loading={loading}
      error={error}
      hasData={!!data}
      subtitle={data ? `FY ${data.monthly.fy} · hover bars for company split` : 'Monthly and yearly sales'}
      headerRight={
        data && (
          <div className="text-right">
            <div className="text-lg font-bold text-gray-800 dark:text-white/90">{inrCompact(data.monthly.total)}</div>
            {growth !== null && (
              <div className={`text-[11px] font-semibold ${growth >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {growth >= 0 ? '▲' : '▼'} {Math.abs(growth).toFixed(1)}% vs last FY ({growthPeriod})
              </div>
            )}
          </div>
        )
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[240px] flex-1">
          <Segmented
            value={tab}
            onChange={setTab}
            color={color}
            options={[
              { key: 'monthly', label: 'Monthly Trend (Apr–Mar)' },
              { key: 'yearly', label: 'Yearly Comparison' },
            ]}
          />
        </div>
        {tab === 'yearly' && (
          <div className="flex rounded-xl bg-gray-100 p-1 dark:bg-gray-900">
            {(['bar', 'line'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setYearlyType(t)}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                  yearlyType === t ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-white' : 'text-gray-500'
                }`}
              >
                {t === 'bar' ? <BarChart3 className="h-3.5 w-3.5" /> : <LineChart className="h-3.5 w-3.5" />}
                {t === 'bar' ? 'Bar' : 'Line'}
              </button>
            ))}
          </div>
        )}
      </div>

      {!data ? (
        <EmptyState />
      ) : tab === 'monthly' && monthlyOptions ? (
        <div className="mt-2 -mx-2">
          <Chart options={monthlyOptions} series={[{ name: 'Sales', data: data.monthly.values }]} type="bar" height={320} />
        </div>
      ) : yearlyOptions ? (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {data.yearly.map((y, i) => (
              <div key={y.fy} className="rounded-xl border border-gray-100 px-3 py-2 dark:border-gray-800">
                <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                  <span className="h-2 w-2 rounded-sm" style={{ background: YEAR_COLORS[i] }} /> FY {y.fy}
                </div>
                <div className="text-sm font-bold text-gray-800 dark:text-white/90">{inrCompact(y.total)}</div>
              </div>
            ))}
          </div>
          <div className="mt-1 -mx-2">
            <Chart
              key={yearlyType}
              options={yearlyOptions}
              series={data.yearly.map((y) => ({ name: `FY ${y.fy}`, data: y.values }))}
              type={yearlyType}
              height={300}
            />
          </div>
        </>
      ) : null}
    </KpiCard>
  );
};

export default TrendKpi;
