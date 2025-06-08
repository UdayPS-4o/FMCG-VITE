import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import constants from '../../constants';

interface StockData {
    date: string;
    item: string;
    opening: string;
    closing: string;
}

const PrintGodownStock: React.FC = () => {
    const { godownCode } = useParams<{ godownCode: string }>();
    const [stockData, setStockData] = useState<StockData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchStockData = async () => {
            try {
                setLoading(true);
                const token = localStorage.getItem('token');
                const response = await axios.get(`${constants.baseURL}/api/godown-stock/${godownCode}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                setStockData(response.data);
                setError(null);
            } catch (err: any) {
                console.error('Error fetching stock data:', err);
                setError(err.response?.data?.message || 'Failed to fetch stock data.');
            } finally {
                setLoading(false);
            }
        };

        if (godownCode) {
            fetchStockData();
        }
    }, [godownCode]);

    const handlePrint = () => {
        window.print();
    };
    
    if (loading) {
        return <div className="p-4">Loading...</div>;
    }

    if (error) {
        return <div className="p-4 text-red-500">Error: {error}</div>;
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
                        }
                        .no-print {
                            display: none;
                        }
                    }
                `}
            </style>

            <div className="printable-area">
                <h1 className="text-xl font-bold text-center mb-4">Godown Stock Register - Godown {godownCode}</h1>
                <h2 className="text-lg font-semibold text-center mb-4">Stock as on {stockData.length > 0 ? stockData[0].date : ''}</h2>
                
                <table className="min-w-full divide-y divide-gray-200 border">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r">Date</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r">Item</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r">Opening Stock</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Closing Stock</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {stockData.map((row, index) => (
                            <tr key={index}>
                                <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900 border-r">{row.date}</td>
                                <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900 border-r">{row.item}</td>
                                <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900 border-r">{row.opening}</td>
                                <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">{row.closing}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            
            <div className="no-print mt-6 text-center">
                <button
                    onClick={handlePrint}
                    className="bg-blue-500 text-white font-bold py-2 px-4 rounded hover:bg-blue-700"
                >
                    Print
                </button>
            </div>
        </div>
    );
};

export default PrintGodownStock; 