# Developer Knowledge Base

Essential workflows and feature notes for maintaining the FMCG-VITE system.

## 1. Product Nicknames Workflow
- **Initial State**: Most products have raw, all-caps names from `PMPL.json`.
- **Pre-seeding**: The `server/scripts/seed_nicknames.js` script can be run to auto-populate nicknames using the `itemvarient_desc` from the SQLite `products` table.
- **Admin Edit**: Admins can manually override these in the "App Listings" dashboard.

## 2. Image Management System
- **Amazon Search**: The backend uses `cheerio` to scrape image results from Amazon. This is available in both the Admin Dashboard and the Consumer App (for admins).
- **Storage**: Uploaded images are stored in the backend and served via the static `/api/app/uploads` path.
- **Resolution**: Frontend code should use a `getImageUrl(path)` utility to handle absolute URLs vs relative paths.

## 3. Brand Grouping & Custom Brands
- **Logic**: Products are grouped by `brand_code`.
- **Priority**: A brand assignment in `product_meta` always takes priority. If null, the system tries to find a brand mapping in the `products` table based on `basepack_code`.
- **Custom Brands**: Admins can create new brands (e.g., "Trending", "New Arrivals") and bulk-assign products to them.

## 4. Troubleshooting & Common Issues
- **Image URL Issue**: If images appear as `http://localhost:8000http://...`, ensure the frontend is checking for `startsWith('http')` before prepending the `baseURL`.
- **Dark Mode**: Modal text contrast is managed using `dark:text-white` classes in Tailwind/CSS.
- **Auth Tokens**: The Admin Dashboard uses a JWT token stored in `localStorage` as `token`. The mobile app uses a different session mechanism.

## 5. Recent Deployment & Build Fixes
- **Asset Bundling (Logo)**: To ensure images like `logo.png` are available in production, **import them as modules** in the React component (e.g., `import logoUrl from '../../public/logo.png'`). Referencing them simply as `/logo.png` can fail if the server doesn't serve the `public` folder correctly at runtime.
- **CORS Whitelist**: Production and test domains (`app.ekta-enterprises.com`, `test.ekta-enterprises.com`) must be explicitly whitelisted in `server/app.js` to allow mobile app logins.
- **TypeScript & JSX Errors**: Be vigilant about mismatched JSX tags in large components like `AppListings.tsx`, as they can cause cryptic build failures.
- **Brand Filtering**: Brands are now filtered at the API level (`/brands`) based on actual stock levels. If a brand disappears, check if any of its products are in-stock via the `/stock` endpoint.

## 6. Maintenance Commands
- **Seed Nicknames**: `node server/scripts/seed_nicknames.js` (Run from project root).
- **Start All**: `npm run dev:all`.

