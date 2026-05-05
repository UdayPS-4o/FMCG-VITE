# Admin Dashboard Technical Reference: Office Panel

This document maps out the internal structure of the React-based admin dashboard (located in the root `/src` directory), detailing components, routes, and business logic.

## 1. Application Layout
- **`src/layout/AppLayout.tsx`**: Main container with Header and Sidebar integration.
- **`src/layout/AppHeader.tsx`**: Top navigation, search, and user profile actions.
- **`src/layout/AppSidebar.tsx`**: Dynamic sidebar navigation. 
    - **Note**: The Attendance system has been removed for Admin users; related navigation links have been disabled.
- **`src/layout/SidebarContext.tsx`**: UI state for sidebar collapse/expand.

## 2. Route & Page Structure

### Core Operations
- **`src/pages/Dashboard/Home.tsx`**: Main stats overview.
- **`src/pages/app-orders/AppOrders.tsx`**: Review center for mobile app orders.
    - **Invoicing Workflow**: Replaces the old Accept/Reject system. Admin can now click "Create Invoice" directly from an app order.
    - **Status Badges**: Shows "Invoiced" with a clickable link to the bill once the conversion is complete.
- **`src/pages/invoicing/Invoicing.tsx`**: Primary entry for sales.
    - **App Order Integration**: When loading an app order, the dashboard automatically pre-fills the customer, items, and quantities.
    - **Bill Numbering**: Respects the pre-assigned `T-` series number from the mobile app (e.g., `T-101`) and locks it in the pre-fill logic to ensure sequential consistency.
- **`src/pages/godown-transfer/GodownTransfer.tsx`**: Inventory movement tracking.

### Master Data Management
- **`src/pages/account-master/AccountMaster.tsx`**: Interface for creating new customers/parties.
- **`src/pages/database/AccountMaster.tsx`**: Tabular view of all parties with sync status flags.
- **`src/pages/approved/AccountMasterApproved.tsx`**: List of parties successfully synced to the legacy FoxPro system.

### Reporting & Finance
- **`src/pages/reports/ItemWiseSales.tsx`**: Detailed sales analysis grid with filtering and Excel export.
- **`src/pages/ledger/Ledger.tsx`**: Financial transaction logging for Receipts and Payments.

## 3. Component & UI Architecture

### Form System
- **`src/components/form/Form.tsx`**: Base wrapper for consistent form layout.
- **`src/components/form/input/Input.tsx`**: Standard text/number input.
- **`src/components/form/input/Autocomplete.tsx`**: Real-time search for items and parties.

### Common UI
- **`src/components/common/PageBreadCrumb.tsx`**: Dynamic path navigation.
- **`src/components/ui/toast/Toast.tsx`**: Centralized user notification system.

## 4. Contexts & Hooks
- **`src/contexts/InvoiceContext.tsx`**: Global state for the active invoice draft.
- **`src/hooks/useInvoiceData.tsx`**: Helper for fetching rates and calculating tax totals.
- **`src/hooks/useAuth.tsx`**: Handles CMS authentication and user role permissions.

## 5. Development Summary
- **Style**: Uses Tailwind CSS 4 and custom CSS for high-fidelity UI components.
- **Navigation**: Managed via `react-router-dom`.
- **Sync Architecture**: The dashboard acts as a staging area. Final persistence is handled by the `/api/merge` layer on the backend, which updates binary `.DBF` files.
