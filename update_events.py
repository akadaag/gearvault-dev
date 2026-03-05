import re

with open('src/pages/EventsPage.tsx', 'r') as f:
    content = f.read()

# 1. Add scroll state
if "const [scrolled, setScrolled] = useState(false);" not in content:
    imports_match = re.search(r"import \{([^}]+)\} from 'react';", content)
    if imports_match:
        imports = imports_match.group(1)
        if "UIEvent" not in imports:
            pass # React.UIEvent
    
    # insert state after URL-driven state
    state_injection = """  // ── Scroll state ───────────────────────────────────────────────────────────
  const [scrolled, setScrolled] = useState(false);
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrolled(e.currentTarget.scrollTop > 30);
  };
"""
    content = re.sub(r"(// ── URL-driven state ───────────────────────────────────────────────────────)", 
                     state_injection + r"\n  \1", content, count=1)


# 2. Replace the header section
header_old = r"""        \{\/\* ── iOS Header ─────────────────────────────────────────────── \*\/\}
        <header className="ev-ios-header">
          \{\/\* Row 1: Title \+ Toolbar pill \*\/\}
          <div className="ev-ios-header-top">
            <h1 className="ev-ios-large-title">Events<\/h1>

            \{\/\* Toolbar pill — calendar \+ add \*\/\}
            <div className="ev-ios-toolbar" role="group" aria-label="Events actions">
              <button
                className={`ev-ios-toolbar-btn\$\{showCalendar \? ' active' : ''\}`}
                onClick=\{\(\) => setParam\('calendar', showCalendar \? null : '1'\)\}
                aria-label="Toggle calendar view"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" \/>
                  <line x1="16" y1="2" x2="16" y2="6" \/>
                  <line x1="8" y1="2" x2="8" y2="6" \/>
                  <line x1="3" y1="10" x2="21" y2="10" \/>
                <\/svg>
              <\/button>
              <button
                className="ev-ios-toolbar-btn"
                onClick=\{\(\) => setParam\('add', '1'\)\}
                aria-label="Create new event"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" \/>
                  <line x1="5" y1="12" x2="19" y2="12" \/>
                <\/svg>
              <\/button>
            <\/div>
          <\/div>

          \{\/\* Event count \*\/\}
          <div className="ev-ios-item-count">
            \{sorted\.length\} event\{sorted\.length !== 1 \? 's' : ''\}
          <\/div>

          \{\/\* Row 2: Filter circle \+ scrollable filter pills \*\/\}
          <div className="ev-ios-filter-row">
            \{\/\* Fixed filter circle button \*\/\}
            <button
              className={`ev-ios-filter-circle-btn\$\{selectedEventTypes\.length > 0 \|\| clientFilter \|\| locationFilter \? ' active' : ''\}`}
              aria-label="Open event filters"
              onClick=\{\(\) => setParam\('filters', '1'\)\}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

            \{\/\* Horizontally scrollable pills \*\/\}
            <div className="ev-ios-pills-scroll" role="group" aria-label="Quick event filters">
              \{filterPills\.map\(pill => \(
                <button
                  key=\{pill\.key\}
                  className={`ev-ios-filter-pill\$\{quickFilter === pill\.key \? ' active' : ''\}`}
                  onClick=\{\(\) => toggleQuickFilter\(pill\.key\)\}
                >
                  <span className="ev-ios-pill-count">\{pill\.count\}<\/span>
                  \{pill\.label\}
                <\/button>
              \)\)\}
            <\/div>
          <\/div>
        <\/header>

        \{\/\* ── Scrollable content area ───────────────────────────────── \*\/\}
        <div className="ev-ios-content-scroll page-scroll-area">"""

header_new = """        {/* ── iOS Liquid Glass Header ─────────────────────────────────────────────── */}
        <header className="ev-ios-header">
          {/* We keep empty left space or something else if needed, but flex-justify will push toolbar to right if left is empty. We'll use a placeholder div so title is center and toolbar is right */}
          <div style={{ width: 80 }} /> 
          <h2 className="ev-ios-glass-title" style={{ opacity: scrolled ? 1 : 0 }}>
            Events
          </h2>

          <div className="ev-ios-toolbar" role="group" aria-label="Events actions">
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
        <div className="ev-ios-content-scroll page-scroll-area" onScroll={handleScroll}>
          <div className="ev-ios-scrollable-header">
            <h1 className="ev-ios-large-title" style={{ opacity: scrolled ? 0 : 1, transition: 'opacity 0.2s ease', marginBottom: 8 }}>
              Events
            </h1>

            <div className="ev-ios-item-count">
              {sorted.length} event{sorted.length !== 1 ? 's' : ''}
            </div>

            <div className="ev-ios-filter-row" style={{ marginTop: 12 }}>
              <button
                className={`ev-ios-filter-circle-btn${selectedEventTypes.length > 0 || clientFilter || locationFilter ? ' active' : ''}`}
                aria-label="Open event filters"
                onClick={() => setParam('filters', '1')}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

              <div className="ev-ios-pills-scroll" role="group" aria-label="Quick event filters">
                {filterPills.map(pill => (
                  <button
                    key={pill.key}
                    className={`ev-ios-filter-pill${quickFilter === pill.key ? ' active' : ''}`}
                    onClick={() => toggleQuickFilter(pill.key)}
                  >
                    <span className="ev-ios-pill-count">{pill.count}</span>
                    {pill.label}
                  </button>
                ))}
              </div>
            </div>
          </div>"""

content = re.sub(header_old, header_new, content)

with open('src/pages/EventsPage.tsx', 'w') as f:
    f.write(content)
print("Updated EventsPage")
