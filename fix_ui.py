import re

# 1. Update CSS
with open('src/index.css', 'r') as f:
    css = f.read()

# Replace .ios-catalog-header
css = re.sub(
    r'\.ios-catalog-header \{[^}]+\}',
    """.ios-catalog-header {
  position: fixed;
  top: calc(12px + env(safe-area-inset-top));
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  z-index: 40;
  pointer-events: none;
  background: transparent;
  border: none;
}""", css
)

# Replace dark mode overrides for catalog header
css = re.sub(
    r':root\.dark \.ios-catalog-header \{[^}]+\}',
    """/* removed dark background */""", css
)

# Replace .ev-ios-header
css = re.sub(
    r'\.ev-ios-header \{[^}]+\}',
    """.ev-ios-header {
  position: fixed;
  top: calc(12px + env(safe-area-inset-top));
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  z-index: 40;
  pointer-events: none;
  background: transparent;
  border: none;
}""", css
)

# Replace dark mode overrides for ev header
css = re.sub(
    r':root\.dark \.ev-ios-header \{[^}]+\}',
    """/* removed dark background */""", css
)

with open('src/index.css', 'w') as f:
    f.write(css)

# 2. Update CatalogPage.tsx
with open('src/pages/CatalogPage.tsx', 'r') as f:
    cat = f.read()

# Replace header block
cat_header_old = r"""        \{/\* ── iOS Liquid Glass Header ─────────────────────────────────────────────── \*/\}
        <header className="ios-catalog-header">
          <div style=\{\{ width: 80 \}\} /> 
          <h2 className="ios-catalog-glass-title" style=\{\{ opacity: scrolled \? 1 : 0 \}\}>
            Catalog
          </h2>
          <div className="ios-catalog-header-actions">
            <div className="ios-catalog-toolbar" role="group" aria-label="Catalog actions">
              <button
                className=\{`ios-catalog-toolbar-btn\$\{showFilterSheet \|\| tagFilter \|\| conditionFilter !== 'all' \|\| essentialOnly \|\| selectedCategoryIds\.length > 0 \? ' active' : ''\}`}
                onClick=\{\(\) => updateSearchParams\(\(p\) => p\.set\('filters', '1'\)\)\}
                aria-label="Filters"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="4" y1="21" x2="4" y2="14" />
                  <line x1="4" y1="10" x2="4" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12" y2="3" />
                  <line x1="20" y1="21" x2="20" y2="16" />
                  <line x1="20" y1="12" x2="20" y2="3" />
                  <line x1="1" y1="14" x2="7" y2="14" />
                  <line x1="9" y1="8" x2="15" y2="8" />
                  <line x1="17" y1="16" x2="23" y2="16" />
                </svg>
              </button>
              <button
                className="ios-catalog-toolbar-btn"
                onClick=\{\(\) => updateSearchParams\(\(p\) => p\.set\('add', '1'\)\)\}
                aria-label="Add Item"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            </div>
          </div>
        </header>

        \{/\* ── Scrollable content area ───────────────────────────────── \*/\}
        <div className="ios-catalog-scroll page-scroll-area" onScroll=\{handleScroll\}>
          <div className="ios-catalog-scrollable-header">
            <div className="ios-title-pill-container" style=\{\{ opacity: scrolled \? 0 : 1, transition: 'opacity 0\.2s ease', pointerEvents: scrolled \? 'none' : 'auto' \}\}>
              <div className="ios-title-pill">
                <span>Catalog</span>
              </div>
            </div>
            <div className="ios-catalog-item-count" style=\{\{ marginTop: "-4px" \}\}>"""

