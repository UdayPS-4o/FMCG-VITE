import React, { useState, useEffect } from 'react';
import TodaysSales from "../../components/Dashboard/TodaysSales";
import TodaysCollections from "../../components/Dashboard/TodaysCollections";
import BalanceUddhari from "../../components/Dashboard/BalanceUddhari";


import PageMeta from "../../components/common/PageMeta";
import { DashboardSkeletonLoader } from "../../components/ui/skeleton/SkeletonLoader";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { useAuth } from "../../contexts/AuthContext";
import { fetchWithAuth } from "../../lib/api";
import { Loader2, ChevronDown, ChevronRight } from "lucide-react";

// New KPI component: Unbilled Customers
const UnbilledCustomersKPI: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSubgroups, setExpandedSubgroups] = useState<Set<string>>(new Set());
  const [data, setData] = useState<{
    subgroups: Array<{
      title: string;
      subgroupCode: string;
      prefix: string;
      last7: { code: string; name: string; lastBillDate: string; daysSince: number | null }[];
      last15: { code: string; name: string; lastBillDate: string; daysSince: number | null }[];
      last30: { code: string; name: string; lastBillDate: string; daysSince: number | null }[];
      counts: { last7: number; last15: number; last30: number; total: number };
    }>;
  } | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetchWithAuth(`/api/dashboard/unbilled-customers`);
        if (!res.ok) throw new Error('Failed to fetch');
        const json = await res.json();
        setData(json);
      } catch (e) {
        console.error('Failed to load unbilled customers', e);
        setError('Failed to load unbilled customers');
      } finally {
        setLoading(false);
      }
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify((user as any)?.subgroup || null)]);

  const toggleSubgroup = (subgroupCode: string) => {
    const newExpanded = new Set(expandedSubgroups);
    if (newExpanded.has(subgroupCode)) {
      newExpanded.delete(subgroupCode);
    } else {
      newExpanded.add(subgroupCode);
    }
    setExpandedSubgroups(newExpanded);
  };

  const Column: React.FC<{ title: string; items: any[]; count?: number }> = ({ title, items, count }) => (
    <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800 bg-white dark:bg-white/[0.03]">
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-semibold text-gray-800 dark:text-white/90">{title}</h4>
        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">{count ?? items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No customers</p>
      ) : (
        <ul className="space-y-1 max-h-64 overflow-auto pr-1">
          {items.slice(0, 50).map((c) => (
            <li key={`${c.code}-${c.lastBillDate}-${c.name}`} className="flex items-center justify-between text-sm">
              <span className="truncate mr-2" title={c.name}>{c.name}</span>
              <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap" title={`Last bill: ${c.lastBillDate}`}>{c.lastBillDate}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const SubgroupSection: React.FC<{ subgroup: any }> = ({ subgroup }) => {
    const isExpanded = expandedSubgroups.has(subgroup.subgroupCode);
    
    return (
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg mb-4">
        <div 
          className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
          onClick={() => toggleSubgroup(subgroup.subgroupCode)}
        >
          <div className="flex items-center gap-3">
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-gray-500" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-500" />
            )}
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">{subgroup.title}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">{subgroup.subgroupCode}</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-300">
            <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 px-2 py-1 rounded-full text-xs">
              7d: {subgroup.counts.last7}
            </span>
            <span className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 px-2 py-1 rounded-full text-xs">
              15d: {subgroup.counts.last15}
            </span>
            <span className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 px-2 py-1 rounded-full text-xs">
              30d: {subgroup.counts.last30}
            </span>
            <span className="bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300 px-2 py-1 rounded-full text-xs font-medium">
              Total: {subgroup.counts.total}
            </span>
          </div>
        </div>
        
        {isExpanded && (
          <div className="border-t border-gray-200 dark:border-gray-700 p-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Column title="Last 7 Days" items={subgroup.last7} count={subgroup.counts.last7} />
              <Column title="Last 15 Days" items={subgroup.last15} count={subgroup.counts.last15} />
              <Column title="Last 30 Days" items={subgroup.last30} count={subgroup.counts.last30} />
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <Card className="rounded-2xl border border-gray-200 dark:border-gray-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Unbilled Customers by Subgroup</CardTitle>
          {data?.subgroups && (
            <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
              <span>Subgroups: {data.subgroups.length}</span>
              <span>Total: {data.subgroups.reduce((sum, sg) => sum + sg.counts.total, 0)}</span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-500">
            <Loader2 className="animate-spin mr-2" size={16} /> Loading...
          </div>
        ) : error ? (
          <div className="text-sm text-red-600">{error}</div>
        ) : data?.subgroups && data.subgroups.length > 0 ? (
          <div className="space-y-0">
            {data.subgroups.map((subgroup) => (
              <SubgroupSection key={subgroup.subgroupCode} subgroup={subgroup} />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            <p>No unbilled customers found</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default function Home() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate loading delay for demo purposes
    const timer = setTimeout(() => {
      setLoading(false);
    }, 1500);
    
    return () => clearTimeout(timer);
  }, []);

  if (loading) {
    return (
      <>
        <PageMeta
          title="React.js Ecommerce Dashboard | Ekta-Enterprises - React.js Admin Dashboard Template"
          description="This is React.js Ecommerce Dashboard page for Ekta-Enterprises - React.js Tailwind CSS Admin Dashboard Template"
        />
        <DashboardSkeletonLoader />
      </>
    );
  }

  return (
    <>
      <PageMeta
        title="React.js Ecommerce Dashboard | Ekta-Enterprises - React.js Admin Dashboard Template"
        description="This is React.js Ecommerce Dashboard page for Ekta-Enterprises - React.js Tailwind CSS Admin Dashboard Template"
      />
      <div className="grid grid-cols-12 gap-4 md:gap-6">
        {/* Balance Uddhari KPI - Full width at top */}
        <div className="col-span-12">
          <BalanceUddhari />
        </div>

        {/* Today's Sales and Collections - Side by side */}
        <div className="col-span-12 lg:col-span-6">
          <TodaysSales />
        </div>

        <div className="col-span-12 lg:col-span-6">
          <TodaysCollections />
        </div>

        {/* Replace Customers/Orders metrics with Unbilled Customers KPI */}
        <div className="col-span-12">
          <UnbilledCustomersKPI />
        </div>
      </div>
    </>
  );
}
