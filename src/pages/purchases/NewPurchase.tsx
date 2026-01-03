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
import CMPL from '../../../d01-2324/data/json/CMPL.json';
import PMPL from '../../../d01-2324/data/json/PMPL.json';
import PUR from '../../../d01-2324/data/json/PUR.json';
import GODOWNS from '../../../d01-2324/data/json/godown.json';

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
  godown?: string;
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

  const addItem = () => {
    setItems((prev) => [...prev, { description: '', hsn: '', qty: '', rate: '', mrp: '', itemCode: '', discRs: '', discPercent: '', cdPercent: '', gstPercent: '', godown: globalGodown || '' }]);
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
    const data = (PMPL as any[]) || [];
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
    if (!code) return { hsn: '', gstPercent: '' };
    const data = (PMPL as any[]) || [];
    const found = data.find((it) => String(it.CODE || '') === String(code));
    if (!found) return { hsn: '', gstPercent: '' };
    const h = String(found.H_CODE || '').trim();
    const gRaw = found.GST;
    const gNum = typeof gRaw === 'number' ? gRaw : parseFloat(String(gRaw || '').trim().replace(/[^0-9.]/g, ''));
    const g = isNaN(gNum) ? '' : String(gNum);
    return { hsn: h, gstPercent: g };
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
    const q = parseFloat(row.qty || '0');
    const r = parseFloat(row.rate || '0');
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
    const data = (PMPL as any[]) || [];
    const prefixes = new Set<string>();
    data.forEach(it => {
      const code = String(it.CODE || '');
      if (code.length >= 2) prefixes.add(code.slice(0, 2));
    });
    return Array.from(prefixes).sort().map(p => ({ value: p, label: p }));
  }, []);

  const getPurRecords = async (): Promise<any[]> => {
    const imported = Array.isArray(PUR) ? (PUR as any[]) : [];
    if (imported.length > 0) return imported;
    try {
      const respLocal = await fetch('/d01-2324/data/json/PUR.json');
      if (respLocal.ok) {
        const arr = await respLocal.json();
        if (Array.isArray(arr) && arr.length > 0) return arr;
      }
    } catch {}
    try {
      const token = localStorage.getItem('token');
      const respApi = await fetch(`${constants.baseURL}/api/dbf/PUR.json`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      });
      if (respApi.ok) {
        const arr = await respApi.json();
        if (Array.isArray(arr) && arr.length > 0) return arr;
      }
    } catch {}
    return [];
  };

  useEffect(() => {
    (async () => {
      const arr = await getPurRecords();
      if (editingBill) {
        const row = (arr || []).find((r: any) => String(r.BILL) === String(editingBill));
        if (row?.BILL_BB) {
          setPBillBB(String(row.BILL_BB));
          return;
        }
      }
      let maxBillNum = 0;
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
    })();
  }, [editingBill]);

  const gstGroupOptions = useMemo(() => {
    const rawArr: any[] = Array.isArray(CMPL) ? (CMPL as any[]) : [];
    return rawArr
      .filter(it => String(it.C_CODE || '').toUpperCase().startsWith('GG'))
      .map(it => {
        const code = String(it.C_CODE || '');
        const name = String(it.C_NAME || '');
        const tax = typeof it.GST_TAX === 'number' ? it.GST_TAX : parseFloat(String(it.GST_TAX || '0'));
        return { value: code, label: `${code} - ${name} - ${isNaN(tax) ? '' : `${tax}%`}`, tax: isNaN(tax) ? 0 : tax };
      });
  }, []);

  const gstUnitOptions = useMemo(() => {
    const units = ['PCS','BOX','BOTTLE','JAR','CAN','KG','GMS','LTR','ML','PACK','BAG','DOZEN','TUBE','SACHET'];
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
    const data = (PMPL as any[]) || [];
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
  }, []);
  const getItemLabelByCode = (code?: string) => {
    if (!code) return '';
    const opt = pmplItemOptions.find(o => o.value === code);
    return opt?.label || '';
  };
  const findSupplierByGstin = (gst: string) => {
    if (!gst) return null;
    const g = gst.trim().toUpperCase();
    const rawArr: any[] = Array.isArray(CMPL) ? (CMPL as any[]) : [];
    const match = rawArr.find(p => {
      const gstno = String((p as any).GSTNO || (p as any).GST || '').trim().toUpperCase();
      return gstno && gstno === g;
    });
    if (match && match.C_CODE && match.C_NAME) return { C_CODE: String(match.C_CODE), C_NAME: String(match.C_NAME), GSTNO: String(match.GSTNO || match.GST || '') } as SupplierRecord;
    return null;
  };
  const handleItemSelection = (index: number, code: string) => {
    const data = (PMPL as any[]) || [];
    const found = data.find(it => String(it.CODE || '') === String(code));
    setItems(prev => prev.map((row, i) => {
      if (i !== index) return row;
      const desc = String(found?.PRODUCT || row.description);
      const hsn = String(found?.H_CODE || row.hsn);
      const gstVal = found?.GST;
      const gstStr = typeof gstVal === 'number' ? String(gstVal) : String(gstVal || row.gstPercent);
      const mrpStr = found && (typeof found.MRP1 === 'number' ? String(found.MRP1) : String(found.MRP1 || row.mrp));
      return { ...row, itemCode: code, description: desc, hsn, gstPercent: gstStr, mrp: mrpStr || row.mrp };
    }));
  };

  const computeNextItemCode = (prefix: string) => {
    const data = (PMPL as any[]) || [];
    let max = 0;
    data.forEach(it => {
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
            hsn: meta.hsn || String(it.hsn || ''),
            qty: String(it.qty ?? ''),
            rate: String(it.rate ?? ''),
            mrp,
            itemCode,
            discRs: String(it.discountRs ?? ''),
            discPercent: String(it.discountPercent ?? ''),
            cdPercent: String(it.cdPercent ?? ''),
            gstPercent: meta.gstPercent || String((it.gstPercent ?? 18)),
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

  useEffect(() => {
    const rawArr: unknown[] = Array.isArray(CMPL) ? (CMPL as unknown[]) : [];
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
  }, []);

  useEffect(() => {
    // Prefill from local JSON import
    try {
      const baseArr: any[] = Array.isArray(GODOWNS) ? (GODOWNS as any[]) : [];
      if (baseArr.length > 0) {
        const localOpts = baseArr
          .filter((g: any) => String(g.ACTIVE || 'Y') === 'Y')
          .map((g: any) => {
            const code = String(g.GDN_CODE || '').padStart(2, '0').slice(0, 2);
            const name = String(g.GDN_NAME || '');
            return { value: code, label: `${name} (${code})` };
          });
        setGodownOptions(localOpts);
      }
    } catch {}

    // Fetch from API for up-to-date list
    (async () => {
      try {
        const token = localStorage.getItem('token');
        const resp = await fetch(`${constants.baseURL}/api/godowns`, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
        if (resp.ok) {
          const arr = await resp.json();
          const opts = (arr || []).filter((g: any) => String(g.ACTIVE || 'Y') === 'Y').map((g: any) => {
            const code = String(g.GDN_CODE || '').padStart(2, '0').slice(0, 2);
            const name = String(g.GDN_NAME || '');
            return { value: code, label: `${name} (${code})` };
          });
          setGodownOptions(opts);
        }
      } catch {}
    })();
  }, []);

  useEffect(() => {
    const prefix = (gstin || '').slice(0, 2);
    if (GST_STATES.find(s => s.code === prefix)) {
      setStateVal(prefix);
    }
  }, [gstin]);

  useEffect(() => {
    const prefill = (location.state as any)?.purchase;
    const editId = params?.id;
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
          const dbfRow = (purDbf || []).find((r: any) => String(r.BILL) === billParam);
          let found = (purchases || []).find((x: any) => String(x.bill) === billParam);
          if (!found && dbfRow) {
            const pbill = String(dbfRow.PBILL || '').trim();
            const pcode = String(dbfRow.C_CODE || '').trim();
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
        } catch {}
      })();
    }
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
      } catch {}
      const token = localStorage.getItem('token');
      // Determine BILL to use
      let billNo: string | null = editingBill;
      if (!billNo) {
        const arr = await getPurRecords();
        let maxBillNum = 0;
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
        totals: (() => {
          const taxableSum = items.reduce((sum, r) => sum + computeTaxable(r), 0);
          const gstSum = items.reduce((sum, r) => sum + computeRowGst(r), 0);
          const gross = taxableSum + gstSum;
          const rounded = Math.round(gross);
          const roundOff = rounded - gross;
          const grandTotal = gross + roundOff;
          return {
            taxable: Number(taxableSum.toFixed(2)),
            cgst: Number((gstSum / 2).toFixed(2)),
            sgst: Number((gstSum / 2).toFixed(2)),
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
    } catch (e) {
      alert('Error saving purchase');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <PageMeta title="New Purchase Entry | FMCG Vite Admin Template" description="OCR Assisted Purchase Recording" />
      <PageBreadcrumb pageTitle="New Purchase Entry" />

      <div className="container mx-auto px-4 py-2">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('/purchases')} className="p-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300">
              <ChevronLeftIcon className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-2xl font-semibold text-gray-800 dark:text-white">New Purchase Entry</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">OCR Assisted Purchase Recording</p>
            </div>
          </div>
          <div className="flex gap-2 items-center">
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
                  <path d="M12 20h9"/>
                  <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
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
                  <path d="M19 21H5a2 2 0 0 1-2-2V7"/>
                  <path d="M16 3l5 5L8 21H3v-5L16 3z"/>
                </svg>
              </button>
            </div>
            <div className="hidden sm:block rounded-lg bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 px-3 py-2 text-sm max-w-[300px] truncate">
              {selectedFileName || 'No file selected'}
            </div>
            <button onClick={handleUploadClick} disabled={isProcessing} className="inline-flex items-center gap-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 px-4 py-2 text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v16H4z"/><path d="M8 8h8v8H8z"/></svg>
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
              <Input id="pbillbb" label="PBILL" value={pBillBB} onChange={() => {}} variant="outlined" disabled />
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
          <div className="flex items-center justify-between px-4 sm:px-6 py-4">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Items</h3>
            <div className="flex items-center gap-3">
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
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
              Add Item
              </button>
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
                    } catch (err) {
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
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Item Description</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">MRP</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Item Code</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">HSN</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">GDN</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Qty</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
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
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Disc. Rs</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Disc. %</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">CD%</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Taxable</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">GST %</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Total</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Remove</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {items.map((row, index) => {
                  const taxable = computeTaxable(row);
                  const total = computeTotal(row);
                  return (
                    <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
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
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
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
                          className="w-[40ch]"
                        />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <Input id={`mrp-${index}`} label="MRP" value={row.mrp} onChange={(e) => updateItem(index, 'mrp', e.target.value)} variant="outlined" className="w-[9ch]" />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <Input id={`code-${index}`} label="Item Code" value={row.itemCode} onChange={() => {}} variant="outlined" disabled maxLength={5} className="w-[9ch]" />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <Input id={`hsn-${index}`} label="HSN" value={row.hsn} onChange={(e) => updateItem(index, 'hsn', e.target.value)} variant="outlined" disabled={!!row.itemCode} maxLength={8} className="w-[12ch]" />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <Select
                          options={godownOptions}
                          value={row.godown || ''}
                          onChange={(val: string) => updateItem(index, 'godown', val.slice(0, 2))}
                          className="min-w-[180px]"
                          placeholder="Select Godown"
                        />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <Input id={`qty-${index}`} label="Qty" value={row.qty} onChange={(e) => updateItem(index, 'qty', e.target.value)} variant="outlined" className="w-[8ch]" />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <Input id={`rate-${index}`} label="Rate" value={row.rate} onChange={(e) => updateItem(index, 'rate', e.target.value.replace(/[^0-9.]/g, '').slice(0, 6))} variant="outlined" maxLength={6} className="w-[10ch]" />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <Input id={`discRs-${index}`} label="Disc. Rs" value={row.discRs} onChange={(e) => updateItem(index, 'discRs', e.target.value)} variant="outlined" className="w-[8ch]" />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <Input id={`discPercent-${index}`} label="Disc. %" value={row.discPercent} onChange={(e) => updateItem(index, 'discPercent', e.target.value)} variant="outlined" className="w-[7ch]"/>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <Input id={`cdPercent-${index}`} label="CD%" value={row.cdPercent} onChange={(e) => updateItem(index, 'cdPercent', e.target.value)} variant="outlined" className="w-[7ch]"/>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                        {formatINR.format(taxable || 0)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        {row.itemCode ? (
                          <Input id={`gst-${index}`} label="GST %" value={row.gstPercent} onChange={(e) => updateItem(index, 'gstPercent', e.target.value)} variant="outlined" disabled className="w-[10ch]" />
                        ) : (
                          <Select
                            options={[
                              { value: '0', label: '0%' },
                              { value: '5', label: '5%' },
                              { value: '12', label: '12%' },
                              { value: '18', label: '18%' },
                              { value: '28', label: '28%' },
                            ]}
                            value={row.gstPercent}
                            onChange={(val: string) => updateItem(index, 'gstPercent', String(val))}
                            className="min-w-[100px]"
                            placeholder="GST %"
                          />
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                        {formatINR.format(total || 0)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <button onClick={() => removeItem(index)} className="p-2 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700">
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                            <path d="M10 11v6"/>
                            <path d="M14 11v6"/>
                            <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>
                          </svg>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 sm:px-6 py-4 flex justify-end">
            {(() => {
              const taxableSum = items.reduce((sum, r) => sum + computeTaxable(r), 0);
              const gstSum = items.reduce((sum, r) => sum + computeRowGst(r), 0);
              const cgst = gstSum / 2;
              const sgst = gstSum / 2;
              const gross = taxableSum + gstSum;
              const rounded = Math.round(gross);
              const roundOff = (rounded - gross);
              const grandTotal = gross + roundOff;
              return (
                <div className="text-right">
                  <div className="text-sm text-gray-600 dark:text-gray-300">Taxable: {formatINR.format(taxableSum)}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-300">CGST: {formatINR.format(cgst)}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-300">SGST: {formatINR.format(sgst)}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-300">Round Off: {roundOff >= 0 ? '+' : ''}{roundOff.toFixed(2)}</div>
                  <div className="mt-2 text-xl font-semibold text-gray-900 dark:text-white">Total: {formatINR.format(grandTotal)}</div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
};


export default NewPurchase;
