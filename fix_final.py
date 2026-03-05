import re

with open('src/index.css', 'r') as f:
    css = f.read()

# Catalog Header
css = re.sub(
    r'\.ios-catalog-header \{[^}]+\}',
    """.ios-catalog-header {
  position: fixed;
  top: 0; /* Use full height for background blur */
  padding-top: calc(12px + env(safe-area-inset-top));
  padding-bottom: 12px;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-left: 16px;
  padding-right: 16px;
  z-index: 40;
  pointer-events: none;
  background: transparent;
  border-bottom: 0.5px solid transparent;
  transition: background-color 0.3s ease, border-color 0.3s ease, backdrop-filter 0.3s ease;
}

.ios-catalog-header.is-scrolled {
  background: rgba(249, 249, 249, 0.85);
  backdrop-filter: saturate(180%) blur(20px);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
  border-bottom: 0.5px solid rgba(0, 0, 0, 0.1);
}
:root.dark .ios-catalog-header.is-scrolled {
  background: rgba(28, 28, 30, 0.85);
  border-bottom: 0.5px solid rgba(255, 255, 255, 0.1);
}
""", css
)

# Events Header
css = re.sub(
    r'\.ev-ios-header \{[^}]+\}',
    """.ev-ios-header {
  position: fixed;
  top: 0; /* Use full height for background blur */
  padding-top: calc(12px + env(safe-area-inset-top));
  padding-bottom: 12px;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-left: 16px;
  padding-right: 16px;
  z-index: 40;
  pointer-events: none;
  background: transparent;
  border-bottom: 0.5px solid transparent;
  transition: background-color 0.3s ease, border-color 0.3s ease, backdrop-filter 0.3s ease;
}

.ev-ios-header.is-scrolled {
  background: rgba(249, 249, 249, 0.85);
  backdrop-filter: saturate(180%) blur(20px);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
  border-bottom: 0.5px solid rgba(0, 0, 0, 0.1);
}
:root.dark .ev-ios-header.is-scrolled {
  background: rgba(28, 28, 30, 0.85);
  border-bottom: 0.5px solid rgba(255, 255, 255, 0.1);
}
""", css
)


with open('src/index.css', 'w') as f:
    f.write(css)

# Update CatalogPage.tsx
with open('src/pages/CatalogPage.tsx', 'r') as f:
    cat = f.read()

cat_old = r"""        \{/\* ── Floating Header ─────────────────────────────────────────────── \*/\}
        <header className="ios-catalog-header">
          \{/\* Left Pill \(fades out on scroll\) \*/\}
          <div className="ios-title-pill" style=\{\{ opacity: scrolled \? 0 : 1, transition: 'opacity 0\.2s ease', pointerEvents: scrolled \? 'none' : 'auto' \}\}>
            <span>Catalog</span>
          </div>
          
          \{/\* Center Title \(fades in on scroll\) \*/\}
          <h2 className="ios-catalog-glass-title" style=\{\{ opacity: scrolled \? 1 : 0, pointerEvents: 'none' \}\}>
            Catalog
          </h2>

          \{/\* Right Actions \*/\}
          <div className="ios-catalog-header-actions" style=\{\{ pointerEvents: 'auto' \}\}>"""

cat_new = """        {/* ── Floating Header ─────────────────────────────────────────────── */}
        <header className={`ios-catalog-header${scrolled ? ' is-scrolled' : ''}`}>
          {/* Spacer to balance flex layout */}
          <div style={{ width: 80 }} />

          {/* Center Title (fades in on scroll) */}
          <h2 className="ios-catalog-glass-title" style={{ opacity: scrolled ? 1 : 0, pointerEvents: 'none' }}>
            Catalog
          </h2>

          {/* Right Actions */}
          <div className="ios-catalog-header-actions" style={{ pointerEvents: 'auto' }}>"""

cat = re.sub(cat_old, cat_new, cat)

