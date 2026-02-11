## Sheet Layout/Card/Placeholder Issues – 2026-11-02

**Short Issue Summary:**  
- Preview sheet: two cards are oversized and partially empty; placeholder icon disappears if no image.
- Add/Edit sheet: save button leaves excessive bottom whitespace.

**Root Cause:**  
- Cards: Flex container or child constraints are incorrect, causing cards to expand to fill available space.
- Placeholder: Conditional rendering or CSS hides the icon when no image is present.
- Save button: Footer or button padding, or flex layout, creates extra space at the bottom.

**Minimal Fix Strategy:**  
- Use `flex flex-col h-full` (or `max-h-[value]`) for sheet container.
- Header: `flex-shrink-0`
- Content: `flex-1 min-h-0 overflow-y-auto`
- Footer: `flex-shrink-0 sticky bottom-0 pb-[env(safe-area-inset-bottom)]`
- Cards: Remove `flex-1` from cards; set explicit `min-h-0` on scrollable content.
- Placeholder: Render icon with fallback if no image.

**Scope:**  
- `src/pages/CatalogPage.tsx`
- `src/components/GearItemFormSheet.tsx`
- `src/index.css` (if global sheet/card/footer styles are used)

**What NOT to change:**  
- Do not refactor unrelated layout or global app structure.
- Do not change card content logic or unrelated CSS.
- Do not alter unrelated modal/sheet components.

**Key risks to monitor:**  
- Unintended scroll/overflow issues on mobile.
- Footer overlapping content or being hidden.
- Placeholder icon not visible in all fallback cases.