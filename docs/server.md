# Server Technical Reference: Ekta Enterprises Backend

This document maps out the internal structure of the Node.js backend, detailing the responsibility of each file and module.

## 1. Entry Point & Core Configuration
- **`server/app.js`**: The main application entry point. Configures Express, Socket.io, CORS, and mounts all major route groups (`/api/app`, `/api/merge`, etc.).
- **`server/package.json`**: Defines dependencies and start scripts.
- **`server/.env`**: Contains environment variables like `DBF_FOLDER_PATH` and `API_PORT`.

## 2. Core Service Modules
- **`server/routes/watcher.js`**: Background service that monitors the legacy data folder (DBF files).
    - **JSON Conversion**: Monitors `.DBF` files and converts them to `.json` for high-speed frontend access.
    - **Balance Engine**: Pre-calculates party balances in `balance.json` based on ledger entries.
- **`server/routes/utilities.js`**: Common helper functions for file system access, exponential backoff retries, and data persistence.
- **`server/dbf-orm/index.js`**: Low-level binary interaction layer for reading and appending to legacy FoxPro DBF files.

## 3. Database & Storage Layers
- **`server/db/app/appDb.js`**: SQLite interface for mobile-specific data (users, brands, banners).
- **`server/routes/push.js`**: Logic for push notification registration (Capacitor/Web) and broadcast dispatch.
- **Data Persistence**:
    - `server/db/appOrders.json`: Stores all orders placed via the mobile app.
    - `server/db/productImages.json`: Maps product codes to image URLs (scraped or uploaded).

## 4. API Route Modules

### Mobile API (`/api/app`)
- **`server/routes/app/index.js`**: Core hub for the mobile application.
    - **Authentication**: Party-code based login. Supports forced password changes for security.
    - **Typo-Tolerant Search**: Implements a multi-stage search.
        1. Exact match on product code/name.
        2. Fallback to **Fuzzy Matching** (Levenshtein-based) if exact results are < 5. Returns an `isFuzzy` flag to the frontend.
    - **Order Submission**:
        - Receives `qtyPcs` and `qtyBoxes` from the app.
        - **Bill Numbering**: Pre-assigns a sequential `billNo` with a `T-` prefix (e.g., `T-101`). This number is synchronized with the manual invoicing sequence to prevent collisions.
    - **Image Scraping**: Background logic using Puppeteer to scrape product images from Amazon when local images are missing.

### Accounting Merge (`/api/merge`)
- **`server/routes/merge/invoicing.js`**: The bridge between the web dashboard and legacy DBF files.
    - **App Order Invoicing**: Logic to convert `appOrders.json` entries into real invoices.
    - **Bill Number Preservation**: Ensures that the pre-assigned `billNo` from the app order is preserved when creating the final invoice record in `BILL.DBF`.
    - **Status Tracking**: Marks orders as "Invoiced" and stores the reference `billNo` to prevent double-billing.
- **`server/routes/merge/account-master.js`**: Logic for syncing party/customer data back to `CMPL.DBF`.

### Reports & Stock
- **`server/routes/reports.js`**: Aggregates sales and purchase data for detailed business reporting.
- **`server/routes/stock.js`**: Real-time stock engine. Calculates inventory by processing sales, purchases, and godown transfers.

## 5. Directory Structure Summary
- **`/server/db`**: SQLite databases and JSON cache.
- **`/server/routes`**: Domain-specific logic.
- **`/server/public/uploads`**: Product image storage.
- **`/server/dbf-orm`**: Binary file access logic.
