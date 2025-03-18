# FMCG_VITE Project Structure

This document maps out the routing structure of the FMCG_VITE application, showing which page components correspond to which routes, and where these files are located in the project.

## Application Layout

The main application layout is defined in:
- `/src/layout/AppLayout.tsx` - Main layout component that includes the header, sidebar, and outlet for page content
- `/src/layout/AppHeader.tsx` - Application header component
- `/src/layout/AppSidebar.tsx` - Sidebar navigation component

## Route Structure

### Dashboard
- **Route**: `/`
- **Component**: `src/pages/Dashboard/Home.tsx`
- **Description**: Application dashboard/home page

### Account Master
- **Route**: `/account-master`
- **Component**: `src/pages/account-master/AccountMaster.tsx`
- **Description**: Account master creation form

- **Route**: `/account-master/edit/:id`
- **Component**: `src/pages/account-master/EditAccountMaster.tsx`
- **Description**: Edit form for existing account master entries

### Invoicing
- **Route**: `/invoicing`
- **Component**: `src/pages/invoicing/Invoicing.tsx`
- **Description**: Invoice creation form
- **Related Components**:
  - `src/pages/invoicing/CollapsibleItemSection.tsx` - Collapsible section for item entries in the invoice

- **Route**: `/invoicing/edit/:id`
- **Component**: `src/pages/invoicing/EditInvoicing.tsx`
- **Description**: Edit form for existing invoices
- **Related Components**:
  - `src/pages/invoicing/CollapsibleItemSection.tsx` - Reused from the main invoicing page

### Godown Transfer
- **Route**: `/godown-transfer`
- **Component**: `src/pages/godown-transfer/GodownTransfer.tsx`
- **Description**: Godown transfer creation form
- **Related Components**:
  - `src/pages/godown-transfer/CollapsibleItemSection.tsx` - Collapsible section for item entries in the godown transfer

- **Route**: `/godown-transfer/edit/:id`
- **Component**: `src/pages/godown-transfer/EditGodownTransfer.tsx`
- **Description**: Edit form for existing godown transfers
- **Related Components**:
  - `src/pages/godown-transfer/CollapsibleItemSection.tsx` - Reused from the main godown transfer page

### Database Management
- **Route**: `/db/account-master`
- **Component**: `src/pages/database/AccountMaster.tsx`
- **Description**: Database view/management for account masters

- **Route**: `/db/invoicing`
- **Component**: `src/pages/database/Invoicing.tsx`
- **Description**: Database view/management for invoices

- **Route**: `/db/godown-transfer`
- **Component**: `src/pages/database/GodownTransfer.tsx`
- **Description**: Database view/management for godown transfers

- **Route**: `/db/account-master/edit/:id`
- **Component**: `src/pages/account-master/EditAccountMaster.tsx`
- **Description**: Reuses the edit component from account-master

- **Route**: `/db/invoicing/edit/:id`
- **Component**: `src/pages/invoicing/EditInvoicing.tsx`
- **Description**: Reuses the edit component from invoicing

- **Route**: `/db/godown-transfer/edit/:id`
- **Component**: `src/pages/godown-transfer/EditGodownTransfer.tsx`
- **Description**: Reuses the edit component from godown-transfer

### Approval Management
- **Route**: `/approved/account-master`
- **Component**: `src/pages/approved/AccountMasterApproved.tsx`
- **Description**: View and manage approved account masters

- **Route**: `/approved/invoicing`
- **Component**: `src/pages/approved/InvoicingApproved.tsx`
- **Description**: View and manage approved invoices

- **Route**: `/approved/godown-transfer`
- **Component**: `src/pages/approved/GodownTransferApproved.tsx`
- **Description**: View and manage approved godown transfers

### Print Views
- **Route**: `/printInvoicing`
- **Component**: `src/pages/print/PrintInvoicing.tsx`
- **Description**: Printable invoice view (no header/sidebar)

- **Route**: `/printAccount`
- **Component**: `src/pages/print/PrintAccount.tsx`
- **Description**: Printable account view (no header/sidebar)

- **Route**: `/printGodown`
- **Component**: `src/pages/print/PrintGodown.tsx`
- **Description**: Printable godown transfer view (no header/sidebar)

### Authentication
- **Route**: `/signin`
- **Component**: `src/pages/AuthPages/SignIn.tsx`
- **Description**: Sign-in page

- **Route**: `/signup`
- **Component**: `src/pages/AuthPages/SignUp.tsx`
- **Description**: Sign-up page

- **Route**: `/login`
- **Component**: `src/pages/AuthPages/Login.tsx`
- **Description**: Login page

### Error Pages
- **Route**: `*` (any unmatched route)
- **Component**: `src/pages/OtherPage/NotFound.tsx`
- **Description**: 404 Not Found page

## Component Structure

### Form Components
- `src/components/form/Form.tsx` - Base form component
- `src/components/form/input/Input.tsx` - Input field component
- `src/components/form/input/Autocomplete.tsx` - Autocomplete field component

### Common Components
- `src/components/common/PageBreadCrumb.tsx` - Breadcrumb navigation
- `src/components/common/PageMeta.tsx` - Page metadata
- `src/components/common/ScrollToTop.tsx` - Scroll to top functionality

### UI Components
- `src/components/ui/toast/Toast.tsx` - Toast notification component

## Contexts and Hooks
- `src/contexts/InvoiceContext.tsx` - Context for invoice data
- `src/hooks/useInvoiceData.tsx` - Hook for managing invoice data
- `src/context/SidebarContext.tsx` - Context for sidebar state
- `src/hooks/useAuth.tsx` - Hook for authentication

## Additional Information
- The application uses React Router for navigation
- Global toast notifications are implemented using react-toastify
- The UI appears to follow a responsive design pattern
- The application includes functionality for creating, editing, and approving account masters, invoices, and godown transfers
