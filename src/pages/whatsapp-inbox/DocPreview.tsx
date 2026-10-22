import { useEffect, useRef, useState } from 'react';

// ─── Document preview bubble ─────────────────────────────────────────────────
// Inbound documents arrive from the webhook as a bare S3 URL — no filename, no
// MIME type. The bucket allows CORS, so the browser inspects the file itself:
// HEAD for type + size, and for PDFs renders page 1 as a WhatsApp-style thumbnail.

/** PDFs larger than this are not downloaded just to draw a thumbnail */
const MAX_THUMB_BYTES = 15 * 1024 * 1024;
const THUMB_WIDTH = 330;
const MAX_PARALLEL = 2;

interface DocInfo {
  ext: string;        // 'pdf', 'xlsx', … ('' when unknown)
  size?: number;      // bytes
  pages?: number;
  thumb?: string;     // data URL of page 1
}

const MIME_EXT: [RegExp, string][] = [
  [/pdf/, 'pdf'],
  [/spreadsheetml/, 'xlsx'],
  [/ms-excel/, 'xls'],
  [/wordprocessingml/, 'docx'],
  [/msword/, 'doc'],
  [/presentationml/, 'pptx'],
  [/ms-powerpoint/, 'ppt'],
  [/text\/csv/, 'csv'],
  [/text\/plain/, 'txt'],
  [/zip/, 'zip'],
  [/rar/, 'rar'],
];

function extFromMime(mime: string): string {
  const m = mime.toLowerCase();
  return MIME_EXT.find(([re]) => re.test(m))?.[1] || '';
}

function extFromName(filename: string): string {
  return filename.includes('.') ? filename.split('.').pop()!.toLowerCase() : '';
}

/** A real filename, or null when the webhook only gave us the 'Document' placeholder */
function realFilename(filename?: string): string | null {
  return filename && filename !== 'Document' && filename !== 'Attachment' ? filename : null;
}

export function getDocType(ext: string): string {
  const map: Record<string, string> = {
    pdf: 'PDF', xls: 'Excel', xlsx: 'Excel', xlsm: 'Excel',
    doc: 'Word', docx: 'Word', ppt: 'PowerPoint', pptx: 'PowerPoint',
    csv: 'CSV', txt: 'Text', zip: 'ZIP', rar: 'Archive',
  };
  return map[ext] || ext.toUpperCase() || 'Document';
}

export function DocIcon({ ext }: { ext: string }) {
  const colors: Record<string, string> = {
    pdf: '#e53935', xls: '#2e7d32', xlsx: '#2e7d32', xlsm: '#2e7d32',
    doc: '#1565c0', docx: '#1565c0', ppt: '#e65100', pptx: '#e65100',
    csv: '#2e7d32', zip: '#6d4c41', rar: '#6d4c41',
  };
  const color = colors[ext] || '#607d8b';
  const label = ext.toUpperCase().slice(0, 4) || 'FILE';
  return (
    <div className="wa-doc-icon" style={{ background: color }}>
      <span>{label}</span>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Loading: shared cache + small concurrency limit ──────────────────────────
const infoCache = new Map<string, Promise<DocInfo>>();
let active = 0;
const waiting: (() => void)[] = [];

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_PARALLEL) await new Promise<void>((r) => waiting.push(r));
  active++;
  try { return await fn(); }
  finally { active--; waiting.shift()?.(); }
}

let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;
function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ]).then(([pdfjs, worker]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

async function renderPdf(data: ArrayBuffer): Promise<{ pages: number; thumb: string }> {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data }).promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: (THUMB_WIDTH * 2) / base.width });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    return { pages: doc.numPages, thumb: canvas.toDataURL('image/jpeg', 0.8) };
  } finally {
    doc.destroy();
  }
}

function loadDocInfo(url: string, knownExt: string): Promise<DocInfo> {
  let p = infoCache.get(url);
  if (!p) {
    p = withSlot(async () => {
      const head = await fetch(url, { method: 'HEAD' });
      if (!head.ok) throw new Error(`HTTP ${head.status}`);
      const ext = knownExt || extFromMime(head.headers.get('content-type') || '');
      const len = Number(head.headers.get('content-length')) || undefined;
      const info: DocInfo = { ext, size: len };
      if (ext !== 'pdf' || (len && len > MAX_THUMB_BYTES)) return info;

      const res = await fetch(url);
      const data = await res.arrayBuffer();
      info.size = data.byteLength;
      // Sniff in case the MIME lied
      const magic = new TextDecoder().decode(new Uint8Array(data, 0, Math.min(5, data.byteLength)));
      if (magic !== '%PDF-') return info;
      return { ...info, ...(await renderPdf(data)) };
    }).catch((err) => {
      infoCache.delete(url); // allow a retry on next mount
      throw err;
    });
    infoCache.set(url, p);
  }
  return p;
}

function useInView<T extends Element>() {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setInView(true); }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [inView]);
  return [ref, inView] as const;
}

// ── Component ────────────────────────────────────────────────────────────────
export function DocPreview({ url, filename }: { url: string; filename?: string }) {
  const name = realFilename(filename);
  const nameExt = name ? extFromName(name) : '';
  const [ref, inView] = useInView<HTMLAnchorElement>();
  const [info, setInfo] = useState<DocInfo | null>(null);

  useEffect(() => {
    if (!inView) return;
    let alive = true;
    loadDocInfo(url, nameExt).then((i) => alive && setInfo(i)).catch(() => {});
    return () => { alive = false; };
  }, [inView, url, nameExt]);

  const ext = info?.ext || nameExt;
  const typeLabel = getDocType(ext);
  const title = name || (ext ? `${typeLabel} document` : 'Document');
  const meta = [
    info?.pages ? `${info.pages} page${info.pages > 1 ? 's' : ''}` : null,
    typeLabel,
    info?.size ? formatSize(info.size) : null,
  ].filter(Boolean).join(' • ');

  return (
    <a ref={ref} href={url} target="_blank" rel="noopener noreferrer"
      className={`wa-doc-link ${info?.thumb ? 'wa-doc-link--thumb' : ''}`}>
      {info?.thumb && <img src={info.thumb} alt="" className="wa-doc-thumb" />}
      <div className="wa-doc-row">
        <DocIcon ext={ext} />
        <div className="wa-doc-info">
          <span className="wa-doc-name" title={title}>{title}</span>
          <span className="wa-doc-type">{meta}</span>
        </div>
      </div>
    </a>
  );
}
