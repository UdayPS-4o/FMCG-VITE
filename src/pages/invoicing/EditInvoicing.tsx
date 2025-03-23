import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import Input from "../../components/form/input/Input";
import Autocomplete from "../../components/form/input/Autocomplete";
import FormComponent from "../../components/form/Form";
import constants from "../../constants";
import CollapsibleItemSection from './CollapsibleItemSection';
import Toast from '../../components/ui/toast/Toast';
import { InvoiceContext, useInvoiceContext, type Option, type ItemData } from '../../contexts/InvoiceContext';
import InvoiceProvider from '../../contexts/InvoiceProvider';

const EditInvoicingContent: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const dataLoadedRef = useRef(false);
  
  // Get shared invoice data from context
  const { 
    partyOptions, 
    smOptions, 
    pmplData, 
    stockList, 
    loading: dataLoading,
    error: dataError,
    items,
    updateItem,
    removeItem,
    addItem,
    expandedIndex,
    setExpandedIndex
  } = useInvoiceContext();

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [searchItems, setSearchItems] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Form state
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [series, setSeries] = useState<string>('');
  const [cash, setCash] = useState<string>('Y');
  const [party, setParty] = useState<Option | null>(null);
  const [sm, setSm] = useState<Option | null>(null);
  const [ref, setRef] = useState<string>('');
  const [dueDays, setDueDays] = useState<string>('7');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
  }>({
    visible: false,
    message: '',
    type: 'info',
  });

  // Load invoice data
  useEffect(() => {
    const loadInvoice = async () => {
      if (!id) {
        setError('No invoice ID provided');
        setLoading(false);
        return;
      }

      // If we've already loaded the data, don't load it again
      if (dataLoadedRef.current) {
        return;
      }

      try {
        // Try both possible endpoints
        let invoiceData;
        try {
          const res = await fetch(`${constants.baseURL}/edit/invoicing/${id}`);
          if (!res.ok) throw new Error('Primary endpoint failed');
          invoiceData = await res.json();
        } catch {
          const res = await fetch(`${constants.baseURL}/invoicing/${id}`);
          if (!res.ok) throw new Error('Invoice not found');
          invoiceData = await res.json();
        }

        // Set form data
        setCash(invoiceData.cash === 'true' || invoiceData.cash === true ? 'Y' : 'N');
        setSeries(invoiceData.series || '');
        setRef(invoiceData.ref || '');
        setDueDays(invoiceData.dueDays || '7');

        // Format and set date
        if (invoiceData.date) {
          try {
            const dateParts = invoiceData.date.split(/[-/]/);
            let formattedDate;
            
            if (dateParts.length === 3) {
              if (dateParts[0].length === 4) {
                formattedDate = invoiceData.date;
              } else if (dateParts[2].length === 4) {
                formattedDate = `${dateParts[2]}-${dateParts[1].padStart(2, '0')}-${dateParts[0].padStart(2, '0')}`;
              } else {
                formattedDate = new Date().toISOString().slice(0, 10);
              }
            } else {
              const dateObj = new Date(invoiceData.date);
              formattedDate = !isNaN(dateObj.getTime()) 
                ? dateObj.toISOString().slice(0, 10)
                : new Date().toISOString().slice(0, 10);
            }
            
            setDate(formattedDate);
          } catch (err) {
            console.error('Error formatting date:', err);
            setDate(new Date().toISOString().slice(0, 10));
          }
        }

        // Set party and SM
        if (invoiceData.party && partyOptions.length > 0) {
          const partyOption = partyOptions.find(p => p.value === invoiceData.party);
          if (partyOption) {
            setParty(partyOption);
          } else {
            const placeholder = {
              value: invoiceData.party,
              label: invoiceData.partyName || invoiceData.party
            };
            setParty(placeholder);
          }
        }

        if (invoiceData.sm && smOptions.length > 0) {
          const smOption = smOptions.find(s => s.value === invoiceData.sm);
          if (smOption) {
            setSm(smOption);
          } else {
            const placeholder = {
              value: invoiceData.sm,
              label: invoiceData.smName || invoiceData.sm
            };
            setSm(placeholder);
          }
        }

        // Process items
        if (invoiceData.items) {
          let itemsArray = typeof invoiceData.items === 'string' 
            ? JSON.parse(invoiceData.items) 
            : invoiceData.items;

          const processedItems = itemsArray.map((item: any) => {
            // Find the matching PMPL item
            const pmplItem = pmplData.find(p => p.CODE === item.item);
            
            // Calculate stock
            let totalStock = 0;
            if (stockList[item.item]) {
              Object.values(stockList[item.item]).forEach(stock => {
                totalStock += parseInt(stock as string, 10);
              });
            }

            // Calculate stock limit
            const godownStock = stockList[item.item]?.[item.godown] || '0';
            const stockValue = parseInt(godownStock, 10);
            const stockLimit = item.unit === pmplItem?.UNIT_2
              ? Math.floor(stockValue / parseInt(pmplItem.MULT_F, 10))
              : stockValue;

            return {
              ...item,
              stock: `${godownStock} (Total: ${totalStock})`,
              stockLimit,
              selectedItem: pmplItem || null,
              // Ensure all required fields exist
              unit: item.unit || pmplItem?.UNIT_1 || '',
              pack: item.pack || pmplItem?.PACK || '',
              gst: item.gst || pmplItem?.GST || '',
              pcBx: item.pcBx || pmplItem?.MULT_F || '',
              mrp: item.mrp || pmplItem?.MRP1 || '',
              rate: item.rate || '',
              qty: item.qty || '',
              cess: item.cess || '',
              schRs: item.schRs || '',
              sch: item.sch || '',
              cd: item.cd || '',
              amount: item.amount || '',
              netAmount: item.netAmount || ''
            };
          });

          // Update items through context - this part was causing the infinite loop
          processedItems.forEach((item: ItemData, index: number) => {
            if (index < items.length) {
              updateItem(index, item);
            } else {
              addItem();
              updateItem(items.length, item);
            }
          });
        }

        dataLoadedRef.current = true; // Mark that we've loaded the data
        setError(null);
      } catch (err) {
        console.error('Failed to load invoice:', err);
        setError(err instanceof Error ? err.message : 'Failed to load invoice');
        setToast({
          visible: true,
          message: 'Failed to load invoice',
          type: 'error'
        });
      } finally {
        setLoading(false);
      }
    };

    if (!dataLoading && !dataError && !dataLoadedRef.current) {
      loadInvoice();
    }
  }, [id, dataLoading, dataError, partyOptions, smOptions, pmplData, stockList]); // Removed items, updateItem, addItem

  const handleAccordionChange = (panel: number) => (_: React.SyntheticEvent, isExpanded: boolean) => {
    setExpandedIndex?.(isExpanded ? panel : -1);
  };

  // Form handlers
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDate(e.target.value);
  };

  const handleSeriesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSeries(e.target.value);
  };

  const toggleCash = () => {
    setCash(prev => prev === 'Y' ? 'N' : 'Y');
  };

  const handleDueDaysChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDueDays(e.target.value);
  };

  const handleRefChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRef(e.target.value);
  };

  const handlePartyChange = (value: string) => {
    const selected = partyOptions.find(option => option.value === value);
    setParty(selected || null);
  };

  const handleSmChange = (value: string) => {
    const selected = smOptions.find(option => option.value === value);
    setSm(selected || null);
  };

  const handleSearchItemsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchItems(e.target.value);
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!party) {
      newErrors.party = 'Party is required';
    }

    if (!sm) {
      newErrors.sm = 'S/M is required';
    }

    if (items.some((item) => !item.item || !item.qty || !item.rate)) {
      newErrors.items = 'Each item must have a name, quantity, and rate';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const calculateTotal = () => {
    return items.reduce((total, item) => {
      return total + (parseFloat(item.netAmount) || 0);
    }, 0).toFixed(2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isSubmitting) {
      console.log('Already submitting, please wait...');
      return;
    }
    
    if (!validateForm()) {
      console.log('Form validation failed');
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      const formattedItems = items.map(item => ({
        ...item,
        selectedItem: undefined
      }));
      
      const response = await fetch(`${constants.baseURL}/edit/invoicing`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id,
          series,
          date,
          cash,
          party: party?.value || '',
          partyName: party?.label || '',
          sm: sm?.value || '',
          smName: sm?.label || '',
          ref,
          dueDays,
          items: formattedItems
        }),
      });
      
      if (!response.ok) {
        let errorMessage = 'Failed to update invoice';
        try {
          const errorData = await response.text();
          errorMessage = `Server error: ${errorData || response.statusText}`;
        } catch (e) {
          console.error('Could not parse error response:', e);
        }
        throw new Error(errorMessage);
      }
      
      setToast({
        visible: true,
        message: 'Invoice updated successfully',
        type: 'success',
      });
      
      setTimeout(() => {
        navigate('/invoicing');
      }, 1500);
    } catch (error) {
      console.error('Error updating invoice:', error);
      setToast({
        visible: true,
        message: `An unexpected error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredItems = () => {
    if (!searchItems) return items;

    return items
      .filter((item) => item.item.toLowerCase().includes(searchItems.toLowerCase()))
      .sort((a, b) => a.item.localeCompare(b.item));
  };

  if (dataLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-lg text-gray-600 dark:text-gray-300">Loading...</div>
      </div>
    );
  }

  if (dataError || error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-lg text-red-600 dark:text-red-400">{dataError || error}</div>
      </div>
    );
  }

  return (
    <div>
      <PageMeta
        title="Edit Invoice | FMCG Vite Admin Template"
        description="Edit Invoice page in FMCG Vite Admin Template"
      />
      <PageBreadcrumb pageTitle="Edit Invoice" />
      
      <Toast         
        message={toast.message}
        type={toast.type}
        isVisible={toast.visible}
        onClose={() => setToast({ ...toast, visible: false })}
      />
      
      <FormComponent onSubmit={handleSubmit} autoComplete="off" className="flex flex-col w-full">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div>
              <Input
                id="date"
                label="Date"
                type="date"
                value={date}
                onChange={handleDateChange}
                variant="outlined"
                autoComplete="off"
              />
            </div>
            <div>
              <Input
                id="series"
                label="Series"
                placeholder="T"
                value={series}
                onChange={handleSeriesChange}
                variant="outlined"
                autoComplete="off"
              />
            </div>
            <div className="flex items-center">
              <div className="flex items-center space-x-2">
                <span className="text-gray-700 dark:text-gray-300">CREDIT {cash === 'N' ? '(O)' : ''}</span>
                <div className="relative inline-block w-12 h-6 transition duration-200 ease-in-out rounded-full cursor-pointer">
                  <input
                    type="checkbox"
                    id="cash-toggle"
                    className="absolute w-6 h-6 transition duration-200 ease-in-out transform bg-white border rounded-full appearance-none cursor-pointer peer border-gray-300 dark:border-gray-600 checked:right-0 checked:border-brand-500 checked:bg-brand-500 dark:checked:border-brand-400 dark:checked:bg-brand-400"
                    checked={cash === 'Y'}
                    onChange={toggleCash}
                    autoComplete="off"
                  />
                  <label
                    htmlFor="cash-toggle"
                    className="block h-full overflow-hidden rounded-full cursor-pointer bg-gray-300 dark:bg-gray-700 peer-checked:bg-brand-100 dark:peer-checked:bg-brand-900"
                  ></label>
                </div>
                <span className="text-gray-700 dark:text-gray-300">CASH {cash === 'Y' ? '(O)' : ''}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <Autocomplete
                id="party"
                label="Party"
                options={partyOptions}
                onChange={handlePartyChange}
                defaultValue={party?.value}
                autoComplete="off"
              />
              {errors.party && (
                <p className="mt-1 text-sm text-red-500">{errors.party}</p>
              )}
            </div>
            <div>
              <Input
                id="gst"
                label="GST"
                value={party ? (party as any).gst || '' : ''}
                disabled
                variant="outlined"
                autoComplete="off"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <Autocomplete
                id="sm"
                label="S/M"
                options={smOptions}
                onChange={handleSmChange}
                defaultValue={sm?.value}
                autoComplete="off"
              />
              {errors.sm && (
                <p className="mt-1 text-sm text-red-500">{errors.sm}</p>
              )}
            </div>
            <div>
              <Input
                id="ref"
                label="Reference"
                value={ref}
                onChange={handleRefChange}
                variant="outlined"
                autoComplete="off"
              />
            </div>
          </div>

          {cash === 'N' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <Input
                  id="dueDays"
                  label="Due Date"
                  value={dueDays}
                  onChange={handleDueDaysChange}
                  variant="outlined"
                  autoComplete="off"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex-grow w-full mb-4 mt-6">
          <h2 className="text-xl font-semibold mb-2 dark:text-white">Items</h2>
          
          <div className="relative max-w-md mb-4">
            <Input
              id="searchItems"
              label="Search Items"
              value={searchItems}
              onChange={handleSearchItemsChange}
              variant="outlined"
              className="pl-10"
              autoComplete="off"
            />
          </div>
        </div>

        <div className="w-full mb-6 pr-2">
          {filteredItems().map((item, index) => (
            <CollapsibleItemSection
              key={index}
              index={index}
              item={item}
              handleAccordionChange={handleAccordionChange}
              expanded={expandedIndex === index}
              updateItem={updateItem}
              removeItem={removeItem}
            />
          ))}
        </div>

        <div className="mb-6">
          <button
            type="button"
            className="px-5 py-3 text-brand-500 border-2 border-brand-500 font-medium rounded-md hover:bg-brand-50 hover:text-brand-600 dark:text-brand-400 dark:border-brand-400 dark:hover:bg-gray-800 flex items-center gap-2 transition-all duration-200"
            onClick={addItem}
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              width="18" 
              height="18" 
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Add Another Item
          </button>
        </div>

        <div className="flex justify-between items-center mb-6">
          <div className="text-xl font-semibold dark:text-white">
            Total: ₹{calculateTotal()}
          </div>
          <div className="flex space-x-4">
            <button
              type="submit"
              className="px-4 py-2 bg-brand-500 text-white rounded-md hover:bg-brand-600 dark:bg-brand-600 dark:hover:bg-brand-700"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Updating...' : 'Update Invoice'}
            </button>
            <button
              type="button"
              className="px-4 py-2 text-gray-500 rounded-md hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
              onClick={() => navigate('/db/invoicing')}
            >
              Cancel
            </button>
          </div>
        </div>
      </FormComponent>
    </div>
  );
};

const EditInvoicing: React.FC = () => {
  const [items, setItems] = useState<ItemData[]>([{
    item: '',
    godown: '',
    unit: '',
    stock: '',
    pack: '',
    gst: '',
    pcBx: '',
    mrp: '',
    rate: '',
    qty: '',
    cess: '',
    schRs: '',
    sch: '',
    cd: '',
    amount: '',
    netAmount: '',
    selectedItem: null,
    stockLimit: 0,
  }]);
  const [expandedIndex, setExpandedIndex] = useState<number>(0);

  // Item management functions
  const addItem = () => {
    const newItems = [...items, {
      item: '',
      godown: '',
      unit: '',
      stock: '',
      pack: '',
      gst: '',
      pcBx: '',
      mrp: '',
      rate: '',
      qty: '',
      cess: '',
      schRs: '',
      sch: '',
      cd: '',
      amount: '',
      netAmount: '',
      selectedItem: null,
      stockLimit: 0,
    }];
    setItems(newItems);
    // Set the expandedIndex to the new item's index
    setExpandedIndex(newItems.length - 1);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const updateItem = (index: number, newData: ItemData) => {
    const newItems = items.map((item, i) => i === index ? newData : item);
    setItems(newItems);
  };

  const calculateTotal = () => {
    return items.reduce((total, item) => {
      return total + (parseFloat(item.netAmount) || 0);
    }, 0).toFixed(2);
  };

  return (
    <InvoiceProvider
      items={items}
      updateItem={updateItem}
      removeItem={removeItem}
      addItem={addItem}
      calculateTotal={calculateTotal}
      expandedIndex={expandedIndex}
      setExpandedIndex={setExpandedIndex}
    >
      <EditInvoicingContent />
    </InvoiceProvider>
  );
};

export default EditInvoicing; 