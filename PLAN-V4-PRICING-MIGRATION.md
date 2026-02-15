# Pricing Migration & Inventory Overhaul Plan

## 1. Objective

Shift the system from a **Product-centric pricing model** (Product has price, Variant overrides it) to a **Variant-centric pricing model** (Every variant has its own explicit price).
Simultaneously, overhaul the Inventory Management UI to match professional, industry-standard ERP designs (e.g., Shopify, Square), focusing on density, utility, and bulk management.

## 2. Database Schema Changes (`src/lib/server/db/schema.ts`)

### A. Table: `product_variant`

- **Change**: Add column `price` (Real/Float, NOT NULL, Default: 0).
- **Deprecate**: `priceOverride`.
- **Logic**: This column becomes the **Source of Truth** for sales.

### B. Table: `products`

- **Change**: Rename/Retain `basePrice` as `templatePrice`.
- **Logic**: This value will ONLY be used as a default pre-fill value when creating _new_ variants. It no longer affects existing variants during sales.

## 3. Data Migration Strategy

We must ensure zero data loss during this transition.

1.  **Backup**: Copy `local.db` to `local.db.backup`.
2.  **Script (`scripts/migrate_pricing.js`)**:
    - Add `price` column to `product_variant`.
    - Iterate all variants.
    - `NewPrice` = `ExistingPriceOverride` (if not null) OR `ProductBasePrice`.
    - Update `product_variant.price`.
3.  **Cleanup**: (Optional) Remove `priceOverride` column after verification.

## 4. Backend & Logic Refactoring

### A. POS & Sales Logic

- **Query Updates**: Update all SQL queries in `pos/+page.server.ts` and `api/` endpoints.
  - _Old_: `COALESCE(variant.priceOverride, product.basePrice)`
  - _New_: `variant.price`

### B. Reports

- **Inventory Value**: Update calculation to `SUM(variant.stock * variant.price)`.

### C. Mutations (Create/Edit)

- **Create Product**: Form still asks for a price, but it saves to `product.templatePrice` AND sets `variant.price` for all initial variants.
- **Add Variant**: Form defaults input to `product.templatePrice`, but saves explicitly to `variant.price`.

## 5. UI Overhaul: Inventory Management

The current UI is too "mobile-app" like. We need a "Desktop Admin" interface.

### A. Main Inventory List (`/inventory`)

**Design Philosophy**: Data Density & Quick Actions.

- **Layout**: Full-width Data Table.
- **Columns**:
  1.  **Product**: Name + Category Badge + Variant Count.
  2.  **Inventory**: Progress bar or color-coded text (e.g., "45 in stock across 3 variants").
  3.  **Price**: Display range if variants differ (e.g., "৳500 - ৳600") or single price.
  4.  **Status**: Active/Archived tags.
  5.  **Actions**: Edit, Print Labels, Quick View.
- **Features**:
  - **Filters**: Category dropdown, Stock Status (Low/Out/Healthy).
  - **Search**: Real-time debounce search.
  - **Pagination**: Standard.

### B. Unified Product Management (`/inventory/[id]`)

Combine "View" and "Edit" into a single robust management page.

- **Layout**: Two-column layout (Main content left, Metadata right).
- **Section 1: Header**:
  - Product Name (Editable).
  - Stats (Total Stock, Estimated Value).
- **Section 2: Variants Table (The Core)**:
  - A list of all variants.
  - **Columns**: Size, Color, Barcode, **Price** (Input field), **Stock** (Input field).
  - **Bulk Actions**: Checkbox select -> "Update Price for Selected".
  - This allows changing prices for XL and XXL quickly without opening 5 modals.
- **Section 3: Template Settings**:
  - "Default Price for new variants" (The old base price).
  - Category selection.

## 6. Implementation Steps

1.  **Database**: Execute Migration Script.
2.  **Backend**: Fix broken TypeScript types and SQL queries (Grepping for `priceOverride`).
3.  **Frontend - List**: Build the new DataTable component for `/inventory`.
4.  **Frontend - Detail**: Build the new Master-Detail view for `/inventory/[id]`.
5.  **Verify**: Test POS flow with new pricing structure.
