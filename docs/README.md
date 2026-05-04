# Ekta Enterprises Documentation

This directory contains consolidated documentation for the Ekta Enterprises FMCG Management System. These files provide the full technical context for the three primary sub-systems.

## Table of Contents

1.  **[Server Documentation](server.md)**: Deep dive into the Node.js backend, DBF-to-JSON synchronisation logic, fuzzy search algorithms, and binary DBF merging. Includes full API reference and database schema.
2.  **[Mobile App Documentation](app.md)**: Details on the Capacitor-powered React application, including scheme slab calculations, native push notifications, and store state management.
3.  **[Admin Dashboard Documentation](dashboard.md)**: Context on the office management panel, order approval workflows, invoicing, and inventory tracking.
4.  **Home Page Concepts**: Detailed in `app.md`. Includes premium Dark Glass, Vibrant Market (with drawers), and Sliding Panel UX patterns for A/B testing.

## Quick Start for AI Agents

If you are an AI assistant working on this project:
- **Architecture**: All core business and data logic is in `server.md`.
- **Frontend**: Refer to `dashboard.md` or `app.md` depending on your task location.
- **Data Flow**: The detailed binary mapping and sync logic are documented in the "Data Handling" section of `server.md`.
- **Billing Sequence**: The auto-incrementing bill sequence is unified between the dashboard (`invoicing.json`) and the app (`orders.json`) to prevent duplicates.

## Key Paths
- **Root**: Admin Dashboard (`/src`).
- **`/server`**: Node.js Backend.
- **`/app`**: Mobile Application.
- **`/d01-2324`**: Legacy DBF Data Storage.
