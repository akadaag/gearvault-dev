import re

with open('src/pages/CatalogPage.tsx', 'r') as f:
    content = f.read()

# Add UIEvent import if missing
if 'import type { UIEvent }' not in content:
    content = content.replace("import { useEffect, useMemo, useState} from 'react';", "import { useEffect, useMemo, useState} from 'react';\nimport type { UIEvent } from 'react';")

# Add scrolled state
state_code = """  const [showAddItemForm, setShowAddItemForm] = useState(false);
  const [error, setError] = useState('');

  // ── Scroll state ───────────────────────────────────────────────────────────
  const [scrolled, setScrolled] = useState(false);
  const handleScroll = (e: UIEvent<HTMLDivElement>) => {
    setScrolled(e.currentTarget.scrollTop > 10);
  };
"""
content = re.sub(r"  const \[showAddItemForm, setShowAddItemForm\] = useState\(false\);\n  const \[error, setError\] = useState\(''\);", state_code, content)


# Update header section
header_pattern = r'<header className="ios-catalog-header">.*?</header>'
header_replacement = """<header className={`ios-catalog-header${scrolled ? ' is-scrolled' : ''}`}>
          {/* Left: large title + count — both fade out on scroll */}
          <div
            className="ios-catalog-header-left"
            style={{ opacity: scrolled ? 0 : 1, transition: 'opacity 0.2s ease', pointerEvents: 'none' }}
          >
            <h1 className="ios-catalog-title" style={{ margin: 0, fontSize: '32px', lineHeight: 1.2 }}>Catalog</h1>
            <p className="ios-catalog-item-count" style={{ margin: 0 }}>{filtered.length} item{filtered.length !== 1 ? 's' : ''}</p>
          </div>

          {/* Center title — fades in on scroll */}
          <h2
            className="ios-catalog-glass-title"
            style={{ opacity: scrolled ? 1 : 0, pointerEvents: 'none' }}
          >
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
        </header>"""

content = re.sub(header_pattern, header_replacement, content, flags=re.DOTALL)


# Update scroll area
scroll_pattern = r'<div className="ios-catalog-scroll page-scroll-area">\s*<div className="ios-catalog-header-title-area">\s*<h1 className="ios-catalog-title">Catalog</h1>\s*<p className="ios-catalog-item-count">\{filtered\.length\} item\{filtered\.length !== 1 \? \'s\' : \'\'\}</p>\s*</div>'
scroll_replacement = """<div className="ios-catalog-scroll page-scroll-area" onScroll={handleScroll}>
          <div style={{ height: 'calc(env(safe-area-inset-top) + 68px)' }} />"""

content = re.sub(scroll_pattern, scroll_replacement, content)

with open('src/pages/CatalogPage.tsx', 'w') as f:
    f.write(content)

