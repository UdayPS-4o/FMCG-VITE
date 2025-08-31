import React, { useState, useEffect, useMemo, useRef, createRef } from 'react';
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import Input, { InputRefHandle } from "../../components/form/input/Input";
import Autocomplete, { AutocompleteRefHandle } from "../../components/form/input/Autocomplete";
import DatePicker from '../../components/form/input/DatePicker';
import FormComponent from "../../components/form/Form";
import Toast from '../../components/ui/toast/Toast';
import constants from "../../constants";
import CollapsibleItemSection, { CollapsibleItemSectionRefHandle } from './CollapsibleItemSection';
import apiCache from '../../utils/apiCache';
import { FormSkeletonLoader } from "../../components/ui/skeleton/SkeletonLoader";
import useAuth from "../../hooks/useAuth";

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

// Interface for godown ID data from API
interface GodownIdData {
  nextSeries: {
    [key: string]: number;
  };
}

interface SmOption {
  value: string;
  label: string;
}

// Utility function to center an element in the viewport
const centerElementInViewport = (element: HTMLElement | null) => {
  if (!element) return;
  element.scrollIntoView({
    behavior: 'smooth',
    block: 'center' 
  });
};

const GodownTransfer: React.FC = () => {
  const [id, setId] = useState(0);
  const [partyOptions, setPartyOptions] = useState<any[]>([]);
  const [allGodowns, setAllGodowns] = useState<any[]>([]); // Store all godowns
  const [fromGodown, setFromGodown] = useState<any>(null);
  const [toGodown, setToGodown] = useState<any>(null);
  const [sm, setSm] = useState<SmOption | null>(null); // S/M state
  const [smOptions, setSmOptions] = useState<SmOption[]>([]); // S/M options state
  const [pmplData, setPmplData] = useState<any[]>([]); // Hold product data from pmpl.json
  const [stockData, setStockData] = useState<StockData>({});
  const [searchItems, setSearchItems] = useState('');
  const [clicked, setClicked] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('info');
  
  // Helper function to format local date as DD-MM-YYYY
  const getLocalDateDDMMYYYY = (date: Date): string => {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0'); // Add 1 because months are 0-indexed
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  };
  
  const [formValues, setFormValues] = useState({
    date: getLocalDateDDMMYYYY(new Date()), // Prefill with local date
    series: 'T',
    fromGodown: '',
    toGodown: '',
    sm: '', // Add S/M field
    items: [] as ItemData[],
  });
  const [expanded, setExpanded] = useState<number | false>(0);
  const [stockDataLoaded, setStockDataLoaded] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const baseURL = constants.baseURL;
  const { user } = useAuth();
  const [godownIdInfo, setGodownIdInfo] = useState<GodownIdData | null>(null);
  const [godownIdHash, setGodownIdHash] = useState<string | null>(null);

  // Refs for focus management
  const seriesRef = useRef<InputRefHandle>(null);
  const fromGodownRef = useRef<AutocompleteRefHandle>(null);
  const toGodownRef = useRef<AutocompleteRefHandle>(null);
  const smSelectRef = useRef<AutocompleteRefHandle>(null);
  const searchItemsRef = useRef<InputRefHandle>(null);
  const addAnotherItemButtonRef = useRef<HTMLButtonElement>(null);
  const collapsibleItemRefs = useRef<Array<React.RefObject<CollapsibleItemSectionRefHandle>>>([]);
  const [focusNewItemIndex, setFocusNewItemIndex] = useState<number | null>(null);

  useEffect(() => {
    collapsibleItemRefs.current = formValues.items.map((_, i) => collapsibleItemRefs.current[i] ?? createRef<CollapsibleItemSectionRefHandle>());
  }, [formValues.items]);

  useEffect(() => {
    if (!loading && seriesRef.current) {
      seriesRef.current.focus();
    }
  }, [loading]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Fetch godownId with caching support
        let godownIdResponse;
        try {
          const headers: HeadersInit = {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          };
          
          // Add the ETag if we have a hash
          if (godownIdHash) {
            headers['If-None-Match'] = godownIdHash;
          }
          
          godownIdResponse = await fetch(`${baseURL}/slink/godownId`, {
            headers
          });
          
          // Update the stored hash from the response
          const newEtag = godownIdResponse.headers.get('ETag');
          if (newEtag) {
            setGodownIdHash(newEtag.replace(/"/g, ''));
          }
          
          // If we got a 304 Not Modified, use our cached data
          if (godownIdResponse.status === 304) {
            console.log('Using cached godown ID data');
          } else if (godownIdResponse.ok) {
            // Otherwise parse the new data
            const godownIdData = await godownIdResponse.json();
            setGodownIdInfo(godownIdData);
            // Update ID based on series
            if (godownIdData.nextSeries && godownIdData.nextSeries[formValues.series]) {
              setId(godownIdData.nextSeries[formValues.series]);
            } else {
              // If series not found, default to 1
              setId(1);
            }
          } else {
            throw new Error('Failed to fetch godown ID');
          }
        } catch (error) {
          console.error('Error fetching godown ID:', error);
        }
        
        // Fetch all data in parallel using Promise.all
        const [godownData, pmplResponse, stockResponse, cmplData] = await Promise.all([
          apiCache.fetchWithCache(`${baseURL}/api/dbf/godown.json`),
          apiCache.fetchWithCache(`${baseURL}/api/dbf/pmpl.json`),
          apiCache.fetchWithCache<StockData>(`${baseURL}/api/stock`),
          apiCache.fetchWithCache<any[]>(`${baseURL}/cmpl`) // Add CMPL data for S/M
        ]);
        
        // Store all godowns for the To Godown dropdown
        if (Array.isArray(godownData)) {
          setAllGodowns(godownData);
          
          // Filter godowns based on user access rights for From Godown
          let filteredGodowns = godownData;
          
          // If user has godownAccess restrictions, filter the godowns
          if (user && user.godownAccess && user.godownAccess.length > 0) {
            filteredGodowns = godownData.filter(godown => 
              user.godownAccess.includes(godown.GDN_CODE)
            );
          }
          
          setPartyOptions(filteredGodowns);
        } else {
          console.error('Godown data is not an array:', godownData);
        }

        // Process PMPL data
        if (Array.isArray(pmplResponse)) {
          setPmplData(pmplResponse);
        } else {
          console.error('PMPL data is not an array:', pmplResponse);
        }

        // Process S/M options from CMPL data
        if (Array.isArray(cmplData)) {
          const smList = cmplData.filter(item => 
            item.C_CODE && item.C_CODE.startsWith('SM') && !item.C_CODE.endsWith('000')
          );
          const smApiOptions = smList.map((item: any) => ({
            value: item.C_CODE, // Assuming C_CODE is the SM_CODE
            label: `${item.C_NAME} | ${item.C_CODE}`, // Assuming C_NAME is the SM_NAME
          }));
          setSmOptions(smApiOptions);
        } else {
          console.warn('CMPL data for S/M is not an array:', cmplData);
          setSmOptions([]);
          showToast('Failed to fetch S/M options (CMPL data invalid)', 'error');
        }

        // Process stock data
        setStockData(stockResponse || {});
        setStockDataLoaded(true);
        
        setLoading(false);
      } catch (error) {
        console.error('Error fetching data:', error);
        setLoading(false);
      }
    };

    fetchData();
    
    // Clean up expired cache items
    try {
      apiCache.clearExpiredCache();
    } catch (error) {
      console.error('Error clearing cache:', error);
    }
  }, []); // Empty dependency array prevents infinite re-renders

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

  // Determine if S/M field should be disabled
  const isSmDisabled = useMemo(() => {
    if (!user) return false;
    const isAdmin = user.routeAccess && user.routeAccess.includes('Admin');
    return !!(!isAdmin && user.smCode);
  }, [user]);

  // Auto-select SM based on user's smCode
  useEffect(() => {
    if (user && smOptions && smOptions.length > 0) {
      const isAdmin = user.routeAccess && user.routeAccess.includes('Admin');
      
      if (user.smCode && !isAdmin) {
        const userSm = smOptions.find(option => option.value === user.smCode);
        if (userSm) {
          setSm(userSm);
          setFormValues(prev => ({
            ...prev,
            sm: userSm.value
          }));
        }
      }
    }
  }, [user, smOptions]);

  // Apply default series if present in user settings
  useEffect(() => {
    if (user && user.defaultSeries) {
      // Set default series for godown transfer if specified in user settings
      if (user.defaultSeries.godown) {
        setFormValues(prev => ({
          ...prev,
          series: user.defaultSeries.godown
        }));
      }
    }
  }, [user]);

  // Update id whenever series changes
  useEffect(() => {
    if (godownIdInfo && godownIdInfo.nextSeries && formValues.series) {
      const upperSeries = formValues.series.toUpperCase();
      if (godownIdInfo.nextSeries[upperSeries]) {
        setId(godownIdInfo.nextSeries[upperSeries]);
      } else {
        // If no specific series ID is found, default to 1
        setId(1);
      }
    }
  }, [formValues.series, godownIdInfo]);

  // Get stock for a specific item and godown
  const getStockForItemAndGodown = (itemCode: string, godownCode: string): number => {
    if (!stockData[itemCode] || !stockData[itemCode][godownCode]) {
      return 0;
    }
    return stockData[itemCode][godownCode];
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    
    // For series field, only allow alphabetic characters
    if (name === 'series') {
      const alphabeticValue = value.replace(/[^A-Za-z]/g, '');
      const uppercaseValue = alphabeticValue.toUpperCase();
      setFormValues(prev => ({ ...prev, [name]: uppercaseValue }));
    } else {
      // For other fields, simply set the value directly
      setFormValues(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleDateChange = (dateString: string) => {
    setFormValues(prev => ({ ...prev, date: dateString }));
  };

  const handleSmChange = (value: string) => {
    const selected = smOptions.find(option => option.value === value);
    setSm(selected || null);
    setFormValues(prev => ({
      ...prev,
      sm: value
    }));
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
    const selectedGodown = allGodowns.find(option => option.GDN_CODE === value);
    setToGodown(selectedGodown);
    
    // If this is the first time both godowns are selected and stock data is loaded, add the first item
    if (value && formValues.fromGodown && formValues.items.length === 0 && stockDataLoaded) {
      addItem(value);
    } else {
      setFormValues({ ...formValues, toGodown: value });
    }
  };

  const getAvailableItems = () => {
    const selectedCodes = new Set(formValues.items.map((item) => item.item));
    
    if (!formValues.fromGodown || !stockDataLoaded) return [];
    
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
    
    const newItem: ItemData = {
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
      godown: formValues.fromGodown, // Set the godown to the form's fromGodown
    };

    const newItems = [...formValues.items, newItem];
    setFormValues(prevState => ({
      ...prevState,
      toGodown: toGodownValue,
      items: newItems,
    }));
    
    setExpanded(newItems.length - 1);
    setFocusNewItemIndex(newItems.length - 1); // Set focus to the new item
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
    if (isExpanded) {
      // Potentially focus item name when expanding an existing section, if desired
      // setTimeout(() => collapsibleItemRefs.current[panel]?.current?.focusItemName(), 50);
    } else if (focusNewItemIndex === panel) {
      // If the section being collapsed was the one intended for focus, clear it
      setFocusNewItemIndex(null);
    }
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

    // S/M validation
    if (!formValues.sm && !isSmDisabled) {
      showToast('Please select a Salesman', 'error');
      setClicked(false);
      return;
    }

    const payload = {
      date: formValues.date,
      series: formValues.series,
      fromGodown: formValues.fromGodown,
      toGodown: formValues.toGodown,
      sm: formValues.sm || (user?.smCode || 'SM001'), // Use user's smCode or SM001 as default
      smName: sm?.label ? sm.label.split('|')[0].trim() : '', // Extract SM name
      id: id.toString(),
      items: items.map((el) => ({
        code: el.item,
        qty: el.qty,
        unit: el.unit
      })),
    };

    try {
      const res = await fetch(`${baseURL}/godown`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(payload),
      });
      
      if (!res.ok) {
        throw new Error(`Error ${res.status}: ${await res.text()}`);
      }
      
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

  // Navigation Handlers
  const handleTabToNextItem = (currentIndex: number) => {
    const nextItemIndex = currentIndex + 1;
    if (nextItemIndex < formValues.items.length && collapsibleItemRefs.current[nextItemIndex]?.current) {
      setExpanded(nextItemIndex); 
      setTimeout(() => {
        collapsibleItemRefs.current[nextItemIndex]?.current?.focusItemName();
      }, 50); // Delay to allow section to expand
    } else if (addAnotherItemButtonRef.current) {
      addAnotherItemButtonRef.current.focus();
      centerElementInViewport(addAnotherItemButtonRef.current);
    }
  };

  const handleShiftTabToPreviousItem = (currentIndex: number) => {
    const prevItemIndex = currentIndex - 1;
    if (prevItemIndex >= 0 && collapsibleItemRefs.current[prevItemIndex]?.current) {
      setExpanded(prevItemIndex);       
      setTimeout(() => {
        collapsibleItemRefs.current[prevItemIndex]?.current?.focusQty(); // Focus Qty of previous item
      }, 50); // Delay to allow section to expand
    } else if (searchItemsRef.current) { 
      searchItemsRef.current.focus();
      centerElementInViewport(document.getElementById('searchItems'));
    }
  };

  const handleQtyEnterNavigate = () => {
    if (addAnotherItemButtonRef.current) {
      addAnotherItemButtonRef.current.focus();
      centerElementInViewport(addAnotherItemButtonRef.current);
    }
  };

  const handleSearchItemsEnter = () => {
    if (formValues.items.length > 0 && collapsibleItemRefs.current[0]?.current) {
      setExpanded(0);
      setTimeout(() => {
         collapsibleItemRefs.current[0]?.current?.focusItemName();
      }, 50);
    } else if (addAnotherItemButtonRef.current) {
      addAnotherItemButtonRef.current.focus();
      centerElementInViewport(addAnotherItemButtonRef.current);
    }
  };

  // Reset focusNewItemIndex after it has been used or section changes
  useEffect(() => {
    if (focusNewItemIndex !== null && expanded !== focusNewItemIndex) {
        // If a new item was added, but then the user expanded a different section, clear the focus intent
        setFocusNewItemIndex(null);
    }
  }, [expanded, focusNewItemIndex]);

  // Add loading state check to render the skeleton loader
  if (loading) {
    return (
      <div>
        <PageMeta
          title="Godown Transfer | FMCG Vite Admin Template"
          description="Create Godown Transfer in FMCG Vite Admin Template"
        />
        <PageBreadcrumb pageTitle="Godown Transfer" />
        <FormSkeletonLoader />
      </div>
    );
  }

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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
            <div>
              <DatePicker
                id="date"
                label="Date"
                name="date"
                value={formValues.date}
                onChange={handleDateChange}
                dateFormatType="dd-mm-yyyy"
                required
                minDate={useAuth().user?.allowPastDateEntries ? undefined : new Date()}
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
                disabled={Boolean(user && ((user.defaultSeries?.godown) || user.canSelectSeries === false))}
                ref={seriesRef}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
                    e.preventDefault();
                    fromGodownRef.current?.focus();
                    centerElementInViewport(document.getElementById('fromGodown'));
                  }
                }}
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
            <div>
              <Autocomplete
                id="sm-select"
                label="S/M"
                options={filteredSmOptions}
                onChange={handleSmChange}
                value={sm?.value || ''}
                defaultValue={sm?.value || ''}
                disabled={isSmDisabled}
                ref={smSelectRef}
                onEnter={() => { // Assuming S/M is last before From Godown or not critical for immediate item entry focus
                  fromGodownRef.current?.focus();
                  centerElementInViewport(document.getElementById('fromGodown'));
                }}
              />
              {isSmDisabled && (
                <p className="mt-1 text-xs text-gray-500">S/M is locked to your assigned salesman code</p>
              )}
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
                defaultValue={formValues.fromGodown || ""} // Ensure defaultValue is string
                ref={fromGodownRef}
                onEnter={() => {
                  toGodownRef.current?.focus();
                  centerElementInViewport(document.getElementById('toGodown'));
                }}
              />
            </div>
            <div>
              <Autocomplete
                id="toGodown"
                label="To Godown"
                options={allGodowns
                  // Only filter out the current fromGodown
                  .filter(option => option.GDN_CODE !== formValues.fromGodown)
                  .map(option => ({
                    value: option.GDN_CODE,
                    label: option.GDN_NAME
                  }))}
                onChange={handleToGodownChange}
                defaultValue={formValues.toGodown || ""} // Ensure defaultValue is string
                ref={toGodownRef}
                onEnter={() => {
                  // If items exist, focus the first one, otherwise focus search/add button
                  if (formValues.items.length > 0 && collapsibleItemRefs.current[0]?.current) {
                    setExpanded(0);
                    setTimeout(() => {
                        collapsibleItemRefs.current[0]?.current?.focusItemName();
                    }, 50);
                  } else if (searchItemsRef.current) {
                    searchItemsRef.current.focus();
                    centerElementInViewport(document.getElementById('searchItems'));
                  } else if (addAnotherItemButtonRef.current) {
                    addAnotherItemButtonRef.current.focus();
                    centerElementInViewport(addAnotherItemButtonRef.current);
                  }
                }}
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
              ref={searchItemsRef}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
                  e.preventDefault();
                  handleSearchItemsEnter();
                }
                // Shift+Tab will be handled by browser default or previous field
              }}
            />
          </div>
        </div>

        <div className="mb-6">
          {sortedFormValues().items.map((itemData, idx) => (
            <CollapsibleItemSection
              key={idx} // Changed from index to idx to avoid conflict with outer scope
              ref={collapsibleItemRefs.current[idx]}
              index={idx} // Changed from index to idx
              itemData={itemData}
              handleChange={handleAccordionChange}
              expanded={expanded === idx ? idx : false} // Ensure expanded is number | false
              updateItem={updateItem}
              removeItem={removeItem}
              pmplData={getAvailableItems()}
              pmpl={pmplData}
              stockData={stockData}
              shouldFocusOnExpand={focusNewItemIndex === idx}
              onQtyEnterNavigate={handleQtyEnterNavigate}
              onTabToNextItem={handleTabToNextItem}
              onShiftTabToPreviousItem={handleShiftTabToPreviousItem}
            />
          ))}
        </div>

        {formValues.fromGodown && formValues.toGodown && (
          <div className="mb-6">
            <button
              type="button"
              className="px-4 py-2 text-brand-500 border border-brand-500 rounded-md hover:bg-brand-50 dark:text-brand-400 dark:border-brand-400 dark:hover:bg-gray-800"
              onClick={() => addItem()} // addItem now handles focus
              disabled={!stockDataLoaded}
              ref={addAnotherItemButtonRef}
            >
              {!stockDataLoaded ? 'Loading Stock Data...' : 'Add Another Item'}
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