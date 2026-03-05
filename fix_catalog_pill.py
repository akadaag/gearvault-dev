import re

with open('src/pages/CatalogPage.tsx', 'r') as f:
    content = f.read()

# Replace the large title with the pill style
old_title = """            <h1 className="ios-catalog-title" style={{ opacity: scrolled ? 0 : 1, transition: 'opacity 0.2s ease', marginBottom: 8 }}>
              Catalog
            </h1>"""

new_title = """            <div className="ios-title-pill-container" style={{ opacity: scrolled ? 0 : 1, transition: 'opacity 0.2s ease', pointerEvents: scrolled ? 'none' : 'auto' }}>
              <div className="ios-title-pill">
                <span>Catalog</span>
              </div>
            </div>"""

content = content.replace(old_title, new_title)

# Also fix the item count margin so it doesn't look weird without the h1's bottom margin
content = content.replace('<div className="ios-catalog-item-count">', '<div className="ios-catalog-item-count" style={{ marginTop: "-4px" }}>')

with open('src/pages/CatalogPage.tsx', 'w') as f:
    f.write(content)

