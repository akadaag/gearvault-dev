# GearVault Page Redesign Workflow

## Overview
Systematically revamp all GearVault pages with Material 3 design system while avoiding breaking existing functionality. This document provides prompts for Gemini and a safe implementation workflow.

---

## 🎨 Design System Reference

### Material 3 Design Tokens (from commit e3df959)

**Colors (Dark Theme)**
- Primary: `#D0BCFF` on `#381E72`
- Secondary: `#CCC2DC` on `#332D41`
- Background: `#141218`
- Surface variants: `#1D1B20` (low) → `#211F26` (base) → `#2B2930` (high) → `#36343B` (highest)
- Outline: `#938F99` / `#49454F`

**Spacing**
- XS: 4px, SM: 8px, MD: 16px, LG: 24px, XL: 32px

**Shapes**
- XS: 4px, SM: 8px, MD: 12px, LG: 16px, XL: 28px, Pill: 9999px

**Typography**
- Font: Roboto, system-ui, sans-serif
- Display/Headline: 28px/36px line-height
- Body: 16px/1.5 line-height
- Small/Caption: 14px and 12px

**Animations**
```css
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.fade-in-up {
  animation: fadeInUp 0.4s ease-out backwards;
}
```

---

## 🚨 CRITICAL SAFETY RULES

### ❌ NEVER DO:
1. **Delete existing CSS** - Never remove CSS classes used by other pages
2. **Replace entire stylesheets** - Always append new styles
3. **Break global layouts** - Don't modify `.content`, `.bottom-nav`, `TabLayout` wrapper classes
4. **Skip testing** - Always verify other pages still work after changes
5. **Commit without review** - Always show diff before committing

### ✅ ALWAYS DO:
1. **Scope your styles** - Use unique class prefixes (e.g., `.catalog-page.m3-theme`)
2. **Append CSS** - Add new styles at the END of `src/index.css`
3. **Preserve HTML structure** - Keep existing semantic structure when possible
4. **Test navigation** - Verify bottom nav, routing, and page transitions still work
5. **Incremental commits** - One page at a time with clear commit messages

---

## 📋 Page Redesign Checklist

### Pages to Redesign (Priority Order)
- [ ] **CatalogPage.tsx** - Main gear list view (HIGH priority)
- [ ] **GearItemDetailPage.tsx** - Individual item view
- [ ] **EventsPage.tsx** - Events list view
- [ ] **EventDetailPage.tsx** - Single event with packing checklist
- [ ] **AIAssistantPage.tsx** - AI chat interface
- [ ] **SettingsPage.tsx** - App settings
- [ ] **LoginPage.tsx** - Auth flow (LOW priority)

---

## 🤖 Gemini Prompt Template

Use this prompt for each page. Replace `[PAGE_NAME]` with the actual page (e.g., CatalogPage, EventsPage).

