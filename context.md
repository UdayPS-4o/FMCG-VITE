# FMCG-VITE Project Context

This document provides a high-level overview of the `FMCG-VITE` project structure and its core components. We are building an ecosystem for FMCG (Fast-Moving Consumer Goods) operations, consisting of a mobile app, an admin dashboard, and a backend server.

## Directory Structure

The project is divided into three main parts:

### 1. Capacitor App (`./app/`)
- **Purpose**: This is the customer-facing mobile application built using web technologies (React/Vite) and packaged for mobile platforms (Android/iOS) using Ionic Capacitor. 
- **Tech Stack**: React, Vite, Tailwind CSS, Capacitor.
- **Key Features**: 
  - Product catalog and search.
  - Cart and checkout system supporting multiple unit types (e.g., Boxes and Pieces).
  - User profiles, order history, and schemes/discounts.
- **Location**: All mobile app frontend code resides here (e.g., `app/src/pages`, `app/src/components`).

### 2. Admin Dashboard (`./src/` and root)
- **Purpose**: This is the web-based administrative dashboard used by store owners or managers to oversee operations.
- **Tech Stack**: React, Vite, Tailwind CSS, Material UI, ApexCharts.
- **Key Features**:
  - Viewing and managing incoming orders from the mobile app.
  - Generating and managing invoices.
  - Updating product catalogs, pricing, inventory, and promotional banners.
- **Location**: The admin panel uses the root `package.json` and its source code is located in the `./src/` directory.

### 3. Backend Server (`./server/`)
- **Purpose**: The Node.js/Express backend that serves data to both the mobile app and the admin dashboard.
- **Tech Stack**: Node.js, Express.
- **Key Features**:
  - REST API endpoints for products, authentication, orders, and ledger.
  - Push notification services.
  - Handling business logic, fuzzy search, and data processing.
- **Location**: Backend code, routes, and API controllers are in the `./server/` directory.

## What We Are Building
We are building a complete B2B/B2C e-commerce platform tailored for FMCG distributors. It streamlines the ordering process for clients through the Capacitor mobile app while providing a robust Admin Dashboard for the business owner to fulfill orders, generate invoices, track deliveries, and manage the product catalog effectively.
