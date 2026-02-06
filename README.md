# GearVault

GearVault is a production-ready, local-first web app for photographers and videographers to catalog gear, plan events, and generate AI-assisted packing checklists.

## Highlights

- **Local-first by default** (Dexie + IndexedDB, no login required)
- **4 main tabs**: Catalog, Events, AI Pack Assistant, Settings
- **Strong typed models** for catalog, categories, events, checklist items, missing-item suggestions
- **Catalog management**: CRUD, search/filter/sort, category CRUD/reorder/collapse, item detail, maintenance, warranty, related items
- **Events management**: manual create, list/detail, checklist tracking, packed progress, reset, reorder, missing-item status
- **Calendar views**: month and week (offline)
- **AI packing assistant**:
  - 1–3 follow-up questions
  - uses only local catalog + event input (+ local feedback patterns)
  - mock offline provider + optional OpenAI provider via local API key
  - creates event + checklist + missing recommendations
- **Export**: event to PDF + JSON + print
- **Settings**: theme, currency, demo data, AI provider config, local import/export DB, sync placeholder toggle
- **Dark mode** with system/light/dark preference
- **PWA enabled**: installable app shell, manifest, and service worker offline caching

---

## Tech Stack

- React 19 + TypeScript + Vite
- React Router
- Dexie + dexie-react-hooks
- Zod validation
- jsPDF (PDF export)

---

## Project Structure

```txt
src/
  components/
    ErrorBoundary.tsx
    TabLayout.tsx
  constants/
    defaultCategories.ts
  hooks/
    useTheme.ts
  lib/
    aiPrompts.ts
    demoData.ts
    format.ts
    ids.ts
    pdf.ts
    search.ts
    validators.ts
  pages/
    CatalogPage.tsx
    GearItemDetailPage.tsx
    EventsPage.tsx
    EventDetailPage.tsx
    AIAssistantPage.tsx
    SettingsPage.tsx
  services/
    ai.ts
  types/
    models.ts
  db.ts
  App.tsx
  main.tsx
```

Prompt templates and schema documentation are in `docs/ai-prompts.md`.

---

## Run Locally

From `/Users/daniele/Documents/gearvault-dev`:

```bash
npm install
npm run dev
```

Open the local URL shown by Vite (typically `http://localhost:5173`).

### Install as App (PWA)

- In a supported browser, open GearVault and use the **Install App** button in the top bar.
- Once installed, GearVault can launch in standalone mode and continue working offline with cached assets + local IndexedDB data.

### Production Build

```bash
npm run build
npm run preview
```

---

## Offline & Data Notes

- All app data is stored in IndexedDB (`gearvault-db`) on-device.
- No auth is required for the MVP.
- OpenAI API usage is optional and only active if selected in Settings with an API key.
- Import/Export supports complete local database backup/restore as JSON.
- PWA service worker is configured through `vite-plugin-pwa` in `vite.config.ts`.

---

## AI Prompt/Output Contract

See:

- `src/lib/aiPrompts.ts` for:
  - system prompt
  - follow-up prompt template
  - user prompt template
  - JSON schema (Zod + JSON schema object)
  - example catalog input + example output
- `docs/ai-prompts.md` for readable documentation
