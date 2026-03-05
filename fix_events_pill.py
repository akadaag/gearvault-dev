import re

with open('src/pages/EventsPage.tsx', 'r') as f:
    content = f.read()

# Replace the large title with the pill style
old_title = """            <h1 className="ev-ios-large-title" style={{ opacity: scrolled ? 0 : 1, transition: 'opacity 0.2s ease', marginBottom: 8 }}>
              Events
            </h1>"""

new_title = """            <div className="ios-title-pill-container" style={{ opacity: scrolled ? 0 : 1, transition: 'opacity 0.2s ease', pointerEvents: scrolled ? 'none' : 'auto' }}>
              <div className="ios-title-pill">
                <span>Events</span>
              </div>
            </div>"""

content = content.replace(old_title, new_title)

# Also fix the item count margin so it doesn't look weird without the h1's bottom margin
content = content.replace('<div className="ev-ios-item-count">', '<div className="ev-ios-item-count" style={{ marginTop: "-4px" }}>')

with open('src/pages/EventsPage.tsx', 'w') as f:
    f.write(content)

