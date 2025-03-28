import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import Input from "../../components/form/input/Input";
import Autocomplete from "../../components/form/input/Autocomplete";
import FormComponent from "../../components/form/Form";
import Toast from '../../components/ui/toast/Toast';
import constants from "../../constants";
import CollapsibleItemSection from './CollapsibleItemSection';
import apiCache from '../../utils/apiCache';
import { FormSkeletonLoader } from "../../components/ui/skeleton/SkeletonLoader";

// Update the item interface to include godown field
interface ItemData {
  item: string;
  stock: string;
  pack: string;
  gst: string;
  unit: string;
  pcBx: string;
  mrp: string;
  rate: string;
  qty: string;
  cess: string;
  cd: string;
  sch: string;
  amount: string;
  netAmount: string;
  godown?: string;
  originalQty?: string; // To track the original quantity for validation
}

// Interface for stock data from API
interface StockData {
  [itemCode: string]: {
    [godownCode: string]: number;
  }
}

// Interface for godown transfer API response
interface GodownTransferData {
  date: string;
  series: string;
  fromGodown: string;
  toGodown: string;
  id: string;
  items: Array<{
    code: string;
    qty: string;
    unit: string;
  }>;
  createdAt: string;
}

const EditGodownTransfer: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [partyOptions, setPartyOptions] = useState<any[]>([]);
  const [fromGodown, setFromGodown] = useState<any>(null);
  const [toGodown, setToGodown] = useState<any>(null);
  const [pmplData, setPmplData] = useState<any[]>([]); // Hold product data from pmpl.json
  const [stockData, setStockData] = useState<StockData>({});
  const [searchItems, setSearchItems] = useState('');
  const [clicked, setClicked] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('info');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // State to track the loading status of different data sources
  const [dataLoadStatus, setDataLoadStatus] = useState({
    godownTransfer: false,
    partyOptions: false,
    pmplData: false,
    stockData: false
  });
  
  // Store the original godown transfer data
  const [originalData, setOriginalData] = useState<GodownTransferData | null>(null);
  
  const [formValues, setFormValues] = useState({
    date: new Date().toISOString().split('T')[0],
    series: 'T',
    fromGodown: '',
    toGodown: '',
    items: [] as ItemData[],
  });
  
  const [expanded, setExpanded] = useState<number | false>(0);
  const baseURL = constants.baseURL;
  const formPrefilled = useRef(false);

  // First effect: Fetch all required data
  useEffect(() => {
    const fetchGodownTransferData = async () => {
      if (!id) {
        setError('No godown transfer ID provided');
        setLoading(false);
        setDataLoadStatus(prev => ({ ...prev, godownTransfer: true }));
        return;
      }

      try {
        // This is a specific edit endpoint, so we don't cache it
        const godownRes = await fetch(`${baseURL}/edit/godown/${id}`, {
          credentials: 'include'
        });

        if (!godownRes.ok) {
          throw new Error(`Failed to fetch godown transfer data: ${godownRes.statusText}`);
        }

        const godownData = await godownRes.json();
        console.log('Fetched godown transfer data:', godownData);
        
        // Store the original data
        setOriginalData(godownData);
        setDataLoadStatus(prev => ({ ...prev, godownTransfer: true }));
      } catch (err) {
        console.error('Failed to load godown transfer:', err);
        setError(err instanceof Error ? err.message : 'Failed to load godown transfer');
        showToast('Failed to load godown transfer', 'error');
        setDataLoadStatus(prev => ({ ...prev, godownTransfer: true }));
      }
    };

    const fetchAllData = async () => {
      try {
        // Fetch all data with caching in parallel
        const [godownData, pmplDatas, stockDatas] = await Promise.all([
          apiCache.fetchWithCache(`${baseURL}/api/dbf/godown.json`),
          apiCache.fetchWithCache(`${baseURL}/api/dbf/pmpl.json`),
          apiCache.fetchWithCache(`${baseURL}/api/stock`)
        ]);
        
        if (Array.isArray(godownData)) {
          setPartyOptions(godownData);
        } else {
          console.error('Data fetched is not an array:', godownData);
        }
        
        if (Array.isArray(pmplDatas)) {
          setPmplData(pmplDatas);
        } else {
          console.error('PMPL data is not an array:', pmplDatas);
        }
        
        setStockData(stockDatas || {});
        
        setDataLoadStatus(prev => ({
          ...prev,
          partyOptions: true,
          pmplData: true,
          stockData: true
        }));
        
        // Clear expired cache items
        apiCache.clearExpiredCache();
      } catch (error) {
        console.error('Error fetching data:', error);
        // Mark all data as loaded even if there was an error to allow the form to be displayed
        setDataLoadStatus(prev => ({
          ...prev,
          partyOptions: true,
          pmplData: true,
          stockData: true
        }));
      }
    };

    // Fetch godown transfer data and other data in parallel
    fetchGodownTransferData();
    fetchAllData();
  }, [id, baseURL]);

  // Second effect: Wait for all data to be loaded, then prefill the form
  useEffect(() => {
    const allDataLoaded = Object.values(dataLoadStatus).every(status => status === true);
    
    if (allDataLoaded && !formPrefilled.current && originalData) {
      console.log("All data loaded, prefilling form");
      
      // Set form values from original data
      setFormValues({
        date: originalData.date || new Date().toISOString().split('T')[0],
        series: originalData.series || 'T',
        fromGodown: originalData.fromGodown || '',
        toGodown: originalData.toGodown || '',
        items: originalData.items ? originalData.items.map((item) => {
          // Find the matching product in pmplData
          const product = pmplData.find(p => p.CODE === item.code);
          
          // Get stock for this item
          let stockValue = '0';
          if (stockData[item.code] && stockData[item.code][originalData.fromGodown]) {
            stockValue = stockData[item.code][originalData.fromGodown].toString();
          }
          
          // Convert unit codes to text values
          let unitValue = item.unit || '';
          
          // Map unit codes to their text representations
          if (product) {
            // If the unit is "01" use the product's UNIT_1 value (e.g., "PCS")
            if (unitValue === "01" && product.UNIT_1) {
              unitValue = product.UNIT_1;
            } 
            // If the unit is "02" use the product's UNIT_2 value (e.g., "BOX")
            else if (unitValue === "02" && product.UNIT_2) {
              unitValue = product.UNIT_2;
            }
            // If the unit matches UNIT_1_DESC but code is being displayed, use UNIT_1
            else if (unitValue === "01" && product.UNIT_1_DESC) {
              unitValue = product.UNIT_1_DESC;
            }
            // If the unit matches UNIT_2_DESC but code is being displayed, use UNIT_2
            else if (unitValue === "02" && product.UNIT_2_DESC) {
              unitValue = product.UNIT_2_DESC;
            }
          }
          
          return {
            item: item.code || '',
            qty: item.qty || '',
            unit: unitValue,
            stock: stockValue,
            pack: product?.PACK || '',
            gst: product?.GST || '',
            pcBx: product?.MULT_F || '',
            mrp: product?.MRP1 || '',
            rate: product?.RATE1 || '',
            cess: '0',
            cd: '0',
            sch: '0',
            amount: '',
            netAmount: '',
            godown: originalData.fromGodown || '',
            originalQty: item.qty || '0' // Store original quantity for validation
          };
        }) : [],
      });
      
      // Update Godown selections
      if (originalData.fromGodown && partyOptions.length > 0) {
        const selectedFromGodown = partyOptions.find(option => option.GDN_CODE === originalData.fromGodown);
        setFromGodown(selectedFromGodown);
      }

      if (originalData.toGodown && partyOptions.length > 0) {
        const selectedToGodown = partyOptions.find(option => option.GDN_CODE === originalData.toGodown);
        setToGodown(selectedToGodown);
      }
      
      // Mark form as prefilled
      formPrefilled.current = true;
      setLoading(false);
    }
  }, [dataLoadStatus, originalData, pmplData, stockData, partyOptions]);

  // Get stock for a specific item and godown
  const getStockForItemAndGodown = (itemCode: string, godownCode: string): number => {
    if (!stockData[itemCode] || !stockData[itemCode][godownCode]) {
      return 0;
    }
    return stockData[itemCode][godownCode];
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormValues({ ...formValues, [name]: value });
  };

  const handleFromGodownChange = (value: string) => {
    const selectedGodown = partyOptions.find(option => option.GDN_CODE === value);
    setFromGodown(selectedGodown);
    const updatedItems = formValues.items.map(item => {
      const stockValue = item.item ? getStockForItemAndGodown(item.item, value).toString() : '';
      return {
        ...item,
        godown: value,
        stock: stockValue
      };
    });
    
    setFormValues({ 
      ...formValues, 
      fromGodown: value,
      items: updatedItems
    });
    
    // Don't reset toGodown when editing an existing transfer
    if (value === formValues.toGodown) {
      showToast('From and To Godowns cannot be the same', 'error');
    }
  };

  const handleToGodownChange = (value: string) => {
    const selectedGodown = partyOptions.find(option => option.GDN_CODE === value);
    setToGodown(selectedGodown);
    
    if (value === formValues.fromGodown) {
      showToast('From and To Godowns cannot be the same', 'error');
      return;
    }
    
    setFormValues({ ...formValues, toGodown: value });
  };

  const getAvailableItems = () => {
    const selectedCodes = new Set(formValues.items.map((item) => item.item));
    
    if (!formValues.fromGodown) return [];
    
    // Filter products that have stock in the selected "From Godown" OR are in the current transfer
    return pmplData.filter((pmpl) => {
      // Skip already selected items
      if (selectedCodes.has(pmpl.CODE)) return false;
      
      // Include items that have stock in the selected godown
      const stockAmount = getStockForItemAndGodown(pmpl.CODE, formValues.fromGodown);
      if (stockAmount > 0) return true;
      
      // Also include items that were in the original transfer 
      // (regardless of current stock)
      if (originalData && originalData.items) {
        return originalData.items.some(item => item.code === pmpl.CODE);
      }
      
      return false;
    });
  };

  const addItem = (newToGodown?: string) => {
    const toGodownValue = newToGodown || formValues.toGodown;
    
    setFormValues(prevState => ({
      ...prevState,
      toGodown: toGodownValue,
      items: [
        ...prevState.items,
        {
          item: '',
          stock: '',
          pack: '',
          gst: '',
          unit: '',
          pcBx: '',
          mrp: '',
          rate: '',
          qty: '',
          cess: '0',
          cd: '0',
          sch: '0',
          amount: '',
          netAmount: '',
          godown: prevState.fromGodown, // Set the godown to the form's fromGodown
          originalQty: '0'
        },
      ],
    }));
    
    // Automatically expand the newly added accordion
    setExpanded(formValues.items.length);
  };

  const removeItem = (index: number) => {
    const newItems = formValues.items.filter((_, i) => i !== index);
    setFormValues({ ...formValues, items: newItems });
  };

  const updateItem = (index: number, newData: any) => {
    const newItems = formValues.items.map((item, i) => (i === index ? newData : item));
    setFormValues({ ...formValues, items: newItems });
  };

  const handleAccordionChange = (panel: number) => (event: React.SyntheticEvent, isExpanded: boolean) => {
    setExpanded(isExpanded ? panel : false);
  };

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToastMessage(message);
    setToastType(type);
    setToastVisible(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setClicked(true);
    
    const { fromGodown, toGodown, items } = formValues;

    if (!fromGodown) {
      showToast('Please select From Godown', 'error');
      setClicked(false);
      return;
    }

    if (!toGodown) {
      showToast('Please select To Godown', 'error');
      setClicked(false);
      return;
    }

    if (fromGodown === toGodown) {
      showToast('From and To Godowns cannot be the same', 'error');
      setClicked(false);
      return;
    }

    const allQuantitiesValid = items.every((item) => item.qty && parseInt(item.qty) > 0);

    if (!allQuantitiesValid) {
      showToast('All items must have a quantity greater than 0', 'error');
      setClicked(false);
      return;
    }

    const payload = {
      id,
      date: formValues.date,
      series: formValues.series,
      fromGodown: formValues.fromGodown,
      toGodown: formValues.toGodown,
      items: items.map((el) => ({
        code: el.item,
        qty: el.qty,
        unit: el.unit
      })),
    };

    try {
      const res = await fetch(`${baseURL}/edit/godown`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        credentials: 'include'
      });
      
      if (!res.ok) {
        throw new Error(`Error ${res.status}: ${await res.text()}`);
      }
      
      const json = await res.json();
      showToast(json.message || 'Godown transfer updated successfully', 'success');
      
      // Reset form or redirect
      setTimeout(() => {
        navigate('/db/godown-transfer');
      }, 2000);
    } catch (error: any) {
      showToast('Error updating form: ' + (error.message || 'Unknown error'), 'error');
      console.error('Error updating form:', error);
      setClicked(false);
    }
  };

  const sortedFormValues = () => {
    if (!searchItems) return formValues;

    const filteredItems = formValues.items.filter((item) =>
      item.item.toLowerCase().includes(searchItems.toLowerCase()),
    );

    return {
      ...formValues,
      items: filteredItems.sort((a, b) => a.item.localeCompare(b.item)),
    };
  };

  // Check if an item was in the original transfer
  const isOriginalItem = (itemCode: string): boolean => {
    if (!originalData || !originalData.items) return false;
    return originalData.items.some(item => item.code === itemCode);
  };

  // Get the original quantity for an item
  const getOriginalQuantity = (itemCode: string): string => {
    if (!originalData || !originalData.items) return '0';
    const item = originalData.items.find(item => item.code === itemCode);
    return item ? item.qty : '0';
  };

  // Calculate the total items that have been properly filled out
  const calculateValidItemsCount = () => {
    return formValues.items.filter(item => 
      item.item && 
      item.godown && 
      item.qty && 
      parseFloat(item.qty) > 0
    ).length;
  };

  // Add condition to check loading state
  if (loading) {
    return (
      <div>
        <PageMeta
          title="Edit Godown Transfer | FMCG Vite Admin Template"
          description="Edit Godown Transfer in FMCG Vite Admin Template"
        />
        <PageBreadcrumb pageTitle="Edit Godown Transfer" />
        <FormSkeletonLoader />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-lg text-red-600 dark:text-red-400">{error}</div>
      </div>
    );
  }

  return (
    <div>
      <PageMeta
        title="Edit Godown Transfer" 
        description="Edit Godown Transfer page in FMCG Vite Admin Template" 
      />
      <PageBreadcrumb pageTitle="Edit Godown Transfer" />

      {toastVisible && (
        <Toast
          message={toastMessage}
          type={toastType}
          isVisible={toastVisible}
          onClose={() => setToastVisible(false)}
        />
      )}

      <FormComponent onSubmit={handleSubmit} autoComplete="off">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div>
              <Input
                id="date"
                label="Date"
                type="date"
                name="date"
                value={formValues.date}
                onChange={handleChange}
                variant="outlined"
                required
              />
            </div>
            <div>
              <Input
                id="series"
                label="Series"
                name="series"
                value={formValues.series}
                onChange={handleChange}
                variant="outlined"
                disabled
              />
            </div>
            <div>
              <Input
                id="id"
                label="ID"
                value={id || ''}
                variant="outlined"
                disabled
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <Autocomplete
                id="fromGodown"
                label="From Godown"
                options={partyOptions.map(option => ({
                  value: option.GDN_CODE,
                  label: option.GDN_NAME
                }))}
                onChange={handleFromGodownChange}
                defaultValue={formValues.fromGodown}
              />
            </div>
            <div>
              <Autocomplete
                id="toGodown"
                label="To Godown"
                options={partyOptions
                  .filter(option => option.GDN_CODE !== formValues.fromGodown)
                  .map(option => ({
                    value: option.GDN_CODE,
                    label: option.GDN_NAME
                  }))}
                onChange={handleToGodownChange}
                defaultValue={formValues.toGodown}
              />
            </div>
          </div>
        </div>

        <div className="mb-4 mt-6">
          <h2 className="text-xl font-semibold mb-2 dark:text-white">Items</h2>
          
          <div className="relative max-w-md mb-4">
            <Input
              id="searchItems"
              label="Search Items"
              value={searchItems}
              onChange={(e) => setSearchItems(e.target.value)}
              variant="outlined"
              placeholder=""
              autoComplete="off"
            />
          </div>
        </div>

        <div className="mb-6">
          {sortedFormValues().items.map((item, index) => (
            <CollapsibleItemSection
              key={index}
              index={index}
              itemData={item}
              handleChange={handleAccordionChange}
              expanded={expanded}
              updateItem={updateItem}
              removeItem={removeItem}
              pmplData={getAvailableItems()}
              pmpl={pmplData}
              stockData={stockData}
              isOriginalItem={isOriginalItem(item.item)}
              originalQty={getOriginalQuantity(item.item)}
            />
          ))}
        </div>

        {formValues.fromGodown && formValues.toGodown && (
          <div className="mb-6">
            <button
              type="button"
              className="px-4 py-2 text-brand-500 border border-brand-500 rounded-md hover:bg-brand-50 dark:text-brand-400 dark:border-brand-400 dark:hover:bg-gray-800"
              onClick={() => addItem()}
            >
              Add Another Item
            </button>
          </div>
        )}

        <div className="flex justify-between items-center mb-6">
          <div className="text-xl font-semibold dark:text-white">
            Total Items: {calculateValidItemsCount()}
          </div>
          <div className="flex space-x-4">
            <button
              type="submit"
              className="px-4 py-2 bg-brand-500 text-white rounded-md hover:bg-brand-600 dark:bg-brand-600 dark:hover:bg-brand-700"
              disabled={clicked}
            >
              {clicked ? 'Saving...' : 'Update'}
            </button>
            <button
              type="button"
              className="px-4 py-2 text-gray-500 rounded-md hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
              onClick={() => navigate('/db/godown-transfer')}
            >
              Cancel
            </button>
          </div>
        </div>
      </FormComponent>
    </div>
  );
};

export default EditGodownTransfer;
