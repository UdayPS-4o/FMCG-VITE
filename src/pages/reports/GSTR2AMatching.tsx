import React, { useState, useEffect } from 'react';
import Input from '../../components/form/input/Input';
import constants from '../../constants';
import useGoBack from '../../hooks/useGoBack';

// Define interfaces for GSTR2A data structures
interface GSTR2AB2BRecord {
  ctin: string;
  inum: string;
  idt: string;
  val: number;
  pos: string;
  rchrg: string;
  inv_typ: string;
  irn?: string;
  srctyp?: string;
  irngendate?: string;
  chksum?: string;
  itms: Array<{
    num: number;
    itm_det: {
      txval: number;
      rt: number;
      iamt: number;
      camt: number;
      samt: number;
      csamt: number;
    };
  }>;
}

interface GSTR2ACDNRecord {
  ctin: string;
  nt_num: string;
  nt_dt: string;
  val: number;
  pos: string;
  rchrg: string;
  inv_typ: string;
  irn?: string;
  srctyp?: string;
  irngendate?: string;
  chksum?: string;
  itms: Array<{
    num: number;
    itm_det: {
      txval: number;
      rt: number;
      iamt: number;
      camt: number;
      samt: number;
      csamt: number;
    };
  }>;
}

interface PurchaseRecord {
  PBILL: string;
  PBILLDATE: string;
  C_CST: string;
  N_B_AMT: number;
  C_CODE: string;
  PRODUCT: string;
  QTY: number;
  RATE: number;
  AMT: number;
  TOTAL_GST_AMOUNT: number;
  TOTAL_TAXABLE_VALUE: number;
  PURDTL_RECORDS: Array<{
    PBILL: string;
    C_CODE: string;
    DATE: string;
    CODE: string;
    PRODUCT: string;
    QTY: number;
    RATE: number;
    GST: number;
    [key: string]: any;
  }>;
  [key: string]: any;
}

interface ComparisonResult {
  invoiceNumber: string;
  invoiceDate: string;
  partyGST: string;
  invoiceValue: number;
  gstr2aTaxableValue?: number;
  purchaseTaxableValue?: number;
  gstr2aGSTAmount?: number;
  purchaseGSTAmount?: number;
  source: 'GSTR2A' | 'Purchase' | 'Both';
  status: 'Matched' | 'Mismatched' | 'Missing in GSTR2A' | 'Missing in Purchase';
  mismatchDetails?: string[];
  gstr2aRecord?: GSTR2AB2BRecord | GSTR2ACDNRecord;
  purchaseRecord?: PurchaseRecord;
}

