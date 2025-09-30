import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { useAuth, hasMultipleSubgroups } from '../../contexts/AuthContext';
import PartyLedgerDialog from './PartyLedgerDialog';
import constants from '../../constants';

// Create API_BASE_URL from constants for backward compatibility
const API_BASE_URL = constants.baseURL;

// Local icon components
const Loader2: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24" {...props}>
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

const Eye: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
  </svg>
);

const EyeOff: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
  </svg>
);

const ChevronDown: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

const ChevronRight: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);

interface BalanceEntry {
  partycode: string;
  result: string;
}

interface BalanceResponse {
  data: BalanceEntry[];
}

interface PartyInfo {
  C_CODE: string;
  C_NAME: string;
}

interface PartyBalance {
  partyCode: string;
  partyName: string;
  balance: number;
  balanceType: 'DR' | 'CR';
  subgroupCode?: string;
  subgroupName?: string;
  // Added: maximum days past due among pending bills for this party
  daysPast?: number;
}

interface SubgroupBalance {
  subgroupCode: string;
  subgroupName: string;
  parties: PartyBalance[];
  totalBalance: number;
}

const BalanceUddhari: React.FC = () => {
  const [showDetailed, setShowDetailed] = useState(false);
  const [partyBalances, setPartyBalances] = useState<PartyBalance[]>([]);
  const [subgroupBalances, setSubgroupBalances] = useState<SubgroupBalance[]>([]);
  const [expandedSubgroups, setExpandedSubgroups] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalBalance, setTotalBalance] = useState(0);
  const [isLedgerDialogOpen, setIsLedgerDialogOpen] = useState(false);
  const [selectedParty, setSelectedParty] = useState<{ code: string; name: string } | null>(null);
  const { user } = useAuth();

  // Fetch total balance on component mount
  useEffect(() => {
    const fetchTotalBalance = async () => {
      if (!user) return;
      
      try {
        // Fetch balance data
        const balanceResponse = await fetch(`${API_BASE_URL}/json/balance`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        if (!balanceResponse.ok) {
          throw new Error('Failed to fetch balance data');
        }
        const balanceData: BalanceResponse = await balanceResponse.json();
        
        // Filter balances based on user subgroups
        let filteredBalances = balanceData.data;
        
        // Check if user is admin
        const isAdmin = user.routeAccess && user.routeAccess.includes('Admin');
        
        // Define excluded subgroups for admin users
          const excludedSubgroups = ['CL', 'EE', 'FA', 'CT', 'AA', 'GG', 'BB', 'SB', 'FC', 'PL', 'DZ', 'VG', 'VI'];
        
        if (isAdmin) {
          // For admin users, exclude specific subgroups
          filteredBalances = balanceData.data.filter(balance => {
            const partyPrefix = balance.partycode.substring(0, 2).toUpperCase();
            return !excludedSubgroups.includes(partyPrefix);
          });
        } else if (user.subgroups && user.subgroups.length > 0) {
          const userSubgroupCodes = user.subgroups.map(sg => sg.subgroupCode?.substring(0, 2).toUpperCase()).filter(Boolean);
          filteredBalances = balanceData.data.filter(balance => {
            const partyPrefix = balance.partycode.substring(0, 2).toUpperCase();
            return userSubgroupCodes.includes(partyPrefix);
          });
        }
        
        // Calculate total DR balance
        let total = 0;
        filteredBalances.forEach(balance => {
          const resultStr = balance.result.toString();
          const balanceType = resultStr.includes('DR') ? 'DR' : 'CR';
          const balanceAmount = parseFloat(resultStr.replace(/[^0-9.-]/g, ''));
          
          if (balanceType === 'DR' && balanceAmount > 0) {
            total += balanceAmount;
          }
        });
        
        setTotalBalance(total);
      } catch (error) {
        console.error('Error fetching total balance:', error);
      }
    };
    
    fetchTotalBalance();
  }, [user]);

  const fetchDetailedBalances = async () => {
    if (!user) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // Fetch balance data
      const balanceResponse = await fetch(`${API_BASE_URL}/json/balance`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (!balanceResponse.ok) {
        throw new Error('Failed to fetch balance data');
      }
      const balanceData: BalanceResponse = await balanceResponse.json();
      
      // Fetch party information
      const partyResponse = await fetch(`${API_BASE_URL}/cmpl`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (!partyResponse.ok) {
        throw new Error('Failed to fetch party data');
      }
      const partyData: PartyInfo[] = await partyResponse.json();
      
      // Fetch subgroup information
      const subgroupResponse = await fetch(`${API_BASE_URL}/slink/subgrp`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (!subgroupResponse.ok) {
        throw new Error('Failed to fetch subgroup data');
      }
      const subgroupData = await subgroupResponse.json();
      
      // Create party lookup map
      const partyMap = new Map<string, string>();
      partyData.forEach(party => {
        partyMap.set(party.C_CODE, party.C_NAME);
      });
      
      // Create subgroup lookup map
      const subgroupMap = new Map<string, string>();
      subgroupData.forEach((subgroup: any) => {
        subgroupMap.set(subgroup.subgroupCode, subgroup.title);
      });
      
      // Filter balances based on user subgroups
      let filteredBalances = balanceData.data;
      
      // Check if user is admin
      const isAdmin = user.routeAccess && user.routeAccess.includes('Admin');
      
      // Define excluded subgroups for admin users
      const excludedSubgroups = ['CL', 'EE', 'FA', 'CT', 'AA', 'GG', 'BB', 'SB', 'FC', 'PL', 'DZ', 'VG', 'VI'];
      
      if (isAdmin) {
        // For admin users, exclude specific subgroups
        filteredBalances = balanceData.data.filter(balance => {
          const partyPrefix = balance.partycode.substring(0, 2).toUpperCase();
          return !excludedSubgroups.includes(partyPrefix);
        });
      } else if (user.subgroups && user.subgroups.length > 0) {
        const subgroupPrefixes = user.subgroups.map(sg => 
          sg.subgroupCode?.substring(0, 2).toUpperCase()
        ).filter(Boolean);
        
        filteredBalances = balanceData.data.filter(balance => {
          const partyPrefix = balance.partycode.substring(0, 2).toUpperCase();
          return subgroupPrefixes.includes(partyPrefix);
        });
      }
      
      // Process balances and filter for DR (debit) balances only
      const processedBalances: PartyBalance[] = [];
      let total = 0;
      
      filteredBalances.forEach(balance => {
        const resultStr = balance.result.toString();
        const balanceType = resultStr.includes('DR') ? 'DR' : 'CR';
        const balanceAmount = parseFloat(resultStr.replace(/[^0-9.-]/g, ''));
        
        // Only include DR (debit) balances as these represent outstanding amounts
        if (balanceType === 'DR' && balanceAmount > 0) {
          const partyName = partyMap.get(balance.partycode) || balance.partycode;
          const partyPrefix = balance.partycode.substring(0, 2).toUpperCase();
          
          // For admin users, find the full subgroup code from subgroupData
          // For regular users, use their assigned subgroups
          let subgroupCode: string;
          let subgroupName: string;
          
          if (isAdmin) {
            // Find the full subgroup code that starts with the party prefix
            const matchingSubgroup = subgroupData.find((sg: any) => 
              sg.subgroupCode?.substring(0, 2).toUpperCase() === partyPrefix
            );
            subgroupCode = matchingSubgroup?.subgroupCode || partyPrefix;
            subgroupName = matchingSubgroup?.title || partyPrefix;
          } else {
            // For regular users, use their assigned subgroups
            subgroupCode = user.subgroups?.find(sg => 
              sg.subgroupCode?.substring(0, 2).toUpperCase() === partyPrefix
            )?.subgroupCode || partyPrefix;
            subgroupName = subgroupMap.get(subgroupCode) || subgroupCode;
          }
          
          processedBalances.push({
            partyCode: balance.partycode,
            partyName,
            balance: balanceAmount,
            balanceType,
            subgroupCode,
            subgroupName
          });
          
          total += balanceAmount;
        }
      });

      // Batch fetch max days for all parties using the new batch API
      const getBatchPartyMaxDays = async (partyCodes: string[]): Promise<Record<string, number>> => {
        try {
          const partyCodesParam = partyCodes.join(',');
          const resp = await fetch(`${API_BASE_URL}/api/reports/balance-slip-batch?partyCodes=${encodeURIComponent(partyCodesParam)}`, {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
          });
          if (!resp.ok) {
            console.error('Batch balance slip API failed:', resp.status, resp.statusText);
            return {};
          }
          const data = await resp.json();
          const results: Record<string, number> = {};
          if (data.success && data.data) {
            for (const [partyCode, info] of Object.entries(data.data)) {
              results[partyCode] = (info as any).maxDays || 0;
            }
          }
          return results;
        } catch (e) {
          console.error('Failed to fetch batch balance slip data:', e);
          return {};
        }
      };

      // Get all party codes for batch processing
      const allPartyCodes = processedBalances.map(p => p.partyCode);
      const daysPastMap = await getBatchPartyMaxDays(allPartyCodes);

      // Enrich with daysPast (max days) and sort by days past desc then by balance desc
      const enrichedBalances: PartyBalance[] = processedBalances.map(p => ({
        ...p,
        daysPast: daysPastMap[p.partyCode] || 0
      }));

      // Sort parties by days past (desc), then balance (desc)
      enrichedBalances.sort((a, b) => {
        const da = a.daysPast ?? 0;
        const db = b.daysPast ?? 0;
        if (db !== da) return db - da;
        return b.balance - a.balance;
      });
      
      // Group by subgroups if user has multiple subgroups or is admin
      if (hasMultipleSubgroups(user) || isAdmin) {
        const subgroupMap2 = new Map<string, PartyBalance[]>();
        
        enrichedBalances.forEach(balance => {
          const key = balance.subgroupCode || 'Unknown';
          if (!subgroupMap2.has(key)) {
            subgroupMap2.set(key, []);
          }
          subgroupMap2.get(key)!.push(balance);
        });
        
        const groupedSubgroups: SubgroupBalance[] = [];
        subgroupMap2.forEach((parties, subgroupCode) => {
          const subgroupTotal = parties.reduce((sum, party) => sum + party.balance, 0);
          const subgroupNameVal = parties[0]?.subgroupName || subgroupCode;
          
          groupedSubgroups.push({
            subgroupCode,
            subgroupName: subgroupNameVal,
            parties: parties.sort((a, b) => {
              const da = a.daysPast ?? 0; const db = b.daysPast ?? 0;
              if (db !== da) return db - da;
              return b.balance - a.balance;
            }),
            totalBalance: subgroupTotal
          });
        });
        
        // Sort subgroups by total balance descending (keeping existing behavior)
        groupedSubgroups.sort((a, b) => b.totalBalance - a.totalBalance);
        setSubgroupBalances(groupedSubgroups);
        
        // Keep all subgroups collapsed by default
        setExpandedSubgroups(new Set());
      }
      
      setPartyBalances(enrichedBalances);
      setTotalBalance(total);
      
    } catch (err) {
      console.error('Error fetching balance data:', err);
      setError('Failed to load balance data');
    } finally {
      setLoading(false);
    }
  };
  
  const handleToggleView = () => {
    if (!showDetailed) {
      fetchDetailedBalances();
    }
    setShowDetailed(!showDetailed);
  };
  
  const toggleSubgroup = (subgroupCode: string) => {
    const newExpanded = new Set(expandedSubgroups);
    if (newExpanded.has(subgroupCode)) {
      newExpanded.delete(subgroupCode);
    } else {
      newExpanded.add(subgroupCode);
    }
    setExpandedSubgroups(newExpanded);
  };

  const handlePartyClick = (partyCode: string, partyName: string) => {
    setSelectedParty({ code: partyCode, name: partyName });
    setIsLedgerDialogOpen(true);
  };

  const handleCloseLedgerDialog = () => {
    setIsLedgerDialogOpen(false);
    setSelectedParty(null);
  };
  
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2
    }).format(amount);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Balance Uddhari</span>
          <button
            onClick={handleToggleView}
            className="flex items-center gap-2 px-3 py-1 text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-md transition-colors"
            disabled={loading}
          >
            {showDetailed ? (
              <>
                <EyeOff className="h-4 w-4" />
                Summary
              </>
            ) : (
              <>
                <Eye className="h-4 w-4" />
                Detailed
              </>
            )}
          </button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!showDetailed ? (
          <div className="text-center p-4">
            <div className="text-2xl font-bold text-orange-600">
              {formatCurrency(totalBalance)}
            </div>
            <div className="text-sm text-gray-500 mt-1">Outstanding balance</div>
          </div>
        ) : (
          <div>
            {loading ? (
              <div className="flex items-center justify-center p-4">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="ml-2">Loading balance data...</span>
              </div>
            ) : error ? (
              <div className="text-red-500 p-4 text-center">{error}</div>
            ) : partyBalances.length === 0 ? (
              <div className="text-gray-500 p-4 text-center">
                No outstanding balances found
              </div>
            ) : (
              <div>
                <div className="mb-4 p-3 bg-orange-50 rounded-lg border border-orange-200">
                  <div className="text-sm text-orange-700">
                    Total Outstanding: <span className="font-bold">{formatCurrency(totalBalance)}</span>
                  </div>
                  <div className="text-xs text-orange-600 mt-1">
                    {partyBalances.length} parties with outstanding balances
                  </div>
                </div>
                
                <div className="overflow-x-auto max-h-96 overflow-y-auto">
                  {(hasMultipleSubgroups(user) || (user.routeAccess && user.routeAccess.includes('Admin'))) && subgroupBalances.length > 0 ? (
                    // Render collapsible subgroup view
                    <div className="space-y-2">
                      {subgroupBalances.map((subgroup) => (
                        <div key={subgroup.subgroupCode} className="border rounded-lg">
                          {/* Subgroup Header */}
                          <div 
                            className="flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 cursor-pointer border-b"
                            onClick={() => toggleSubgroup(subgroup.subgroupCode)}
                          >
                            <div className="flex items-center space-x-2">
                              {expandedSubgroups.has(subgroup.subgroupCode) ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                              <span className="font-medium">{subgroup.subgroupName} ({subgroup.subgroupCode})</span>
                              <span className="text-sm text-gray-500">({subgroup.parties.length} parties)</span>
                            </div>
                            <div className="font-bold text-orange-600">
                              {formatCurrency(subgroup.totalBalance)}
                            </div>
                          </div>
                          
                          {/* Subgroup Details */}
                          {expandedSubgroups.has(subgroup.subgroupCode) && (
                            <div className="p-0">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Party Code</TableHead>
                                    <TableHead>Party Name</TableHead>
                                    <TableHead className="text-right">Outstanding Amount</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {subgroup.parties.map((party) => (
                                    <TableRow key={party.partyCode}>
                                      <TableCell className="font-mono text-sm">
                                        {party.partyCode}
                                      </TableCell>
                                      <TableCell className="font-medium">
                                        <button
                                          onClick={() => handlePartyClick(party.partyCode, party.partyName)}
                                          className="text-left hover:text-blue-600 hover:underline cursor-pointer transition-colors"
                                        >
                                          {party.partyName}
                                        </button>
                                      </TableCell>
                                      <TableCell className="text-right font-medium text-orange-600">
                                        {formatCurrency(party.balance)}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    // Render regular table view for single subgroup users
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Party Code</TableHead>
                          <TableHead>Party Name</TableHead>
                          <TableHead className="text-right">Outstanding Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {partyBalances.map((party, index) => (
                          <TableRow key={party.partyCode}>
                            <TableCell className="font-mono text-sm">
                              {party.partyCode}
                            </TableCell>
                            <TableCell className="font-medium">
                              <button
                                onClick={() => handlePartyClick(party.partyCode, party.partyName)}
                                className="text-left hover:text-blue-600 hover:underline cursor-pointer transition-colors"
                              >
                                {party.partyName}
                              </button>
                            </TableCell>
                            <TableCell className="text-right font-medium text-orange-600">
                              {formatCurrency(party.balance)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
      
      {/* Party Ledger Dialog */}
      <PartyLedgerDialog
        isOpen={isLedgerDialogOpen}
        onClose={handleCloseLedgerDialog}
        partyCode={selectedParty?.code || ''}
        partyName={selectedParty?.name || ''}
      />
    </Card>
  );
};

export default BalanceUddhari;