# Layout Fix Plan - Sheet Overlay and Grey Strip Issues

## Problem Summary

The application has several critical layout issues after fixing the phantom scroll:

1. **Grey strip appears** between header and bottom navbar
2. **Sheet buttons are missing** (e.g., "More details" in preview sheet, "Save item" in add/edit sheet)
3. **Sheets don't fully overlay** the screen - they blend into header with no blur backdrop
4. **Content disappears into grey area** when scrolling instead of aligning with header/navbar

## Root Causes

### 1. Incorrect `.content` Height Calculation

**Current problematic code:**
```css
.content {
  position: relative;
  margin-top: var(--topbar-height);
  height: calc(100dvh - var(--topbar-height) - var(--bottom-nav-clearance));
  display: flex;
  flex-direction: column;
  gap: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  padding: 0 var(--space-4) var(--space-4);
}
```

**Issues:**
- Creates a fixed-height scroll container on mobile
- The calculation doesn't properly fill the available space
- Creates a gap (grey strip) between the calculated height and actual viewport
- The `--bottom-nav-clearance: calc(78px + env(safe-area-inset-bottom))` leaves too much space

### 2. Desktop Override Conflicts

**Current code:**
```css
@media (min-width: 768px) {
  body {
    overflow-y: visible;
  }

  .content {
    position: static;
    margin-top: 0;
    height: auto;
    overflow-y: visible;
    overscroll-behavior: auto;
    -webkit-overflow-scrolling: auto;
    gap: 1.25rem;
    padding: var(--topbar-height) 0 0;
  }
}
```

**Issues:**
- Tries to reset mobile scroll container but creates conflicts
- Mobile uses `.content` as scroll container, desktop uses `body`
- This dual-approach creates stacking and overflow issues

### 3. Sheet Overlay Not Truly Full-Screen

**Current overlay code:**
```css
.sheet-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.06);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  z-index: 90;
}
```

**Current sheet code:**
```css
.filter-sheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 100;
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
  max-height: min(72vh, 620px);
  overflow: auto;
  padding-bottom: calc(1rem + env(safe-area-inset-bottom));
}
```

**Issues:**
- Sheets position at `bottom: 0` but don't account for content scroll container
- Footer buttons get cut off or hidden
- Blur backdrop exists but sheet doesn't feel like a true overlay modal
- No portal rendering - sheets render inline which can cause stacking issues

### 4. Gear Form Sheet Footer Hidden

**Current footer code:**
```css
.gear-form-footer {
  padding: 0.7rem 0.9rem calc(0.8rem + env(safe-area-inset-bottom));
  border-top: 1px solid var(--border-subtle);
  background: var(--surface-raised);
}
```

**Issues:**
- Footer is inside scrollable sheet body
- Gets cut off when sheet content is tall
- No fixed positioning to keep it always visible
- Doesn't account for bottom navbar overlap

## Solution: Code Changes Required

### Change 1: Fix Mobile `.content` Container

**Replace this:**
```css
.content {
  position: relative;
  margin-top: var(--topbar-height);
  height: calc(100dvh - var(--topbar-height) - var(--bottom-nav-clearance));
  display: flex;
  flex-direction: column;
  gap: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  padding: 0 var(--space-4) var(--space-4);
}
```

**With this:**
```css
.content {
  position: relative;
  min-height: calc(100dvh - var(--topbar-height) - var(--bottom-nav-clearance));
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: var(--topbar-height) var(--space-4) var(--bottom-nav-clearance);
  overflow-y: visible;
}
```

**Explanation:**
- Use `min-height` instead of fixed `height` - allows content to expand naturally
- Remove `overflow-y: auto` from content - let body handle scrolling
- Use padding instead of margin for top spacing
- This eliminates the scroll container that was causing the grey strip

### Change 2: Update Catalog Page Content Class

**Replace this:**
```css
.content.content-catalog {
  margin-top: var(--topbar-catalog-height);
  height: calc(100dvh - var(--topbar-catalog-height) - var(--bottom-nav-clearance));
}
```

**With this:**
```css
.content.content-catalog {
  min-height: calc(100dvh - var(--topbar-catalog-height) - var(--bottom-nav-clearance));
  padding-top: var(--topbar-catalog-height);
}
```

### Change 3: Fix Desktop Content (Keep Existing Logic)

**Keep this but update:**
```css
@media (min-width: 768px) {
  .content {
    position: static;
    min-height: auto;
    overflow-y: visible;
    gap: 1.25rem;
    padding: var(--topbar-height) 0 var(--bottom-nav-clearance);
  }

  .content.content-catalog {
    padding-top: var(--topbar-catalog-height);
  }
}
```

**Explanation:**
- Ensure `min-height: auto` on desktop
- Keep simple padding approach
- Body scrolling handles everything on desktop

### Change 4: Make Body Always Scrollable

**Replace this:**
```css
body {
  margin: 0;
  color: var(--text);
  background: var(--bg);
  -webkit-tap-highlight-color: transparent;
  overflow-x: hidden;
  overflow-y: hidden;
}
```

