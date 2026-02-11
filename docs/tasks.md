## Sheet Layout/Card/Placeholder Issues – 2026-11-02

### Task 1: Fix Preview Sheet Card Sizing
- **Objective:** Prevent preview sheet cards from expanding to fill empty space.
- **Scope:** `src/pages/CatalogPage.tsx` (preview sheet JSX), card container CSS if present.
- **Discovery:**  
  - `rg "detail-quick-card" src/pages/CatalogPage.tsx`
  - `rg "flex-1" src/pages/CatalogPage.tsx`
- **Allowed changes:**  
  - Remove `flex-1` from card elements.
  - Ensure only the scrollable content container uses `flex-1 min-h-0 overflow-y-auto`.
- **Definition of Done:**  
  - Cards have natural height, no excessive empty space.
  - No regression in card layout on desktop/mobile.
- **Regression checks:**  
  - Cards do not overflow or shrink unexpectedly.
  - Sheet scrolls as expected.
- **Status:** COMPLETED

### Task 2: Restore Placeholder Icon in Preview Sheet
- **Objective:** Ensure placeholder icon is always visible when no image is present.
- **Scope:** `src/pages/CatalogPage.tsx` (preview sheet JSX), card image logic.
- **Discovery:**  
  - `rg "item.photo" src/pages/CatalogPage.tsx`
  - `rg "detail-quick-icon" src/pages/CatalogPage.tsx`
- **Allowed changes:**  
  - Update conditional rendering to always show icon if no image.
  - Adjust CSS to prevent icon from being hidden.
- **Definition of Done:**  
  - Placeholder icon is visible for items without images.
- **Regression checks:**  
  - Icon does not overlap with uploaded images.
  - No duplicate icons.
- **Status:** COMPLETED

### Task 3: Reduce Save Button Bottom Whitespace in Add/Edit Sheet
- **Objective:** Minimize bottom whitespace below the save button in add/edit sheet.
- **Scope:** `src/components/GearItemFormSheet.tsx`, `src/index.css` (footer/button styles).
- **Discovery:**  
  - `rg "gear-form-footer" src/components/GearItemFormSheet.tsx`
  - `rg "padding" src/index.css`
- **Allowed changes:**  
  - Adjust footer padding to use only `pb-[env(safe-area-inset-bottom)]` or minimal static padding.
  - Remove redundant padding from button or container.
- **Definition of Done:**  
  - Save button sits close to the bottom safe area, no excessive gap.
- **Regression checks:**  
  - Button remains fully tappable and not cut off.
  - No new overflow or scroll issues.
- **Status:** COMPLETED
