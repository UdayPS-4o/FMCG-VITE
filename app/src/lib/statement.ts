/**
 * Ledger statement for the Profile page: a printable page (the browser's
 * "Save as PDF") and a short text version for sharing on WhatsApp.
 */
import { Capacitor } from '@capacitor/core';
import type { LedgerEntry } from './api';

export interface StatementInput {
    partyName: string;
    partyCode: string;
    fy: string;
    balance: string;
    entries: LedgerEntry[];
}

const SHARE_ENTRY_LIMIT = 15;
const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

/** "2627" -> "2026-27" */
export const fyLabel = (fy: string) => (/^\d{4}$/.test(fy) ? `20${fy.slice(0, 2)}-${fy.slice(2)}` : fy);

export const formatInr = (n: number) =>
    `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, c => HTML_ESCAPES[c]);

const totals = (entries: LedgerEntry[]) => ({
    dr: entries.reduce((sum, e) => sum + e.dr, 0),
    cr: entries.reduce((sum, e) => sum + e.cr, 0),
});

const buildHtml = ({ partyName, partyCode, fy, balance, entries }: StatementInput) => {
    const t = totals(entries);
    // Statements read oldest first; the app lists newest first
    const rows = [...entries].reverse().map(e => `
        <tr>
            <td>${escapeHtml(e.date)}</td>
            <td>${escapeHtml(e.book)}</td>
            <td>${escapeHtml(e.narration)}</td>
            <td class="n">${e.dr ? formatInr(e.dr) : ''}</td>
            <td class="n">${e.cr ? formatInr(e.cr) : ''}</td>
        </tr>`).join('');
    return `<!doctype html><html><head><meta charset="utf-8"><title>Statement ${escapeHtml(partyCode)} ${escapeHtml(fyLabel(fy))}</title>
<style>
body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#111;margin:24px}
h1{font-size:18px;margin:0 0 2px}
.meta{color:#555;margin-bottom:14px}
table{width:100%;border-collapse:collapse}
th,td{border:1px solid #ccc;padding:5px 6px;text-align:left;vertical-align:top}
th{background:#f1f1f1}
.n{text-align:right;white-space:nowrap}
tfoot td{font-weight:bold}
</style></head><body>
<h1>EKTA ENTERPRISES</h1>
<div class="meta">Ledger statement, FY ${escapeHtml(fyLabel(fy))}<br>
${escapeHtml(partyName)} (${escapeHtml(partyCode)})<br>
Current balance: ${escapeHtml(balance || '₹0.00')}</div>
<table>
<thead><tr><th>Date</th><th>Voucher</th><th>Particulars</th><th class="n">Debit</th><th class="n">Credit</th></tr></thead>
<tbody>${rows}</tbody>
<tfoot><tr><td colspan="3">Total</td><td class="n">${formatInr(t.dr)}</td><td class="n">${formatInr(t.cr)}</td></tr></tfoot>
</table>
</body></html>`;
};

/**
 * Opens the print dialog with the statement (choose "Save as PDF").
 * Returns false where printing is not available (the native app shell).
 */
export const printStatement = (input: StatementInput): boolean => {
    if (Capacitor.isNativePlatform()) return false;
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    frame.srcdoc = buildHtml(input);
    frame.onload = () => {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
        // The dialog blocks in most browsers; leave time for the ones where it does not
        setTimeout(() => frame.remove(), 60_000);
    };
    document.body.appendChild(frame);
    return true;
};

export const statementText = ({ partyName, partyCode, fy, balance, entries }: StatementInput) => {
    const t = totals(entries);
    const lines = entries.slice(0, SHARE_ENTRY_LIMIT).map(e =>
        `${e.date}  ${e.type === 'CR' ? 'Received' : 'Billed'} ${formatInr(e.amount)}  ${e.book}`);
    const more = entries.length > SHARE_ENTRY_LIMIT ? [`... and ${entries.length - SHARE_ENTRY_LIMIT} older entries`] : [];
    return [
        `EKTA ENTERPRISES - Ledger FY ${fyLabel(fy)}`,
        `${partyName} (${partyCode})`,
        `Current balance: ${balance || '₹0.00'}`,
        `Total billed: ${formatInr(t.dr)} | Total received: ${formatInr(t.cr)}`,
        '',
        ...lines,
        ...more,
    ].join('\n');
};

/** Native share sheet where there is one, otherwise WhatsApp with the text filled in. */
export const shareStatement = async (input: StatementInput) => {
    const text = statementText(input);
    if (navigator.share) {
        try {
            await navigator.share({ title: `Ledger FY ${fyLabel(input.fy)}`, text });
            return;
        } catch (err) {
            if ((err as Error).name === 'AbortError') return; // user closed the sheet
        }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
};
