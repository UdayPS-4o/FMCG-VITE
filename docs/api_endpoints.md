# API Endpoints Documentation

All endpoints are prefixed with `/api/app`.

## 1. Consumer App Endpoints

### `GET /products`
Returns the merged list of products from `PMPL.json` and SQLite `product_meta`.
- **Query Params**: `page`, `search`, `brand`.
- **Logic**: Resolves images and brands for each product.

### `GET /brands`
Returns the merged list of brands from the `brands` and `brands_custom` tables.
- **Logic**: `brands_custom` entries override `brands` with the same `brand_code`.

### `POST /login`
Mobile app authentication using `party_code` and `password`.

## 2. Admin Dashboard Endpoints (Protected by `requireAdminJwtAuth`)

### `GET /admin/products`
Returns all products with their associated metadata for the Admin Listings page.

### `PUT /admin/products/:code/meta`
Updates the `nickname`, `brand_code`, and `image_url` for a specific product.

### `POST /admin/product-image`
Uploads a new product image or saves an external Amazon image URL to a product.

### `GET /admin/brands`
Returns all brands (base + custom) along with the count of products assigned to each.

### `POST /admin/brands`
Upserts a custom brand entry.

### `DELETE /admin/brands_custom/:id`
Deletes a custom brand entry.

### `GET /admin/amazon-search?q=...`
Proxies a search to Amazon to retrieve product images for easy matching.

## 3. Scheme Management

### `GET /schemes/active`
Returns active banner schemes for the app home page.

### `POST /admin/schemes`
Creates a new promotional scheme.
