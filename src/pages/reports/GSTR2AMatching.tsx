import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import useGoBack from '../../hooks/useGoBack';
import useAuth from '../../hooks/useAuth';
import Gstr2aSection from './gst/Gstr2aSection';
import GstAuthPanel from './gst/GstAuthPanel';
import PortalViewer, { GSTR1_TABS, GSTR2B_TABS } from './gst/PortalViewer';
import Gstr1Upload from './gst/Gstr1Upload';
import Gstr3bUpload from './gst/Gstr3bUpload';

const SECTIONS = [
  { key: 'gstr2a', label: 'GSTR-2A Matching' },
  { key: 'gstr1-view', label: 'GSTR-1 Portal Viewer' },
  { key: 'gstr2b-view', label: 'GSTR-2B Portal Viewer' },
  { key: 'gstr1-upload', label: 'GSTR-1 Upload & File' },
  { key: 'gstr3b-upload', label: 'GSTR-3B Upload & File' },
] as const;
type SectionKey = (typeof SECTIONS)[number]['key'];

// GST reports page: the original GSTR-2A matching plus the GSTR-1 / GSTR-2B portal viewers and the
// GSTR-1 / GSTR-3B upload & filing tools (ported from the VFP programs).
const GSTR2AMatching: React.FC = () => {
  const goBack = useGoBack();
  const { user } = useAuth();
  const hasAdminAccess = Boolean(user?.routeAccess?.includes('Admin'));
  const [params, setParams] = useSearchParams();
  const initial = (SECTIONS.find((s) => s.key === params.get('tab'))?.key || 'gstr2a') as SectionKey;
  const [active, setActive] = useState<SectionKey>(initial);
  // sections stay mounted once opened so switching tabs keeps their data
  const [visited, setVisited] = useState<Set<SectionKey>>(new Set([initial]));

  const open = (key: SectionKey) => {
    setActive(key);
    setVisited((v) => new Set(v).add(key));
    setParams(key === 'gstr2a' ? {} : { tab: key }, { replace: true });
  };

  const header = (
    <div className="mb-4 flex items-center">
      <button
        onClick={goBack}
        className="mr-4 p-2 text-gray-600 transition-colors hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
        title="Go back"
      >
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <h1 className="text-2xl font-bold text-gray-800 dark:text-white">GSTR2A Matching Report</h1>
    </div>
  );

  if (!hasAdminAccess) {
    return (
      <div className="container mx-auto p-4">
        {header}
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center dark:border-red-800 dark:bg-red-900/20">
          <h2 className="mb-2 text-xl font-semibold text-red-800 dark:text-red-200">Access Denied</h2>
          <p className="mb-4 text-red-600 dark:text-red-300">
            You don't have permission to access this report. This report is restricted to admin users only.
          </p>
          <p className="text-sm text-red-500 dark:text-red-400">Please contact your administrator if you believe you should have access to this report.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      {header}

      <div className="mb-4 flex flex-wrap gap-1 border-b border-gray-200 dark:border-gray-700">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            onClick={() => open(s.key)}
            className={`-mb-px rounded-t border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              active === s.key
                ? 'border-blue-600 bg-white text-blue-700 dark:bg-gray-800 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {active !== 'gstr2a' && <GstAuthPanel />}

      <div className={active === 'gstr2a' ? '' : 'hidden'}>{visited.has('gstr2a') && <Gstr2aSection />}</div>
      <div className={active === 'gstr1-view' ? '' : 'hidden'}>
        {visited.has('gstr1-view') && (
          <PortalViewer
            kind="gstr1"
            title="GSTR-1 Portal Data Viewer"
            tabs={GSTR1_TABS}
            matchHelp="Match records compares the portal data with the system exports B2B.CSV, cdnr.csv, b2cs.csv, hsn(b2b).csv and hsn(b2c).csv (by invoice / note number + rate, POS + rate, HSN + rate; tolerance ₹1)."
          />
        )}
      </div>
      <div className={active === 'gstr2b-view' ? '' : 'hidden'}>
        {visited.has('gstr2b-view') && (
          <PortalViewer
            kind="gstr2b"
            title="GSTR-2B Portal Data Viewer"
            tabs={GSTR2B_TABS}
            matchHelp="Match records compares GSTR-2B with the purchase entries in CASH (bill number match; invoice value, taxable, IGST, CGST and bill date; tolerance ₹1). PB bills of the selected periods that are not in GSTR-2B are added as “Missing Portal”."
          />
        )}
      </div>
      <div className={active === 'gstr1-upload' ? '' : 'hidden'}>{visited.has('gstr1-upload') && <Gstr1Upload />}</div>
      <div className={active === 'gstr3b-upload' ? '' : 'hidden'}>{visited.has('gstr3b-upload') && <Gstr3bUpload />}</div>
    </div>
  );
};

export default GSTR2AMatching;