const GSTR2AMatching: React.FC = () => {
  const goBack = useGoBack();
  
  // Custom back navigation for internal steps
  const handleBackNavigation = () => {
    if (currentStep === 'comparison') {
      setCurrentStep('display');
    } else if (currentStep === 'display') {
      setCurrentStep('input');
    } else if (currentStep === 'otp' || currentStep === 'download') {
      setCurrentStep('input');
    } else {
      goBack(); // Exit the report if on first step
    }
  };
  
  // State for month input and API flow
  const [month, setMonth] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<'input' | 'otp' | 'download' | 'display' | 'comparison'>('input');
  
  // OTP and authentication states
  const [otp, setOtp] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [otpRequested, setOtpRequested] = useState(false);
  
  // Data selection states
  const [selectedSections, setSelectedSections] = useState<{ b2b: boolean; cdn: boolean }>({ b2b: true, cdn: false });
  
  // Downloaded data states
  const [gstr2aB2BData, setGstr2aB2BData] = useState<GSTR2AB2BRecord[]>([]);
  const [gstr2aCDNData, setGstr2aCDNData] = useState<GSTR2ACDNRecord[]>([]);
  const [activeTab, setActiveTab] = useState<'b2b' | 'cdn'>('b2b');
  
  // Comparison states
  const [comparisonResults, setComparisonResults] = useState<ComparisonResult[]>([]);
  const [purchaseData, setPurchaseData] = useState<PurchaseRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('All');
  
  // Validate month format (MMYYYY)
  const validateMonth = (monthStr: string): boolean => {
    if (monthStr.length !== 6) return false;
    const month = parseInt(monthStr.substring(0, 2));
    const year = parseInt(monthStr.substring(2, 6));
    return month >= 1 && month <= 12 && year >= 2000 && year <= 2099;
  };
  
  // Handle OTP request
  const handleOTPRequest = async () => {
    if (!month || !validateMonth(month)) {
      setError('Please enter a valid month in MMYYYY format (e.g., 082025)');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${constants.baseURL}/api/reports/gst-otp-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          gstin: '23AJBPS6285R1ZF',
          username: 'ektaseoni123',
          aspid: '1672501821',
          password: 'sHUBHAM@288'
        })
      });
      
      const data = await response.json();
      
      if (data.status_cd === '1') {
        setOtpRequested(true);
        setCurrentStep('otp');
        alert('OTP has been sent to your registered mobile number.');
      } else {
        setError(data.error || 'Failed to request OTP. Please try again.');
      }
    } catch (err) {
      setError('Error requesting OTP. Please check your connection and try again.');
      console.error('OTP request error:', err);
    } finally {
      setLoading(false);
    }
  };
  
  // Handle auth token retrieval
  const handleAuthToken = async () => {
    if (!otp || otp.length !== 6) {
      setError('Please enter a valid 6-digit OTP');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${constants.baseURL}/api/reports/gst-auth-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          gstin: '23AJBPS6285R1ZF',
          username: 'ektaseoni123',
          otp: otp,
          aspid: '1672501821',
          password: 'sHUBHAM@288'
        })
      });
      
      const data = await response.json();
      
      if (data.status_cd === '1' && data.auth_token) {
        setAuthToken(data.auth_token);
        setCurrentStep('download');
      } else {
        setError(data.error?.message || 'Failed to authenticate. Please check your OTP and try again.');
      }
    } catch (err) {
      setError('Error during authentication. Please try again.');
      console.error('Auth token error:', err);
    } finally {
      setLoading(false);
    }
  };
  
  // Handle GSTR2A data download
  const handleDownloadGSTR2A = async () => {
    if (!selectedSections.b2b && !selectedSections.cdn) {
      setError('Please select at least one section (B2B or CDN)');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const downloadPromises = [];
      
      if (selectedSections.b2b) {
        const b2bPromise = fetch(`${constants.baseURL}/api/reports/gst-download-gstr2a`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({
            action: 'B2B',
            gstin: '23AJBPS6285R1ZF',
            ret_period: month,
            authtoken: authToken,
            username: 'ektaseoni123',
            aspid: '1672501821',
            password: 'sHUBHAM@288'
          })
        }).then(res => res.json());
        downloadPromises.push(b2bPromise);
      }
      
      if (selectedSections.cdn) {
        const cdnPromise = fetch(`${constants.baseURL}/api/reports/gst-download-gstr2a`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({
            action: 'CDN',
            gstin: '23AJBPS6285R1ZF',
            ret_period: month,
            authtoken: authToken,
            username: 'ektaseoni123',
            aspid: '1672501821',
            password: 'sHUBHAM@288'
          })
        }).then(res => res.json());
        downloadPromises.push(cdnPromise);
      }
      
      const results = await Promise.all(downloadPromises);
      
      let b2bIndex = 0;
      if (selectedSections.b2b) {
        const b2bResult = results[b2bIndex];
        if (b2bResult.status_cd === '1' && b2bResult.data) {
          const rawB2BData = b2bResult.data.b2b || [];
          // Flatten the nested structure: each supplier has an 'inv' array
          const flattenedB2BData = rawB2BData.flatMap((supplier: any) => 
            supplier.inv.map((invoice: any) => ({
              ...invoice,
              ctin: supplier.ctin
            }))
          );
          setGstr2aB2BData(flattenedB2BData);
          // Save to dedicated folder via backend API
          try {
            await fetch(`${constants.baseURL}/api/reports/gstr2a-save-file`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
              },
              body: JSON.stringify({
                month: month,
                fileType: 'B2B',
                data: b2bResult.data
              })
            });
            console.log(`B2B data saved to gstr2a-data/${month}/gstr2aB2B${month}.json`);
          } catch (saveError) {
            console.error('Error saving B2B file:', saveError);
            // Continue with the process even if save fails
          }
        } else {
          setError(`B2B data download failed: ${b2bResult.error?.message || 'Unknown error'}`);
          return;
        }
        b2bIndex++;
      }
      
      if (selectedSections.cdn) {
        const cdnResult = results[b2bIndex];
        if (cdnResult.status_cd === '1' && cdnResult.data) {
          const rawCDNData = cdnResult.data.cdn || [];
          // Flatten the nested structure: each supplier has an 'nt' array
          const flattenedCDNData = rawCDNData.flatMap((supplier: any) => 
            supplier.nt.map((note: any) => ({
              ...note,
              ctin: supplier.ctin
            }))
          );
          setGstr2aCDNData(flattenedCDNData);
          // Save to dedicated folder via backend API
          try {
            await fetch(`${constants.baseURL}/api/reports/gstr2a-save-file`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
              },
              body: JSON.stringify({
                month: month,
                fileType: 'CDN',
                data: cdnResult.data
              })
            });
            console.log(`CDN data saved to gstr2a-data/${month}/gstr2aCDN${month}.json`);
          } catch (saveError) {
            console.error('Error saving CDN file:', saveError);
            // Continue with the process even if save fails
          }
        } else {
          setError(`CDN data download failed: ${cdnResult.error?.message || 'Unknown error'}`);
          return;
        }
      }
      
      setCurrentStep('display');
    } catch (err) {
      setError('Error downloading GSTR2A data. Please try again.');
      console.error('Download error:', err);
    } finally {
      setLoading(false);
    }
  };
  
  // Load existing GSTR2A files and purchase data for comparison
  const handleLoadExistingData = async () => {
    if (!month || !validateMonth(month)) {
      setError('Please enter a valid month in MMYYYY format (e.g., 082025)');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      // Load existing GSTR2A JSON files from dedicated folder via backend API
      let b2bData = [];
      let cdnData = [];
      let filesFound = false;
      
      // Try to load B2B data
      try {
        const b2bResponse = await fetch(`${constants.baseURL}/api/reports/gstr2a-load-file/${month}/B2B`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        
        if (b2bResponse.ok) {
          const b2bJson = await b2bResponse.json();
          const rawB2BData = b2bJson.b2b || [];
          // Flatten the nested structure: each supplier has an 'inv' array
          b2bData = rawB2BData.flatMap((supplier: any) => 
            supplier.inv.map((invoice: any) => ({
              ...invoice,
              ctin: supplier.ctin
            }))
          );
          setGstr2aB2BData(b2bData);
          setSelectedSections(prev => ({ ...prev, b2b: true }));
          filesFound = true;
          console.log(`Loaded B2B data from gstr2a-data/${month}/gstr2aB2B${month}.json`);
        }
      } catch (b2bError) {
        console.log(`B2B file not found for month ${month}`);
      }
      
      // Try to load CDN data
      try {
        const cdnResponse = await fetch(`${constants.baseURL}/api/reports/gstr2a-load-file/${month}/CDN`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        
        if (cdnResponse.ok) {
          const cdnJson = await cdnResponse.json();
          const rawCDNData = cdnJson.cdn || [];
          // Flatten the nested structure: each supplier has an 'nt' array
          cdnData = rawCDNData.flatMap((supplier: any) => 
            supplier.nt.map((note: any) => ({
              ...note,
              ctin: supplier.ctin
            }))
          );
          setGstr2aCDNData(cdnData);
          setSelectedSections(prev => ({ ...prev, cdn: true }));
          filesFound = true;
          console.log(`Loaded CDN data from gstr2a-data/${month}/gstr2aCDN${month}.json`);
        }
      } catch (cdnError) {
        console.log(`CDN file not found for month ${month}`);
      }
      
      if (!filesFound) {
        setError(`No GSTR2A data files found for month ${month}. Please ensure files exist in the gstr2a-data/${month}/ folder or download them first.`);
        return;
      }
      
      setCurrentStep('display');
    } catch (err) {
      setError('Error loading GSTR2A data files. Please check if the files exist.');
      console.error('Load existing data error:', err);
    } finally {
      setLoading(false);
    }
  };
  
  // Handle purchase data loading and comparison
  const handleMatchRecords = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Load purchase data from server
      const response = await fetch(`${constants.baseURL}/api/reports/gstr2a-purchase-data?month=${month}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to load purchase data');
      }
      
      const purchaseData = await response.json();
      setPurchaseData(purchaseData);
      
      // Perform comparison
      const results = performComparison(gstr2aB2BData, gstr2aCDNData, purchaseData, month);
      setComparisonResults(results);
      setCurrentStep('comparison');
    } catch (err) {
      setError('Error loading purchase data or performing comparison.');
      console.error('Match records error:', err);
    } finally {
      setLoading(false);
    }
  };
  
  // Comparison logic
  const performComparison = (
    b2bData: GSTR2AB2BRecord[],
    cdnData: GSTR2ACDNRecord[],
    purchaseData: PurchaseRecord[],
    month: string
  ): ComparisonResult[] => {
    const results: ComparisonResult[] = [];
    const tolerance = 2.00; // Rs. 2.00 tolerance for value comparison
    
    // Filter purchase data for the selected month
    const monthYear = `${month.substring(0, 2)}-${month.substring(2, 6)}`;
    const filteredPurchaseData = purchaseData.filter(record => {
      if (!record.PBILLDATE) return false;
      const recordDate = new Date(record.PBILLDATE);
      const recordMonthYear = `${String(recordDate.getMonth() + 1).padStart(2, '0')}-${recordDate.getFullYear()}`;
      return recordMonthYear === monthYear;
    });
    
    // Create maps for quick lookup
    const gstr2aMap = new Map<string, GSTR2AB2BRecord | GSTR2ACDNRecord>();
    const purchaseMap = new Map<string, PurchaseRecord>();
    
    // Process B2B data
    b2bData.forEach(record => {
      const key = `${record.inum}_${record.ctin}`;
      gstr2aMap.set(key, record);
    });
    
    // Process CDN data
    cdnData.forEach(record => {
      const key = `${record.nt_num}_${record.ctin}`;
      gstr2aMap.set(key, record);
    });
    
    // Process purchase data
    filteredPurchaseData.forEach(record => {
      const key = `${record.PBILL}_${record.C_CST}`;
      purchaseMap.set(key, record);
    });
    
    // Compare records
    const allKeys = new Set([...gstr2aMap.keys(), ...purchaseMap.keys()]);
    
    allKeys.forEach(key => {
      const gstr2aRecord = gstr2aMap.get(key);
      const purchaseRecord = purchaseMap.get(key);
      
      if (gstr2aRecord && purchaseRecord) {
        // Both records exist - check for mismatches
        const mismatchDetails: string[] = [];
        
        // Date comparison - normalize both dates to DD/MM/YYYY format
        const gstr2aDate = 'idt' in gstr2aRecord ? gstr2aRecord.idt : gstr2aRecord.nt_dt;
        const purchaseDate = new Date(purchaseRecord.PBILLDATE).toLocaleDateString('en-GB');
        
        // Normalize dates to compare (convert DD-MM-YYYY to DD/MM/YYYY)
        const normalizedGstr2aDate = gstr2aDate.replace(/-/g, '/');
        const normalizedPurchaseDate = purchaseDate;
        
        if (normalizedGstr2aDate !== normalizedPurchaseDate) {
          mismatchDetails.push(`Date mismatch: GSTR2A(${gstr2aDate}) vs Purchase(${purchaseDate})`);
        }
        
        // Invoice value comparison removed as per user request
        
        // Calculate GSTR2A taxable value and GST amount
        const gstr2aTaxableValue = gstr2aRecord.itms.reduce((sum, item) => sum + item.itm_det.txval, 0);
        const gstr2aGSTAmount = gstr2aRecord.itms.reduce((sum, item) => 
          sum + item.itm_det.iamt + item.itm_det.camt + item.itm_det.samt + item.itm_det.csamt, 0);
        
        // Get purchase taxable value and GST amount
        const purchaseTaxableValue = purchaseRecord.TOTAL_TAXABLE_VALUE || 0;
        const purchaseGSTAmount = purchaseRecord.TOTAL_GST_AMOUNT || 0;
        
        // GST amount comparison with tolerance
        if (Math.abs(gstr2aGSTAmount - purchaseGSTAmount) > tolerance) {
          mismatchDetails.push(`GST Amount mismatch: GSTR2A(${gstr2aGSTAmount.toFixed(2)}) vs Purchase(${purchaseGSTAmount.toFixed(2)})`);
        }
        
        // Taxable value comparison with tolerance
        if (Math.abs(gstr2aTaxableValue - purchaseTaxableValue) > tolerance) {
          mismatchDetails.push(`Taxable Value mismatch: GSTR2A(${gstr2aTaxableValue.toFixed(2)}) vs Purchase(${purchaseTaxableValue.toFixed(2)})`);
        }
        
        results.push({
          invoiceNumber: 'inum' in gstr2aRecord ? gstr2aRecord.inum : gstr2aRecord.nt_num,
          invoiceDate: gstr2aDate,
          partyGST: gstr2aRecord.ctin,
          invoiceValue: gstr2aRecord.val,
          gstr2aTaxableValue,
          purchaseTaxableValue,
          gstr2aGSTAmount,
          purchaseGSTAmount,
          source: 'Both',
          status: mismatchDetails.length > 0 ? 'Mismatched' : 'Matched',
          mismatchDetails: mismatchDetails.length > 0 ? mismatchDetails : undefined,
          gstr2aRecord,
          purchaseRecord
        });
      } else if (gstr2aRecord) {
        // Only in GSTR2A
        results.push({
          invoiceNumber: 'inum' in gstr2aRecord ? gstr2aRecord.inum : gstr2aRecord.nt_num,
          invoiceDate: 'idt' in gstr2aRecord ? gstr2aRecord.idt : gstr2aRecord.nt_dt,
          partyGST: gstr2aRecord.ctin,
          invoiceValue: gstr2aRecord.val,
          source: 'GSTR2A',
          status: 'Missing in Purchase',
          gstr2aRecord
        });
      } else if (purchaseRecord) {
        // Only in Purchase
        results.push({
          invoiceNumber: purchaseRecord.PBILL,
          invoiceDate: new Date(purchaseRecord.PBILLDATE).toLocaleDateString('en-GB'),
          partyGST: purchaseRecord.C_CST,
          invoiceValue: purchaseRecord.N_B_AMT || 0,
          source: 'Purchase',
          status: 'Missing in GSTR2A',
          purchaseRecord
        });
      }
    });
    
    return results.sort((a, b) => a.invoiceNumber.localeCompare(b.invoiceNumber));
  };

  // Handle save comparison to CSV
  const handleSaveComparison = () => {
    if (comparisonResults.length === 0) {
      alert('No comparison data to save');
      return;
    }

    // Create CSV content
    const headers = [
      'Invoice Number',
      'Invoice Date',
      'Party GST',
      'Invoice Value',
      'GSTR2A Taxable Value',
      'Purchase Taxable Value',
      'GSTR2A GST Amount',
      'Purchase GST Amount',
      'Status',
      'Mismatch Details'
    ];

    const csvContent = [
      headers.join(','),
      ...comparisonResults.map(result => [
        `"${result.invoiceNumber}"`,
        `"${result.invoiceDate}"`,
        `"${result.partyGST}"`,
        result.invoiceValue.toFixed(2),
        result.gstr2aTaxableValue?.toFixed(2) || '',
        result.purchaseTaxableValue?.toFixed(2) || '',
        result.gstr2aGSTAmount?.toFixed(2) || '',
        result.purchaseGSTAmount?.toFixed(2) || '',
        `"${result.status}"`,
        `"${result.mismatchDetails?.join('; ') || ''}"`
      ].join(','))
    ].join('\n');

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `GSTR2A_Comparison_${month}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  return (
    <div className="container mx-auto p-4">
      <div className="flex items-center mb-6">
        <button
          onClick={handleBackNavigation}
          className="mr-4 p-2 text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
          title="Go back"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">GSTR2A Matching Report</h1>
      </div>
      
      {error && (
        <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}
      
      {/* Step 1: Month Input */}
      {currentStep === 'input' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4 text-gray-800 dark:text-white">Step 1: Enter Month</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="month" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Month (MMYYYY format, e.g., 082025)
              </label>
              <Input
                id="month"
                type="text"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                placeholder="082025"
                maxLength={6}
                variant="outlined"
              />
            </div>
            <div className="flex items-end space-x-2">
              <button
                onClick={handleLoadExistingData}
                disabled={loading || !month}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Loading...' : 'Load Existing Files'}
              </button>
              <span className="text-gray-500 dark:text-gray-400 text-sm self-center">OR</span>
              <button
                onClick={handleOTPRequest}
                disabled={loading || !month}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Requesting...' : 'Download New Data'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Step 2: OTP Input */}
      {currentStep === 'otp' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4 text-gray-800 dark:text-white">Step 2: Enter OTP</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="otp" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                6-Digit OTP
              </label>
              <Input
                id="otp"
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                maxLength={6}
                variant="outlined"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={handleAuthToken}
                disabled={loading || otp.length !== 6}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Authenticating...' : 'Authenticate'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Step 3: Section Selection and Download */}
      {currentStep === 'download' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4 text-gray-800 dark:text-white">Step 3: Select Sections and Download</h2>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Select sections to download:
            </label>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={selectedSections.b2b}
                  onChange={(e) => setSelectedSections(prev => ({ ...prev, b2b: e.target.checked }))}
                  className="mr-2"
                />
                <span className="text-gray-700 dark:text-gray-300">B2B Section</span>
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={selectedSections.cdn}
                  onChange={(e) => setSelectedSections(prev => ({ ...prev, cdn: e.target.checked }))}
                  className="mr-2"
                />
                <span className="text-gray-700 dark:text-gray-300">CDN Section</span>
              </label>
            </div>
          </div>
          <button
            onClick={handleDownloadGSTR2A}
            disabled={loading || (!selectedSections.b2b && !selectedSections.cdn)}
            className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Downloading...' : 'Download GSTR2A Data'}
          </button>
        </div>
      )}
      
      {/* Step 4: Data Display */}
      {currentStep === 'display' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white">GSTR2A Data</h2>
            <button
              onClick={handleMatchRecords}
              disabled={loading}
              className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Matching...' : 'Match Records'}
            </button>
          </div>
          
          {/* Tabs */}
          <div className="border-b border-gray-200 dark:border-gray-600 mb-4">
            <nav className="-mb-px flex space-x-8">
              {selectedSections.b2b && (
                <button
                  onClick={() => setActiveTab('b2b')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'b2b'
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                  }`}
                >
                  B2B ({gstr2aB2BData.length})
                </button>
              )}
              {selectedSections.cdn && (
                <button
                  onClick={() => setActiveTab('cdn')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'cdn'
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                  }`}
                >
                  CDN ({gstr2aCDNData.length})
                </button>
              )}
            </nav>
          </div>
          
          {/* Table Display */}
          <div className="overflow-x-auto max-h-screen">
            {activeTab === 'b2b' && (
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
                <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">GSTIN</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Invoice Number</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Invoice Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Value</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Place of Supply</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Invoice Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Reverse Charge</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Source Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">IRN Gen Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Taxable Value</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Tax Rate</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">IGST</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">CGST</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">SGST</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">CESS</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-600">
                  {gstr2aB2BData.flatMap((record, recordIndex) => 
                    record.itms?.map((item, itemIndex) => (
                      <tr key={`${recordIndex}-${itemIndex}`}>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{record.ctin}</td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{record.inum}</td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{record.idt}</td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{record.val?.toFixed(2) || '0.00'}</td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{record.pos}</td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{record.inv_typ}</td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{record.rchrg}</td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{record.srctyp}</td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{record.irngendate}</td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{item.itm_det?.txval?.toFixed(2) || '0.00'}</td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{item.itm_det?.rt?.toFixed(2) || '0.00'}%</td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{item.itm_det?.iamt?.toFixed(2) || '0.00'}</td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{item.itm_det?.camt?.toFixed(2) || '0.00'}</td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{item.itm_det?.samt?.toFixed(2) || '0.00'}</td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{item.itm_det?.csamt?.toFixed(2) || '0.00'}</td>
                      </tr>
                    )) || []
                  )}
                </tbody>
              </table>
            )}
            
            {activeTab === 'cdn' && (
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
                <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">GSTIN</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Note Number</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Note Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Value</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Place of Supply</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Invoice Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Reverse Charge</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Source Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">IRN Gen Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Taxable Value</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Tax Rate</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">IGST</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">CGST</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">SGST</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">CESS</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-600">
                  {gstr2aCDNData.flatMap((record, recordIndex) => 
                    record.itms?.map((item, itemIndex) => (
                      <tr key={`${recordIndex}-${itemIndex}`}>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{record.ctin}</td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{record.nt_num}</td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{record.nt_dt}</td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{record.val?.toFixed(2) || '0.00'}</td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{record.pos}</td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{record.inv_typ}</td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{record.rchrg}</td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{record.srctyp}</td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{record.irngendate}</td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{item.itm_det?.txval?.toFixed(2) || '0.00'}</td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{item.itm_det?.rt?.toFixed(2) || '0.00'}%</td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{item.itm_det?.iamt?.toFixed(2) || '0.00'}</td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{item.itm_det?.camt?.toFixed(2) || '0.00'}</td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{item.itm_det?.samt?.toFixed(2) || '0.00'}</td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{item.itm_det?.csamt?.toFixed(2) || '0.00'}</td>
                      </tr>
                    )) || []
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
      
      {/* Step 5: Comparison Results */}
      {currentStep === 'comparison' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4 text-gray-800 dark:text-white">Comparison Results</h2>
          
          {/* Summary */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-green-100 dark:bg-green-900 p-4 rounded">
              <div className="text-green-800 dark:text-green-200 text-sm font-medium">Matched</div>
              <div className="text-green-900 dark:text-green-100 text-2xl font-bold">
                {comparisonResults.filter(r => r.status === 'Matched').length}
              </div>
            </div>
            <div className="bg-yellow-100 dark:bg-yellow-900 p-4 rounded">
              <div className="text-yellow-800 dark:text-yellow-200 text-sm font-medium">Mismatched</div>
              <div className="text-yellow-900 dark:text-yellow-100 text-2xl font-bold">
                {comparisonResults.filter(r => r.status === 'Mismatched').length}
              </div>
            </div>
            <div className="bg-red-100 dark:bg-red-900 p-4 rounded">
              <div className="text-red-800 dark:text-red-200 text-sm font-medium">Missing in GSTR2A</div>
              <div className="text-red-900 dark:text-red-100 text-2xl font-bold">
                {comparisonResults.filter(r => r.status === 'Missing in GSTR2A').length}
              </div>
            </div>
            <div className="bg-blue-100 dark:bg-blue-900 p-4 rounded">
              <div className="text-blue-800 dark:text-blue-200 text-sm font-medium">Missing in Purchase</div>
              <div className="text-blue-900 dark:text-blue-100 text-2xl font-bold">
                {comparisonResults.filter(r => r.status === 'Missing in Purchase').length}
              </div>
            </div>
          </div>
          
          {/* Save Button */}
          <div className="mb-4 flex justify-end">
            <button
              onClick={handleSaveComparison}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200 flex items-center space-x-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>Save Comparison</span>
            </button>
          </div>
          
          {/* Results Table */}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Invoice Number</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Invoice Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Party GST</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Invoice Value</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">GSTR2A Taxable</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Purchase Taxable</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">GSTR2A GST</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Purchase GST</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    <div className="flex flex-col space-y-1">
                      <span>Status</span>
                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      >
                        <option value="All">All</option>
                        <option value="Matched">Matched</option>
                        <option value="Mismatched">Mismatched</option>
                        <option value="Missing in GSTR2A">Missing in GSTR2A</option>
                        <option value="Missing in Purchase">Missing in Purchase</option>
                      </select>
                    </div>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Details</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-600">
                {comparisonResults
                  .filter(result => statusFilter === 'All' || result.status === statusFilter)
                  .map((result, index) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{result.invoiceNumber}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{result.invoiceDate}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{result.partyGST}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{result.invoiceValue.toFixed(2)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{result.gstr2aTaxableValue?.toFixed(2) || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{result.purchaseTaxableValue?.toFixed(2) || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{result.gstr2aGSTAmount?.toFixed(2) || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{result.purchaseGSTAmount?.toFixed(2) || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        result.status === 'Matched' ? 'bg-green-100 text-green-800' :
                        result.status === 'Mismatched' ? 'bg-yellow-100 text-yellow-800' :
                        result.status === 'Missing in GSTR2A' ? 'bg-red-100 text-red-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {result.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100">
                      {result.mismatchDetails && (
                        <ul className="list-disc list-inside">
                          {result.mismatchDetails.map((detail, idx) => (
                            <li key={idx} className="text-xs">{detail}</li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Notes */}
          <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700 rounded">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">Notes on the Comparison:</h3>
            <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
              <li>• Date Conversion: pur.json PBILLDATE ("YYYY-MM-DDTHH:mm:ss.sssZ") has been converted to "DD-MM-YYYY" for comparison with GSTR2A idt.</li>
              <li>• Value Comparison: The comparison between pur.N_B_AMT and GSTR2A.val is done with a tolerance of Rs. 2.00. Differences greater than this are flagged.</li>
              <li>• GST Amount Matching: GST amounts are calculated from GSTR2A (IGST + CGST + SGST + CESS) and compared with purchase GST amounts from purdtl.json with Rs. 2.00 tolerance.</li>
              <li>• Taxable Value Matching: Taxable values from GSTR2A and purchase records (from purdtl.json) are compared with Rs. 2.00 tolerance.</li>
              <li>• Purchase Data Integration: Item-wise purchase details from purdtl.json are aggregated by bill number to calculate total GST amounts and taxable values.</li>
              <li>• "Missing in Purchase Register (pur.json)": This means the invoice was found in GSTR2A but either not found in pur.json at all or found with a PBILLDATE outside of the selected month.</li>
              <li>• "Missing in GSTR2A": This means the invoice was found in pur.json for the selected month but not found in GSTR2A data.</li>
              <li>• Records with null N_B_AMT in pur.json are treated as value mismatches when compared to GSTR2A entries.</li>
              <li>• GSTIN mismatches are flagged when the party GST numbers don't match between the two sources.</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default GSTR2AMatching;