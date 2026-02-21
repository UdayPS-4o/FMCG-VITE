import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import PageBreadcrumb from '../../components/common/PageBreadCrumb';
import PageMeta from '../../components/common/PageMeta';
import Input from '../../components/form/input/Input';
import DatePicker from '../../components/form/input/DatePicker';
import Select from '../../components/form/Select';
import Autocomplete from '../../components/form/input/Autocomplete';
import { ChevronLeftIcon } from '../../icons';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Modal } from '../../components/ui/modal';
import constants from '../../constants';
import apiCache from '../../utils/apiCache';

type ItemRow = {
  description: string;
  hsn: string;
  qty: string;
  rate: string;
  mrp: string;
  itemCode: string;
  discRs: string;
  discPercent: string;
  cdPercent: string;
  gstPercent: string;
  gstCode?: string;
  godown?: string;
  originalDescription?: string;
};

type SupplierRecord = {
  C_CODE: string;
  C_NAME: string;
  GSTNO?: string;
};

const GST_STATES: { code: string; name: string }[] = [
  { code: '01', name: 'Jammu & Kashmir' },
  { code: '02', name: 'Himachal Pradesh' },
  { code: '03', name: 'Punjab' },
  { code: '04', name: 'Chandigarh' },
  { code: '05', name: 'Uttarakhand' },
  { code: '06', name: 'Haryana' },
  { code: '07', name: 'Delhi' },
  { code: '08', name: 'Rajasthan' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '10', name: 'Bihar' },
  { code: '11', name: 'Sikkim' },
  { code: '12', name: 'Arunachal Pradesh' },
  { code: '13', name: 'Nagaland' },
  { code: '14', name: 'Manipur' },
  { code: '15', name: 'Mizoram' },
  { code: '16', name: 'Tripura' },
  { code: '17', name: 'Meghalaya' },
  { code: '18', name: 'Assam' },
  { code: '19', name: 'West Bengal' },
  { code: '20', name: 'Jharkhand' },
  { code: '21', name: 'Odisha' },
  { code: '22', name: 'Chhattisgarh' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '24', name: 'Gujarat' },
  { code: '25', name: 'Daman & Diu' },
  { code: '26', name: 'Dadra & Nagar Haveli and Daman & Diu' },
  { code: '27', name: 'Maharashtra' },
  { code: '28', name: 'Andhra Pradesh' },
  { code: '29', name: 'Karnataka' },
  { code: '30', name: 'Goa' },
  { code: '31', name: 'Lakshadweep' },
  { code: '32', name: 'Kerala' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '34', name: 'Puducherry' },
  { code: '35', name: 'Andaman & Nicobar Islands' },
  { code: '36', name: 'Telangana' },
  { code: '37', name: 'Andhra Pradesh' },
  { code: '38', name: 'Ladakh' },
  { code: '97', name: 'Other Territory' },
];

