# Project Architecture Overview

This document provides a high-level overview of the FMCG-VITE project architecture.

## System Components

### 1. Backend Server (`/server`)
- **Technology**: Node.js with Express.
- **Database**: 
  - **SQLite (`/server/db/app/data.sqlite`)**: Stores persistent application data like users, sessions, custom brands, product metadata (nicknames, images), and schemes.
  - **JSON (`/db/data/json/PMPL.json`)**: The master product database derived from the legacy DBF system.
- **Key Responsibilities**:
  - API endpoints for the consumer app and admin dashboard.
  - Authentication (JWT for Admin, custom session for App).
  - Amazon image search proxying and scraping.
  - Image upload and storage.

### 2. Admin Dashboard (`/`)
- **Technology**: React + Vite + Tailwind CSS.
- **Key Pages**:
  - **App Listings (`/src/pages/app-listings/AppListings.tsx`)**: Unified interface for managing product nicknames, brand assignments, and images. Includes bulk actions and Amazon search.
  - **Invoicing/Dashboard**: Core business logic for managing orders and bills.

### 3. Consumer Application (`/app`)
- **Technology**: React + Vite + Capacitor (for Android/iOS).
- **Key Pages**:
  - **Home/Home2 (`/app/src/pages/Home.tsx`, `Home2.tsx`)**: Product discovery and ordering.
  - **Cart**: Floating pill-style cart with animated unit selection (box/pcs).
- **Features**:
  - Admin-only "+" button for on-the-fly image management.
  - Real-time product metadata synchronization.

## Data Flow

1. **Product Sync**: Data from the legacy system is converted to `PMPL.json`.
2. **Metadata Enhancement**: Admins use the Dashboard to add nicknames, brands, and images. This metadata is stored in SQLite `product_meta` and joined with `PMPL.json` data on the fly.
3. **Consumer View**: The App fetches merged data from the `/api/app/products` endpoint, ensuring visual consistency.

## Environment Configuration
- `VITE_API_URL`: Points to the backend server.
- `DBF_FOLDER_PATH`: Path to the directory containing JSON data.
