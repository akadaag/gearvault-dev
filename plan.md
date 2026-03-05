We need to create the following structure for EventsPage and CatalogPage:
1. `ios-glass-header` (sticky, top: 0, z-index: 40)
   - glassmorphic background (e.g. `background: rgba(249,249,249,0.85); backdrop-filter: blur(20px); border-bottom: 0.5px solid rgba(0,0,0,0.1);`)
   - `ios-glass-header-content`: flex, space-between.
   - center title: `opacity: 0; transition: opacity 0.2s` (becomes 1 when scrolled)
   - right toolbar pill: gap 8px.
2. `page-scroll-area`
   - top section containing large `<h1>` (Events/Catalog) and item count, filters.
   - as it scrolls down, we listen to `onScroll` and calculate opacity for the large title and small title.
