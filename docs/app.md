# Mobile App Technical Reference: Capacitor Frontend

This document maps the internal structure of the mobile application (located in the `/app` directory), detailing the routing, components, and native integrations.

## 1. Core Framework & Configuration
- **`app/src/main.tsx`**: React entry point.
- **`app/src/App.tsx`**: Root component. Defines the layout, routing, and initializes push notification listeners.
- **`app/capacitor.config.ts`**: Native configuration for Android/iOS builds, including App ID and web dir settings.
- **`app/package.json`**: Defines mobile dependencies (Capacitor plugins, Framer Motion, Lucide icons).
- **Styling**: Modern premium UI using custom CSS and `framer-motion` for layout animations. Includes `mix-blend-mode: multiply` on product images to seamlessly blend white-background assets into the design.

## 2. Global State & Contexts
- **`app/src/context/StoreContext.tsx`**: The heart of the app's state.
    - Manages `user` session, `cart` items, and `language` (en/hi).
    - **Cart Logic**: Supports dual-unit ordering (Pieces vs. Boxes).
    - **Scheme Calculation**: Implements real-time **Slab Logic**. As quantity changes, the context calculates the applicable discount percentage by matching `totalQty` against product `schemes` (slab1 to slab2).
    - **Persistence**: Auto-saves cart and user session to `localStorage`.

## 3. Route & Page Structure

### Public / Auth
- **`app/src/pages/Login.tsx`**: Party code authentication (Login ID + Password).
- **`app/src/pages/ChangePassword.tsx`**: Forced password change screen for new users (`mustChangePassword` flag).

### Product Discovery (Home Concepts)
The app features multiple "Home Page Concepts" for A/B testing or design selection:
- **`Home.tsx`**: The original legacy interface.
- **`Home2.tsx` (Vibrant Market)**:
    - **UX**: Uses a **Bottom Drawer** (drawer/sheet) for multi-unit selection.
    - **Visuals**: Color-coded brand palettes, skeleton loading states (`MarketCardSkeleton`), and a floating "Pill Cart" button.
- **`Home3.tsx` (Market + Sliding Panel)**:
    - **UX**: Uses an **Inline Sliding Panel** that slides down below the card for Box/Pcs selection, avoiding grid reflow issues.
    - **Visuals**: Matches Home2's vibrant theme but with optimized interaction for quick ordering.

### Core Features
- **`app/src/pages/Search.tsx`**: Debounced search interface.
    - **Fuzzy Search**: Integrates with backend typo-tolerant search. Displays an "Approximate Results" banner when fuzzy matches are found.
- **`app/src/pages/Cart.tsx`**: Detailed review of items. Displays gross amounts, scheme savings, and net totals.
- **`app/src/pages/Orders.tsx`**: List of current and past orders.
- **`app/src/pages/OrderView.tsx` & `InvoiceView.tsx`**: Deep dive into specific order/invoice details with print-ready layouts.

## 4. Native & UI Components

### Custom Components
- **`app/src/components/ProductCard.tsx`**: Interactive grid item with animation and cart integration.
- **`app/src/components/ProtectedRoute.tsx`**: Session enforcement wrapper.
- **`app/src/components/Layout.tsx`**: Common shell with bottom navigation (Home, Search, Orders, Profile).

### Interaction Systems
- **Box/Pcs System**: 
    - Logic handles conversion factors (`MULT_F`).
    - Increments/decrements update the global `StoreContext`.
    - Supports "Quick Add" for single-unit items and "Detailed Select" for multi-unit items.
- **Skeleton Loaders**: Integrated in `Home2` to prevent layout shift during data fetching.

### Native integrations
- **`@capacitor/push-notifications`**: Handled in `App.tsx` for registering device tokens and receiving notifications.
- **`@capacitor/status-bar`**: Configured for a native app feel.

## 5. Directory Structure Summary
- **`/app/src/pages`**: Individual screens.
- **`/app/src/components`**: Shared UI blocks.
- **`/app/src/lib/api.ts`**: Typed API helper functions for all backend communication.
- **`/app/android`**: Native Android project files.
