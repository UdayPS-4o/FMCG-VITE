import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// ── Route → Page Title map ────────────────────────────────────────────────────
const ROUTE_TITLES: { pattern: RegExp; title: string }[] = [
  // Auth
  { pattern: /^\/login$/,                           title: 'Login' },
  { pattern: /^\/signin$/,                          title: 'Sign In' },
  { pattern: /^\/signup$/,                          title: 'Sign Up' },

  // Main
  { pattern: /^\/dashboard$/,                       title: 'Dashboard' },
  { pattern: /^\/account-master\/edit\//,           title: 'Edit Account' },
  { pattern: /^\/account-master$/,                  title: 'Account Master' },
  { pattern: /^\/invoicing\/edit\//,                title: 'Edit Invoice' },
  { pattern: /^\/invoicing$/,                       title: 'Invoicing' },
  { pattern: /^\/godown-transfer\/edit\//,          title: 'Edit Godown Transfer' },
  { pattern: /^\/godown-transfer$/,                 title: 'Godown Transfer' },
  { pattern: /^\/cash-receipt$/,                    title: 'Cash Receipt' },
  { pattern: /^\/cash-payment$/,                    title: 'Cash Payment' },
  { pattern: /^\/purchases\/edit\//,                title: 'Edit Purchase' },
  { pattern: /^\/purchases/,                        title: 'New Purchase' },
  { pattern: /^\/add-user$/,                        title: 'Add User' },

  // Database
  { pattern: /^\/db\/account-master\/edit\//,       title: 'Edit Account' },
  { pattern: /^\/db\/account-master$/,              title: 'DB · Account Master' },
  { pattern: /^\/db\/invoicing\/edit\//,            title: 'Edit Invoice' },
  { pattern: /^\/db\/invoicing$/,                   title: 'DB · Invoicing' },
  { pattern: /^\/db\/purchases$/,                   title: 'DB · Purchases' },
  { pattern: /^\/db\/godown-transfer\/edit\//,      title: 'Edit Godown Transfer' },
  { pattern: /^\/db\/godown-transfer$/,             title: 'DB · Godown Transfer' },
  { pattern: /^\/db\/cash-receipts\/edit\//,        title: 'Edit Cash Receipt' },
  { pattern: /^\/db\/cash-receipts$/,               title: 'DB · Cash Receipts' },
  { pattern: /^\/db\/cash-payments\/edit\//,        title: 'Edit Cash Payment' },
  { pattern: /^\/db\/cash-payments$/,               title: 'DB · Cash Payments' },
  { pattern: /^\/db\/users$/,                       title: 'DB · Users' },
  { pattern: /^\/db\/dbf-print$/,                   title: 'DBF Print' },

  // Reports
  { pattern: /^\/reports\/item-wise-sales$/,        title: 'Item Wise Sales' },
  { pattern: /^\/reports\/item-wise-purchase$/,     title: 'Item Wise Purchase' },
  { pattern: /^\/reports\/godown-stock-register$/,  title: 'Godown Stock Register' },
  { pattern: /^\/reports\/item-wise-stock-register$/,title: 'Item Wise Stock' },
  { pattern: /^\/reports\/bills-delivery-register$/,title: 'Bills Delivery Register' },
  { pattern: /^\/reports\/cash-book$/,              title: 'Cash Book' },
  { pattern: /^\/reports\/party-ledger$/,           title: 'Party Ledger' },
  { pattern: /^\/reports\/van-loading$/,            title: 'Van Loading' },
  { pattern: /^\/reports\/pnb-stock-statement$/,    title: 'PNB Stock Statement' },
  { pattern: /^\/reports\/pnb-statement$/,          title: 'PNB Statement' },
  { pattern: /^\/reports\/gstr2a-matching$/,        title: 'GSTR-2A Matching' },
  { pattern: /^\/reports\/shikhar-scheme-update$/,  title: 'Shikhar Scheme Update' },
  { pattern: /^\/reports\/godrej-scheme-update$/,   title: 'Godrej Scheme Update' },

  // Edit pages (catch-all patterns)
  { pattern: /^\/cash-receipts\/edit\//,            title: 'Edit Cash Receipt' },
  { pattern: /^\/cash-payments\/edit\//,            title: 'Edit Cash Payment' },
  { pattern: /^\/db\/cash-receipts\/edit\//,        title: 'Edit Cash Receipt' },
  { pattern: /^\/db\/cash-payments\/edit\//,        title: 'Edit Cash Payment' },

  // Approved
  { pattern: /^\/approved\/account-master$/,        title: 'Approved · Account Master' },
  { pattern: /^\/approved\/invoicing$/,             title: 'Approved · Invoicing' },
  { pattern: /^\/approved\/purchases$/,             title: 'Approved · Purchases' },
  { pattern: /^\/approved\/godown-transfer$/,       title: 'Approved · Godown Transfer' },
  { pattern: /^\/approved\/cash-receipts$/,         title: 'Approved · Cash Receipts' },
  { pattern: /^\/approved\/cash-payments$/,         title: 'Approved · Cash Payments' },

  // Other
  { pattern: /^\/push-notifications$/,              title: 'Push Notifications' },
  { pattern: /^\/app-orders$/,                      title: 'App Orders' },
  { pattern: /^\/app-schemes$/,                     title: 'App Schemes' },
  { pattern: /^\/app-listings$/,                    title: 'App Listings' },
  { pattern: /^\/attendance\/history$/,             title: 'Attendance History' },
  { pattern: /^\/attendance$/,                      title: 'Attendance' },
  { pattern: /^\/admin\/attendance$/,               title: 'Admin Attendance' },
  { pattern: /^\/whatsapp-inbox$/,                  title: 'WhatsApp Inbox' },
  { pattern: /^\/mandatory-docs$/,                  title: 'Mandatory Docs' },
  { pattern: /^\/product\//,                        title: 'Product' },

  // Print pages
  { pattern: /^\/printInvoicing$/,                  title: 'Print Invoice' },
  { pattern: /^\/printAccount$/,                    title: 'Print Account' },
  { pattern: /^\/printGodown$/,                     title: 'Print Godown' },
  { pattern: /^\/print\/bulk-cash-receipts$/,       title: 'Bulk Cash Receipts' },
  { pattern: /^\/print\/godown-stock\//,            title: 'Godown Stock Print' },
  { pattern: /^\/print$/,                           title: 'Print' },
  { pattern: /^\/printInvoice$/,                    title: 'Print Invoice' },
  { pattern: /^\/internal\/print\/invoice\//,       title: 'Invoice PDF' },
];

const APP_SUFFIX = '· EE';

function getTitleForPath(pathname: string): string {
  for (const { pattern, title } of ROUTE_TITLES) {
    if (pattern.test(pathname)) return `${title} ${APP_SUFFIX}`;
  }
  return 'Ekta Enterprises';
}

// ── Component ─────────────────────────────────────────────────────────────────
const MetaController = () => {
  const location = useLocation();
  const isPrintPage = location.pathname.includes('/print') || location.pathname.includes('/printInvoice');

  // Update browser tab title on every navigation
  useEffect(() => {
    document.title = getTitleForPath(location.pathname);
  }, [location.pathname]);

  // Update viewport meta tag (existing behaviour)
  useEffect(() => {
    let metaViewport = document.querySelector('meta[name="viewport"]');
    if (!metaViewport) {
      metaViewport = document.createElement('meta');
      metaViewport.setAttribute('name', 'viewport');
      document.head.appendChild(metaViewport);
    }
    if (isPrintPage) {
      metaViewport.setAttribute('content', 'width=device-width, initial-scale=1.0');
    } else {
      metaViewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
    }
  }, [isPrintPage]);

  return null;
};

export default MetaController;