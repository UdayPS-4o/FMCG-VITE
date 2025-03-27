import React, { useState, useEffect } from 'react';
import EcommerceMetrics from "../../components/ecommerce/EcommerceMetrics";
import MonthlySalesChart from "../../components/ecommerce/MonthlySalesChart";
import StatisticsChart from "../../components/ecommerce/StatisticsChart";
import MonthlyTarget from "../../components/ecommerce/MonthlyTarget";
import RecentOrders from "../../components/ecommerce/RecentOrders";
import DemographicCard from "../../components/ecommerce/DemographicCard";
import PageMeta from "../../components/common/PageMeta";
import { DashboardSkeletonLoader } from "../../components/ui/skeleton/SkeletonLoader";

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
        <div className="col-span-12 space-y-6 xl:col-span-7">
          <EcommerceMetrics />

          <MonthlySalesChart />
        </div>

        <div className="col-span-12 xl:col-span-5">
          <MonthlyTarget />
        </div>

        <div className="col-span-12">
          <StatisticsChart />
        </div>

        <div className="col-span-12 xl:col-span-5">
          <DemographicCard />
        </div>

        <div className="col-span-12 xl:col-span-7">
          <RecentOrders />
        </div>
      </div>
    </>
  );
}