```
## TASK: Redesign [PAGE_NAME] with Material 3 Design System

### Context
You are redesigning a SINGLE PAGE of the GearVault PWA (a photography gear management app). Your previous attempt deleted 4,700 lines of CSS which broke the entire app. This time you MUST follow strict safety rules.

### What You're Redesigning
- **File**: `src/pages/[PAGE_NAME].tsx`
- **Current state**: Read this file first to understand its functionality and data flow
- **Goal**: Apply Material 3 design system while preserving ALL existing functionality

### Design System to Use
**Material 3 Dark Theme** (same as commit e3df959):
- Colors: Primary #D0BCFF, Surface #211F26, Background #141218
- Shapes: Rounded corners (12-16px), pill-shaped buttons (9999px)
- Typography: Roboto, 28px headlines, 16px body, 14px/12px small text
- Spacing: 4px/8px/16px/24px/32px scale
- Animations: Fade-in-up with stagger delays (0.4s ease-out)
- Components: Cards with elevation, pill-shaped chips for tags/urgency, glass morphism effects

**Reference commit**: e3df959 (you can check the HomePage.tsx implementation there)

### CRITICAL SAFETY RULES

#### ❌ NEVER:
1. **Delete ANY existing CSS** - The `src/index.css` file is 5,800+ lines and contains styles for ALL pages. Deleting CSS will break other pages.
2. **Replace the entire stylesheet** - ONLY append new styles at the END of the file
3. **Modify global classes** - Don't touch: `.content`, `.bottom-nav`, `.tab-button`, layout wrappers, or any class not specific to [PAGE_NAME]
4. **Change routing or navigation** - Keep the bottom nav, TabLayout wrapper, and React Router setup unchanged
5. **Remove existing functionality** - All buttons, forms, data fetching, and interactions must continue to work

#### ✅ ALWAYS:
1. **Read first** - Use Read tool on `src/pages/[PAGE_NAME].tsx` and relevant sections of `src/index.css` BEFORE making changes
2. **Scope your CSS** - Add a unique root class like `.[page-name]-page.m3-theme` and scope ALL new styles under it
3. **Append CSS only** - Add new styles at line 5900+ (after existing iOS home styles)
4. **Preserve data flow** - Keep all `useLiveQuery`, `useState`, `useNavigate`, and business logic unchanged
5. **Test incrementally** - After editing, verify the page loads and functions work before moving to CSS

### Step-by-Step Workflow

**STEP 1: Research**
- Read `src/pages/[PAGE_NAME].tsx` completely
- Identify all interactive elements (buttons, forms, modals, search bars)
- Note all data displayed (lists, cards, stats, images)
- Check if the page already has unique CSS classes in `src/index.css` (search for "[page-name]")

**STEP 2: Plan the HTML Structure**
- Draft new JSX with Material 3 patterns:
  - Wrap page in `<div className="[page-name]-page m3-theme">`
  - Use semantic sections: `<header>`, `<main>`, `<section>`
  - Cards: `.m3-card` with elevation classes
  - Buttons: `.m3-btn-primary`, `.m3-btn-text`, `.m3-fab` (floating action button)
  - Lists: `.m3-list` with `.m3-list-item`
  - Chips/Tags: `.m3-chip` or `.pill`
- Add animation classes: `.fade-in-up` with staggered delays (style="animation-delay: 0.1s")

**STEP 3: Update the TSX File**
- Use Edit tool to replace OLD JSX with NEW JSX in `src/pages/[PAGE_NAME].tsx`
- Preserve ALL existing imports, hooks, state, and logic
- Only change the `return (...)` JSX structure
- Keep all event handlers (onClick, onChange, onSubmit) intact

**STEP 4: Write Scoped CSS**
- Read the LAST 100 lines of `src/index.css` to find where to append
- Add a comment separator: `/* ===== [PAGE_NAME] - Material 3 Theme ===== */`
- Write ALL new CSS under `.[page-name]-page.m3-theme` scope
- Include:
  - Layout styles (flexbox, grid, spacing)
  - Card elevation and borders
  - Button styles (primary, secondary, text, FAB)
  - Typography scale
  - Color tokens from Material 3 palette
  - Animation keyframes if needed
- Use Edit tool to APPEND (not replace) at the end of `src/index.css`

**STEP 5: Verify**
- List all changes made (files modified, line count added)
- Confirm no existing CSS was deleted (diff should show only additions)
- Describe what the page looks like now (layout, colors, animations)

### Output Format
When done, provide:
1. **Summary**: What you changed and why
2. **File diff preview**: Show OLD vs NEW for TSX changes
3. **CSS added**: Show the new CSS block (first 50 lines)
4. **Verification checklist**:
   - [ ] No existing CSS deleted
   - [ ] All functionality preserved (buttons, navigation, data display)
   - [ ] Styles scoped under `.[page-name]-page.m3-theme`
   - [ ] Page-specific classes added at END of index.css
   - [ ] Animation classes applied with stagger delays

### Example Commit Message
```
Redesign [PAGE_NAME] with Material 3 design system

- Apply M3 color tokens (primary, surface, outline)
- Add card elevation and rounded corners
- Implement fade-in-up animations with stagger
- Use pill-shaped buttons and chips
- Preserve all existing functionality and data flow
- Append ~200 lines of scoped CSS to index.css (no deletions)
```

### Ready?
Start by reading `src/pages/[PAGE_NAME].tsx` and identifying its current structure.
```

---

## 🔄 Safe Implementation Workflow (After Gemini)

### Step 1: Review Gemini's Changes
1. **Check the diff first**: Ask Gemini to show `git diff --stat` and `git diff src/index.css | head -100`
2. **Verify no deletions**: Ensure the diff shows only `+` (additions), not `-` (deletions) in CSS
3. **Spot check**: Verify a few random existing classes (e.g., `.home-page`, `.bottom-nav`) are still present