cat_scroll_old = r"""        \{/\* ── Scrollable content area ───────────────────────────────── \*/\}
        <div className="ios-catalog-scroll page-scroll-area" onScroll=\{handleScroll\} style=\{\{ paddingTop: '80px' \}\}>
          <div className="ios-catalog-scrollable-header">
            <div className="ios-catalog-item-count" style=\{\{ marginTop: "-4px" \}\}>"""

cat_scroll_new = """        {/* ── Scrollable content area ───────────────────────────────── */}
        <div className="ios-catalog-scroll page-scroll-area" onScroll={handleScroll} style={{ paddingTop: '80px' }}>
          <div className="ios-catalog-scrollable-header">
            <h1 className="ios-catalog-title" style={{ opacity: scrolled ? 0 : 1, transition: 'opacity 0.2s ease', marginBottom: 8 }}>
              Catalog
            </h1>
            <div className="ios-catalog-item-count" style={{ marginTop: "-4px" }}>"""

cat = re.sub(cat_scroll_old, cat_scroll_new, cat)

with open('src/pages/CatalogPage.tsx', 'w') as f:
    f.write(cat)

# Update EventsPage.tsx
with open('src/pages/EventsPage.tsx', 'r') as f:
    ev = f.read()

ev_old = r"""        \{/\* ── Floating Header ─────────────────────────────────────────────── \*/\}
        <header className="ev-ios-header">
          \{/\* Left Pill \*/\}
          <div className="ios-title-pill" style=\{\{ opacity: scrolled \? 0 : 1, transition: 'opacity 0\.2s ease', pointerEvents: scrolled \? 'none' : 'auto' \}\}>
            <span>Events</span>
          </div>

          \{/\* Center Title \*/\}
          <h2 className="ev-ios-glass-title" style=\{\{ opacity: scrolled \? 1 : 0, pointerEvents: 'none' \}\}>
            Events
          </h2>

          \{/\* Right Actions \*/\}
          <div className="ev-ios-toolbar" role="group" aria-label="Events actions" style=\{\{ pointerEvents: 'auto' \}\}>"""

ev_new = """        {/* ── Floating Header ─────────────────────────────────────────────── */}
        <header className={`ev-ios-header${scrolled ? ' is-scrolled' : ''}`}>
          {/* Spacer to balance flex layout */}
          <div style={{ width: 80 }} />

          {/* Center Title */}
          <h2 className="ev-ios-glass-title" style={{ opacity: scrolled ? 1 : 0, pointerEvents: 'none' }}>
            Events
          </h2>

          {/* Right Actions */}
          <div className="ev-ios-toolbar" role="group" aria-label="Events actions" style={{ pointerEvents: 'auto' }}>"""

ev = re.sub(ev_old, ev_new, ev)

ev_scroll_old = r"""        \{/\* ── Scrollable content area ───────────────────────────────── \*/\}
        <div className="ev-ios-content-scroll page-scroll-area" onScroll=\{handleScroll\} style=\{\{ paddingTop: '80px' \}\}>
          <div className="ev-ios-scrollable-header">
            <div className="ev-ios-item-count" style=\{\{ marginTop: "-4px" \}\}>"""

ev_scroll_new = """        {/* ── Scrollable content area ───────────────────────────────── */}
        <div className="ev-ios-content-scroll page-scroll-area" onScroll={handleScroll} style={{ paddingTop: '80px' }}>
          <div className="ev-ios-scrollable-header">
            <h1 className="ev-ios-large-title" style={{ opacity: scrolled ? 0 : 1, transition: 'opacity 0.2s ease', marginBottom: 8 }}>
              Events
            </h1>
            <div className="ev-ios-item-count" style={{ marginTop: "-4px" }}>"""

ev = re.sub(ev_scroll_old, ev_scroll_new, ev)

with open('src/pages/EventsPage.tsx', 'w') as f:
    f.write(ev)

