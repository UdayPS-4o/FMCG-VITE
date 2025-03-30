import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import Input from "../../components/form/input/Input";
import Autocomplete from "../../components/form/input/Autocomplete";
import FormComponent from "../../components/form/Form";
import constants from "../../constants";
import CollapsibleItemSection from './CollapsibleItemSection';
import Toast from '../../components/ui/toast/Toast';
import { InvoiceContext, useInvoiceContext, type ItemData } from '../../contexts/InvoiceContext';
import InvoiceProvider from '../../contexts/InvoiceProvider';
import InvoicingSkeletonLoader from '../../components/ui/skeleton/SkeletonLoader';
import useAuth from '../../hooks/useAuth';

interface Option {
  value: string;
  label: string;
  stockLimit?: number;
}

const InvoicingContent: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [searchItems, setSearchItems] = useState<string>('');
  const [showValidationErrors, setShowValidationErrors] = useState<boolean>(false);
  
  // Get shared invoice data from context
  const { 
    partyOptions, 
    smOptions, 
    loading,
    error,
    items,
    updateItem,
    removeItem,
    addItem,
    calculateTotal,
    expandedIndex,
    setExpandedIndex,
    invoiceIdInfo
  } = useInvoiceContext();
  
  // Form state
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [series, setSeries] = useState<string>('T');
  const [billNo, setBillNo] = useState<string>('1');
  const [cash, setCash] = useState<'Y' | 'N'>('N');
  const [party, setParty] = useState<Option | null>(null);
  const [sm, setSm] = useState<Option | null>(null);
  const [ref, setRef] = useState<string>('');
  const [dueDays, setDueDays] = useState<string>('7');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [toast, setToast] = useState<{ 
    visible: boolean, 
    message: string, 
    type: 'success' | 'error' | 'info' 
  }>({ 
    visible: false, 
    message: '', 
    type: 'info' 
  });

  // Apply default series from user settings
  useEffect(() => {
    if (user && user.defaultSeries && user.defaultSeries.billing) {
      setSeries(user.defaultSeries.billing);
    }
  }, [user]);

  // Filter SM options based on user's role and assigned SM code
  const filteredSmOptions = useMemo(() => {
    if (!user || !smOptions) return [];
    
    const isAdmin = user.routeAccess && user.routeAccess.includes('Admin');
    
    // If user is not admin and has an assigned SM code, only show that option
    if (!isAdmin && user.smCode) {
      const userSm = smOptions.find(option => option.value === user.smCode);
      return userSm ? [userSm] : [];
    }
    
    // Otherwise, show all options
    return smOptions;
  }, [user, smOptions]);

  // Update bill number whenever series changes
  useEffect(() => {
    if (series && invoiceIdInfo?.nextSeries) {
      const nextNumber = invoiceIdInfo.nextSeries[series.toUpperCase()] || 1;
      setBillNo(nextNumber.toString());
    } else {
      setBillNo('1');
    }
  }, [series, invoiceIdInfo]);

  // Auto-select SM based on user's smCode
  useEffect(() => {
    // Only proceed if we have user data and SM options loaded
    if (user && smOptions && smOptions.length > 0) {
      // If user has smCode and is not admin, auto-select their SM
      const isAdmin = user.routeAccess && user.routeAccess.includes('Admin');
      
      if (user.smCode && !isAdmin) {
        const userSm = smOptions.find(option => option.value === user.smCode);
        if (userSm) {
          setSm(userSm);
        }
      }
    }
  }, [user, smOptions]);

  const handleAccordionChange = (panel: number) => (_: React.SyntheticEvent, isExpanded: boolean) => {
    setExpandedIndex?.(isExpanded ? panel : -1);
  };

  // Form handlers
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDate(e.target.value);
  };

  const handleSeriesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Take only the last character typed and convert to uppercase
    const value = e.target.value;
    const newValue = value.length > 0 ? value.charAt(value.length - 1).toUpperCase() : '';
    setSeries(newValue);
  };

  const handleBillNoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setBillNo(e.target.value);
  };

  const toggleCash = () => {
    setCash(prev => {
      // When changing to credit (N), ensure due days is set to 7 if empty
      if (prev === 'Y') {
        if (!dueDays) {
          setDueDays('7');
        }
        return 'N';
      } else {
        return 'Y';
      }
    });
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
      newErrors.sm = 'SM is required';
    }
    
    // Create a more detailed validation for items
    let hasInvalidItems = false;
    let itemErrorMessage = '';
    
    // Check if there are any items
    if (items.length === 0 || !items.some(item => item.item)) {
      newErrors.items = 'At least one item is required';
      hasInvalidItems = true;
      itemErrorMessage = 'At least one item is required';
    } else {
      // Check each item that has an item code
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        
        // Only validate items that have been selected (have an item code)
        if (item.item) {
          if (!item.godown) {
            hasInvalidItems = true;
            itemErrorMessage = `Item ${item.item} is missing a godown selection`;
            setExpandedIndex?.(i); // Expand the problematic item
            break;
          }
          
          if (!item.qty || item.qty === '0') {
            hasInvalidItems = true;
            itemErrorMessage = `Item ${item.item} is missing a quantity`;
            setExpandedIndex?.(i); // Expand the problematic item
            break;
          }
          
          // Validate that quantity doesn't exceed stock limit
          if (parseInt(item.qty) > item.stockLimit) {
            hasInvalidItems = true;
            itemErrorMessage = `Item ${item.item} quantity (${item.qty}) exceeds available stock (${item.stockLimit})`;
            setExpandedIndex?.(i); // Expand the problematic item
            break;
          }
        }
      }
    }
    
    if (hasInvalidItems) {
      newErrors.items = itemErrorMessage;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    // Set validation messages to be visible
    setShowValidationErrors(true);
    
    if (!validateForm()) {
      // Show a more detailed error message based on the specific validation error
      let errorMessage = 'Please fill in all required fields';
      
      if (errors.items) {
        errorMessage = errors.items;
      } else if (errors.party) {
        errorMessage = errors.party;
      } else if (errors.sm) {
        errorMessage = errors.sm;
      }
      
      setToast({
        visible: true,
        message: errorMessage,
        type: 'error'
      });
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      // For non-admin users with an assigned smCode, the SM field is locked to their code
      // This is handled in the UI by making the field disabled and auto-selecting their SM
      const apiData = {
        date,
        series,
        billNo,
        cash,
        party: party?.value || '',
        partyName: party?.label.split('|')[0]?.trim() || '',
        sm: sm?.value || '',
        smName: sm?.label.split('|')[0]?.trim() || '',
        ref,
        dueDays: cash === 'N' ? dueDays : '',
        items: items.filter(item => item.item).map(item => ({
          item: item.item,
          godown: item.godown,
          unit: item.unit,
          rate: item.rate,
          qty: item.qty,
          cess: item.cess,
          schRs: item.schRs,
          sch: item.sch,
          cd: item.cd,
          amount: item.amount,
          netAmount: item.netAmount
        }))
      };
      
      const response = await fetch(`${constants.baseURL}/invoicing`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(apiData),
        credentials: 'include'
      });
      
      // Handle duplicate bill number error (409 Conflict)
      if (response.status === 409) {
        const errorData = await response.json();
        setToast({
          visible: true,
          message: errorData.message,
          type: 'error'
        });
        
        // Update the bill number with the suggested number
        if (errorData.suggestedBillNo) {
          setBillNo(errorData.suggestedBillNo);
        }
        
        setIsSubmitting(false);
        return;
      }
      
      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }
      
      setToast({
        visible: true,
        message: 'Invoice created successfully!',
        type: 'success'
      });
      
      setTimeout(() => {
        navigate('/db/invoicing');
      }, 2000);
      
    } catch (error) {
      console.error('Failed to submit invoice:', error);
      setToast({
        visible: true,
        message: 'Failed to create invoice',
        type: 'error'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredItems = () => {
    if (!searchItems.trim()) {
      return items;
    }
    
    return items.map(item => {
      if (item.selectedItem) {
        const matchesSearch = item.selectedItem.PRODUCT?.toLowerCase().includes(searchItems.toLowerCase()) ||
                            item.item.toLowerCase().includes(searchItems.toLowerCase());
        if (matchesSearch) {
          return { ...item, searchHighlight: true };
        }
      }
      return { ...item, searchHighlight: false };
    });
  };

  if (loading) {
    return (
      <div>
        <PageMeta
          title="Invoicing | FMCG Vite Admin Template"
          description="Create Invoice in FMCG Vite Admin Template"
        />
        <PageBreadcrumb pageTitle="Invoicing" />
        <InvoicingSkeletonLoader />
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
        title="Invoicing | FMCG Vite Admin Template"
        description="Create Invoice in FMCG Vite Admin Template"
      />
      <PageBreadcrumb pageTitle="Invoicing" />
      
      <Toast         
        message={toast.message}
        type={toast.type}
        isVisible={toast.visible}
        onClose={() => setToast({ ...toast, visible: false })}
      />
      
      <FormComponent onSubmit={handleSubmit} autoComplete="off">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
            <div>
              <Input
                id="date"
                label="Date"
                type="date"
                value={date}
                onChange={handleDateChange}
                variant="outlined"
                autoComplete="off"
                required
              />
            </div>
            <div>
              <Input
                id="series"
                label="Series"
                value={series}
                onChange={handleSeriesChange}
                variant="outlined"
                maxLength={1}
                autoComplete="off"
                required
                className="uppercase"
                disabled={user && user.canSelectSeries === false}
                seriesMode={true}
              />
            </div>
            <div>
              <Input
                id="billNo"
                label="Bill No."
                value={billNo}
                onChange={handleBillNoChange}
                variant="outlined"
                autoComplete="off"
                required
              />
            </div>
            <div>
              <div className="flex items-center h-full">
                <div
                  className={`relative inline-block w-16 h-8 cursor-pointer rounded-full transition-colors ease-in-out duration-200 ${
                    cash === 'Y' ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                  onClick={toggleCash}
                >
                  <span
                    className={`absolute left-1 top-1 inline-block w-6 h-6 rounded-full bg-white shadow transform transition-transform duration-200 ${
                      cash === 'Y' ? 'translate-x-8' : 'translate-x-0'
                    }`}
                  />
                </div>
                <div className="ml-3 text-gray-700 dark:text-gray-300 text-sm">
                  {cash === 'Y' ? 'Cash' : 'Credit'}
                </div>
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
                options={filteredSmOptions}
                onChange={handleSmChange}
                defaultValue={sm?.value || ''}
                value={sm?.value || ''}
                disabled={!!(user && !user.routeAccess.includes('Admin') && user.smCode)}
                autoComplete="off"
              />
              {user && !user.routeAccess.includes('Admin') && user.smCode && (
                <p className="mt-1 text-xs text-gray-500">S/M is locked to your assigned salesman code</p>
              )}
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

        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-2 dark:text-white">Items</h2>
          
          <div className="relative max-w-md mb-4">
            <Input
              id="searchItems"
              label="Search Items"
              value={searchItems}
              onChange={handleSearchItemsChange}
              variant="outlined"
              autoComplete="off"
            />
          </div>
        </div>

        <div className="mb-6">
          {filteredItems().map((item, index) => (
            <CollapsibleItemSection
              key={index}
              index={index}
              item={item}
              handleAccordionChange={handleAccordionChange}
              expanded={expandedIndex === index}
              updateItem={updateItem}
              removeItem={removeItem}
              showValidationErrors={showValidationErrors}
            />
          ))}
        </div>

        <div className="mb-6">
          <button
            type="button"
            className="px-4 py-2 text-brand-500 border border-brand-500 rounded-md hover:bg-brand-50 dark:text-brand-400 dark:border-brand-400 dark:hover:bg-gray-800"
            onClick={() => {
              // Check if there are any incomplete items
              const hasIncompleteItems = items.some(item => item.item && (!item.godown || !item.qty));
              if (hasIncompleteItems) {
                setShowValidationErrors(true);
                setToast({
                  visible: true,
                  message: 'Please complete all item details before adding another item',
                  type: 'error'
                });
              } else {
                setShowValidationErrors(false);
              }
              // Always add a new item regardless of validation state
              addItem();
            }}
          >
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
              {isSubmitting ? 'Submitting...' : 'Submit'}
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

const Invoicing: React.FC = () => {
  const [items, setItems] = useState<ItemData[]>([{ 
    item: '', godown: '', unit: '', stock: '', pack: '', gst: '', 
    pcBx: '', mrp: '', rate: '', qty: '', cess: '', schRs: '', sch: '', 
    cd: '', amount: '', netAmount: '', selectedItem: null, stockLimit: 0 
  }]);
  const [expandedIndex, setExpandedIndex] = useState<number>(0);

  // Item management functions
  const addItem = () => {
    const newItems = [...items, { 
      item: '', godown: '', unit: '', stock: '', pack: '', gst: '', 
      pcBx: '', mrp: '', rate: '', qty: '', cess: '', schRs: '', sch: '', 
      cd: '', amount: '', netAmount: '', selectedItem: null, stockLimit: 0 
    }];
    setItems(newItems);
    // Set the expanded index to the new item
    setExpandedIndex(newItems.length - 1);
  };

  const removeItem = (index: number) => {
    const newItems = [...items];
    newItems.splice(index, 1);
    setItems(newItems);
  };

  const updateItem = (index: number, newData: ItemData) => {
    const newItems = [...items];
    newItems[index] = newData;
    setItems(newItems);
  };

  const calculateTotal = () => {
    return items
      .reduce((sum, item) => sum + parseFloat(item.netAmount || '0'), 0)
      .toFixed(2);
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
      <InvoicingContent />
    </InvoiceProvider>
  );
};

export default Invoicing; 