### Step 2: Test the Changed Page
1. Navigate to the redesigned page in the app
2. Test all interactions: buttons, forms, search, filters, modals
3. Verify data displays correctly: lists, cards, stats, images

### Step 3: Test Other Pages
1. Navigate to Home, Catalog, Events, Settings, etc.
2. Confirm layout, styles, and bottom nav still work
3. If anything breaks, REVERT immediately: `git reset --hard HEAD^`

### Step 4: Commit Safely
Only if all tests pass:
```bash
git add src/pages/[PAGE_NAME].tsx src/index.css
git commit -m "Redesign [PAGE_NAME] with Material 3 (preserves existing styles)"
git push
```

### Step 5: Move to Next Page
- Update the checklist above
- Use the Gemini prompt template for the next page
- Repeat workflow

---

## 🏠 Home Page Refinements (iOS Theme)

The current iOS home page (commit cc00ac1 + 52e08b8) is good but could be more compact for mobile. Here are suggested tweaks:

### Make It More Compact
1. **Reduce widget padding**: Change `.ios-theme .home-widget-card` padding from `1.25rem` → `1rem`
2. **Tighter grid gaps**: Change `.home-widgets` gap from `0.875rem` → `0.625rem` (10px)
3. **Smaller stat font**: Already reduced to 24px (good)
4. **Compact header**: Reduce `.ios-theme .home-header` margin-bottom from `1.25rem` → `0.75rem`
5. **Essentials cards**: Reduce `.ios-theme .ios-essential-card` padding from `1rem` → `0.75rem`
6. **Action buttons**: Reduce height from `64px` → `56px` for quicker access

### Visual Polish
1. **Smoother shadows**: Use softer `box-shadow` on cards (reduce blur radius by 20%)
2. **Subtle animations**: Add hover/active scale on action buttons (transform: scale(0.98))
3. **Better contrast**: Increase text opacity in dark mode for `.ios-text-secondary` (0.6 → 0.7)

### Apply These Changes
Use Edit tool on `src/index.css` (lines 5368-5900) to adjust the values above. Test on mobile viewport (375px width) to ensure no overflow.

---

## 📊 Progress Tracking

Use this section to track which pages are done:

| Page | Status | Commit | Notes |
|------|--------|--------|-------|
| HomePage | ✅ Done | d04de34 | iOS frosted-glass theme, home-ios-* classes |
| CatalogPage | ✅ Done | - | iOS theme, ios-catalog-* classes |
| GearItemDetailPage | ✅ Done | c424515 | iOS theme, gear-detail-* classes |
| EventsPage | ✅ Done | - | iOS theme, ev-ios-* classes |
| EventDetailPage | ✅ Done | - | iOS theme, ev-detail-* classes |
| AIAssistantPage | ✅ Done | - | iOS theme, ai-ios-* classes |
| SettingsPage | ✅ Done | - | iOS theme, ios-settings-* classes |
| LoginPage | ✅ Done | - | iOS theme, ios-auth-* classes |

---

## 🆘 Troubleshooting

### If Gemini Deletes CSS Again:
```bash
git status  # See what changed
git diff src/index.css --stat  # Check line count
git restore src/index.css  # Undo if bad
```

### If a Page Breaks:
1. Revert: `git reset --hard HEAD^`
2. Re-run Gemini with MORE EMPHASIS on safety rules
3. Manually apply changes in smaller chunks

### If Styles Conflict:
- Increase specificity: `.catalog-page.m3-theme .m3-card` beats `.m3-card`
- Use `!important` ONLY as last resort
- Check browser DevTools to see which styles are overriding

---

## ✅ Final Checklist (Before Each Commit)

- [ ] Read all changed files to confirm no deletions
- [ ] Test the redesigned page (all interactions work)
- [ ] Test 3 other pages (layout/nav still works)
- [ ] Verify `git diff --stat` shows reasonable line counts (~200-400 additions, 0 deletions)
- [ ] Clear commit message describes what was added
- [ ] Push to remote only after local testing passes

---

**Last Updated**: 2026-02-18
**Status**: ALL PAGES COMPLETE. Full iOS frosted-glass redesign finished.
**Last Commit**: c424515 — GearItemDetailPage (final page)
