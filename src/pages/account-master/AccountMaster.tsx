import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import Input from "../../components/form/input/Input";
import Autocomplete from "../../components/form/input/Autocomplete";
import FormComponent from "../../components/form/Form";
import constants from "../../constants";
import { useAuth, getUserSubgroups, hasMultipleSubgroups, hasSingleSubgroup } from '../../contexts/AuthContext';
import apiCache from '../../utils/apiCache';
import { FormSkeletonLoader } from "../../components/ui/skeleton/SkeletonLoader";
import Toast from '../../components/ui/toast/Toast';
import { validateGSTIN, validatePAN, validateFSSAI, fetchGSTINDetails, validatePANFormat, validateGSTINFormat } from '../../utils/validators';
import GpsCapture, { GpsValue } from '../../components/account-master/GpsCapture';
import ShopPhotoCapture from '../../components/account-master/ShopPhotoCapture';
import {
  Store, ReceiptText, IdCard, MapPin, Map as MapIcon, Building2, Mailbox, Phone, Mail,
  Fingerprint, FileBadge, Leaf, BadgeCheck, LoaderCircle, Check, Camera,
} from 'lucide-react';

interface Option {
  label: string;
  value: string;
  badges?: React.ReactNode;
}

interface FormValues {
  achead: string;
  addressline1: string;
  addressline2: string;
  place: string;
  pincode: string;
  mobile: string;
  pan: string;
  aadhar: string;
  gstin: string;
  dlno: string;
  fssaino: string;
  email: string;
  statecode: string;
  subgroup: string;
  businessName: string;
}

interface ValidationErrors {
  gstin?: string;
  pan?: string;
  fssaino?: string;
  mobile?: string;
  pincode?: string;
  aadhar?: string;
}

// Add this interface to define Input component's error prop type
interface InputProps {
  id: string;
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  variant: string;
  autoComplete: string;
  required?: boolean;
  maxLength?: number;
  type?: string;
  error?: string;
  hint?: string;
}

interface AccountMasterEntry {
  subgroup: string;
  achead?: string;
  addressline1?: string;
  addressline2?: string;
  place?: string;
  pincode?: string;
  mobile?: string;
  pan?: string;
  aadhar?: string;
  gst?: string;
  dlno?: string;
  fssaino?: string;
  email?: string;
  statecode?: string;
  businessName?: string;
}

interface SubgroupEntry {
  title: string;
  subgroupCode: string;
}

interface StateEntry {
  ST_CODE: string;
  ST_NAME: string;
}

const Section: React.FC<{ n: number; title: string; hint?: string; delay: number; children: React.ReactNode }> = ({
  n, title, hint, delay, children,
}) => (
  <section className="am-enter mb-8" style={{ animationDelay: `${delay}ms` }}>
    <div className="flex items-center gap-2 mb-4">
      <span className="w-6 h-6 rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400 text-xs font-medium flex items-center justify-center">
        {n}
      </span>
      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-200">{title}</h3>
      {hint && <span className="hidden sm:inline text-xs text-gray-400 dark:text-gray-500">{hint}</span>}
      <div className="flex-1 h-px bg-gray-100 dark:bg-gray-700 ml-2" />
    </div>
    {children}
  </section>
);

const REQUIRED_FIELDS = ['achead', 'addressline1', 'place', 'pincode', 'mobile'] as const;

interface UpdateParty {
  code: string;
  name: string;
  place: string;
  prefix: string;
  updatedAt: string | null;
  hasGps?: boolean;
  hasPhoto?: boolean;
}

interface AccountMasterProps {
  /** 'update' edits existing parties (CMPL) and saves them in the web app only */
  mode?: 'create' | 'update';
}

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

