import re

with open('src/index.css', 'r') as f:
    css = f.read()

# 1. Remove the background from ios-catalog-scroll so it doesn't block the blur
css = re.sub(
    r'\.ios-catalog-scroll \{\n\s*flex: 1;\n\s*overflow-y: auto;\n\s*overflow-x: clip;\n\s*-webkit-overflow-scrolling: touch;\n\s*padding: 0 16px;\n\s*padding-bottom: var\(--bottom-nav-clearance\);\n\s*min-height: 0;\n\s*background: #ffffff;\n\}',
    r""".ios-catalog-scroll {
  flex: 1;
  overflow-y: auto;
  overflow-x: clip;
  -webkit-overflow-scrolling: touch;
  padding: 0;
  padding-bottom: var(--bottom-nav-clearance);
  min-height: 0;
  background: transparent;
}""", css)

css = re.sub(
    r':root\.dark \.ios-catalog-scroll \{\n\s*background: var\(--ios-bg\);\n\}',
    r""":root.dark .ios-catalog-scroll {
  background: transparent;
}""", css)


# 2. Same for ev-ios-content-scroll
css = re.sub(
    r'\.ev-ios-content-scroll \{\n\s*flex: 1;\n\s*overflow-y: auto;\n\s*-webkit-overflow-scrolling: touch;\n\s*padding: 0 16px;\n\s*padding-bottom: var\(--bottom-nav-clearance\);\n\s*min-height: 0;\n\s*background: #ffffff;\n\}',
    r""".ev-ios-content-scroll {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 0;
  padding-bottom: var(--bottom-nav-clearance);
  min-height: 0;
  background: transparent;
}""", css)

css = re.sub(
    r':root\.dark \.ev-ios-content-scroll \{\n\s*background: var\(--ios-bg\);\n\}',
    r""":root.dark .ev-ios-content-scroll {
  background: transparent;
}""", css)


with open('src/index.css', 'w') as f:
    f.write(css)

# Update CatalogPage.tsx to remove inline style and add empty spacer div
with open('src/pages/CatalogPage.tsx', 'r') as f:
    cat = f.read()

cat = cat.replace(
    """<div className="ios-catalog-scroll page-scroll-area" onScroll={handleScroll} style={{ paddingTop: '80px' }}>""",
    """<div className="ios-catalog-scroll page-scroll-area" onScroll={handleScroll}>
          <div style={{ height: '70px' }} />"""
)

# Also wrap the content that needs padding
# Wait, let's just make the scroll container have no horizontal padding, but add a wrapper or apply padding to children.
# Actually, the scrollable header already has `padding: 0 16px 12px;`
# But wait, `.ios-catalog-groups` and `.ios-catalog-empty` need horizontal padding if we removed it from the parent!

with open('src/pages/CatalogPage.tsx', 'w') as f:
    f.write(cat)

