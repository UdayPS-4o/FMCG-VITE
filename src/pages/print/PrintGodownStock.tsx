import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import constants from '../../constants';

interface StockData {
    item: string;
    opening: string;
    purchase: string;
    sales: string;
    transfer: string;
    closing: string;
}

interface ApiResponse {
    date: string;
    data: StockData[];
}

const PrintGodownStock: React.FC = () => {
    const { godownCode } = useParams<{ godownCode: string }>();
    const [searchParams] = useSearchParams();
    const reportDate = searchParams.get('date');

    const [stockData, setStockData] = useState<StockData[]>([]);
    const [pageDate, setPageDate] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchStockData = async () => {
            if (!godownCode || !reportDate) {
                setError('Godown code and date are required.');
                setLoading(false);
                return;
            }
            try {
                setLoading(true);
                const token = localStorage.getItem('token');
                const response = await axios.get<ApiResponse>(`${constants.baseURL}/api/godown-stock/${godownCode}?date=${reportDate}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                setStockData(response.data.data);
                setPageDate(response.data.date);
                setError(null);
            } catch (err: any) {
                console.error('Error fetching stock data:', err);
                setError(err.response?.data?.message || 'Failed to fetch stock data.');
            } finally {
                setLoading(false);
            }
        };

        fetchStockData();
    }, [godownCode, reportDate]);

    const handlePrint = () => {
        window.print();
    };
    
    if (loading) {
        return <div className="p-4 text-center text-lg">Loading report...</div>;
    }

    if (error) {
        return <div className="p-4 text-red-500 text-center text-lg">Error: {error}</div>;
    }

    return (
        <div className="p-4 bg-white">
            <style>
                {`
                    @media print {
                        body * {
                            visibility: hidden;
                        }
                        .printable-area, .printable-area * {
                            visibility: visible;
                        }
                        .printable-area {
                            position: absolute;
                            left: 0;
                            top: 0;
                            width: 100%;
                            padding: 20px;
                        }
                        .no-print {
                            display: none;
                        }
                        table {
                            font-size: 10px; /* Smaller font for printing */
                        }
                    }
                `}
            </style>

            <div className="printable-area">
                <h1 className="text-xl font-bold text-center mb-2">Godown Stock Register - Godown {godownCode}</h1>
                <h2 className="text-lg font-semibold text-center mb-4">Stock as on {pageDate}</h2>
                
                <table className="min-w-full divide-y divide-gray-300 border border-gray-300">
                    <thead className="bg-gray-100">
                        <tr>
                            <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 uppercase tracking-wider border-r border-gray-300">Item Name</th>
                            <th className="px-3 py-2 text-center text-xs font-bold text-gray-600 uppercase tracking-wider border-r border-gray-300">Opening</th>
                            <th className="px-3 py-2 text-center text-xs font-bold text-gray-600 uppercase tracking-wider border-r border-gray-300">Purchase</th>
                            <th className="px-3 py-2 text-center text-xs font-bold text-gray-600 uppercase tracking-wider border-r border-gray-300">Sales</th>
                            <th className="px-3 py-2 text-center text-xs font-bold text-gray-600 uppercase tracking-wider border-r border-gray-300">Trf to Retail</th>
                            <th className="px-3 py-2 text-center text-xs font-bold text-gray-600 uppercase tracking-wider">Closing</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {stockData.map((row, index) => (
                            <tr key={index} className="hover:bg-gray-50">
                                <td className="px-3 py-1.5 whitespace-nowrap text-sm text-gray-800 border-r border-gray-300">{row.item}</td>
                                <td className="px-3 py-1.5 whitespace-nowrap text-sm text-center text-gray-800 border-r border-gray-300">{row.opening}</td>
                                <td className="px-3 py-1.5 whitespace-nowrap text-sm text-center text-green-600 font-semibold border-r border-gray-300">{row.purchase}</td>
                                <td className="px-3 py-1.5 whitespace-nowrap text-sm text-center text-red-600 font-semibold border-r border-gray-300">{row.sales}</td>
                                <td className="px-3 py-1.5 whitespace-nowrap text-sm text-center text-orange-600 font-semibold border-r border-gray-300">{row.transfer}</td>
                                <td className="px-3 py-1.5 whitespace-nowrap text-sm text-center text-blue-600 font-bold">{row.closing}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            
            <div className="no-print mt-6 text-center">
                <button
                    onClick={handlePrint}
                    className="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 shadow-md"
                >
                    Print Report
                </button>
            </div>
        </div>
    );
};

export default PrintGodownStock; 