**With this:**
```css
body {
  margin: 0;
  color: var(--text);
  background: var(--bg);
  -webkit-tap-highlight-color: transparent;
  overflow-x: hidden;
  overflow-y: auto;
}
```

**Explanation:**
- Change `overflow-y: hidden` to `overflow-y: auto`
- This allows body scrolling which is more natural
- Sheets will lock body scroll when open via JavaScript (`body.sheet-open`)

### Change 5: Fix Gear Form Sheet Structure

**Replace the gear form sheet CSS:**
```css
.gear-form-sheet {
  max-height: min(84vh, 760px);
  padding: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
```

**With this:**
```css
.gear-form-sheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  top: auto;
  max-height: min(90dvh, 800px);
  padding: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  z-index: 100;
}
```

**Explanation:**
- Explicitly set `position: fixed` with all position values
- Increase max-height slightly to accommodate footer
- Ensure proper z-index stacking

### Change 6: Fix Sheet Footer to Always Show

**Replace this:**
```css
.gear-form-footer {
  padding: 0.7rem 0.9rem calc(0.8rem + env(safe-area-inset-bottom));
  border-top: 1px solid var(--border-subtle);
  background: var(--surface-raised);
}
```

**With this:**
```css
.gear-form-footer {
  flex-shrink: 0;
  padding: 0.7rem 0.9rem calc(0.8rem + env(safe-area-inset-bottom));
  border-top: 1px solid var(--border-subtle);
  background: var(--surface-raised);
  position: sticky;
  bottom: 0;
  z-index: 1;
}
```

**Explanation:**
- Add `flex-shrink: 0` to prevent footer from shrinking
- Add `position: sticky` and `bottom: 0` to keep footer visible
- Add `z-index: 1` to ensure footer stays above scrolling content

### Change 7: Ensure Sheet Body Scrolls Properly

**Update the gear form stack:**
```css
.gear-form-stack {
  padding: 0.35rem 0.9rem 1rem;
  overflow-y: auto;
  display: grid;
  gap: 0.65rem;
  flex: 1;
  min-height: 0;
}
```

**Explanation:**
- Add `flex: 1` to take remaining space
- Add `min-height: 0` to enable proper flex shrinking
- Keep `overflow-y: auto` so this section scrolls while footer stays fixed

### Change 8: Fix Item Detail Sheet Footer (Same Pattern)

**Update maintenance sheet footer:**
```css
.maintenance-sheet-footer {
  flex-shrink: 0;
  padding: 0.7rem 0.9rem calc(0.8rem + env(safe-area-inset-bottom));
  border-top: 1px solid var(--border-subtle);
  background: var(--surface-raised);
  position: sticky;
  bottom: 0;
  z-index: 1;
}
```

**Update event add sheet footer:**
```css
.event-add-sheet-footer {
  flex-shrink: 0;
  padding: 0.7rem 0.9rem calc(0.8rem + env(safe-area-inset-bottom));
  border-top: 1px solid var(--border-subtle);
  background: var(--surface-raised);
  position: sticky;
  bottom: 0;
  z-index: 1;
}
```

### Change 9: Fix Detail Actions (Preview Sheet)

**Add to `.detail-actions`:**
```css
.detail-actions {
  margin-top: var(--space-4);
  padding-top: var(--space-3);
  border-top: 1px solid var(--border-subtle);
  display: flex;
  gap: var(--space-2);
  flex-shrink: 0;
  position: sticky;
  bottom: 0;
  background: var(--card);
  z-index: 1;
}
```

**Explanation:**
- Make the "More details" button area sticky at bottom
- Add background to prevent content showing through
- Use `flex-shrink: 0` to prevent collapsing

### Change 10: Enhance Sheet Overlay Backdrop

**Update overlay to be more visible:**
```css
.sheet-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.15);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  z-index: 90;
  animation: overlay-fade-in 180ms ease-out;
}

@keyframes overlay-fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
```

**Explanation:**
- Increase overlay darkness from 0.06 to 0.15 for better visibility
- Increase blur from 6px to 8px for stronger backdrop effect
- Add fade-in animation for polish

## Implementation Steps

1. **Update `src/index.css`** with all the CSS changes above
2. **Test mobile viewport** - verify no grey strip, sheets overlay properly
3. **Test desktop viewport** - verify normal body scrolling works
4. **Test sheet interactions** - verify all footer buttons are visible and clickable
5. **Verify scroll behavior** - content scrolls behind header/navbar cleanly

## Expected Results

✅ No grey strip between header and navbar  
✅ Sheet buttons always visible at bottom  
✅ Sheets fully overlay with blur backdrop  
✅ Content scrolls cleanly behind fixed header/navbar  
✅ Desktop mode continues to work properly  
✅ Mobile mode provides smooth sheet interactions

## Testing Checklist

- [ ] Open catalog page - no grey strip visible
- [ ] Click "Add new item" - form sheet overlays fully with blur
- [ ] Scroll form content - "Save item" button stays visible
- [ ] Click on catalog item - preview sheet shows "More details" button
- [ ] Open maintenance sheet - footer buttons visible
- [ ] Test on mobile viewport (< 768px)
- [ ] Test on desktop viewport (≥ 768px)
- [ ] Verify smooth scrolling on both viewports