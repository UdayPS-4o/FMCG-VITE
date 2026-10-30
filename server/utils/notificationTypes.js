// Notification types that an admin can grant to individual users from the
// Add User page (users.json → notificationAccess). Keep keys in sync with
// availableNotifications in src/pages/add-user/AddUser.tsx.
//
// userUrl is where a non-admin user lands when tapping the notification
// (admins keep the original approve-from-notification URL).
const NOTIFICATION_TYPES = {
  'attendance-marked':   { label: 'Attendance Marked (by any user)',      userUrl: '/attendance' },
  'attendance-reminder': { label: 'Attendance Reminder (12:45 PM if not marked)', userUrl: '/attendance' },
  'invoicing':           { label: 'Invoice Created / Modified',           userUrl: '/db/invoicing' },
  'cash-receipts':       { label: 'Cash Receipt Created / Modified',      userUrl: '/db/cash-receipts' },
  'cash-payments':       { label: 'Cash Payment Created / Modified',      userUrl: '/db/cash-payments' },
  'godown':              { label: 'Godown Transfer Created / Modified',   userUrl: '/db/godown-transfer' },
  'purchases':           { label: 'Purchase Created / Modified',          userUrl: '/db/purchases' },
  'account-master':      { label: 'Account Master Created / Modified',    userUrl: '/db/account-master' },
  'whatsapp':            { label: 'WhatsApp Inbox Messages',              userUrl: '/whatsapp-inbox' },
};

module.exports = { NOTIFICATION_TYPES };
