import re

with open('src/pages/CatalogPage.tsx', 'r') as f:
    content = f.read()

if "const [scrolled, setScrolled] = useState(false);" not in content:
    state_injection = """  // ── Scroll state ───────────────────────────────────────────────────────────
  const [scrolled, setScrolled] = useState(false);
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrolled(e.currentTarget.scrollTop > 30);
  };
"""
    content = re.sub(r"(// Closing animation for filter sheet)", 
                     state_injection + r"\n  \1", content, count=1)


header_old = r"""        \{\/\* iOS-style inline header \*\/\}
        <header className="ios-catalog-header">
          <div className="ios-catalog-header-top">
            <h1 className="ios-catalog-title">Catalog<\/h1>
            <div className="ios-catalog-header-actions">
              <div className="ios-catalog-toolbar" role="group" aria-label="Catalog actions">
                <button
                  className={`ios-catalog-toolbar-btn\$\{showFilterSheet \|\| tagFilter \|\| conditionFilter !== 'all' \|\| essentialOnly \|\| selectedCategoryIds\.length > 0 \? ' active' : ''\}`}
                  onClick=\{\(\) => updateSearchParams\(\(p\) => p\.set\('filters', '1'\)\)\}
                  aria-label="Filters"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="4" y1="21" x2="4" y2="14" \/>
                    <line x1="4" y1="10" x2="4" y2="3" \/>
                    <line x1="12" y1="21" x2="12" y2="12" \/>
                    <line x1="12" y1="8" x2="12" y2="3" \/>
                    <line x1="20" y1="21" x2="20" y2="16" \/>
                    <line x1="20" y1="12" x2="20" y2="3" \/>
                    <line x1="1" y1="14" x2="7" y2="14" \/>
                    <line x1="9" y1="8" x2="15" y2="8" \/>
                    <line x1="17" y1="16" x2="23" y2="16" \/>
                  <\/svg>
                <\/button>
                <button
                  className="ios-catalog-toolbar-btn"
                  onClick=\{\(\) => updateSearchParams\(\(p\) => p\.set\('add', '1'\)\)\}
                  aria-label="Add Item"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" \/>
                    <line x1="5" y1="12" x2="19" y2="12" \/>
                  <\/svg>
                <\/button>
              <\/div>
            <\/div>
          <\/div>

          <div className="ios-catalog-item-count">\{filtered\.length\} item\{filtered\.length !== 1 \? 's' : ''\}<\/div>
        <\/header>

        \{\/\* Scrollable content area \*\/\}
        <div className="ios-catalog-scroll page-scroll-area">"""


header_new = """        {/* ── iOS Liquid Glass Header ─────────────────────────────────────────────── */}
        <header className="ios-catalog-header">
          <div style={{ width: 80 }} /> 
          <h2 className="ios-catalog-glass-title" style={{ opacity: scrolled ? 1 : 0 }}>
            Catalog
          </h2>
          <div className="ios-catalog-header-actions">
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
        <div className="ios-catalog-scroll page-scroll-area" onScroll={handleScroll}>
          <div className="ios-catalog-scrollable-header">
            <h1 className="ios-catalog-title" style={{ opacity: scrolled ? 0 : 1, transition: 'opacity 0.2s ease', marginBottom: 8 }}>
              Catalog
            </h1>
            <div className="ios-catalog-item-count">
              {filtered.length} item{filtered.length !== 1 ? 's' : ''}
            </div>
          </div>"""

content = re.sub(header_old, header_new, content)

with open('src/pages/CatalogPage.tsx', 'w') as f:
    f.write(content)
print("Updated CatalogPage")
