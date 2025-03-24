import React, { useState, useEffect } from 'react';
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import Input from "../../components/form/input/Input";
import Autocomplete from "../../components/form/input/Autocomplete";
import FormComponent from "../../components/form/Form";
import Toast from '../../components/ui/toast/Toast';
import constants from "../../constants";
import CollapsibleItemSection from './CollapsibleItemSection';

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
}

// Interface for stock data from API
interface StockData {
  [itemCode: string]: {
    [godownCode: string]: number;
  }
}

const GodownTransfer: React.FC = () => {
  const [id, setId] = useState(0);
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
  const [formValues, setFormValues] = useState({
    date: new Date().toISOString().split('T')[0],
    series: 'T',
    fromGodown: '',
    toGodown: '',
    items: [] as ItemData[],
  });
  const [expanded, setExpanded] = useState<number | false>(0);
  const baseURL = constants.baseURL;

  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const idRes = await fetch(`${baseURL}/slink/godownId`);
        const idData = await idRes.json();
        setId(idData.nextGodownId);

        const res = await fetch(`${baseURL}/api/dbf/godown.json`);
        const data = await res.json();
        if (Array.isArray(data)) {
          setPartyOptions(data);
        } else {
          console.error('Data fetched is not an array:', data);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };

    const fetchPmplData = async () => {
      try {
        const pmplRes = await fetch(`${baseURL}/api/dbf/pmpl.json`);
        const pmplDatas = await pmplRes.json();
        setPmplData(pmplDatas);
      } catch (error) {
        console.error('Error fetching PMPL data:', error);
      }
    };

    const fetchStockData = async () => {
      try {
        const stockRes = await fetch(`${baseURL}/api/stock`);
        const stockDatas = await stockRes.json();
        setStockData(stockDatas);
      } catch (error) {
        console.error('Error fetching stock data:', error);
      }
    };

    fetchOptions();
    fetchPmplData();
    fetchStockData();
  }, []); // Empty dependency array prevents infinite re-renders

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
    
    setToGodown(null); // Reset toGodown when fromGodown changes
  };

  const handleToGodownChange = (value: string) => {
    const selectedGodown = partyOptions.find(option => option.GDN_CODE === value);
    setToGodown(selectedGodown);
    
    // If this is the first time both godowns are selected, add the first item
    if (value && formValues.fromGodown && formValues.items.length === 0) {
      addItem(value);
    } else {
      setFormValues({ ...formValues, toGodown: value });
    }
  };

  const getAvailableItems = () => {
    const selectedCodes = new Set(formValues.items.map((item) => item.item));
    
    if (!formValues.fromGodown) return [];
    
    // Filter products that have stock in the selected "From Godown"
    return pmplData.filter((pmpl) => {
      if (selectedCodes.has(pmpl.CODE)) return false;
      
      // Check if this product has stock in the selected godown
      const stockAmount = getStockForItemAndGodown(pmpl.CODE, formValues.fromGodown);
      return stockAmount > 0;
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
      date: formValues.date,
      series: formValues.series,
      fromGodown: formValues.fromGodown,
      toGodown: formValues.toGodown,
      id: id.toString(),
      items: items.map((el) => ({
        code: el.item,
        qty: el.qty,
        unit: el.unit
      })),
    };

    try {
      const res = await fetch(`${baseURL}/api/godown`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      showToast(json.message || 'Godown transfer created successfully', 'success');
      // Reset form or redirect
      setTimeout(() => {
        window.location.href = '/db/godown-transfer';
      }, 2000);
    } catch (error: any) {
      showToast('Error submitting form: ' + (error.message || 'Unknown error'), 'error');
      console.error('Error submitting form:', error);
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

  // Calculate the total items that have been properly filled out
  const calculateValidItemsCount = () => {
    return formValues.items.filter(item => 
      item.item && 
      item.godown && 
      item.qty && 
      parseFloat(item.qty) > 0
    ).length;
  };

  return (
    <div>
      <PageMeta
        title="Godown Transfer" 
        description="Godown Transfer page in FMCG Vite Admin Template" 
      />
      <PageBreadcrumb pageTitle="Godown Transfer" />

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
                value={id.toString()}
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
                defaultValue=""
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
                defaultValue=""
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
              {clicked ? 'Saving...' : 'Submit'}
            </button>
            <button
              type="button"
              className="px-4 py-2 text-gray-500 rounded-md hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
              onClick={() => window.location.href = '/db/godown-transfer'}
            >
              Cancel
            </button>
          </div>
        </div>
      </FormComponent>
    </div>
  );
};

export default GodownTransfer;