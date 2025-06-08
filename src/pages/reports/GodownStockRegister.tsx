import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import constants from '../../constants';
import Autocomplete from '../../components/form/input/Autocomplete';
import useAuth from '../../hooks/useAuth';

interface Godown {
    GDN_CODE: string;
    GDN_NAME: string;
}

const GodownStockRegister: React.FC = () => {
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [godownOptions, setGodownOptions] = useState<{ value: string; label: string }[]>([]);
    const [selectedGodown, setSelectedGodown] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const { user } = useAuth();

    useEffect(() => {
        const fetchGodowns = async () => {
            try {
                const token = localStorage.getItem('token');
                const response = await axios.get<Godown[]>(`${constants.baseURL}/api/godowns`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                let godownsData = response.data;
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

                if (options.length > 0) {
                    // setSelectedGodown(options[0].value);
                }
            } catch (error) {
                console.error('Error fetching godowns:', error);
                toast.error('Failed to fetch godowns.');
            }
        };

        if (user) { // Wait for user data to be available
            fetchGodowns();
        }
    }, [user]);

    const handleCalculateStock = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const formattedDate = new Date(date).toLocaleDateString('en-GB').replace(/\//g, '-');
            const response = await axios.get(`${constants.baseURL}/api/calculate-next-day-stock?nextdate=${formattedDate}`, {
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
        window.open(`/print/godown-stock/${selectedGodown}`, '_blank');
    };

    return (
        <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
            <div className="max-w-4xl mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-md p-8">
                <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-6">Godown Stock Register</h1>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    {/* Calculate Next Day Stock Section */}
                    <div className="p-6 border rounded-lg bg-gray-50 dark:bg-gray-700">
                        <h2 className="text-xl font-semibold text-gray-700 dark:text-white mb-4">Calculate Next Day's Opening Stock</h2>
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
                                    onChange={(value) => setSelectedGodown(value)}
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