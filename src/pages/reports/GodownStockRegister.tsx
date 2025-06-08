import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import constants from '../../constants';
import Autocomplete from '../../components/form/input/Autocomplete';
import useAuth from '../../hooks/useAuth';

interface Godown {
    GDN_CODE: string;
    GDN_NAME: string;
}

interface PmplItem {
    CODE: string;
    PRODUCT: string;
    NAME?: string;
    MRP1?: string;
}

interface TransferItem {
    code: string;
    name: string;
    unit: string;
    id: number;
}

const getInitialDate = () => {
    const nowInIndia = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    
    // If it's 4 AM or later, set the date to tomorrow.
    if (nowInIndia.getHours() >= 4) {
        nowInIndia.setDate(nowInIndia.getDate() + 1);
    }
    
    // Format to YYYY-MM-DD
    const year = nowInIndia.getFullYear();
    const month = String(nowInIndia.getMonth() + 1).padStart(2, '0');
    const day = String(nowInIndia.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${day}`;
};

const GodownStockRegister: React.FC = () => {
    const [date, setDate] = useState(getInitialDate());
    const [godownOptions, setGodownOptions] = useState<{ value: string; label: string }[]>([]);
    const [selectedGodown, setSelectedGodown] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const { user } = useAuth();
    const [pmplData, setPmplData] = useState<PmplItem[]>([]);
    const [stockData, setStockData] = useState<any>({});
    const [selectedItemCode, setSelectedItemCode] = useState<string>('');
    const [transferItems, setTransferItems] = useState<TransferItem[]>(() => {
        try {
            const savedItems = localStorage.getItem(`transferItems-${getInitialDate()}`);
            return savedItems ? JSON.parse(savedItems) : [];
        } catch (error) {
            console.error("Failed to parse transfer items from localStorage on init", error);
            return [];
        }
    });

    useEffect(() => {
        const fetchData = async () => {
            try {
                const token = localStorage.getItem('token');
                const [godownsResponse, pmplResponse, stockResponse] = await Promise.all([
                    axios.get<Godown[]>(`${constants.baseURL}/api/godowns`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    }),
                    axios.get<PmplItem[]>(`${constants.baseURL}/api/dbf/pmpl.json`, {
                        headers: { 'Authorization': 'Bearer ' + token }
                    }),
                    axios.get<any>(`${constants.baseURL}/api/stock`, {
                        headers: { 'Authorization': 'Bearer ' + token }
                    })
                ]);

                // Godown processing
                let godownsData = godownsResponse.data;
                // Filter based on user access
                if (user && user.godownAccess && user.godownAccess.length > 0) {
                    godownsData = godownsData.filter(godown => 
                        user.godownAccess.includes(godown.GDN_CODE)
                    );
                }

                const options = godownsData.map(g => ({
                    value: g.GDN_CODE,
                    label: `${g.GDN_NAME} (${g.GDN_CODE})`
                }));

                setGodownOptions(options);

                // PMPL Processing
                setPmplData(pmplResponse.data);

                // Stock Processing
                setStockData(stockResponse.data || {});

            } catch (error) {
                console.error('Error fetching page data:', error);
                toast.error('Failed to fetch page data.');
            }
        };

        if (user) { // Wait for user data to be available
            fetchData();
        }
    }, [user]);

    // Load/clear transfer items from localStorage when the date changes
    useEffect(() => {
        try {
            const savedItems = localStorage.getItem(`transferItems-${date}`);
            setTransferItems(savedItems ? JSON.parse(savedItems) : []);
        } catch (error) {
            console.error("Failed to parse transfer items from localStorage", error);
            setTransferItems([]);
        }
    }, [date]);

    // Save transfer items to localStorage whenever they change
    useEffect(() => {
        try {
            if (transferItems.length > 0) {
                localStorage.setItem(`transferItems-${date}`, JSON.stringify(transferItems));
            } else {
                localStorage.removeItem(`transferItems-${date}`);
            }
        } catch (error) {
            console.error("Failed to save transfer items to localStorage", error);
        }
    }, [transferItems, date]);

    const handleAddItemToTransfer = () => {
        if (!selectedItemCode) {
            toast.warn('Please select an item to add.');
            return;
        }

        const itemToAdd = pmplData.find(p => p.CODE === selectedItemCode);
        if (itemToAdd) {
            setTransferItems(prevItems => [
                ...prevItems,
                { 
                    code: itemToAdd.CODE, 
                    name: itemToAdd.PRODUCT || itemToAdd.NAME || 'Unknown Item', 
                    unit: '1 box',
                    id: Date.now() + Math.random() // Simple unique ID
                }
            ]);
            setSelectedItemCode(''); // Reset autocomplete
        }
    };

    const handleRemoveTransferItem = (idToRemove: number) => {
        setTransferItems(prevItems => prevItems.filter(item => item.id !== idToRemove));
    };

    const handleClearTransferItems = () => {
        setTransferItems([]);
    };

    const handleCalculateStock = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');

            const stockDate = new Date(date);
            stockDate.setDate(stockDate.getDate() + 1); // We calculate opening for the *next* day
            const nextDateForApi = stockDate.toLocaleDateString('en-GB').replace(/\//g, '-');

            // Aggregate quantities for duplicate items, assuming each entry is 1 box
            const aggregatedTransfers = transferItems.reduce((acc, item) => {
                acc[item.code] = (acc[item.code] || 0) + 1;
                return acc;
            }, {} as Record<string, number>);

            const payload = {
                nextdate: nextDateForApi,
                gdnCode: selectedGodown, // Source godown for transfers
                transferItems: Object.entries(aggregatedTransfers).map(([code, qty]) => ({ code, qty }))
            };

            const response = await axios.post(`${constants.baseURL}/api/calculate-next-day-stock`, payload, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            toast.success(response.data.message);
        } catch (error: any) {
            console.error('Error calculating stock:', error);
            toast.error(error.response?.data?.message || 'Failed to calculate next day stock.');
        } finally {
            setLoading(false);
        }
    };

    const handleGeneratePdf = () => {
        if (!selectedGodown) {
            toast.warn('Please select a godown.');
            return;
        }
        const formattedDate = new Date(date).toLocaleDateString('en-GB').replace(/\//g, '-');
        window.open(`/print/godown-stock/${selectedGodown}?date=${formattedDate}`, '_blank');
    };
    
    const itemDropdownOptions = useMemo(() => {
        if (!stockData || Object.keys(stockData).length === 0) return [];

        return pmplData
            .filter(p => {
                const itemStock = stockData[p.CODE];
                if (itemStock && typeof itemStock === 'object') {
                    const totalStock = Object.values(itemStock).reduce((sum: number, stock: any) => sum + (parseInt(stock, 10) || 0), 0);
                    // @ts-ignore
                    return totalStock > 0;
                }
                return false;
            })
            .map(p => ({ 
                value: p.CODE, 
                label: `${p.PRODUCT || p.NAME} (${p.CODE}) {${p.MRP1 || 'N/A'}}` 
            }));
    }, [pmplData, stockData]);

    return (
        <div className="p-4 bg-gray-50 dark:bg-gray-900 min-h-screen">
            <div className="max-w-7xl mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-6">Godown Stock Register</h1>

                {/* Transfer to Retail Section */}
                <div className="mb-8">
                    <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-6">Transfer to Retail</h2>
                    <div className="p-6 border rounded-lg bg-gray-50 dark:bg-gray-700">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* Left side: Item Selection */}
                            <div>
                                <div className="flex flex-col h-full">
                                    <div className="flex-grow">
                                        <Autocomplete
                                            id="item-transfer-select"
                                            label="Select Item to Transfer"
                                            options={itemDropdownOptions}
                                            onChange={(value) => setSelectedItemCode(value || '')}
                                            value={selectedItemCode}
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleAddItemToTransfer}
                                        className="w-full mt-4 px-4 py-2 bg-blue-600 text-white font-bold rounded-md hover:bg-blue-700"
                                    >
                                        Add Item
                                    </button>
                                 </div>
                            </div>

                            {/* Right side: Items Table */}
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Selected Items</h3>
                                    {transferItems.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={handleClearTransferItems}
                                            className="px-3 py-1 bg-red-600 text-white text-sm font-bold rounded-md hover:bg-red-700"
                                        >
                                            CLEAR ALL
                                        </button>
                                    )}
                                </div>
                                <div className="border rounded-lg overflow-hidden bg-white dark:bg-gray-800 max-h-80 overflow-y-auto">
                                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                        <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
                                            <tr>
                                                <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">#</th>
                                                <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Item</th>
                                                <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Unit</th>
                                                <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                            {transferItems.length > 0 ? (
                                                transferItems.map((item, index) => (
                                                    <tr key={item.id}>
                                                        <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{index + 1}</td>
                                                        <td className="px-4 py-2 text-sm font-medium text-gray-900 dark:text-white truncate" title={item.name} style={{ maxWidth: '20ch' }}>{item.name}</td>
                                                        <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{item.unit}</td>
                                                        <td className="px-4 py-2 whitespace-nowrap text-sm">
                                                            <button
                                                                onClick={() => handleRemoveTransferItem(item.id)}
                                                                className="text-red-600 hover:text-red-800 dark:text-red-500 dark:hover:text-red-400 font-semibold"
                                                            >
                                                                Delete
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))
                                            ) : (
                                                <tr>
                                                    <td colSpan={4} className="text-center py-4 text-sm text-gray-500 dark:text-gray-400">No items added.</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    {/* Calculate Next Day Stock Section */}
                    <div className="p-6 border rounded-lg bg-gray-50 dark:bg-gray-700">
                        <h2 className="text-xl font-semibold text-gray-700 dark:text-white mb-4">Calculate Today's Closing Stock</h2>
                        <div className="flex flex-col space-y-4">
                            <div>
                                <label htmlFor="stock-date" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    For Date
                                </label>
                                <input
                                    type="date"
                                    id="stock-date"
                                    value={date}
                                    onChange={(e) => setDate(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-brand-500 focus:border-brand-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                                />
                            </div>
                            <button
                                onClick={handleCalculateStock}
                                disabled={loading}
                                className="w-full bg-brand-600 text-white font-bold py-2 px-4 rounded-md hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500 disabled:bg-gray-400"
                            >
                                {loading ? 'Calculating...' : 'Calculate & Append Stock'}
                            </button>
                        </div>
                    </div>

                    {/* Generate PDF Section */}
                    <div className="p-6 border rounded-lg bg-gray-50 dark:bg-gray-700">
                        <h2 className="text-xl font-semibold text-gray-700 dark:text-white mb-4">Generate Stock Report</h2>
                        <div className="flex flex-col space-y-4">
                             <div>
                                <Autocomplete
                                    id="godown-select"
                                    label="Select Godown"
                                    options={godownOptions}
                                    onChange={(value) => setSelectedGodown(value || '')}
                                    value={selectedGodown}
                                    defaultValue={selectedGodown}
                                />
                            </div>
                            <button
                                onClick={handleGeneratePdf}
                                className="w-full bg-green-600 text-white font-bold py-2 px-4 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                            >
                                Generate PDF
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GodownStockRegister; 