# Handoff Context - FMCG User Ordering App

## Project Overview
We are building a mobile-friendly user ordering app for clients of an FMCG business. It integrates with an existing Admin CMS.

- **Admin CMS**: `src/` (frontend), `server/` (backend)
- **User App**: `app/` (Vite + React + Tailwind)
- **Primary Data**: DBF files (`PMPL` for products, `CMPL` for parties) converted to JSON for the web layer.
- **App Auth Storage**: SQLite (`server/db/app/data.sqlite`) - stores password hashes, session tokens, and image mappings only.

## Current State

### ✅ Authentication & User Management (Implemented)
- **Strategy**: DBF is the source of truth for parties. SQLite handles security.
- **Flow**: User logs in with Party Code or Mobile. If found in DBF but not SQLite, they are auto-registered with temp password `1234` and `mustChangePassword: 1`.
- **Session**: Token-based (Bearer). Tokens stored in SQLite `app_sessions`.
- **Frontend**: Login, Change Password (enforced on first login), and Profile pages are fully functional.

### ✅ Order Management (Implemented)
- **User Side**: Users can browse products, add to cart, and place orders. Orders are saved to `server/db/app/orders.json`.
- **Admin Side**: A new "App Orders" page (`src/pages/app-orders/AppOrders.tsx`) allows admins to see incoming orders, view details (expanded cards), and Approve/Reject with notes.
- **Sidebar**: Added "App Orders" link in Admin Sidebar with a live 🔴 pending count badge.

### ✅ Product Catalog (Implemented)
- **Logic**: Fetches products from `PMPL.json`. Calculates live stock from godown stock files.
- **Pagination**: Implemented in `GET /api/app/products`.

## 🚧 In Progress: Product Images
We are currently integrating product images from the SQLite database into the PMPL-based product list.

- **SQLite Schema**: `products` table in `data.sqlite` contains `basepack_code`, `itemvarient_desc`, and `image_url`.
- **Status**: Just added `getAllProductImages` to `server/db/app/appDb.js`. This function fetches all products with images and caches them in `_imageCache`.
- **The Challenge**: PMPL `CODE` doesn't always match SQLite `basepack_code`. We need to use fuzzy name matching between PMPL `PRODUCT` and SQLite `itemvarient_desc`.

## 📋 Next Steps for New AI

1.  **Server-side Image Mapping**:
    - Modify the `GET /api/app/products` route in `server/routes/app/index.js`.
    - Use `appDb.getAllProductImages()` to get the image list.
    - Implement fuzzy matching (e.g., check if the first 12-15 characters match or use a substring comparison).
    - Attach `image_url` to each product object sent to the frontend.

2.  **Frontend Image Display**:
    - Update the `Product` type in `app/src/context/StoreContext.tsx` to include `image_url?: string`.
    - Update `app/src/components/ProductCard.tsx` (and `Cart.tsx`, `Orders.tsx`) to render the product image if available.

3.  **UI/UX Polish**:
    - Add a "Clear Cart" button or handle empty states more gracefully in `Cart.tsx`.
    - Ensure pull-to-refresh on `Orders.tsx` is robust.

4.  **Admin Tools**:
    - (Optional) Implement the password reset button for admins to reset a party's password to `1234` in the Admin panel.

## Reference Files
- `app/AI.md`: Detailed project task list and architecture notes.
- `server/routes/app/index.js`: Main backend logic for the app.
- `server/db/app/appDb.js`: SQLite helper.
- `app/src/lib/api.ts`: App frontend API client.
