import re

with open('src/pages/EventsPage.tsx', 'r') as f:
    content = f.read()

# Add UIEvent import if missing
if 'import type { UIEvent }' not in content:
    content = content.replace("import { useMemo, useEffect, useState} from 'react';", "import { useMemo, useEffect, useState} from 'react';\nimport type { UIEvent } from 'react';")

# Add scrolled state
state_search = r"  const \[showCalendar, setShowCalendar\] = useState\(false\);"
# Actually, looking at EventsPage, searchParams is used for calendar
# Let's find a good place to insert it.
state_code = """
  // ── Scroll state ───────────────────────────────────────────────────────────
  const [scrolled, setScrolled] = useState(false);
  const handleScroll = (e: UIEvent<HTMLDivElement>) => {
    setScrolled(e.currentTarget.scrollTop > 10);
  };
"""
# insert before "const sorted = useMemo"
content = re.sub(r"(  const sorted = useMemo\(\(\) => \{)", state_code + r"\1", content)


# Update header section
header_pattern = r'<header className="ev-ios-header">.*?</header>'
header_replacement = """<header className={`ev-ios-header${scrolled ? ' is-scrolled' : ''}`}>
          {/* Left: large title + count — both fade out on scroll */}
          <div
            className="ev-ios-header-left"
            style={{ opacity: scrolled ? 0 : 1, transition: 'opacity 0.2s ease', pointerEvents: 'none' }}
          >
            <h1 className="ev-ios-large-title" style={{ margin: 0, fontSize: '32px', lineHeight: 1.2 }}>Events</h1>
            <p className="ev-ios-item-count" style={{ margin: 0 }}>{sorted.length} event{sorted.length !== 1 ? 's' : ''}</p>
          </div>

          {/* Center title — fades in on scroll */}
          <h2
            className="ev-ios-glass-title"
            style={{ opacity: scrolled ? 1 : 0, pointerEvents: 'none' }}
          >
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
        </header>"""

content = re.sub(header_pattern, header_replacement, content, flags=re.DOTALL)


# Update scroll area
scroll_pattern = r'<div className="ev-ios-content-scroll page-scroll-area">\s*<div className="ev-ios-header-title-area">\s*<h1 className="ev-ios-large-title">Events</h1>\s*<p className="ev-ios-item-count">\{sorted\.length\} event\{sorted\.length !== 1 \? \'s\' : \'\'\}</p>\s*</div>'
scroll_replacement = """<div className="ev-ios-content-scroll page-scroll-area" onScroll={handleScroll}>
          <div style={{ height: 'calc(env(safe-area-inset-top) + 68px)' }} />"""

content = re.sub(scroll_pattern, scroll_replacement, content)

with open('src/pages/EventsPage.tsx', 'w') as f:
    f.write(content)