const AccountMaster: React.FC<AccountMasterProps> = ({ mode = 'create' }) => {
  const isUpdate = mode === 'update';
  const [updSubgroups, setUpdSubgroups] = useState<Option[]>([]);
  const [updParties, setUpdParties] = useState<UpdateParty[]>([]);
  const [updSubgroup, setUpdSubgroup] = useState('');
  const [partyCode, setPartyCode] = useState('');
  const [partyLoading, setPartyLoading] = useState(false);
  const [existingPhoto, setExistingPhoto] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<{ at: string; by: string | null } | null>(null);
  // Contacts the customer added in the ordering app; shown read-only
  const [appContacts, setAppContacts] = useState<{ name: string; mobile: string; role: string }[]>([]);
  const [group, setGroup] = useState<Option[]>([]);
  const [subgroup, setSubgroup] = useState<Option[]>([]);
  const [city, setCity] = useState<Option[]>([]);
  const [isEDIT, setIsEDIT] = useState<boolean>(false);
  const [SubName, setSubName] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const [isTouched, setIsTouched] = useState<Record<string, boolean>>({});
  const [fieldBlurred, setFieldBlurred] = useState<Record<string, boolean>>({});
  const [formValues, setFormValues] = useState<FormValues>({
    achead: '',
    addressline1: '',
    addressline2: '',
    place: '',
    pincode: '',
    mobile: '',
    pan: '',
    aadhar: '',
    gstin: '',
    dlno: '',
    fssaino: '',
    email: '',
    statecode: '',
    subgroup: '',
    businessName: '',
  });
  const [gps, setGps] = useState<GpsValue | null>(null);
  const [shopPhoto, setShopPhoto] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [gstChecking, setGstChecking] = useState(false);
  const [flashAchead, setFlashAchead] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  const [toast, setToast] = useState<{ 
    visible: boolean, 
    message: string, 
    type: 'success' | 'error' | 'info' 
  }>({ 
    visible: false, 
    message: '', 
    type: 'info' 
  });

  // Check if user is admin
  const isAdmin = user && user.routeAccess && user.routeAccess.includes('Admin');

  // Configure field order for Enter key navigation
  // Same order as the fields appear on screen
  const fieldOrder = [
    'subgroup',
    'party',
    'achead',
    'gstin',
    'pan',
    'addressline1',
    'addressline2',
    'place',
    'pincode',
    'statecode',
    'mobile',
    'email',
    'aadhar',
    'dlno',
    'fssaino',
  ];

  // Handle Enter key for field navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        // Get the active element's ID
        const activeElement = document.activeElement as HTMLElement;
        if (!activeElement || !activeElement.id) return;
        
        // Prevent form submission
        e.preventDefault();
        
        // Find the current field index in our order
        const currentIndex = fieldOrder.indexOf(activeElement.id);
        
        // If found and not the last field, move to the next one
        if (currentIndex >= 0 && currentIndex < fieldOrder.length - 1) {
          const nextFieldId = fieldOrder[currentIndex + 1];
          const nextField = document.getElementById(nextFieldId);
          if (nextField) {
            nextField.focus();
            
            // If it's an input, move cursor to the end
            if (nextField instanceof HTMLInputElement) {
              const inputLength = nextField.value.length;
              nextField.setSelectionRange(inputLength, inputLength);
            }
          }
        }
      }
    };
    
    // Add event listener to each field
    fieldOrder.forEach(fieldId => {
      const element = document.getElementById(fieldId);
      if (element) {
        element.addEventListener('keydown', handleKeyDown);
      }
    });
    
    // Cleanup function
    return () => {
      fieldOrder.forEach(fieldId => {
        const element = document.getElementById(fieldId);
        if (element) {
          element.removeEventListener('keydown', handleKeyDown);
        }
      });
    };
  }, [fieldOrder]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const currentUrl = window.location.href;
        
        if (isUpdate) {
          const res = await fetch(`${constants.baseURL}/api/account-updates/parties`, { headers: authHeaders() });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data?.message || 'Could not load parties');
          setUpdSubgroups(data.subgroups || []);
          setUpdParties(data.parties || []);
          if ((data.subgroups || []).length === 1) setUpdSubgroup(data.subgroups[0].value);
        } else if (currentUrl.includes('edit')) {
          setIsEDIT(true);
          const subgroup = currentUrl.split('?sub=').pop() || '';
          console.log('Fetching account data for subgroup:', subgroup);

          // Use apiCache for account-master data
          const data = await apiCache.fetchWithCache<AccountMasterEntry[]>(`${constants.baseURL}/json/account-master`);
          console.log('Account data:', data);

          const account = data.find((account) => account.subgroup === subgroup);
          if (account) {
            console.log('Found account:', account);
            setGroup([{ label: account.subgroup, value: account.subgroup }]);
            setSubgroup([{ label: account.subgroup, value: account.subgroup }]);
            setFormValues({
              subgroup: account.subgroup,
              achead: account.achead || '',
              addressline1: account.addressline1 || '',
              addressline2: account.addressline2 || '',
              place: account.place || '',
              pincode: account.pincode || '',
              mobile: account.mobile || '',
              pan: account.pan || '',
              aadhar: account.aadhar || '',
              gstin: account.gst || '',
              dlno: account.dlno || '',
              fssaino: account.fssaino || '',
              email: account.email || '',
              statecode: account.statecode || '',
              businessName: account.businessName || '',
            });
          } else {
            console.error('Account not found for subgroup:', subgroup);
            console.error('Available accounts:', data);
            throw new Error(`Subgroup "${subgroup}" not found in account data`);
          }
        } else {
          setIsEDIT(false);
          const response = await fetch(`${constants.baseURL}/slink/subgrp`, {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
          });
          if (!response.ok) {
            throw new Error('Failed to fetch subgroup data');
          }
          const data = await response.json() as SubgroupEntry[];
          
          // Get all available subgroups
          const allSubgroups = data.map((party) => ({
            label: party.title,
            value: party.subgroupCode,
          }));
          
          // Filter subgroups based on user permissions
          if (!isAdmin && user) {
            const userSubgroups = getUserSubgroups(user);
            const allowedSubgroupCodes = userSubgroups.map(sg => sg.subgroupCode);
            
            // Filter groups to only include allowed subgroups
            const filteredGroups = allSubgroups.filter(g => 
              allowedSubgroupCodes.includes(g.value)
            );
            
            setGroup(filteredGroups);
            
            // If user has only one subgroup or only one subgroup is available, pre-select it
            if (hasSingleSubgroup(user) || filteredGroups.length === 1) {
              const subgroupOption = hasSingleSubgroup(user) ? 
                {
                  label: userSubgroups[0]?.title || 'Unknown',
                  value: userSubgroups[0]?.subgroupCode || ''
                } : 
                filteredGroups[0];
              
              setSubgroup([subgroupOption]);
              
              setFormValues({
                ...formValues,
                subgroup: subgroupOption.value
              });
            }
          } else {
            // For admin users, show all subgroups
            setGroup(allSubgroups);
            
            // If only one subgroup is available, auto-select it
            if (allSubgroups.length === 1) {
              setSubgroup([allSubgroups[0]]);
              setFormValues({
                ...formValues,
                subgroup: allSubgroups[0].value
              });
            }
          }
        }

        // Fetch state data with caching
        const stateData = await apiCache.fetchWithCache<StateEntry[]>(`${constants.baseURL}/api/dbf/state.json`);
        
        const stateList = stateData.map((state) => ({
          value: state.ST_CODE,
          label: state.ST_NAME,
        }));
        setCity(stateList);

        // Clear expired cache entries
        apiCache.clearExpiredCache();
      } catch (error) {
        console.error('Error:', error);
        setError(error instanceof Error ? error.message : 'An error occurred');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [user, isAdmin, isUpdate]);

  // Parties for the chosen sub group (the server already limits them to the user's sub groups)
  const partyOptions = useMemo(
    () =>
      updParties
        .filter((p) => !updSubgroup || p.prefix === updSubgroup)
        .map((p) => ({
          value: p.code,
          label: `${p.name}${p.place ? ` · ${p.place}` : ''} (${p.code})`,
          badges:
            p.updatedAt || p.hasGps || p.hasPhoto ? (
              <>
                {p.hasGps && (
                  <span title="GPS captured" className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400">
                    <MapPin className="w-3.5 h-3.5" aria-label="GPS captured" />
                  </span>
                )}
                {p.hasPhoto && (
                  <span title="Shop photo taken" className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400">
                    <Camera className="w-3.5 h-3.5" aria-label="Shop photo taken" />
                  </span>
                )}
                {p.updatedAt && (
                  <span title="Details updated" className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-green-50 text-green-600 dark:bg-green-500/15 dark:text-green-400">
                    <Check className="w-3.5 h-3.5" aria-label="Details updated" />
                  </span>
                )}
              </>
            ) : undefined,
        })),
    [updParties, updSubgroup]
  );

  const handleUpdSubgroupChange = (value: string) => {
    setUpdSubgroup(value);
    if (partyCode && !partyCode.toUpperCase().startsWith(value)) setPartyCode('');
  };

  const loadParty = async (code: string) => {
    if (!code || code === partyCode) return;
    setPartyLoading(true);
    setError(null);
    try {
      const res = await fetch(`${constants.baseURL}/api/account-updates/party/${encodeURIComponent(code)}`, {
        headers: authHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || 'Could not load party');
      const v = data.values || {};
      setFormValues({
        subgroup: code,
        achead: v.achead || '',
        addressline1: v.addressline1 || '',
        addressline2: v.addressline2 || '',
        place: v.place || '',
        pincode: v.pincode || '',
        mobile: v.mobile || '',
        pan: v.pan || '',
        aadhar: v.aadhar || '',
        gstin: v.gst || '',
        dlno: v.dlno || '',
        fssaino: v.fssaino || '',
        email: v.email || '',
        statecode: v.statecode || '',
        businessName: '',
      });
      setValidationErrors({});
      setFieldBlurred({});
      setGSTDetails({ entityType: '', legalName: '' });
      setSaved(false);
      setGps(
        typeof v.latitude === 'number' && typeof v.longitude === 'number'
          ? { latitude: v.latitude, longitude: v.longitude, accuracy: Number(v.gpsAccuracy) || 0, capturedAt: v.gpsCapturedAt || '' }
          : null
      );
      setLastUpdate(data.updatedAt ? { at: data.updatedAt, by: data.updatedByName } : null);
      setExistingPhoto(v.shopPhoto || null);
      setAppContacts(Array.isArray(data.appContacts) ? data.appContacts : []);
      setShopPhoto(null);
      if (v.shopPhoto) {
        // Photos are behind auth, so fetch with the token and show a blob URL
        const img = await fetch(`${constants.baseURL}/api/shop-photos/${encodeURIComponent(v.shopPhoto)}`, { headers: authHeaders() });
        if (img.ok) setShopPhoto(URL.createObjectURL(await img.blob()));
      }
      setPartyCode(code);
      const sub = code.substring(0, 2).toUpperCase();
      if (updSubgroups.some((sg) => sg.value === sub)) setUpdSubgroup(sub);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load party');
    } finally {
      setPartyLoading(false);
    }
  };

  useEffect(() => {
    const subg = localStorage.getItem('subgroup');
    if (subg) {
      const parsedSubg = JSON.parse(subg);
      setFormValues({
        ...formValues,
        subgroup: parsedSubg.subgroupCode,
      });
      setSubName(parsedSubg.title);
    }
  }, []);

  const handlePartyChange = (value: string) => {
    const selectedOption = group.find(option => option.value === value);
    if (selectedOption) {
      setSubgroup([selectedOption]);
      setFormValues({
        ...formValues,
        subgroup: value,
      });
    }
  };

  // Fetch GSTIN details when valid GSTIN is entered
  const fetchGSTINData = async (gstin: string) => {
    if (gstin.length === 15) {
      setGstChecking(true);
      try {
        const gstinData = await fetchGSTINDetails(gstin);
        
        if (gstinData && gstinData["Legal Name"]) {
          // Set the A/C Head to Business Name when GSTIN is verified
          setFormValues({
            ...formValues,
            businessName: gstinData["Business Name"] || "",
            achead: gstinData["Business Name"] || "",
            gstin: gstin || ""
          });
          
          // Store the entity type and legal name for display
          setGSTDetails({
            entityType: gstinData["Entity Type"] || "",
            legalName: gstinData["Legal Name"] || ""
          });

          if (gstinData["Business Name"]) {
            setFlashAchead(true);
            setTimeout(() => setFlashAchead(false), 1200);
          }
        }
      } catch (error) {
        console.error("Error fetching GSTIN data:", error);
      } finally {
        setGstChecking(false);
      }
    }
  };

  // Track GSTIN verification details
  const [gstDetails, setGSTDetails] = useState<{entityType: string, legalName: string}>({
    entityType: "",
    legalName: ""
  });

  // Validate specific fields
  const validateField = (id: string, value: string) => {
    let error = '';
    
    switch (id) {
      case 'gstin':
        if (value && value.length === 15) {
          if (!validateGSTIN(value)) {
            error = 'Invalid GSTIN';
          } else {
            // if gstin is not in focus 
            // if (!fieldBlurred[id]) {
              fetchGSTINData(value);
            // }
          }
        } else if (value && value.length > 0 && fieldBlurred[id]) {
          error = 'GSTIN must be 15 characters';
        }
        break;
      case 'pan':
        if (value && value.length === 10) {
          if (!validatePAN(value)) {
            error = 'Invalid PAN format';
          }
        } else if (value && value.length > 0 && fieldBlurred[id]) {
          error = 'PAN must be 10 characters';
        }
        break;
      case 'fssaino':
        if (value && fieldBlurred[id]) {
          const fssaiResult = validateFSSAI(value);
          if (fssaiResult !== true) {
            error = fssaiResult as string;
          }
        }
        break;
      case 'mobile':
        if (!value && fieldBlurred[id]) {
          error = 'Mobile number is required';
        } else if (value && value.length !== 10 && fieldBlurred[id]) {
          error = 'Mobile number must be 10 digits';
        }
        break;
      case 'pincode':
        if (value && value.length !== 6 && fieldBlurred[id]) {
          error = 'PIN code must be 6 digits';
        }
        break;
      case 'aadhar':
        if (value && value.length !== 12 && fieldBlurred[id]) {
          error = 'Aadhar number must be 12 digits';
        }
        break;
    }
    
    setValidationErrors(prev => ({
      ...prev,
      [id]: error
    }));
    
    return !error;
  };

  // Track whether a field is currently focused
  const [isFocused, setIsFocused] = useState<boolean>(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    
    // Mark field as touched
    if (!isTouched[id]) {
      setIsTouched({ ...isTouched, [id]: true });
    }
    
   
    if (id === 'pan') {
      // Progressive format validation for PAN
      if (value === '') {
        setFormValues({
          ...formValues,
          [id]: '',
        });
        setValidationErrors(prev => ({ ...prev, [id]: undefined }));
      } else {
        // Allow entry only if it matches PAN format for current position
        const newValue = value.toUpperCase();
        let isValid = true;
        
        // Check each character
        if (newValue.length > formValues.pan.length) {
          // Only validate the last character (newly added)
          const newChar = newValue[newValue.length - 1];
          const pos = newValue.length - 1;
          
          if (pos < 3) { // First 3 chars: Uppercase letters
            isValid = /^[A-Z]$/.test(newChar);
          } else if (pos === 3) { // 4th char: P, F, C, H, A, A, T
            isValid = /^[PFCHAAT]$/.test(newChar);
          } else if (pos === 4) { // 5th char: Uppercase letter
            isValid = /^[A-Z]$/.test(newChar);
          } else if (pos >= 5 && pos < 9) { // 6-9th chars: Digits
            isValid = /^[0-9]$/.test(newChar);
          } else if (pos === 9) { // 10th char: Uppercase letter
            isValid = /^[A-Z]$/.test(newChar);
          }
        }
        
        if (isValid) {
          setFormValues({
            ...formValues,
            [id]: newValue,
          });
          
          // Only validate complete PAN when blurred
          if (newValue.length === 10 && fieldBlurred[id]) {
            validateField(id, newValue);
          } else {
            setValidationErrors(prev => ({ ...prev, [id]: undefined }));
          }
        }
      }
    } else if (id === 'mobile') {
      // Format mobile: 10 digits
      const mobileRegex = /^[0-9]{0,10}$/;
      if (value === '' || mobileRegex.test(value)) {
        setFormValues({
          ...formValues,
          [id]: value,
        });
        
        // Only validate when field loses focus
        if (fieldBlurred[id] && !isFocused) {
          validateField(id, value);
        } else {
          setValidationErrors(prev => ({ ...prev, [id]: undefined }));
        }
      }
    } else if (id === 'pincode') {
      // Format pincode: 6 digits
      const pincodeRegex = /^[0-9]{0,6}$/;
      if (value === '' || pincodeRegex.test(value)) {
        setFormValues({
          ...formValues,
          [id]: value,
        });
        
        // Only validate when field loses focus
        if (fieldBlurred[id] && !isFocused) {
          validateField(id, value);
        } else {
          setValidationErrors(prev => ({ ...prev, [id]: undefined }));
        }
      }
    } else if (id === 'aadhar') {
      // Aadhar: 12 digits only
      const aadharRegex = /^[0-9]{0,12}$/;
      
      if (value === '' || aadharRegex.test(value)) {
        setFormValues({
          ...formValues,
          [id]: value,
        });
        
        // Only validate when field loses focus
        if (fieldBlurred[id] && !isFocused) {
          validateField(id, value);
        } else {
          setValidationErrors(prev => ({ ...prev, [id]: undefined }));
        }
      }
    } else if (id === 'gstin') {
      // Progressive format validation for GSTIN
      if (value === '') {
        setFormValues({
          ...formValues,
          [id]: '',
        });
        setValidationErrors(prev => ({ ...prev, [id]: undefined }));
        // Reset GSTIN verification details
        setGSTDetails({ entityType: "", legalName: "" });
      } else {
        // Allow entry only if it matches GSTIN format for current position
        const newValue = value.toUpperCase();
        let isValid = true;
        
        // Check each character
        if (newValue.length > formValues.gstin.length) {
          // Only validate the last character (newly added)
          const newChar = newValue[newValue.length - 1];
          const pos = newValue.length - 1;
          
          if (pos < 2) { // First 2 chars: Digits (state code)
            isValid = /^[0-9]$/.test(newChar);
          } else if (pos >= 2 && pos < 5) { // 3-5th chars: Uppercase letters (first 3 of PAN)
            isValid = /^[A-Z]$/.test(newChar);
          } else if (pos === 5) { // 6th char: P, F, C, H, A, A, T (4th of PAN)
            isValid = /^[PFCHAAT]$/.test(newChar);
          } else if (pos === 6) { // 7th char: Uppercase letter (5th of PAN)
            isValid = /^[A-Z]$/.test(newChar);
          } else if (pos >= 7 && pos < 11) { // 8-11th chars: Digits (6-9th of PAN)
            isValid = /^[0-9]$/.test(newChar);
          } else if (pos === 11) { // 12th char: Uppercase letter (10th of PAN)
            isValid = /^[A-Z]$/.test(newChar);
          } else if (pos === 12) { // 13th char: Digit 1-9 (entity number)
            isValid = /^[1-9]$/.test(newChar);
          } else if (pos === 13) { // 14th char: Z typically
            isValid = /^[A-Z]$/.test(newChar);
          } else if (pos === 14) { // 15th char: Checksum (alphanumeric)
            isValid = /^[0-9A-Z]$/.test(newChar);
          }
        }
        
        if (isValid) {
          // Reset GSTIN verification details when user modifies GSTIN
          if (newValue.length < 15 || newValue !== formValues.gstin) {
            setGSTDetails({ entityType: "", legalName: "" });
          }
          
          setFormValues({
            ...formValues,
            [id]: newValue,
          });
          
          // Validate complete GSTIN after user has typed 15 chars
          if (newValue.length === 15) {
            validateField(id, newValue);
          } else if (fieldBlurred[id] && !isFocused) {
            setValidationErrors(prev => ({ 
              ...prev, 
              [id]: 'GSTIN must be 15 characters'
            }));
          } else {
            // Clear validation error while user is still typing
            setValidationErrors(prev => ({ ...prev, [id]: undefined }));
          }
        }
      }
    } else if (id === 'fssaino') {
      // FSSAI: 14 digits
      const fssaiRegex = /^[0-9]{0,14}$/;
      if (value === '' || fssaiRegex.test(value)) {
        setFormValues({
          ...formValues,
          [id]: value,
        });
        
        // Validate when complete or field loses focus
        if (value.length === 14) {
          validateField(id, value);
        } else if (fieldBlurred[id] && !isFocused) {
          validateField(id, value);
        } else {
          // Clear validation error while user is still typing
          setValidationErrors(prev => ({ ...prev, [id]: undefined }));
        }
      }
    } else {
      setFormValues({
        ...formValues,
        [id]: value,
      });
    }
  };
  
  const handleFieldBlur = (id: string) => {
    setIsFocused(false);
    setFieldBlurred(prev => ({ ...prev, [id]: true }));
    validateField(id, formValues[id as keyof FormValues] as string);
  };

  const handleFieldFocus = (id: string) => {
    setIsFocused(true);
    // Clear validation errors when field gets focus
    setValidationErrors(prev => ({ ...prev, [id]: undefined }));
  };

  const handleStateChange = (value: string) => {
    setFormValues({
      ...formValues,
      statecode: value,
    });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving) return;
    try {
      setSaving(true);
      setError(null);

      if (isUpdate && !partyCode) {
        throw new Error('Choose a party first');
      }
      if (!isUpdate && (!subgroup || subgroup.length === 0)) {
        throw new Error('Please select a subgroup');
      }
      
      // Mark all fields as blurred for validation
      const allFields = ['gstin', 'pan', 'fssaino', 'mobile', 'pincode', 'aadhar'];
      const newBlurredState: Record<string, boolean> = {};
      allFields.forEach(field => {
        newBlurredState[field] = true;
      });
      setFieldBlurred(prev => ({ ...prev, ...newBlurredState }));
      
      // Validate mobile (required)
      if (!formValues.mobile) {
        setValidationErrors(prev => ({
          ...prev,
          mobile: 'Mobile number is required'
        }));
        throw new Error('Mobile number is required');
      }
      
      // Validate all fields
      let isValid = true;
      
      allFields.forEach(field => {
        // Only validate if the field has a value
        if (formValues[field as keyof FormValues]) {
          const fieldValid = validateField(field, formValues[field as keyof FormValues] as string);
          if (!fieldValid) isValid = false;
        }
      });
      
      if (!isValid) {
        throw new Error('Please correct the validation errors');
      }

      if (isUpdate) {
        const res = await fetch(`${constants.baseURL}/api/account-updates/party/${encodeURIComponent(partyCode)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({
            achead: formValues.achead,
            addressline1: formValues.addressline1,
            addressline2: formValues.addressline2,
            place: formValues.place,
            pincode: formValues.pincode,
            mobile: formValues.mobile,
            pan: formValues.pan,
            aadhar: formValues.aadhar,
            gst: formValues.gstin,
            dlno: formValues.dlno,
            fssaino: formValues.fssaino,
            email: formValues.email,
            statecode: formValues.statecode,
            latitude: gps?.latitude ?? '',
            longitude: gps?.longitude ?? '',
            gpsAccuracy: gps?.accuracy ?? '',
            gpsCapturedAt: gps?.capturedAt ?? '',
            // New photo -> data URL; unchanged -> keep the stored file name
            shopPhoto: shopPhoto?.startsWith('data:') ? shopPhoto : existingPhoto ?? '',
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.message || `Error ${res.status}`);
        setSaved(true);
        setLastUpdate({ at: data.updatedAt, by: user?.name || null });
        setUpdParties((list) =>
          list.map((p) =>
            p.code === partyCode
              ? { ...p, name: formValues.achead, place: formValues.place, updatedAt: data.updatedAt, hasGps: Boolean(gps), hasPhoto: Boolean(shopPhoto) }
              : p
          )
        );
        setToast({ visible: true, message: 'Account updated', type: 'success' });
        setTimeout(() => setSaved(false), 1800);
        return;
      }

      const values = {
        ...formValues,
        subgroup: subgroup[0].value,
        latitude: gps?.latitude ?? '',
        longitude: gps?.longitude ?? '',
        gpsAccuracy: gps?.accuracy ?? '',
        gpsCapturedAt: gps?.capturedAt ?? '',
        shopPhoto: shopPhoto ?? '',
      };

      const route = isEDIT ? `/edit/account-master` : `/account-master`;
      console.log('Submitting form to:', `${constants.baseURL}${route}`);
      console.log('Form values:', { ...values, shopPhoto: values.shopPhoto ? `[${values.shopPhoto.length} chars]` : '' });

      const response = await fetch(`${constants.baseURL}${route}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          ...values,
          gst: values.gstin, // Rename for API compatibility
        })
      });

      let data;
      try {
        // Try to parse JSON response if available
        const text = await response.text();
        data = text ? JSON.parse(text) : {};
      } catch (e) {
        console.log('Non-JSON response received');
        data = {};
      }

      if (response.ok) {
        console.log('Form submitted successfully');
        setSaved(true);
        // Show success toast
        setToast({
          visible: true,
          message: 'Account saved successfully!',
          type: 'success'
        });
        // Redirect to the correct URL after a short delay
        setTimeout(() => {
          navigate('/db/account-master');
        }, 1500);
      } else {
        console.error('API Error:', response.status, data);
        throw new Error(data?.message || `Error ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Submission failed:', error);
      setError(error instanceof Error ? error.message : 'Failed to submit form');
      setToast({
        visible: true,
        message: error instanceof Error ? error.message : 'Failed to submit form',
        type: 'error'
      });
    } finally {
      setSaving(false);
    }
  };

  const getSubgroupValue = () => {
    // Check if user has exactly one subgroup
    if (!isAdmin && user && hasSingleSubgroup(user)) {
      const userSubgroups = getUserSubgroups(user);
      return { 
        label: userSubgroups[0]?.title || 'Unknown',
        value: userSubgroups[0]?.subgroupCode || ''
      };
    }
    
    if (!subgroup || !subgroup.length) {
      return null;
    }
    
    const option = group.find(option => 
      option && subgroup[0] && option.value === subgroup[0].value
    );
    
    if (option) {
      return option;
    }
    
    if (formValues.subgroup !== '') {
      const routeAccess = localStorage.getItem('routeAccess');
      if (routeAccess && !routeAccess.includes('Admin')) {
        return { label: SubName || 'Subgroup', value: formValues.subgroup };
      }
    }
    
    return null;
  };

  if (isLoading) {
    return (
      <div>
        <PageMeta
          title="Account Master | FMCG Vite Admin Template"
          description="Create Account in FMCG Vite Admin Template"
        />
        <PageBreadcrumb pageTitle={isUpdate ? 'Update Account Master' : 'Account Master'} />
        <FormSkeletonLoader />
      </div>
    );
  }

  const isValid: Record<string, boolean> = {
    achead: formValues.achead.trim().length > 1,
    addressline1: formValues.addressline1.trim().length > 1,
    place: formValues.place.trim().length > 1,
    pincode: /^\d{6}$/.test(formValues.pincode),
    mobile: /^\d{10}$/.test(formValues.mobile),
    gstin: formValues.gstin.length === 15 && !validationErrors.gstin && !!gstDetails.legalName,
    pan: /^[A-Z]{5}\d{4}[A-Z]$/.test(formValues.pan) && !validationErrors.pan,
    aadhar: /^\d{12}$/.test(formValues.aadhar),
    fssaino: /^\d{14}$/.test(formValues.fssaino) && !validationErrors.fssaino,
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formValues.email.trim()),
  };
  const requiredDone = REQUIRED_FIELDS.filter((k) => isValid[k]).length;
  const progress = Math.round((requiredDone / REQUIRED_FIELDS.length) * 100);
  const initials = formValues.achead
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  return (
    <div>
      <PageMeta
        title="Account Master | FMCG Vite Admin Template"
        description="Account Master page in FMCG Vite Admin Template"
      />
      <PageBreadcrumb pageTitle={isUpdate ? 'Update Account Master' : 'Account Master'} />
      <div className="bg-white dark:bg-gray-800 p-5 sm:p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
        {/* Header: live initials + required-field progress */}
        <div className="am-enter flex items-center gap-4 mb-7">
          <div
            key={initials}
            className="am-pop shrink-0 w-12 h-12 rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400 flex items-center justify-center text-base font-medium"
          >
            {initials || <Store className="w-5 h-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-medium text-gray-800 dark:text-white/90 truncate">
              {isUpdate
                ? partyCode
                  ? formValues.achead.trim() || partyCode
                  : 'Update account master'
                : isEDIT
                ? 'Edit account'
                : formValues.achead.trim() || 'Open new account'}
            </h2>
            {isUpdate && partyCode && (
              <p className="am-pop text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {partyCode}
                {lastUpdate
                  ? ` · Last updated ${new Date(lastUpdate.at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}${lastUpdate.by ? ` by ${lastUpdate.by}` : ''}`
                  : ' · Not updated yet'}
              </p>
            )}
            <div className="flex items-center gap-3 mt-2">
              <div className="flex-1 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                <div
                  className="h-full rounded-full bg-brand-500 transition-[width] duration-500 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                {requiredDone} of {REQUIRED_FIELDS.length} required
              </span>
            </div>
          </div>
        </div>

        {error && (
          <div className="am-pop text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded-lg px-4 py-3 mb-6">
            {error}
          </div>
        )}

        <FormComponent onSubmit={handleSubmit}>
          {isUpdate && (
            <Section n={1} title="Choose party" delay={60}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <Autocomplete
                    id="subgroup"
                    label="Sub Group"
                    options={updSubgroups}
                    onChange={handleUpdSubgroupChange}
                    value={updSubgroup}
                    disabled={updSubgroups.length === 1}
                    autoComplete="off"
                  />
                  {!isAdmin && (
                    <p className="text-xs text-gray-500 mt-1">Showing only your assigned sub groups</p>
                  )}
                </div>
                <div>
                  <Autocomplete
                    id="party"
                    label={updSubgroup ? 'Party' : 'Party (all sub groups)'}
                    options={partyOptions}
                    onChange={loadParty}
                    value={partyCode}
                    autoComplete="off"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {partyLoading ? (
                      <span className="inline-flex items-center gap-1.5">
                        <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> Loading party details
                      </span>
                    ) : (
                      <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span>{partyOptions.length} parties</span>
                        <span className="inline-flex items-center gap-1"><Check className="w-3.5 h-3.5 text-green-500" /> updated</span>
                        <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-sky-500" /> GPS</span>
                        <span className="inline-flex items-center gap-1"><Camera className="w-3.5 h-3.5 text-violet-500" /> photo</span>
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </Section>
          )}

          {isUpdate && !partyCode ? (
            <div className="am-enter flex flex-col items-center text-center gap-2 py-12 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700" style={{ animationDelay: '160ms' }}>
              <Store className="w-8 h-8 text-brand-500" aria-hidden="true" />
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Pick a party to load its details</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm">
                Changes are saved in the web app only. The accounting software's party master isn't changed.
              </p>
            </div>
          ) : (
          <div key={partyCode || 'new'}>
          <Section n={isUpdate ? 2 : 1} title="Business details" delay={60}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {!isUpdate && (
              <div>
                <Autocomplete
                  id="subgroup"
                  label="Sub Group"
                  options={group}
                  onChange={handlePartyChange}
                  defaultValue={getSubgroupValue()?.value ?? ''}
                  disabled={Boolean(!isAdmin && user && hasSingleSubgroup(user))}
                  autoComplete="off"
                />
                {!isAdmin && user && hasSingleSubgroup(user) && (
                  <p className="text-xs text-gray-500 mt-1">Subgroup is locked to your assigned subgroup</p>
                )}
                {!isAdmin && user && hasMultipleSubgroups(user) && (
                  <p className="text-xs text-gray-500 mt-1">You can only select from your assigned subgroups</p>
                )}
              </div>
              )}
              <div className={isUpdate ? 'md:col-span-2' : ''}>
              <Input
                id="achead"
                label="A/C Head *"
                icon={<Store />}
                value={formValues.achead}
                onChange={handleInputChange}
                variant="outlined"
                autoComplete="off"
                required
                success={isValid.achead}
                className={flashAchead ? 'am-flash' : ''}
              />
              </div>
              <div>
                <Input
                  id="gstin"
                  label="GSTIN"
                  icon={<ReceiptText />}
                  value={formValues.gstin}
                  onChange={handleInputChange}
                  onBlur={() => handleFieldBlur('gstin')}
                  onFocus={() => handleFieldFocus('gstin')}
                  variant="outlined"
                  autoComplete="off"
                  maxLength={15}
                  fieldType="gstin"
                  error={validationErrors.gstin}
                  success={isValid.gstin}
                />
                <div aria-live="polite">
                  {gstChecking && (
                    <span className="am-pop inline-flex items-center gap-1.5 mt-2 text-xs px-2.5 py-1 rounded-md bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                      <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> Checking GST portal
                    </span>
                  )}
                  {!gstChecking && gstDetails.entityType && gstDetails.legalName && (
                    <span className="am-pop inline-flex items-center gap-1.5 mt-2 text-xs px-2.5 py-1 rounded-md bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-400">
                      <BadgeCheck className="w-3.5 h-3.5" />
                      Verified · {gstDetails.entityType === 'Proprietorship' ? 'Proprietor' : gstDetails.entityType}:{' '}
                      {gstDetails.legalName}
                    </span>
                  )}
                </div>
              </div>
              <Input
                id="pan"
                label="PAN"
                icon={<IdCard />}
                value={formValues.pan}
                onChange={handleInputChange}
                onBlur={() => handleFieldBlur('pan')}
                onFocus={() => handleFieldFocus('pan')}
                variant="outlined"
                autoComplete="off"
                maxLength={10}
                fieldType="pan"
                error={validationErrors.pan}
                success={isValid.pan}
              />
            </div>
          </Section>

          <Section n={isUpdate ? 3 : 2} title="Address and contact" delay={160}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Input
                id="addressline1"
                label="Address Line 1 *"
                icon={<MapPin />}
                value={formValues.addressline1}
                onChange={handleInputChange}
                variant="outlined"
                autoComplete="off"
                required
                success={isValid.addressline1}
              />
              <Input
                id="addressline2"
                label="Address Line 2"
                icon={<MapIcon />}
                value={formValues.addressline2}
                onChange={handleInputChange}
                variant="outlined"
                autoComplete="off"
              />
              <div className="grid grid-cols-2 gap-5">
                <Input
                  id="place"
                  label="Place *"
                  icon={<Building2 />}
                  value={formValues.place}
                  onChange={handleInputChange}
                  variant="outlined"
                  autoComplete="off"
                  required
                  success={isValid.place}
                />
                <Input
                  id="pincode"
                  label="Pin Code *"
                  icon={<Mailbox />}
                  value={formValues.pincode}
                  onChange={handleInputChange}
                  onBlur={() => handleFieldBlur('pincode')}
                  onFocus={() => handleFieldFocus('pincode')}
                  variant="outlined"
                  autoComplete="off"
                  required
                  type="tel"
                  inputMode="numeric"
                  maxLength={6}
                  error={validationErrors.pincode}
                  success={isValid.pincode}
                />
              </div>
              <Autocomplete
                id="statecode"
                label="State"
                options={city}
                onChange={handleStateChange}
                defaultValue={formValues.statecode}
                autoComplete="off"
              />
              <Input
                id="mobile"
                label="Mobile *"
                icon={<Phone />}
                value={formValues.mobile}
                onChange={handleInputChange}
                onBlur={() => handleFieldBlur('mobile')}
                onFocus={() => handleFieldFocus('mobile')}
                variant="outlined"
                autoComplete="off"
                maxLength={10}
                type="tel"
                inputMode="numeric"
                required
                error={validationErrors.mobile}
                success={isValid.mobile}
              />
              <Input
                id="email"
                label="Email"
                icon={<Mail />}
                value={formValues.email}
                onChange={handleInputChange}
                variant="outlined"
                autoComplete="off"
                inputMode="email"
                success={isValid.email}
              />
            </div>
            {isUpdate && appContacts.length > 0 && (
              <div className="mt-5">
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Contacts from the customer app</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">Added by the customer in their app profile. They can only be changed there.</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {appContacts.map((c, i) => (
                    <div key={`${c.mobile}-${i}`} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{c.name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{c.role || 'Contact'}</div>
                      </div>
                      <a href={`tel:${c.mobile}`} className="text-sm font-medium text-brand-500 shrink-0">{c.mobile}</a>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Section>

          <Section n={isUpdate ? 4 : 3} title="Location and shop photo" hint="Take these at the shop" delay={260}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <GpsCapture value={gps} onChange={setGps} />
              <ShopPhotoCapture value={shopPhoto} onChange={setShopPhoto} gps={gps} />
            </div>
          </Section>

          <Section n={isUpdate ? 5 : 4} title="Licences and IDs" delay={360}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <Input
                id="aadhar"
                label="Aadhaar"
                icon={<Fingerprint />}
                value={formValues.aadhar}
                onChange={handleInputChange}
                onBlur={() => handleFieldBlur('aadhar')}
                onFocus={() => handleFieldFocus('aadhar')}
                variant="outlined"
                autoComplete="off"
                maxLength={12}
                type="tel"
                inputMode="numeric"
                error={validationErrors.aadhar}
                success={isValid.aadhar}
              />
              <Input
                id="dlno"
                label="DL No."
                icon={<FileBadge />}
                value={formValues.dlno}
                onChange={handleInputChange}
                variant="outlined"
                autoComplete="off"
              />
              <Input
                id="fssaino"
                label="FSSAI No."
                icon={<Leaf />}
                value={formValues.fssaino}
                onChange={handleInputChange}
                onBlur={() => handleFieldBlur('fssaino')}
                onFocus={() => handleFieldFocus('fssaino')}
                variant="outlined"
                autoComplete="off"
                maxLength={14}
                type="tel"
                inputMode="numeric"
                error={validationErrors.fssaino}
                success={isValid.fssaino}
              />
            </div>
          </Section>
          </div>
          )}

          <div className="am-enter flex justify-end gap-3 pt-2" style={{ animationDelay: '440ms' }}>
            <button
              type="button"
              onClick={() => navigate('/db/account-master')}
              className="px-5 py-2.5 text-sm text-gray-600 rounded-lg hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="min-w-[120px] inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600 active:scale-[0.97] transition-all disabled:opacity-80 dark:bg-brand-600 dark:hover:bg-brand-700"
              disabled={saving || saved || (isUpdate && !partyCode)}
            >
              {saving ? (
                <>
                  <LoaderCircle className="w-4 h-4 animate-spin" /> Saving
                </>
              ) : saved ? (
                <>
                  <Check className="am-pop w-4 h-4" /> Saved
                </>
              ) : (
                'Save'
              )}
            </button>
          </div>
        </FormComponent>
      </div>
      {toast.visible && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(prev => ({ ...prev, visible: false }))}
        />
      )}
    </div>
  );
};

export default AccountMaster; 