import re

with open('src/index.css', 'r') as f:
    css = f.read()

# Replace .ev-ios-header styles
ev_header_old = """\.ev-ios-header \{
  flex-shrink: 0;
  padding: 12px 16px 0;
  background: #ffffff;
  position: sticky;
  top: 0;
  z-index: 40;
  border-bottom: 1px solid transparent;
\}"""
ev_header_new = """.ev-ios-header {
  flex-shrink: 0;
  padding: 12px 16px 12px;
  background: rgba(249, 249, 249, 0.85);
  backdrop-filter: saturate(180%) blur(20px);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
  position: sticky;
  top: 0;
  z-index: 40;
  border-bottom: 0.5px solid rgba(0, 0, 0, 0.1);
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 60px; /* enough space for nav */
}
.ev-ios-glass-title {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  font-size: 17px;
  font-weight: 600;
  color: var(--ios-text-primary);
  margin: 0;
  transition: opacity 0.2s ease;
  pointer-events: none;
}
.ev-ios-scrollable-header {
  padding: 0 16px 12px;
}
"""
css = re.sub(ev_header_old, ev_header_new, css)


# Replace .ios-catalog-header styles
cat_header_old = """\.ios-catalog-header \{
  flex-shrink: 0;
  padding: 12px 16px 0;
  background: #ffffff;
  position: sticky;
  top: 0;
  z-index: 40;
  border-bottom: 1px solid transparent;
\}"""
cat_header_new = """.ios-catalog-header {
  flex-shrink: 0;
  padding: 12px 16px 12px;
  background: rgba(249, 249, 249, 0.85);
  backdrop-filter: saturate(180%) blur(20px);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
  position: sticky;
  top: 0;
  z-index: 40;
  border-bottom: 0.5px solid rgba(0, 0, 0, 0.1);
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 60px;
}
.ios-catalog-glass-title {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  font-size: 17px;
  font-weight: 600;
  color: var(--ios-text-primary);
  margin: 0;
  transition: opacity 0.2s ease;
  pointer-events: none;
}
.ios-catalog-scrollable-header {
  padding: 0 16px 12px;
}
"""
css = re.sub(cat_header_old, cat_header_new, css)

# Fix dark mode overrides
ev_dark_old = """:root\.dark \.ev-ios-header \{
  background: var\(--ios-bg\);
\}"""
ev_dark_new = """:root.dark .ev-ios-header {
  background: rgba(28, 28, 30, 0.85);
  border-bottom: 0.5px solid rgba(255, 255, 255, 0.1);
}"""
css = re.sub(ev_dark_old, ev_dark_new, css)

cat_dark_old = """:root\.dark \.ios-catalog-header \{
  background: var\(--ios-bg\);
\}"""
cat_dark_new = """:root.dark .ios-catalog-header {
  background: rgba(28, 28, 30, 0.85);
  border-bottom: 0.5px solid rgba(255, 255, 255, 0.1);
}"""
css = re.sub(cat_dark_old, cat_dark_new, css)

# Notice we have duplicate catalog dark overrides in the source based on previous grep results:
# 6293:.ios-catalog-header {
# 6303::root.dark .ios-catalog-header {
# 6834::root.dark .ios-catalog-header {
# re.sub replaces all instances which is what we want.

with open('src/index.css', 'w') as f:
    f.write(css)
print("Updated index.css")
