import { useState, useEffect } from 'react';
import PageMeta from "../../components/common/PageMeta";
import { DashboardSkeletonLoader } from "../../components/ui/skeleton/SkeletonLoader";
import KpiBoard from "../../components/Dashboard/BusinessKpis/KpiBoard";

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
          title=" Dashboard | Ekta-Enterprises "
          description="This is Dashboard page for Ekta-Enterprises Admin Dashboard Template"
        />
        <DashboardSkeletonLoader />
      </>
    );
  }

  return (
    <>
      <PageMeta
        title="Dashboard | Ekta-Enterprises "
        description="This is Dashboard page for Ekta-Enterprises Admin Dashboard Template"
      />
      <KpiBoard />
    </>
  );
}
