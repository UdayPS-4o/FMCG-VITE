# Database Schema & Data Storage

The system uses a hybrid storage approach combining SQLite for dynamic metadata and JSON for master product data.

## 1. SQLite Database (`/server/db/app/data.sqlite`)

### `products` (System Brands Mapping)
Used for mapping basepack codes to system brands and variant descriptions.
- `brand_id`: Links to `brands` table.
- `basepack_code`: Unique code from legacy system.
- `itemvarient_desc`: Detailed product name (used for auto-nicknaming).

### `brands` (Master Brands)
- `brand_id`: Primary Key.
- `brand_desc`: Name of the brand.
- `image_url`: Logo URL.

### `brands_custom` (Admin Overrides/Additions)
- `brand_code`: Unique identifier.
- `brand_name`: Display name.
- `image_url`: Logo URL (Base64 or external).

### `product_meta` (Product Overrides)
- `product_code`: Primary Key (maps to `CODE` in `PMPL.json`).
- `nickname`: Custom display name for the app.
- `brand_code`: Assigned brand identifier.
- `image_url`: Path or external URL for the product image.

### `app_users` & `app_sessions`
Handles mobile application authentication and user sessions.

## 2. JSON Data (`/db/data/json/PMPL.json`)

This is the master list of all products in the system.
Key fields used:
- `CODE`: Unique product identifier.
- `PRODUCT`: Raw product description.
- `IT_DESC2`: Basepack code (used to link with SQLite `products` table).
- `RATE1`, `MRP1`: Pricing information.

## 3. Product-Brand Resolution Logic

When fetching products:
1. Load product from `PMPL.json`.
2. Check `product_meta` for `nickname`, `brand_code`, and `image_url`.
3. If no `product_meta` exists, fallback to SQLite `products` table via `IT_DESC2` (basepack_code) to find the default brand.
4. If an image is missing, the app allows admins to search Amazon and save the result to `product_meta`.
