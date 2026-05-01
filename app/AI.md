# FMCG User App — AI Context

## Project Structure

```
FMCG-VITE/
├── server/          # Express backend (port 8000) — CMS for admin
├── src/             # Admin/CMS frontend (Vite + React, port 5173)
└── app/             # User-facing ordering app (Vite + React + TailwindCSS, separate port)
```

---

## Backend (server/)

- **Framework**: Express.js, port 8000
- **App routes base**: `POST/GET /api/app/*` — mounted in `server/app.js` (line 101)
- **Route file**: `server/routes/app/index.js` — all app-specific routes live here
- **DB for app users**: `server/db/app/` (users.json, orders.json, data.sqlite)
- **Products source**: `PMPL.json` (cached from PMPL.DBF) — served via `/api/app/products`
- **Stock source**: Calculated dynamically from DBF stock files via `routes/stock.js`
- **Main user DB** (CMS users): `server/db/users.json`
- **CORS**: Allows localhost:3000, 3001, 5173, and production domains

### Existing `/api/app` endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/app/login` | Login with username/password from `db/app/users.json` |
| GET | `/api/app/products` | Paginated, searchable in-stock product list (PMPL + stock) |
| GET | `/api/app/orders/:username` | Get all orders for a user |
| POST | `/api/app/orders` | Place a new order (saves to `db/app/orders.json`) |

### Order schema (orders.json)
```json
{
  "id": "timestamp string",
  "date": "ISO datetime",
  "status": "Pending",
  "username": "party_code",
  "items": [
    { "productCode", "productName", "qtyPcs", "qtyBoxes", "rate", "netAmount" }
  ],
  "totalAmount": 0
}
```

### Current `db/app/users.json` schema
```json
[{ "id", "name", "username", "password", "number" }]
```
> ⚠️ NEEDS MIGRATION to SQLite with `partyCode`, `mustChangePassword` flag, and bcrypt hashing.

---

## Admin CMS Frontend (src/)

- **Framework**: Vite + React + TypeScript
- **Auth**: JWT via `AuthContext` — `server/db/users.json`
- **Invoicing page** (`src/pages/invoicing/Invoicing.tsx`):
  - Creates invoices submitted to `POST /invoicing` (orcusRoutes)
  - Party dropdown populated from CMPL.DBF (party master) — each party has a `CODE`
  - Items from PMPL.DBF with stock calculation
  - Fields: date, series, billNo, cash/credit, party, SM, ref, dueDays, items (item+godown+unit+qty+rate+cd+sch)
- **Party list** (CMPL.DBF): each party has a `CODE` field — this is the `partyCode` that app users map to

### Admin dashboard — App Orders section (TO BE ADDED)
- Route: `/app-orders` (requires `Admin` access)
- Shows all orders from `db/app/orders.json`
- Admin can Approve/Reject each order
- Approval → converts order to an invoice (or sends to invoicing flow)

---

## User App Frontend (app/)

- **Framework**: Vite + React + TypeScript + TailwindCSS + PWA
- **API base**: `VITE_API_URL` env var → defaults to `http://localhost:8000/api/app`
- **State**: `StoreContext` (user, cart, isLoading) — persisted to localStorage
- **Auth**: `loginUser()` hits `/api/app/login`, stores user in `localStorage` as `app_user`

### Existing pages
| Page | Status | Notes |
|------|--------|-------|
| Login | ✅ Done | Username+password form, calls `/api/app/login` |
| Home | ✅ Done | Infinite-scroll product grid, add to cart |
| Search | ✅ Done | Debounced search hitting `/api/app/products?q=` |
| Cart | ✅ Done | Shows cart items, `placeOrder()` on checkout |
| Orders | ✅ Done | Lists orders from `/api/app/orders/:username` |
| Profile | ✅ Done | Shows user info, logout button |

### Cart → Order flow
1. User adds products (pcs + boxes) to cart in `StoreContext`
2. Cart page calls `placeOrder()` → `POST /api/app/orders`
3. Order saved to `db/app/orders.json` with `status: "Pending"`
4. Orders page shows the order with status badge

---

## Auth Strategy — IMPLEMENTED

### Key Principle
**DBF (CMPL.json) is the source of truth for party identity.** No migration or seeding needed.
SQLite ONLY stores: password hash + mustChangePassword flag + session tokens.

### Login Flow
1. User enters party code (C_CODE) OR mobile number (C_MOBILE / C_PHONE) + password
2. Backend looks up party in CMPL.json (DBF cache) — rejects if not found
3. Backend checks SQLite `app_users` for that `party_code`
   - **Not found** → auto-registers with bcrypt hash of `"1234"` + `must_change_pass=1`
   - **Found** → verifies bcrypt hash
4. On success → creates a session token (random 32-byte hex) in `app_sessions` table
5. Returns `{ success, token, user, mustChangePassword }`

### Session Management
- Token stored in `localStorage('app_token')` on the frontend
- Sent as `Authorization: Bearer <token>` header on protected requests
- Sessions expire after 30 days (stored in `app_sessions.expires_at`)
- Stale sessions cleaned up hourly via setInterval

### SQLite Tables (server/db/app/data.sqlite)
```sql
app_users   (id, party_code UNIQUE, password_hash, must_change_pass, created_at, updated_at)
app_sessions(id, party_code, token UNIQUE, created_at, expires_at)
```

### Files Implementing This
- `server/db/app/appDb.js` — all SQLite queries
- `server/routes/app/index.js` — route handlers + `requireAppAuth` middleware

### Party ↔ User Mapping
- Party code in CMPL (`C_CODE`) is the primary identity key
- `loginId` can be `C_CODE`, `C_MOBILE`, or `C_PHONE`
- When placing an order, `partyCode` + `partyName` are attached from the authenticated session
- No admin action needed to "provision" users — they self-register on first login with temp password

---

## Order Approval Flow (Admin CMS)

1. App user places order → saved to `db/app/orders.json` with `status: "Pending"`
2. Admin sees "App Orders" in the admin sidebar
3. Admin reviews items, quantities, and party
4. Admin clicks **Approve** → order status changes to `"Approved"`
   - Optionally: auto-generates an invoice entry in `invoicing.json`
5. Admin clicks **Reject** → status changes to `"Rejected"` with optional reason
6. User sees updated status on their Orders page

---

## Key Constraints / Gotchas

- `sqlite3` package already installed in server (`package.json` line 43)
- Products filtered to only `stock > 0` in the `/api/app/products` endpoint
- Stock is calculated live from DBF stock files, so it's always current
- The admin CMS frontend uses `routeAccess: ["Admin"]` to gate admin-only pages
- CORS is open in non-production; add app's prod domain to `allowedOrigins` in `server/app.js` line 31
- Orders use `order.totalAmount` (camelCase) — frontend `Orders.tsx` references `order.totalAmount`
- Cart stores `netAmount` per item; order payload sends `totalAmount` (sum)

---

## TODO

### Admin CMS (src/) — Optional
- [ ] Password reset button per party → `PATCH /api/app/admin/users/:partyCode/reset-password`
  - Resets password back to `1234` + sets `must_change_pass = 1`

### 🚧 Product Images Integration
- [x] Added `getAllProductImages()` to `appDb.js` to fetch `basepack_code`, `itemvarient_desc`, and `image_url` from SQLite.
- [ ] Implement fuzzy mapping in `GET /api/app/products` (server/routes/app/index.js) to attach images to PMPL products.
- [ ] Update frontend `ProductCard.tsx` and `Cart.tsx` to display the matched images.
