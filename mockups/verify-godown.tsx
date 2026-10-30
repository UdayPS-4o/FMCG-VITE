// Dev-only harness: renders the real Godown Transfer components with sample data (no backend).
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import GodownTiles from '../src/pages/godown-transfer/GodownTiles';
import TransferSuccess from '../src/pages/godown-transfer/TransferSuccess';
import Autocomplete from '../src/components/form/input/Autocomplete';

const GODOWNS = [
  { GDN_CODE: '01', GDN_NAME: 'SHOP BUDHWARI' }, { GDN_CODE: '02', GDN_NAME: 'GANJ GODOWN' },
  { GDN_CODE: '03', GDN_NAME: 'KEOLARI GODOWN' }, { GDN_CODE: '04', GDN_NAME: 'EXPIRY GODOWN' },
  { GDN_CODE: '05', GDN_NAME: 'SHORTAGE GODOWN' }, { GDN_CODE: '06', GDN_NAME: 'RETAIL GODOWN' },
  { GDN_CODE: '07', GDN_NAME: 'BARAPTHAR GODOWN' }, { GDN_CODE: '08', GDN_NAME: 'CHAPARA GODOWN' },
];
const ITEMS = [
  { value: '16018', label: '16018 | SURF EXCEL BAR 100G', image: 'https://storage.googleapis.com/hul-shikhar-cms/CMS-PROD-HERO/2024112115283316018.png' },
  { value: '16020', label: '16020 | SURF EXCEL BAR 250G', image: 'https://storage.googleapis.com/hul-shikhar-cms/CMS-PROD-HERO/2024112115283216020.png' },
  { value: '16023', label: '16023 | SURF EXCEL BAR 4X200G', image: 'https://storage.googleapis.com/hul-shikhar-cms/CMS-PROD-HERO/16023.png' },
  { value: '99999', label: '99999 | ITEM WITHOUT IMAGE', image: '' },
  { value: '88888', label: '88888 | ITEM WITH BROKEN IMAGE', image: 'https://example.invalid/x.png' },
];
const THEMES: Record<string, string[]> = {
  light: [], dark: ['dark'], sage: ['theme-sage'], saffron: ['theme-saffron'], indigo: ['theme-indigo'],
  glass: ['theme-glass'], 'glass-sunset': ['theme-glass', 'theme-glass-sunset'], 'glass-obsidian': ['theme-glass', 'theme-glass-obsidian'],
};
(window as any).setTheme = (t: string) => {
  const r = document.documentElement;
  Object.values(THEMES).flat().forEach(c => r.classList.remove(c));
  r.classList.add(...THEMES[t]);
};

const App = () => {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [item, setItem] = useState('');
  const [saved, setSaved] = useState(0);
  const f = GODOWNS.find(g => g.GDN_CODE === from);
  const t = GODOWNS.find(g => g.GDN_CODE === to);
  return (
    <div className="p-3 sm:p-6 max-w-5xl mx-auto">
      <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-lg shadow-sm mb-6 flex flex-col gap-6">
        <GodownTiles id="fromGodown" step={1} label="From Godown" hint="tap to pick" godowns={GODOWNS} value={from}
          onChange={(c) => { setFrom(c); if (c === to) setTo(''); }} />
        <GodownTiles id="toGodown" step={2} label="To Godown" godowns={GODOWNS} value={to} onChange={setTo}
          disabledCodes={from ? [from] : GODOWNS.map(g => g.GDN_CODE)} hint={from ? undefined : 'pick From Godown first'} />
      </div>
      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg mb-6 max-w-md">
        <Autocomplete id="item-0" label="Item Name" options={ITEMS} onChange={setItem} defaultValue={item} />
      </div>
      <button id="save" type="button" className="px-4 py-2 bg-brand-500 text-white rounded-md" disabled={!f || !t} onClick={() => setSaved(s => s + 1)}>Submit</button>
      {saved > 0 && f && t && (
        <TransferSuccess key={saved} fromCode={f.GDN_CODE} fromName={f.GDN_NAME} toCode={t.GDN_CODE} toName={t.GDN_NAME}
          docNo="T-36" itemCount={2} onNewTransfer={() => setSaved(0)} onViewTransfers={() => setSaved(0)} />
      )}
    </div>
  );
};

createRoot(document.getElementById('root')!).render(<App />);