cat_header_new = """        {/* ── Floating Header ─────────────────────────────────────────────── */}
        <header className="ios-catalog-header">
          {/* Left Pill (fades out on scroll) */}
          <div className="ios-title-pill" style={{ opacity: scrolled ? 0 : 1, transition: 'opacity 0.2s ease', pointerEvents: scrolled ? 'none' : 'auto' }}>
            <span>Catalog</span>
          </div>
          
          {/* Center Title (fades in on scroll) */}
          <h2 className="ios-catalog-glass-title" style={{ opacity: scrolled ? 1 : 0, pointerEvents: 'none' }}>
            Catalog
          </h2>

          {/* Right Actions */}
          <div className="ios-catalog-header-actions" style={{ pointerEvents: 'auto' }}>
            <div className="ios-catalog-toolbar" role="group" aria-label="Catalog actions">
              <button
                className={`ios-catalog-toolbar-btn${showFilterSheet || tagFilter || conditionFilter !== 'all' || essentialOnly || selectedCategoryIds.length > 0 ? ' active' : ''}`}
                onClick={() => updateSearchParams((p) => p.set('filters', '1'))}
                aria-label="Filters"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="4" y1="21" x2="4" y2="14" />
                  <line x1="4" y1="10" x2="4" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12" y2="3" />
                  <line x1="20" y1="21" x2="20" y2="16" />
                  <line x1="20" y1="12" x2="20" y2="3" />
                  <line x1="1" y1="14" x2="7" y2="14" />
                  <line x1="9" y1="8" x2="15" y2="8" />
                  <line x1="17" y1="16" x2="23" y2="16" />
                </svg>
              </button>
              <button
                className="ios-catalog-toolbar-btn"
                onClick={() => updateSearchParams((p) => p.set('add', '1'))}
                aria-label="Add Item"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            </div>
          </div>
        </header>

        {/* ── Scrollable content area ───────────────────────────────── */}
        <div className="ios-catalog-scroll page-scroll-area" onScroll={handleScroll} style={{ paddingTop: '80px' }}>
          <div className="ios-catalog-scrollable-header">
            <div className="ios-catalog-item-count" style={{ marginTop: "-4px" }}>"""

cat = re.sub(cat_header_old, cat_header_new, cat)
with open('src/pages/CatalogPage.tsx', 'w') as f:
    f.write(cat)

# 3. Update EventsPage.tsx
with open('src/pages/EventsPage.tsx', 'r') as f:
    ev = f.read()

ev_header_old = r"""        \{/\* ── iOS Liquid Glass Header ─────────────────────────────────────────────── \*/\}
        <header className="ev-ios-header">
          \{/\* We keep empty left space or something else if needed, but flex-justify will push toolbar to right if left is empty\. We'll use a placeholder div so title is center and toolbar is right \*/\}
          <div style=\{\{ width: 80 \}\} /> 
          <h2 className="ev-ios-glass-title" style=\{\{ opacity: scrolled \? 1 : 0 \}\}>
            Events
          </h2>

          <div className="ev-ios-toolbar" role="group" aria-label="Events actions">
            <button
              className=\{`ev-ios-toolbar-btn\$\{showCalendar \? ' active' : ''\}`}
              onClick=\{\(\) => setParam\('calendar', showCalendar \? null : '1'\)\}
              aria-label="Toggle calendar view"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </button>
            <button
              className="ev-ios-toolbar-btn"
              onClick=\{\(\) => setParam\('add', '1'\)\}
              aria-label="Create new event"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </div>
        </header>

        \{/\* ── Scrollable content area ───────────────────────────────── \*/\}
        <div className="ev-ios-content-scroll page-scroll-area" onScroll=\{handleScroll\}>
          <div className="ev-ios-scrollable-header">
            <div className="ios-title-pill-container" style=\{\{ opacity: scrolled \? 0 : 1, transition: 'opacity 0\.2s ease', pointerEvents: scrolled \? 'none' : 'auto' \}\}>
              <div className="ios-title-pill">
                <span>Events</span>
              </div>
            </div>

            <div className="ev-ios-item-count" style=\{\{ marginTop: "-4px" \}\}>"""

ev_header_new = """        {/* ── Floating Header ─────────────────────────────────────────────── */}
        <header className="ev-ios-header">
          {/* Left Pill */}
          <div className="ios-title-pill" style={{ opacity: scrolled ? 0 : 1, transition: 'opacity 0.2s ease', pointerEvents: scrolled ? 'none' : 'auto' }}>
            <span>Events</span>
          </div>

          {/* Center Title */}
          <h2 className="ev-ios-glass-title" style={{ opacity: scrolled ? 1 : 0, pointerEvents: 'none' }}>
            Events
          </h2>

          {/* Right Actions */}
          <div className="ev-ios-toolbar" role="group" aria-label="Events actions" style={{ pointerEvents: 'auto' }}>
            <button
              className={`ev-ios-toolbar-btn${showCalendar ? ' active' : ''}`}
              onClick={() => setParam('calendar', showCalendar ? null : '1')}
              aria-label="Toggle calendar view"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </button>
            <button
              className="ev-ios-toolbar-btn"
              onClick={() => setParam('add', '1')}
              aria-label="Create new event"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </div>
        </header>

        {/* ── Scrollable content area ───────────────────────────────── */}
        <div className="ev-ios-content-scroll page-scroll-area" onScroll={handleScroll} style={{ paddingTop: '80px' }}>
          <div className="ev-ios-scrollable-header">
            <div className="ev-ios-item-count" style={{ marginTop: "-4px" }}>"""

ev = re.sub(ev_header_old, ev_header_new, ev)
with open('src/pages/EventsPage.tsx', 'w') as f:
    f.write(ev)

