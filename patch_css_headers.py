import re

with open('src/index.css', 'r') as f:
    content = f.read()

# 1. Update .ios-catalog-header
catalog_header_pattern = r'\.ios-catalog-header\s*\{[^}]+\}'
catalog_header_replacement = """.ios-catalog-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 40;
  padding-top: max(4px, env(safe-area-inset-top));
  padding-bottom: 12px;
  padding-left: 16px;
  padding-right: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: transparent;
  border-bottom: 0.5px solid transparent;
  transition: background-color 0.2s ease, backdrop-filter 0.2s ease, border-bottom-color 0.2s ease;
}

.ios-catalog-header.is-scrolled {
  background: var(--ios-card-bg);
  backdrop-filter: blur(var(--ios-blur));
  -webkit-backdrop-filter: blur(var(--ios-blur));
  border-bottom: 0.5px solid rgba(0, 0, 0, 0.08);
}

:root.dark .ios-catalog-header.is-scrolled {
  border-bottom: 0.5px solid rgba(255, 255, 255, 0.1);
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
}"""
content = re.sub(catalog_header_pattern, catalog_header_replacement, content, count=1)

# Remove the old :root.dark .ios-catalog-header { border-bottom: ... }
content = re.sub(r':root\.dark \.ios-catalog-header\s*\{\s*border-bottom:[^}]+\}', '', content)

# 2. Update .ev-ios-header
ev_header_pattern = r'\.ev-ios-header\s*\{[^}]+\}'
ev_header_replacement = """.ev-ios-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 40;
  padding-top: max(4px, env(safe-area-inset-top));
  padding-bottom: 12px;
  padding-left: 16px;
  padding-right: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: transparent;
  border-bottom: 0.5px solid transparent;
  transition: background-color 0.2s ease, backdrop-filter 0.2s ease, border-bottom-color 0.2s ease;
}

.ev-ios-header.is-scrolled {
  background: var(--ios-card-bg);
  backdrop-filter: blur(var(--ios-blur));
  -webkit-backdrop-filter: blur(var(--ios-blur));
  border-bottom: 0.5px solid rgba(0, 0, 0, 0.08);
}

:root.dark .ev-ios-header.is-scrolled {
  border-bottom: 0.5px solid rgba(255, 255, 255, 0.1);
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
}"""
content = re.sub(ev_header_pattern, ev_header_replacement, content, count=1)

# Remove old :root.dark .ev-ios-header
content = re.sub(r':root\.dark \.ev-ios-header\s*\{\s*border-bottom:[^}]+\}', '', content)

# 3. Update .home-ios-header to maximize real estate too
home_header_pattern = r'\.home-ios-header\s*\{[^}]+\}'
def home_header_replacer(match):
    return match.group(0).replace('max(0.75rem, env(safe-area-inset-top))', 'max(4px, env(safe-area-inset-top))')
content = re.sub(home_header_pattern, home_header_replacer, content)

with open('src/index.css', 'w') as f:
    f.write(content)