const NewPurchase: React.FC = () => {
  const navigate = useNavigate();
  const [vendor, setVendor] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [supplierCode, setSupplierCode] = useState('');
  const [gstin, setGstin] = useState('');
  const [stateVal, setStateVal] = useState('23');
  const [invoiceNo, setInvoiceNo] = useState('INV-001');
  // State for API-fetched data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [cmplData, setCmplData] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [pmplData, setPmplData] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [purData, setPurData] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [itemMap, setItemMap] = useState<any[]>([]);

  const today = useMemo(() => {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = String(d.getFullYear());
    return `${dd}-${mm}-${yyyy}`;
  }, []);
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [entryDate, setEntryDate] = useState(today);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [godownOptions, setGodownOptions] = useState<{ value: string; label: string }[]>([]);
  const godownOptionsTable = useMemo(() => {
    return godownOptions.map(o => ({ value: o.value, label: o.value }));
  }, [godownOptions]);

  const [globalGodown, setGlobalGodown] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [localKey, setLocalKey] = useState<string | null>(() => localStorage.getItem('gemini_apikey'));
  const [showKeyModal, setShowKeyModal] = useState<boolean>(false);
  const [tempKey, setTempKey] = useState<string>('');
  const apiKey = localKey || (import.meta.env.VITE_GEMINI_API_KEY as string | undefined) || undefined;
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string>('');
  const [isRateInclusive, setIsRateInclusive] = useState<boolean>(false);
  const [showNewItemModal, setShowNewItemModal] = useState<boolean>(false);
  const [newItemRowIndex, setNewItemRowIndex] = useState<number | null>(null);
  const [newItemCompany, setNewItemCompany] = useState<string>('');
  const [newItemCodeAllocated, setNewItemCodeAllocated] = useState<string>('');
  const [newItemGSTCode, setNewItemGSTCode] = useState<string>('');
  const [newItemGSTPercent, setNewItemGSTPercent] = useState<string>('');
  const [newItemName, setNewItemName] = useState<string>('');
  const [newItemHSN, setNewItemHSN] = useState<string>('');
  const [newItemPack, setNewItemPack] = useState<string>('');
  const [newItemBrand, setNewItemBrand] = useState<string>('');
  const [newItemUnit1, setNewItemUnit1] = useState<string>('PCS');
  const [newItemUnit2, setNewItemUnit2] = useState<string>('');
  const [newItemPcBx, setNewItemPcBx] = useState<string>('');
  const [newItemMrp1, setNewItemMrp1] = useState<string>('');
  const [newItemRate1, setNewItemRate1] = useState<string>('');
  const [newItemSchemePercent, setNewItemSchemePercent] = useState<string>('');
  const [newItemSchemeRsPc, setNewItemSchemeRsPc] = useState<string>('');
  const [newItemCessRsPc, setNewItemCessRsPc] = useState<string>('');
  const [newItemMinStock, setNewItemMinStock] = useState<string>('');
  const [newItemNotStockItem, setNewItemNotStockItem] = useState<boolean>(false);
  const [newItemExtraDesc, setNewItemExtraDesc] = useState<string>('');
  const [newItemAddedOn, setNewItemAddedOn] = useState<string>(() => {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = String(d.getFullYear());
    return `${dd}-${mm}-${yyyy}`;
  });


  const stateOptions = GST_STATES.map(s => ({ value: s.code, label: `${s.code} - ${s.name}` }));
  const getStateName = (code: string) => GST_STATES.find(s => s.code === code)?.name || '';
  const getStateLabel = (code: string) => {
    const n = getStateName(code);
    return n ? `${code} - ${n}` : code;
  };

  const [vendorOptions, setVendorOptions] = useState<{ value: string; label: string }[]>([
    { value: 'manual', label: 'Enter Manually' }
  ]);
  const [supplierList, setSupplierList] = useState<SupplierRecord[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<SupplierRecord | null>(null);
  const location = useLocation();
  const params = useParams();
  const [editingBill, setEditingBill] = useState<string | null>(null);
  const [pBillBB, setPBillBB] = useState<string>('');
  const [originalCreatedAt, setOriginalCreatedAt] = useState<string | null>(null);

  const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);
  const handleHideColumn = (col: string) => setHiddenColumns(prev => [...prev, col]);
  const handleResetColumns = () => setHiddenColumns([]);

  const addItem = () => {
    setItems((prev) => [...prev, { description: '', hsn: '', qty: '', rate: '', mrp: '', itemCode: '', discRs: '', discPercent: '', cdPercent: '', gstPercent: '', gstCode: '', godown: globalGodown || '' }]);
  };

  const resolveItemCode = (name: string, mrpVal: string) => {
    const rawDesc = String(name || '');
    const rawMrp = String(mrpVal || '');
    const normalize = (s: string) => s
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    const productNorm = normalize(rawDesc);
    const mrpStr = rawMrp.trim().replace(/[^0-9.]/g, '');
    if (!productNorm || !mrpStr) return '';
    const mrpNum = parseFloat(mrpStr);
    if (isNaN(mrpNum)) return '';

    // Check itemMap
    const mapped = itemMap.find(m => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mDesc = normalize(String((m as any).description || ''));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mMrp = String((m as any).mrp || '').trim().replace(/[^0-9.]/g, '');
      const mMrpNum = parseFloat(mMrp);

      if (mDesc !== productNorm) return false;

      if (!isNaN(mrpNum) && !isNaN(mMrpNum)) {
        return Math.abs(mrpNum - mMrpNum) < 0.01;
      }
      return false;
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (mapped && (mapped as any).itemCode) return String((mapped as any).itemCode);

    const data = pmplData;
    for (const it of data) {
      const p = normalize(String(it.PRODUCT || ''));
      const cand = [it.MRP1, it.MRP_1, it.MRP, it.B_RATE1, it.B_RATE];
      let m: number = NaN;
      for (const c of cand) {
        if (typeof c === 'number') { m = c; break; }
        if (typeof c === 'string') {
          const n = parseFloat(String(c).trim().replace(/[^0-9.]/g, ''));
          if (!isNaN(n)) { m = n; break; }
        }
      }
      if (p === productNorm && !isNaN(m) && m === mrpNum) {
        return String(it.CODE || '');
      }
    }
    return '';
  };

  const getPmplMetaByCode = (code?: string) => {
    if (!code) return { hsn: '', gstPercent: '', gstCode: '' };
    const data = pmplData;
    const found = data.find((it) => String(it.CODE || '') === String(code));
    if (!found) return { hsn: '', gstPercent: '', gstCode: '' };
    const h = String(found.H_CODE || '').trim();
    const gRaw = found.GST;
    const gNum = typeof gRaw === 'number' ? gRaw : parseFloat(String(gRaw || '').trim().replace(/[^0-9.]/g, ''));
    const g = isNaN(gNum) ? '' : String(gNum);
    const gstCode = String(found.GST_CODE || found.GR_CODE || '').trim();
    return { hsn: h, gstPercent: g, gstCode };
  };

  const updateItem = (index: number, key: keyof ItemRow, value: string) => {
    setItems((prev) => prev.map((row, i) => {
      if (i !== index) return row;
      const next = { ...row, [key]: value } as ItemRow;
      next.itemCode = resolveItemCode(next.description, next.mrp);
      if (next.itemCode) {
        const meta = getPmplMetaByCode(next.itemCode);
        next.hsn = meta.hsn || next.hsn;
        next.gstPercent = meta.gstPercent || next.gstPercent;
        next.gstCode = meta.gstCode || next.gstCode;
      }
      return next;
    }));
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const computeTaxable = (row: ItemRow) => {
    const q = parseFloat(row.qty || '0');
    const r = parseFloat(row.rate || '0');
    const gp = parseFloat(row.gstPercent || '0');
    const drs = parseFloat(row.discRs || '0');
    const dp = parseFloat(row.discPercent || '0');
    const cdp = parseFloat(row.cdPercent || '0');
    const base = q * r;
    const discountAmt = (base * (isNaN(dp) ? 0 : dp / 100)) + (base * (isNaN(cdp) ? 0 : cdp / 100)) + (isNaN(drs) ? 0 : drs);
    const discountedBase = Math.max(base - discountAmt, 0);
    if (isRateInclusive && gp > 0) {
      return discountedBase / (1 + gp / 100);
    }
    return discountedBase;
  };

  const computeTotal = (row: ItemRow) => {
    const taxable = computeTaxable(row);
    const gst = computeRowGst(row);
    return taxable + gst;
  };

  const computeRowGst = (row: ItemRow) => {
    const q = parseFloat(row.qty || '0');
    const r = parseFloat(row.rate || '0');
    const gp = parseFloat(row.gstPercent || '0');
    const drs = parseFloat(row.discRs || '0');
    const dp = parseFloat(row.discPercent || '0');
    const cdp = parseFloat(row.cdPercent || '0');
    const base = q * r;
    const discountAmt = (base * (isNaN(dp) ? 0 : dp / 100)) + (base * (isNaN(cdp) ? 0 : cdp / 100)) + (isNaN(drs) ? 0 : drs);
    const discountedBase = Math.max(base - discountAmt, 0);
    const taxable = computeTaxable(row);
    return isRateInclusive ? (discountedBase - taxable) : taxable * (isNaN(gp) ? 0 : gp) / 100;
  };

  const formatINR = useMemo(() => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }), []);

  const pmplCompanyOptions = useMemo(() => {
    const prefixes = new Set<string>();
    pmplData.forEach(it => {
      const code = String(it.CODE || '');
      if (code.length >= 2) prefixes.add(code.slice(0, 2));
    });
    return Array.from(prefixes).sort().map(p => ({ value: p, label: p }));
  }, [pmplData]);


  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getPurRecords = async (): Promise<any[]> => {
    try {
      const token = localStorage.getItem('token');
      const respApi = await fetch(`${constants.baseURL}/api/dbf/PUR.json`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      });
      if (respApi.ok) {
        const arr = await respApi.json();
        if (Array.isArray(arr) && arr.length > 0) return arr;
      }
    } catch (err) {
      console.error(err);
    }
    return [];
  };

  useEffect(() => {
    const arr = purData;
    if (editingBill) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row = (arr || []).find((r: any) => String(r.BILL) === String(editingBill));
      if (row?.BILL_BB) {
        setPBillBB(String(row.BILL_BB));
        return;
      }
    }
    let maxBillNum = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (arr || []).forEach((r: any) => {
      const b = parseInt(String(r.BILL || 0), 10);
      if (!isNaN(b) && b > maxBillNum) maxBillNum = b;
      const bbStr = String(r.BILL_BB || '').match(/(\d+)/);
      if (bbStr) {
        const bb = parseInt(bbStr[1], 10);
        if (!isNaN(bb) && bb > maxBillNum) maxBillNum = bb;
      }
    });
    setPBillBB(`P-${maxBillNum + 1}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingBill, purData]);

  const gstGroupOptions = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawArr: any[] = cmplData;
    return rawArr
      .filter(it => String(it.C_CODE || '').toUpperCase().startsWith('GG'))
      .map(it => {
        const code = String(it.C_CODE || '');
        const name = String(it.C_NAME || '');
        const tax = typeof it.GST_TAX === 'number' ? it.GST_TAX : parseFloat(String(it.GST_TAX || '0'));
        return { value: code, label: `${code} - ${name} - ${isNaN(tax) ? '' : `${tax}%`}`, tax: isNaN(tax) ? 0 : tax };
      });
  }, [cmplData]);

  const gstUnitOptions = useMemo(() => {
    const units = ['PCS', 'BOX', 'BOTTLE', 'JAR', 'CAN', 'KG', 'GMS', 'LTR', 'ML', 'PACK', 'BAG', 'DOZEN', 'TUBE', 'SACHET'];
    return units.map(u => ({ value: u, label: u }));
  }, []);
  const [isApiKeyEditing, setIsApiKeyEditing] = useState<boolean>(false);
  const maskedApiKey = useMemo(() => {
    const k = localKey || import.meta.env.VITE_GEMINI_API_KEY || '';
    if (!k) return '';
    const s = String(k);
    if (s.length <= 6) return s;
    return `${s.slice(0, 4)}••••${s.slice(-2)}`;
  }, [localKey]);
  const pmplItemOptions = useMemo(() => {
    const data = pmplData;
    return data.map(it => {
      const code = String(it.CODE || '');
      const name = String(it.PRODUCT || '');
      let mrpVal = '';
      const mCand = it.MRP1 ?? it.MRP_1 ?? it.MRP ?? it.B_RATE1 ?? it.B_RATE;
      if (typeof mCand === 'number') {
        mrpVal = String(mCand);
      } else if (typeof mCand === 'string') {
        const n = String(mCand).trim().replace(/[^0-9.]/g, '');
        if (n) mrpVal = n;
      }
      const label = `${code} | ${name}${mrpVal ? ` (${mrpVal})` : ''}`;
      return { value: code, label };
    });
  }, [pmplData]);
  const getItemLabelByCode = (code?: string) => {
    if (!code) return '';
    const opt = pmplItemOptions.find(o => o.value === code);
    return opt?.label || '';
  };
  const findSupplierByGstin = (gst: string) => {
    if (!gst) return null;
    const g = gst.trim().toUpperCase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawArr: any[] = cmplData;
    const match = rawArr.find(p => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const gstno = String((p as any).GSTNO || (p as any).GST || '').trim().toUpperCase();
      return gstno && gstno === g;
    });
    if (match && match.C_CODE && match.C_NAME) return { C_CODE: String(match.C_CODE), C_NAME: String(match.C_NAME), GSTNO: String(match.GSTNO || match.GST || '') } as SupplierRecord;
    return null;
  };
  const handleItemSelection = (index: number, code: string) => {
    const data = pmplData;
    const found = data.find(it => String(it.CODE || '') === String(code));

    // Learn mapping
    const row = items[index];
    if (row && (row.originalDescription || row.description) && row.mrp && code) {
      const descToMap = row.originalDescription || row.description;
      const currentResolved = resolveItemCode(descToMap, row.mrp);

      console.log('Learning Item Map check:', { descToMap, mrp: row.mrp, code, currentResolved });

      // Only map if it doesn't resolve to the selected code already
      if (currentResolved !== code) {
        const payload = { description: descToMap, mrp: row.mrp, itemCode: code };

        console.log('Sending Item Map payload:', payload);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setItemMap(prev => [...prev, payload]);

        const token = localStorage.getItem('token');
        fetch(`${constants.baseURL}/api/itemmap`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify(payload)
        }).then(res => {
          if (!res.ok) {
            res.text().then(t => {
              console.error('Item map save failed', res.status, t);
              alert(`Failed to save item mapping: ${res.status} ${t}`);
            });
          } else {
            console.log('Item map saved successfully');
            // alert('Item mapping learned!'); // Optional: don't spam user
          }
        }).catch(err => {
          console.error('Failed to save item mapping', err);
          alert(`Error saving item mapping: ${err.message}`);
        });
      } else {
        console.log('Item already resolved correctly, skipping learn.');
      }
    } else {
      console.log('Skipping learn due to missing data:', {
        hasRow: !!row,
        hasDesc: !!(row?.originalDescription || row?.description),
        hasMrp: !!row?.mrp,
        hasCode: !!code
      });
    }

    setItems(prev => prev.map((row, i) => {
      if (i !== index) return row;
      const desc = String(found?.PRODUCT || row.description);
      const hsn = found ? String(found.H_CODE || '') : row.hsn;
      const gstVal = found?.GST;
      const gstStr = found ? (gstVal !== undefined && gstVal !== null ? String(gstVal) : '') : row.gstPercent;
      const gstCode = found ? String(found.GST_CODE || found.GR_CODE || '').trim() : (row.gstCode || '');
      const mrpStr = found && (typeof found.MRP1 === 'number' ? String(found.MRP1) : String(found.MRP1 || row.mrp));
      return { ...row, itemCode: code, description: desc, hsn, gstPercent: gstStr, gstCode: gstCode || undefined, mrp: mrpStr || row.mrp };
    }));
  };

  const handleItemDescriptionInput = (index: number, val: string) => {
    setItems(prev => prev.map((row, i) => {
      if (i !== index) return row;
      // If user types, we clear itemCode unless it happens to match a code (which is handled by selection)
      // Actually, we can check if the typed name matches a product name exactly?
      // For now, assume typing means editing description.
      // But we must also check if this description resolves to an item code?
      // resolveItemCode checks description + MRP.
      // So here we just update description and clear itemCode.
      // The updateItem('mrp') or here will re-trigger resolveItemCode logic if we want auto-link.
      // But resolveItemCode is called in updateItem.
      // So let's just update description here.

      return { ...row, description: val, itemCode: '' };
    }));
  };

  const computeNextItemCode = (prefix: string) => {
    let max = 0;
    pmplData.forEach(it => {
      const code = String(it.CODE || '');
      if (code.startsWith(prefix)) {
        const suf = parseInt(code.slice(prefix.length), 10);
        if (!isNaN(suf) && suf > max) max = suf;
      }
    });
    const next = max + 1;
    if (next > 999) return '';
    return `${prefix}${String(next).padStart(3, '0')}`;
  };

  const computeNextItemCodeAsync = async (prefix: string) => {
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`${constants.baseURL}/api/dbf/PMPL.json`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      });
      if (!resp.ok) return computeNextItemCode(prefix);
      const arr = await resp.json();
      let max = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (arr || []).forEach((it: any) => {
        const code = String(it.CODE || '');
        if (code.startsWith(prefix)) {
          const suf = parseInt(code.slice(prefix.length), 10);
          if (!isNaN(suf) && suf > max) max = suf;
        }
      });
      const next = max + 1;
      if (next > 999) return '';
      return `${prefix}${String(next).padStart(3, '0')}`;
    } catch {
      return computeNextItemCode(prefix);
    }
  };

  const fileToBase64 = (file: File) => {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1] || result;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const extractItemsFromFile = async (file: File) => {
    if (!apiKey) {
      setShowKeyModal(true);
      return;
    }
    setIsProcessing(true);
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });
      const prompt = `Extract purchase bill metadata and items.
Return strict JSON:
{
  "supplier": { "name": string, "state": string, "gstin": string },
  "invoice": { "number": string, "date": string },
  "items": [ { "name": string, "qty": number, "rate": number, "mrp": number, "unit": string, "amount": number, "hsn": string, "gstPercent": number, "discountRs": number, "discountPercent": number, "cdPercent": number } ]
}
Set invoice.date in dd-mm-yyyy. Do not include explanations.`;
      const base64 = await fileToBase64(file);
      const mime = file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
      const result = await model.generateContent([
        prompt,
        { inlineData: { mimeType: mime, data: base64 } }
      ]);
      const text = result.response.text();
      type OCRResult = {
        supplier?: { name?: string; state?: string; gstin?: string };
        invoice?: { number?: string; date?: string };
        items?: { name: string; qty: number; rate: number; mrp?: number; unit?: string; amount?: number; hsn?: string; gstPercent?: number; discountRs?: number; discountPercent?: number; cdPercent?: number }[];
      };
      let parsed: OCRResult | null = null;
      try {
        const codeBlockMatch = text.match(/```json[\s\S]*?```/i);
        const candidate = codeBlockMatch ? codeBlockMatch[0].replace(/```json|```/gi, '').trim() : text;
        const jsonMatch = candidate.match(/\{[\s\S]*\}/);
        const jsonString = jsonMatch ? jsonMatch[0] : candidate;
        parsed = JSON.parse(jsonString);
      } catch {
        parsed = null;
      }
      const normDate = (s?: string) => {
        if (!s) return '';
        const m = s.match(/(\d{2,4})[^\d]+(\d{1,2})[^\d]+(\d{2,4})/);
        if (m) {
          let d = m[1], mn = m[2], y = m[3];
          if (m[1].length === 4) {
            y = m[1]; mn = m[2]; d = m[3];
          }
          const dd = String(d).padStart(2, '0');
          const mm = String(mn).padStart(2, '0');
          const yyyy = String(y).length === 2 ? `20${y}` : String(y);
          return `${dd}-${mm}-${yyyy}`;
        }
        const digits = s.replace(/[^\d]/g, '');
        if (digits.length === 8) {
          const dd = digits.slice(0, 2);
          const mm = digits.slice(2, 4);
          const yyyy = digits.slice(4);
          return `${dd}-${mm}-${yyyy}`;
        }
        return s;
      };
      if (parsed?.supplier) {
        if (parsed.supplier.name) setSupplierName(String(parsed.supplier.name));
        if (parsed.supplier.gstin) setGstin(String(parsed.supplier.gstin));
        if (parsed.supplier.state) setStateVal(String(parsed.supplier.state));
        const autoSupp = findSupplierByGstin(String(parsed.supplier.gstin || ''));
        if (autoSupp) {
          setSelectedSupplier(autoSupp);
          setSupplierName(String(autoSupp.C_NAME));
          setSupplierCode(String(autoSupp.C_CODE));
          setVendor(String(autoSupp.C_CODE));
        } else {
          setVendor('manual');
          setSupplierCode('');
        }
      }
      if (parsed?.invoice) {
        if (parsed.invoice.number) setInvoiceNo(String(parsed.invoice.number));
        if (parsed.invoice.date) setInvoiceDate(normDate(String(parsed.invoice.date)) || today);
      }
      if (parsed?.items && Array.isArray(parsed.items)) {
        const mapped: ItemRow[] = parsed.items.map((it) => {
          const description = String(it.name || '');
          const mrp = String(it.mrp ?? '');
          const itemCode = resolveItemCode(description, mrp);
          const meta = getPmplMetaByCode(itemCode);
          return {
            description,
            originalDescription: description,
            hsn: meta.hsn || String(it.hsn || ''),
            qty: String(it.qty ?? ''),
            rate: String(it.rate ?? ''),
            mrp,
            itemCode,
            discRs: String(it.discountRs ?? ''),
            discPercent: String(it.discountPercent ?? ''),
            cdPercent: String(it.cdPercent ?? ''),
            gstPercent: meta.gstPercent || String((it.gstPercent ?? 18)),
            gstCode: meta.gstCode,
          };
        });
        setItems(mapped);
      } else if (!parsed?.supplier && !parsed?.invoice) {
        alert('Unable to parse OCR result.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'OCR request failed.';
      alert(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  // Fetch CMPL and PMPL data from the backend with caching
  useEffect(() => {
    const rawArr: unknown[] = cmplData;
    const arr: SupplierRecord[] = rawArr.map((p) => {
      const r = p as Record<string, unknown>;
      const C_CODE = String(r.C_CODE ?? '');
      const C_NAME = String(r.C_NAME ?? '');
      const GSTNO = r.GSTNO ? String(r.GSTNO) : (r.GST ? String(r.GST) : undefined);
      return { C_CODE, C_NAME, GSTNO };
    }).filter(p => p.C_CODE && p.C_NAME).filter(p => p.C_CODE.toUpperCase().startsWith('CT'));
    setSupplierList(arr);
    const opts = [{ value: 'manual', label: 'Enter Manually' }, ...arr.map((p) => ({ value: String(p.C_CODE), label: `(${String(p.C_CODE)}) - ${String(p.C_NAME)}` }))];
    setVendorOptions(opts);
  }, [cmplData]);

  useEffect(() => {
    // Fetch from API for up-to-date list
    (async () => {
      const [cmplRes, pmplRes, godownsRes, purRes, imapRes] = await Promise.allSettled([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        apiCache.fetchWithCache<any[]>(`${constants.baseURL}/cmpl`),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        apiCache.fetchWithCache<any[]>(`${constants.baseURL}/api/dbf/pmpl.json`),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        apiCache.fetchWithCache<any[]>(`${constants.baseURL}/api/godowns`),
        getPurRecords(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        apiCache.fetchWithCache<any[]>(`${constants.baseURL}/json/itemmap`),
      ]);

      if (cmplRes.status === 'fulfilled' && Array.isArray(cmplRes.value)) {
        setCmplData(cmplRes.value);
      } else if (cmplRes.status === 'rejected') {
        console.error('Error fetching CMPL:', cmplRes.reason);
      }

      if (pmplRes.status === 'fulfilled' && Array.isArray(pmplRes.value)) {
        setPmplData(pmplRes.value);
      } else if (pmplRes.status === 'rejected') {
        console.error('Error fetching PMPL:', pmplRes.reason);
      }

      if (purRes.status === 'fulfilled' && Array.isArray(purRes.value)) {
        setPurData(purRes.value);
      } else if (purRes.status === 'rejected') {
        console.error('Error fetching PUR:', purRes.reason);
      }

      if (imapRes.status === 'fulfilled' && Array.isArray(imapRes.value)) {
        setItemMap(imapRes.value);
      } else if (imapRes.status === 'rejected') {
        console.error('Error fetching itemmap:', imapRes.reason);
      }

      if (godownsRes.status === 'fulfilled' && Array.isArray(godownsRes.value)) {
        const opts = godownsRes.value
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .filter((g: any) => String(g.ACTIVE || 'Y') === 'Y')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((g: any) => {
            const code = String(g.GDN_CODE || '').padStart(2, '0').slice(0, 2);
            const name = String(g.GDN_NAME || '');
            return { value: code, label: `${name} (${code})` };
          });
        setGodownOptions(opts);
      } else if (godownsRes.status === 'rejected') {
        console.error('Error fetching godowns:', godownsRes.reason);
      }
    })();

    // Clean up expired cache items
    try {
      apiCache.clearExpiredCache();
    } catch (error) {
      console.error('Error clearing cache:', error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const prefix = (gstin || '').slice(0, 2);
    if (GST_STATES.find(s => s.code === prefix)) {
      setStateVal(prefix);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gstin]);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prefill = (location.state as any)?.purchase;
    const editId = params?.id;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const applyPrefill = (p: any) => {
      if (!p) return;
      if (p.bill) setEditingBill(String(p.bill));
      if (p.createdAt) setOriginalCreatedAt(String(p.createdAt));
      setSupplierCode(String(p.supplierCode || ''));
      setSupplierName(String(p.supplierName || ''));
      setGstin(String(p.gstin || ''));
      setStateVal(String(p.state?.split(' - ')[0] || stateVal));
      if (p.invoice) {
        setInvoiceNo(String(p.invoice.number || ''));
        setInvoiceDate(String(p.invoice.date || invoiceDate));
      }
      setEntryDate(String(p.entryDate || entryDate));
      setIsRateInclusive(String(p.rateInclusiveOfGst || 'N') === 'Y');
      if (Array.isArray(p.items)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mapped: ItemRow[] = p.items.map((r: any) => ({
          description: String(r.description || ''),
          hsn: String(r.hsn || ''),
          qty: String(r.qty || ''),
          rate: String(r.rate || ''),
          mrp: String(r.mrp || ''),
          itemCode: String(r.itemCode || ''),
          discRs: String(r.discRs || ''),
          discPercent: String(r.discPercent || ''),
          cdPercent: String(r.cdPercent || ''),
          gstPercent: String(r.gstPercent || ''),
          gstCode: String(r.gstCode || ''),
        }));
        setItems(mapped);
      }
    };
    if (prefill) {
      applyPrefill(prefill);
    } else if (editId) {
      const token = localStorage.getItem('token');
      (async () => {
        try {
          const [purchasesRes, purDbfRes] = await Promise.all([
            fetch(`${constants.baseURL}/json/purchases`, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } }),
            fetch(`${constants.baseURL}/api/dbf/PUR.json`, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } })
          ]);
          const purchases = purchasesRes.ok ? await purchasesRes.json() : [];
          const purDbf = purDbfRes.ok ? await purDbfRes.json() : [];
          const billParam = String(editId);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const dbfRow = (purDbf || []).find((r: any) => String(r.BILL) === billParam);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let found = (purchases || []).find((x: any) => String(x.bill) === billParam);
          if (!found && dbfRow) {
            const pbill = String(dbfRow.PBILL || '').trim();
            const pcode = String(dbfRow.C_CODE || '').trim();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            found = (purchases || []).find((x: any) => {
              const invNum = String(x?.invoice?.number || '').trim();
              const sc = String(x?.supplierCode || '').trim();
              return invNum === pbill && (!pcode || sc === pcode);
            });
            if (found) found.bill = billParam;
          }
          if (found) {
            applyPrefill(found);
            setEditingBill(billParam);
          }
        } catch (err) {
          console.error(err);
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleVendorChange = (value: string) => {
    setVendor(value);
    if (value === 'manual') {
      setSelectedSupplier(null);
      setSupplierCode('');
      return;
    }
    const found = supplierList.find((p) => String(p.C_CODE) === value);
    setSelectedSupplier(found || null);
    if (found) {
      setSupplierName(String(found.C_NAME || ''));
      const g = String(found.GSTNO || '');
      setGstin(g);
      setSupplierCode(String(found.C_CODE || ''));
      const code = g.slice(0, 2);
      if (GST_STATES.find(s => s.code === code)) {
        setStateVal(code);
      }
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFileName(file.name);
      await extractItemsFromFile(file);
      e.target.value = '';
    }
  };

  const handleSavePurchase = async () => {
    try {
      if (items.length === 0) {
        alert('No items present in bill. The bill cannot be saved.');
        return;
      }
      if (!supplierName.trim() || !supplierCode.trim()) {
        alert('Supplier Name and Supplier Code are required');
        return;
      }
      const missingCodes = items
        .map((r, i) => ({ idx: i + 1, code: String(r.itemCode || '').trim() }))
        .filter(x => !x.code);
      if (missingCodes.length > 0) {
        alert(`Item Code is required for all rows.\nMissing on row(s): ${missingCodes.map(x => x.idx).join(', ')}`);
        return;
      }
      try {
        const tokenDup = localStorage.getItem('token');
        const respDup = await fetch(`${constants.baseURL}/json/purchases`, {
          headers: { ...(tokenDup ? { Authorization: `Bearer ${tokenDup}` } : {}) }
        });
        if (respDup.ok) {
          const arrDup = await respDup.json();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const dup = (arrDup || []).find((x: any) => {
            const sameSupp = String(x.supplierCode || '') === String(supplierCode || '');
            const sameInv = String(x?.invoice?.number || '') === String(invoiceNo || '');
            const sameBill = String(x.bill || '') === String(editingBill || '');
            const sameCreated = String(x.createdAt || '') === String(originalCreatedAt || '');
            return sameSupp && sameInv && !sameBill && !sameCreated;
          });
          if (dup) {
            alert('Bill already present for the same supplier and invoice number.');
            return;
          }
        }
      } catch (err) {
        console.error(err);
      }
      const token = localStorage.getItem('token');
      // Determine BILL to use
      let billNo: string | null = editingBill;
      if (!billNo) {
        const arr = purData;
        let maxBillNum = 0;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (arr || []).forEach((r: any) => {
          const b = parseInt(String(r.BILL || 0), 10);
          if (!isNaN(b) && b > maxBillNum) maxBillNum = b;
          const bbStr = String(r.BILL_BB || '').match(/(\d+)/);
          if (bbStr) {
            const bb = parseInt(bbStr[1], 10);
            if (!isNaN(bb) && bb > maxBillNum) maxBillNum = bb;
          }
        });
        billNo = String(maxBillNum + 1);
      }
      const payload = {
        bill: billNo || undefined,
        supplierCode,
        supplierName,
        gstin,
        state: getStateLabel(stateVal),
        invoice: { number: invoiceNo, date: invoiceDate },
        entryDate,
        rateInclusiveOfGst: isRateInclusive ? 'Y' : 'N',
        items: items.map((r) => {
          const taxable = computeTaxable(r);
          const gstAmt = computeRowGst(r);
          const total = taxable + gstAmt;
          return {
            description: r.description,
            hsn: r.hsn,
            qty: r.qty,
            rate: r.rate,
            mrp: r.mrp,
            itemCode: r.itemCode,
            discRs: r.discRs,
            discPercent: r.discPercent,
            cdPercent: r.cdPercent,
            gstPercent: r.gstPercent,
            godown: (r.godown || '').slice(0, 2),
            taxable: taxable.toFixed(2),
            gstAmount: gstAmt.toFixed(2),
            total: total.toFixed(2)
          };
        }),
        gstBreakdown: (() => {
          const breakdown: Record<string, { taxable: number; gst: number; rate: number }> = {};
          items.forEach(row => {
            const taxable = computeTaxable(row);
            const gst = computeRowGst(row);
            const p = parseFloat(row.gstPercent || '0');

            let code = row.gstCode;
            if (!code && row.itemCode) {
              const found = pmplData.find(it => String(it.CODE || '') === String(row.itemCode));
              code = String(found?.GST_CODE || found?.G_CODE || '').trim();
            }
            const label = code || `GST ${p}%`;

            if (!breakdown[label]) breakdown[label] = { taxable: 0, gst: 0, rate: p };
            breakdown[label].taxable += taxable;
            breakdown[label].gst += gst;
          });

          return Object.entries(breakdown).map(([code, data]) => {
            const override = breakdownOverrides[code];
            const finalTaxable = override ? parseFloat(override) : data.taxable;
            const safeTaxable = isNaN(finalTaxable) ? 0 : finalTaxable;
            const finalTax = safeTaxable * (data.rate / 100);
            return {
              code,
              rate: data.rate,
              taxable: Number(safeTaxable.toFixed(2)),
              tax: Number(finalTax.toFixed(2)),
              originalTaxable: Number(data.taxable.toFixed(2))
            };
          });
        })(),
        totals: (() => {
          // Calculate totals based on breakdown (which handles overrides)
          const breakdown: Record<string, { taxable: number; gst: number; rate: number }> = {};
          items.forEach(row => {
            const taxable = computeTaxable(row);
            const gst = computeRowGst(row);
            const p = parseFloat(row.gstPercent || '0');

            let code = row.gstCode;
            if (!code && row.itemCode) {
              const found = pmplData.find(it => String(it.CODE || '') === String(row.itemCode));
              code = String(found?.GST_CODE || found?.G_CODE || '').trim();
            }
            const label = code || `GST ${p}%`;

            if (!breakdown[label]) breakdown[label] = { taxable: 0, gst: 0, rate: p };
            breakdown[label].taxable += taxable;
            breakdown[label].gst += gst;
          });

          let totalTaxable = 0;
          let totalTax = 0;

          Object.entries(breakdown).forEach(([code, data]) => {
            const override = breakdownOverrides[code];
            const finalTaxable = override ? parseFloat(override) : data.taxable;
            const safeTaxable = isNaN(finalTaxable) ? 0 : finalTaxable;
            const finalTax = safeTaxable * (data.rate / 100);

            totalTaxable += safeTaxable;
            totalTax += finalTax;
          });

          const gross = totalTaxable + totalTax;
          const rounded = Math.round(gross);
          const roundOff = rounded - gross;
          const grandTotal = gross + roundOff;
          return {
            taxable: Number(totalTaxable.toFixed(2)),
            cgst: Number((totalTax / 2).toFixed(2)),
            sgst: Number((totalTax / 2).toFixed(2)),
            roundOff: Number(roundOff.toFixed(2)),
            total: Number(grandTotal.toFixed(2))
          };
        })()
      };
      const isEditing = !!editingBill;
      const url = isEditing ? `${constants.baseURL}/edit/purchases` : `${constants.baseURL}/purchases`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        alert(isEditing ? 'Purchase updated' : 'Purchase saved');
        navigate('/db/purchases');
      } else {
        const err = await res.json().catch(() => ({ message: 'Failed to save purchase' }));
        alert(err.message || 'Failed to save purchase');
      }
    } catch {
      alert('Error saving purchase');
    }
  };

  const [breakdownOverrides, setBreakdownOverrides] = useState<Record<string, string>>({});

  useEffect(() => {
    if (Object.keys(breakdownOverrides).length > 0) {
      setBreakdownOverrides({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <PageMeta title="New Purchase Entry | FMCG Vite Admin Template" description="OCR Assisted Purchase Recording" />
      <PageBreadcrumb pageTitle="New Purchase Entry" />

      <div className="container mx-auto px-4 py-2">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('/purchases')} className="p-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300">
              <ChevronLeftIcon className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-2xl font-semibold text-gray-800 dark:text-white">New Purchase Entry</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">OCR Assisted Purchase Recording</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 items-center w-full lg:w-auto">
            <input ref={fileInputRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={handleFileSelected} />
            <div className="flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-2 py-1">
              <input
                type="text"
                value={isApiKeyEditing ? tempKey : maskedApiKey}
                onChange={(e) => setTempKey(e.target.value)}
                disabled={!isApiKeyEditing}
                placeholder="Set Gemini API key"
                className="w-[220px] bg-transparent text-sm outline-none text-gray-700 dark:text-gray-300"
              />
              <button
                onClick={() => {
                  setTempKey(String(localKey || ''));
                  setIsApiKeyEditing(true);
                }}
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                title="Edit API Key"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                </svg>
              </button>
              <button
                onClick={() => {
                  if (!isApiKeyEditing) return;
                  const v = tempKey.trim();
                  if (v) {
                    localStorage.setItem('gemini_apikey', v);
                    setLocalKey(v);
                    setIsApiKeyEditing(false);
                  }
                }}
                className={`p-1 rounded ${isApiKeyEditing ? 'hover:bg-gray-100 dark:hover:bg-gray-700' : 'opacity-50 cursor-not-allowed'}`}
                title="Save API Key"
                disabled={!isApiKeyEditing}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21H5a2 2 0 0 1-2-2V7" />
                  <path d="M16 3l5 5L8 21H3v-5L16 3z" />
                </svg>
              </button>
            </div>
            <div className="hidden sm:block rounded-lg bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 px-3 py-2 text-sm max-w-[300px] truncate">
              {selectedFileName || 'No file selected'}
            </div>
            <button onClick={handleUploadClick} disabled={isProcessing} className="inline-flex items-center gap-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 px-4 py-2 text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v16H4z" /><path d="M8 8h8v8H8z" /></svg>
              {isProcessing ? 'Processing…' : 'Upload Invoice (OCR)'}
            </button>
            <button onClick={handleSavePurchase} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-medium">Save Purchase</button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 sm:p-6">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Supplier Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Autocomplete id="vendor" label="Select Supplier" options={vendorOptions} onChange={handleVendorChange} value={vendor} />
              {selectedSupplier ? (
                <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="rounded-lg border border-gray-300 dark:border-gray-700 p-3">
                    <div className="text-xs text-gray-500 dark:text-gray-400">Supplier Name</div>
                    <div className="text-sm font-medium text-gray-900 dark:text-white">{supplierName}</div>
                  </div>
                  <div className="rounded-lg border border-gray-300 dark:border-gray-700 p-3">
                    <div className="text-xs text-gray-500 dark:text-gray-400">GSTIN</div>
                    <div className="text-sm font-medium text-gray-900 dark:text-white">{gstin || '—'}</div>
                  </div>
                  <div className="rounded-lg border border-gray-300 dark:border-gray-700 p-3">
                    <div className="text-xs text-gray-500 dark:text-gray-400">State</div>
                    <div className="text-sm font-medium text-gray-900 dark:text-white">{getStateLabel(stateVal)}</div>
                  </div>
                  <div className="md:col-span-3 rounded-lg border border-gray-300 dark:border-gray-700 p-3">
                    <div className="text-xs text-gray-500 dark:text-gray-400">Supplier Code</div>
                    <div className="text-sm font-medium text-gray-900 dark:text-white">{supplierCode || '—'}</div>
                  </div>
                </div>
              ) : (
                <>
                  <Input id="supplierName" label="Supplier Name *" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} variant="outlined" required />
                  <Input id="supplierCode" label="Supplier Code *" value={supplierCode} onChange={(e) => setSupplierCode(e.target.value)} variant="outlined" required />
                  <Input id="gstin" label="GSTIN" value={gstin} onChange={(e) => setGstin(e.target.value)} variant="outlined" fieldType="gstin" />
                  <Select options={stateOptions} placeholder="State" onChange={setStateVal} className="" value={stateVal} />
                </>
              )}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 sm:p-6">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Invoice Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input id="invoiceNo" label="Invoice Number *" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} variant="outlined" required />
              <DatePicker id="invoiceDate" label="Invoice Date" value={invoiceDate} onChange={setInvoiceDate} dateFormatType="dd-mm-yyyy" variant="outlined" />
              <DatePicker id="entryDate" label="Entry Date" value={entryDate} onChange={setEntryDate} dateFormatType="dd-mm-yyyy" variant="outlined" />
              <Input id="pbillbb" label="PBILL" value={pBillBB} onChange={() => { }} variant="outlined" disabled />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm">
          <Modal isOpen={showKeyModal} onClose={() => setShowKeyModal(false)} className="max-w-md">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-2">Set Gemini API Key</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Paste your Gemini API key. It will be stored locally in your browser and not committed.</p>
              <input
                type="text"
                value={tempKey}
                onChange={(e) => setTempKey(e.target.value)}
                placeholder="AIza..."
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2 text-sm text-gray-700 dark:text-gray-300"
              />
              <div className="mt-4 flex justify-end gap-2">
                <button onClick={() => setShowKeyModal(false)} className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm">Cancel</button>
                <button
                  onClick={() => {
                    const v = tempKey.trim();
                    if (v) {
                      localStorage.setItem('gemini_apikey', v);
                      setLocalKey(v);
                      setShowKeyModal(false);
                    }
                  }}
                  className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm"
                >Save</button>
              </div>
            </div>
          </Modal>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 px-4 sm:px-6 py-4">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Items</h3>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-700 dark:text-gray-300">GDN</span>
                <Select
                  options={godownOptions}
                  value={globalGodown}
                  onChange={(val: string) => {
                    setGlobalGodown(val.slice(0, 2));
                    setItems(prev => prev.map(r => ({ ...r, godown: val.slice(0, 2) })));
                  }}
                  className="min-w-[200px]"
                  placeholder="Select Godown"
                />
              </div>
              <button onClick={addItem} className="inline-flex items-center gap-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 px-3 py-2 text-sm font-medium">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
                Add Item
              </button>
              {hiddenColumns.length > 0 && (
                <button
                  onClick={handleResetColumns}
                  className="px-3 py-2 rounded-lg bg-gray-600 hover:bg-gray-700 text-white text-sm font-medium"
                >
                  Reset Columns
                </button>
              )}
            </div>
          </div>
          <Modal isOpen={showNewItemModal} onClose={() => setShowNewItemModal(false)} className="max-w-2xl">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Add New Item</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Autocomplete id="company" label="Company Prefix" options={pmplCompanyOptions} value={newItemCompany} onChange={async (val) => {
                  setNewItemCompany(val);
                  const code = await computeNextItemCodeAsync(val);
                  setNewItemCodeAllocated(code);
                }} />
                <Input id="codeAllocated" label="Code Allocated" value={newItemCodeAllocated} onChange={(e) => setNewItemCodeAllocated(e.target.value)} variant="outlined" disabled />
                <Autocomplete id="gstGroup" label="GST Group" options={gstGroupOptions.map(o => ({ value: o.value, label: o.label }))} value={newItemGSTCode} onChange={(val) => {
                  setNewItemGSTCode(val);
                  const g = gstGroupOptions.find(o => o.value === val);
                  setNewItemGSTPercent(String(g?.tax ?? ''));
                }} />
                <Input id="gstPercent" label="GST %" value={newItemGSTPercent} onChange={(e) => setNewItemGSTPercent(e.target.value)} variant="outlined" />
                <Input id="itemName" label="Item Name" value={newItemName} onChange={(e) => setNewItemName(e.target.value)} variant="outlined" />
                <Input id="pack" label="Pack" value={newItemPack} onChange={(e) => setNewItemPack(e.target.value)} variant="outlined" />
                <Input id="hsnNew" label="HSN Code" value={newItemHSN} onChange={(e) => setNewItemHSN(e.target.value)} variant="outlined" />
                <Input id="brand" label="Brand" value={newItemBrand} onChange={(e) => setNewItemBrand(e.target.value)} variant="outlined" />
                <Select options={gstUnitOptions} value={newItemUnit1} onChange={(val) => setNewItemUnit1(val)} className="" placeholder="Unit-1" />
                <Input id="pcbx" label="PCs in Box" value={newItemPcBx} onChange={(e) => setNewItemPcBx(e.target.value)} variant="outlined" />
                <Select options={gstUnitOptions} value={newItemUnit2} onChange={(val) => setNewItemUnit2(val)} className="" placeholder="Unit-2" />
                <Input id="mrp1" label="MRP1" value={newItemMrp1} onChange={(e) => setNewItemMrp1(e.target.value)} variant="outlined" />
                <Input id="rate1" label="Rate1" value={newItemRate1} onChange={(e) => setNewItemRate1(e.target.value)} variant="outlined" />
                <Input id="addedon" label="Added On" value={newItemAddedOn} onChange={(e) => setNewItemAddedOn(e.target.value)} variant="outlined" />
                <Input id="schemePercent" label="Scheme %" value={newItemSchemePercent} onChange={(e) => setNewItemSchemePercent(e.target.value)} variant="outlined" />
                <Input id="schemeRsPc" label="Sch.Rs/Pc" value={newItemSchemeRsPc} onChange={(e) => setNewItemSchemeRsPc(e.target.value)} variant="outlined" />
                <Input id="cessRsPc" label="Cess Rs/Pc" value={newItemCessRsPc} onChange={(e) => setNewItemCessRsPc(e.target.value)} variant="outlined" />
                <Input id="minStock" label="Min. Stock" value={newItemMinStock} onChange={(e) => setNewItemMinStock(e.target.value)} variant="outlined" />
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="notStock" checked={newItemNotStockItem} onChange={(e) => setNewItemNotStockItem(e.target.checked)} />
                  <label htmlFor="notStock" className="text-sm text-gray-700 dark:text-gray-300">Not a Stock Item</label>
                </div>
                <Input id="extraDesc" label="Extra Description" value={newItemExtraDesc} onChange={(e) => setNewItemExtraDesc(e.target.value)} variant="outlined" />
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button onClick={() => setShowNewItemModal(false)} className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm">Cancel</button>
                <button
                  onClick={async () => {
                    if (!newItemCompany || !newItemCodeAllocated || !newItemGSTCode || !newItemName) {
                      alert('Company, Code, GST Group, and Item Name are required');
                      return;
                    }
                    const payload = {
                      CODE: newItemCodeAllocated,
                      PRODUCT: newItemName,
                      PACK: newItemPack,
                      H_CODE: newItemHSN,
                      BRAND: newItemBrand,
                      UNIT_1: newItemUnit1,
                      UNIT_2: newItemUnit2,
                      PCBX: newItemPcBx,
                      MRP1: parseFloat(newItemMrp1 || '0') || undefined,
                      RATE1: parseFloat(newItemRate1 || '0') || undefined,
                      TRADE1: parseFloat(newItemRate1 || '0') || undefined,
                      ADDEDON: newItemAddedOn,
                      G_CODE: newItemCompany,
                      GST_CODE: newItemGSTCode,
                      GST: parseFloat(newItemGSTPercent || '0'),
                      SCH: parseFloat(newItemSchemePercent || '0') || undefined,
                      SCH_RS_PC: parseFloat(newItemSchemeRsPc || '0') || undefined,
                      CESS_RS_PC: parseFloat(newItemCessRsPc || '0') || undefined,
                      MIN_STOCK: parseFloat(newItemMinStock || '0') || undefined,
                      NOT_STOCK: newItemNotStockItem ? 'Y' : 'N',
                      EXTRA_DESC: newItemExtraDesc,
                      C_CODE: newItemGSTCode,
                      GR_CODE: newItemGSTCode,
                    };
                    try {
                      const token = localStorage.getItem('token');
                      await fetch(`${constants.baseURL}/newitem`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                        body: JSON.stringify(payload)
                      });
                      const resp = await fetch(`${constants.baseURL}/api/merge/items/sync`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                        body: JSON.stringify({ records: [payload] })
                      });
                      const data = await resp.json().catch(() => null);
                      if (!resp.ok || !data?.success) {
                        alert(data?.message || 'Failed merging item into PMPL.DBF');
                      }
                    } catch {
                      alert('Error while saving or merging new item');
                    }
                    if (newItemRowIndex !== null) {
                      setItems(prev => prev.map((r, i) => {
                        if (i !== newItemRowIndex) return r;
                        const gstP = parseFloat(newItemGSTPercent || '0');
                        return { ...r, itemCode: newItemCodeAllocated, hsn: newItemHSN || r.hsn, gstPercent: isNaN(gstP) ? r.gstPercent : String(gstP) };
                      }));
                    }
                    setShowNewItemModal(false);
                  }}
                  className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm"
                >Save</button>
              </div>
            </div>
          </Modal>
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto border-collapse">
              <thead>
                <tr className="bg-gray-100 dark:bg-gray-700">
                  {!hiddenColumns.includes('Item Description') && <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    <div className="flex flex-col items-start">
                      <button onClick={() => handleHideColumn('Item Description')} className="text-gray-400 hover:text-red-600 mb-1 focus:outline-none" title="Hide column">(-)</button>
                      Item Description
                    </div>
                  </th>}
                  {!hiddenColumns.includes('HSN') && <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    <div className="flex flex-col items-start">
                      <button onClick={() => handleHideColumn('HSN')} className="text-gray-400 hover:text-red-600 mb-1 focus:outline-none" title="Hide column">(-)</button>
                      HSN
                    </div>
                  </th>}
                  {!hiddenColumns.includes('MRP') && <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    <div className="flex flex-col items-start">
                      <button onClick={() => handleHideColumn('MRP')} className="text-gray-400 hover:text-red-600 mb-1 focus:outline-none" title="Hide column">(-)</button>
                      MRP
                    </div>
                  </th>}
                  {!hiddenColumns.includes('Item Code') && <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    <div className="flex flex-col items-start">
                      <button onClick={() => handleHideColumn('Item Code')} className="text-gray-400 hover:text-red-600 mb-1 focus:outline-none" title="Hide column">(-)</button>
                      Item Code
                    </div>
                  </th>}
                  {!hiddenColumns.includes('GDN') && <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    <div className="flex flex-col items-start">
                      <button onClick={() => handleHideColumn('GDN')} className="text-gray-400 hover:text-red-600 mb-1 focus:outline-none" title="Hide column">(-)</button>
                      GDN
                    </div>
                  </th>}
                  {!hiddenColumns.includes('Qty') && <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    <div className="flex flex-col items-start">
                      <button onClick={() => handleHideColumn('Qty')} className="text-gray-400 hover:text-red-600 mb-1 focus:outline-none" title="Hide column">(-)</button>
                      Qty
                    </div>
                  </th>}
                  {!hiddenColumns.includes('Rate') && <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    <div className="flex flex-col items-start">
                      <button onClick={() => handleHideColumn('Rate')} className="text-gray-400 hover:text-red-600 mb-1 focus:outline-none" title="Hide column">(-)</button>
                      <div className="flex items-center gap-2">
                        <span>Rate</span>
                        <label className="inline-flex items-center gap-2 cursor-pointer">
                          <span className="text-[10px]">{isRateInclusive ? 'Inclusive of GST' : 'Exclusive of GST'}</span>
                          <span className="relative inline-block w-10 h-5">
                            <input type="checkbox" className="sr-only" checked={isRateInclusive} onChange={(e) => setIsRateInclusive(e.target.checked)} />
                            <span className={`absolute inset-0 rounded-full ${isRateInclusive ? 'bg-blue-500 dark:bg-blue-600' : 'bg-gray-300 dark:bg-gray-700'}`}></span>
                            <span className={`absolute top-0 left-0 w-5 h-5 rounded-full bg-white dark:bg-white border border-gray-300 dark:border-gray-600 shadow transform transition ${isRateInclusive ? 'translate-x-5' : ''}`}></span>
                          </span>
                        </label>
                      </div>
                    </div>
                  </th>}
                  {!hiddenColumns.includes('Disc. Rs') && <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    <div className="flex flex-col items-start">
                      <button onClick={() => handleHideColumn('Disc. Rs')} className="text-gray-400 hover:text-red-600 mb-1 focus:outline-none" title="Hide column">(-)</button>
                      Disc. Rs
                    </div>
                  </th>}
                  {!hiddenColumns.includes('Disc. %') && <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    <div className="flex flex-col items-start">
                      <button onClick={() => handleHideColumn('Disc. %')} className="text-gray-400 hover:text-red-600 mb-1 focus:outline-none" title="Hide column">(-)</button>
                      Disc. %
                    </div>
                  </th>}
                  {!hiddenColumns.includes('CD%') && <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    <div className="flex flex-col items-start">
                      <button onClick={() => handleHideColumn('CD%')} className="text-gray-400 hover:text-red-600 mb-1 focus:outline-none" title="Hide column">(-)</button>
                      CD%
                    </div>
                  </th>}
                  {!hiddenColumns.includes('Taxable') && <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    <div className="flex flex-col items-start">
                      <button onClick={() => handleHideColumn('Taxable')} className="text-gray-400 hover:text-red-600 mb-1 focus:outline-none" title="Hide column">(-)</button>
                      Taxable
                    </div>
                  </th>}
                  {!hiddenColumns.includes('GST Group') && <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    <div className="flex flex-col items-start">
                      <button onClick={() => handleHideColumn('GST Group')} className="text-gray-400 hover:text-red-600 mb-1 focus:outline-none" title="Hide column">(-)</button>
                      GST Group
                    </div>
                  </th>}
                  {!hiddenColumns.includes('Total') && <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    <div className="flex flex-col items-start">
                      <button onClick={() => handleHideColumn('Total')} className="text-gray-400 hover:text-red-600 mb-1 focus:outline-none" title="Hide column">(-)</button>
                      Total
                    </div>
                  </th>}
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Remove</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {items.map((row, index) => {
                  const taxable = computeTaxable(row);
                  const total = computeTotal(row);
                  return (
                    <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      {!hiddenColumns.includes('Item Description') && <td className="px-4 py-3 whitespace-nowrap text-sm">
                        {(!row.itemCode && row.description?.trim() && row.mrp?.trim()) && (
                          <div className="flex items-center gap-2 mb-1">
                            <div className="text-xs text-orange-600 dark:text-orange-400 font-semibold animate-pulse">*New item*</div>
                            <button
                              type="button"
                              className="p-1 rounded bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300"
                              title="Add new item"
                              onClick={() => {
                                setNewItemRowIndex(index);
                                setNewItemName(row.description);
                                setNewItemHSN(row.hsn);
                                setNewItemPack('');
                                setNewItemCompany('');
                                setNewItemCodeAllocated('');
                                setNewItemGSTCode('');
                                setNewItemGSTPercent('');
                                setShowNewItemModal(true);
                              }}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
                            </button>
                          </div>
                        )}
                        <Autocomplete
                          id={`desc-${index}`}
                          label="Item Description"
                          options={pmplItemOptions}
                          value={row.itemCode || undefined}
                          inputValue={row.itemCode ? getItemLabelByCode(row.itemCode) : row.description}
                          onChange={(val: string) => handleItemSelection(index, val)}
                          onInputChange={(val: string) => handleItemDescriptionInput(index, val)}
                          className="w-[40ch]"
                        />
                      </td>}
                      {!hiddenColumns.includes('HSN') && <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <Input id={`hsn-${index}`} label="HSN" value={row.hsn} onChange={(e) => updateItem(index, 'hsn', e.target.value)} variant="outlined" disabled={!!row.itemCode} maxLength={8} className="w-[12ch]" />
                      </td>}
                      {!hiddenColumns.includes('MRP') && <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <Input id={`mrp-${index}`} label="MRP" value={row.mrp} onChange={(e) => updateItem(index, 'mrp', e.target.value)} variant="outlined" className="w-[9ch]" />
                      </td>}
                      {!hiddenColumns.includes('Item Code') && <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <Input id={`code-${index}`} label="Item Code" value={row.itemCode} onChange={() => { }} variant="outlined" disabled maxLength={5} className="w-[9ch]" />
                      </td>}
                      {!hiddenColumns.includes('GDN') && <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <Select
                          options={godownOptionsTable}
                          value={row.godown || ''}
                          onChange={(val: string) => updateItem(index, 'godown', val.slice(0, 2))}
                          className="min-w-[80px]"
                          placeholder="GDN"
                        />
                      </td>}
                      {!hiddenColumns.includes('Qty') && <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <Input id={`qty-${index}`} label="Qty" value={row.qty} onChange={(e) => updateItem(index, 'qty', e.target.value)} variant="outlined" className="w-[8ch]" />
                      </td>}
                      {!hiddenColumns.includes('Rate') && <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <Input id={`rate-${index}`} label="Rate" value={row.rate} onChange={(e) => updateItem(index, 'rate', e.target.value.replace(/[^0-9.]/g, '').slice(0, 6))} variant="outlined" maxLength={6} className="w-[10ch]" />
                      </td>}
                      {!hiddenColumns.includes('Disc. Rs') && <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <Input id={`discRs-${index}`} label="Disc. Rs" value={row.discRs} onChange={(e) => updateItem(index, 'discRs', e.target.value)} variant="outlined" className="w-[8ch]" />
                      </td>}
                      {!hiddenColumns.includes('Disc. %') && <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <Input id={`discPercent-${index}`} label="Disc. %" value={row.discPercent} onChange={(e) => updateItem(index, 'discPercent', e.target.value)} variant="outlined" className="w-[7ch]" />
                      </td>}
                      {!hiddenColumns.includes('CD%') && <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <Input id={`cdPercent-${index}`} label="CD%" value={row.cdPercent} onChange={(e) => updateItem(index, 'cdPercent', e.target.value)} variant="outlined" className="w-[7ch]" />
                      </td>}
                      {!hiddenColumns.includes('Taxable') && <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                        {formatINR.format(taxable || 0)}
                      </td>}
                      {!hiddenColumns.includes('GST Group') && <td className="px-4 py-3 whitespace-nowrap text-sm">
                        {row.itemCode ? (
                          <div className="relative w-[10ch]">
                            {row.gstCode ? (
                              <div
                                className="absolute inset-0 flex items-center px-3 text-sm text-gray-900 dark:text-white bg-transparent pointer-events-none z-10"
                              >
                                {(() => {
                                  const g = gstGroupOptions.find(o => o.value === row.gstCode);
                                  return g ? `${g.value}` : row.gstCode;
                                })()}
                              </div>
                            ) : null}
                            <Input
                              id={`gst-${index}`}
                              label="GST Group"
                              value={row.gstCode || row.gstPercent}
                              onChange={(e) => updateItem(index, 'gstPercent', e.target.value)}
                              variant="outlined"
                              disabled
                              className={`w-full ${row.gstCode ? 'text-transparent dark:text-transparent' : ''}`}
                            />
                          </div>
                        ) : (
                          <div className="relative w-[10ch]">
                            {row.gstCode ? (
                              <div
                                className="absolute inset-0 flex items-center px-3 text-sm text-gray-900 dark:text-white bg-transparent pointer-events-none z-10"
                              >
                                {(() => {
                                  const g = gstGroupOptions.find(o => o.value === row.gstCode);
                                  return g ? `${g.tax}%` : '';
                                })()}
                              </div>
                            ) : null}
                            <Select
                              options={gstGroupOptions.map(o => ({ value: o.value, label: o.label }))}
                              value={row.gstCode || ''}
                              onChange={(val: string) => {
                                const g = gstGroupOptions.find(o => o.value === val);
                                const tax = g ? String(g.tax) : '';
                                setItems(prev => prev.map((r, i) => i === index ? { ...r, gstCode: val, gstPercent: tax } : r));
                              }}
                              className={`w-full ${row.gstCode ? 'text-transparent dark:text-transparent' : ''}`}
                              placeholder="Select"
                            />
                          </div>
                        )}
                      </td>}
                      {!hiddenColumns.includes('Total') && <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                        {formatINR.format(total || 0)}
                      </td>}
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <button onClick={() => removeItem(index)} className="p-2 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700">
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                            <path d="M10 11v6" />
                            <path d="M14 11v6" />
                            <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 sm:px-6 py-4 flex flex-col lg:flex-row justify-between items-start gap-4">
            {(() => {
              const gstBreakdown: Record<string, { taxable: number; gst: number; rate: number }> = {};
              items.forEach(row => {
                const taxable = computeTaxable(row);
                const gst = computeRowGst(row);
                const p = parseFloat(row.gstPercent || '0');

                let code = row.gstCode;
                if (!code && row.itemCode) {
                  const found = pmplData.find(it => String(it.CODE || '') === String(row.itemCode));
                  code = String(found?.GST_CODE || found?.G_CODE || '').trim();
                }
                const label = code || `GST ${p}%`;

                if (!gstBreakdown[label]) gstBreakdown[label] = { taxable: 0, gst: 0, rate: p };
                gstBreakdown[label].taxable += taxable;
                gstBreakdown[label].gst += gst;
              });

              const isInterState = !gstin.startsWith('23');

              let totalTaxableBreakdown = 0;
              let totalTaxBreakdown = 0;

              const breakdownRows = Object.entries(gstBreakdown)
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([code, data]) => {
                  const override = breakdownOverrides[code];
                  const finalTaxable = override ? parseFloat(override) : data.taxable;
                  const safeTaxable = isNaN(finalTaxable) ? 0 : finalTaxable;

                  // Re-calculate tax based on (new) taxable amount
                  const finalTax = safeTaxable * (data.rate / 100);

                  totalTaxableBreakdown += safeTaxable;
                  totalTaxBreakdown += finalTax;

                  return {
                    code,
                    rate: data.rate,
                    taxable: safeTaxable,
                    tax: finalTax,
                    originalTaxable: data.taxable
                  };
                });

              // Grand Total calculation now uses breakdown sums if available, or item sums?
              // The user said: "make the table's taxable feild editable... thus change in the cgst and sgst value"
              // This implies the Grand Total should reflect these edits.

              const grandTaxable = totalTaxableBreakdown;
              const grandTax = totalTaxBreakdown;
              const grandGross = grandTaxable + grandTax;
              const rounded = Math.round(grandGross);
              const roundOff = rounded - grandGross;
              const grandTotal = grandGross + roundOff;

              return (
                <>
                  <div className="w-full lg:w-auto overflow-x-auto">
                    <table className="min-w-full text-xs text-left text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
                      <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
                        <tr>
                          <th className="px-3 py-2 border-b dark:border-gray-600">GST Group</th>
                          <th className="px-3 py-2 border-b dark:border-gray-600 text-right">Taxable</th>
                          {isInterState ? (
                            <th className="px-3 py-2 border-b dark:border-gray-600 text-right">IGST</th>
                          ) : (
                            <>
                              <th className="px-3 py-2 border-b dark:border-gray-600 text-right">CGST</th>
                              <th className="px-3 py-2 border-b dark:border-gray-600 text-right">SGST</th>
                            </>
                          )}
                          <th className="px-3 py-2 border-b dark:border-gray-600 text-right">Total Tax</th>
                        </tr>
                      </thead>
                      <tbody>
                        {breakdownRows.map((row) => (
                          <tr key={row.code} className="bg-white border-b dark:bg-gray-800 dark:border-gray-700">
                            <td className="px-3 py-1 border-r dark:border-gray-700 font-medium">{row.code} ({row.rate}%)</td>
                            <td className="px-3 py-1 border-r dark:border-gray-700 text-right">
                              <input
                                type="text"
                                className="w-20 text-right bg-transparent border-b border-gray-300 focus:border-blue-500 outline-none"
                                value={breakdownOverrides[row.code] ?? row.originalTaxable.toFixed(2)}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (/^\d*\.?\d*$/.test(val)) {
                                    setBreakdownOverrides(prev => ({ ...prev, [row.code]: val }));
                                  }
                                }}
                              />
                            </td>
                            {isInterState ? (
                              <td className="px-3 py-1 border-r dark:border-gray-700 text-right">{formatINR.format(row.tax)}</td>
                            ) : (
                              <>
                                <td className="px-3 py-1 border-r dark:border-gray-700 text-right">{formatINR.format(row.tax / 2)}</td>
                                <td className="px-3 py-1 border-r dark:border-gray-700 text-right">{formatINR.format(row.tax / 2)}</td>
                              </>
                            )}
                            <td className="px-3 py-1 text-right">{formatINR.format(row.tax)}</td>
                          </tr>
                        ))}
                        <tr className="bg-gray-100 dark:bg-gray-700 font-semibold">
                          <td className="px-3 py-2 border-r dark:border-gray-600">Total</td>
                          <td className="px-3 py-2 border-r dark:border-gray-600 text-right">{formatINR.format(grandTaxable)}</td>
                          {isInterState ? (
                            <td className="px-3 py-2 border-r dark:border-gray-600 text-right">{formatINR.format(grandTax)}</td>
                          ) : (
                            <>
                              <td className="px-3 py-2 border-r dark:border-gray-600 text-right">{formatINR.format(grandTax / 2)}</td>
                              <td className="px-3 py-2 border-r dark:border-gray-600 text-right">{formatINR.format(grandTax / 2)}</td>
                            </>
                          )}
                          <td className="px-3 py-2 text-right">{formatINR.format(grandTax)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="text-right w-full lg:w-auto">
                    <div className="text-sm text-gray-600 dark:text-gray-300">Taxable: {formatINR.format(grandTaxable)}</div>
                    {isInterState ? (
                      <div className="text-sm text-gray-600 dark:text-gray-300">IGST: {formatINR.format(grandTax)}</div>
                    ) : (
                      <>
                        <div className="text-sm text-gray-600 dark:text-gray-300">CGST: {formatINR.format(grandTax / 2)}</div>
                        <div className="text-sm text-gray-600 dark:text-gray-300">SGST: {formatINR.format(grandTax / 2)}</div>
                      </>
                    )}
                    <div className="text-sm text-gray-600 dark:text-gray-300">Round Off: {roundOff >= 0 ? '+' : ''}{roundOff.toFixed(2)}</div>
                    <div className="mt-2 text-xl font-semibold text-gray-900 dark:text-white">Total: {formatINR.format(grandTotal)}</div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
};


export default NewPurchase;
