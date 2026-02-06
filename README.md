# GearVault

GearVault is a production-ready web app for photographers and videographers to catalog gear, plan events, and generate AI-assisted packing checklists.

## Highlights

- **Login + cloud sync** with Supabase Auth + Supabase Postgres
- **Local-first runtime** with Dexie + IndexedDB cache
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
- **Settings**: theme, currency, demo data, AI provider config, local import/export DB, cloud sync toggle + manual sync
- **Dark mode** with system/light/dark preference
- **PWA enabled**: installable app shell, manifest, and service worker offline caching

---

## Tech Stack

- React 19 + TypeScript + Vite
- React Router
- Dexie + dexie-react-hooks
- Supabase JS client
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
    useAuth.tsx
    useTheme.ts
  lib/
    supabase.ts
    aiPrompts.ts
    demoData.ts
    format.ts
    ids.ts
    pdf.ts
    search.ts
    validators.ts
  pages/
    LoginPage.tsx
    CatalogPage.tsx
    GearItemDetailPage.tsx
    EventsPage.tsx
    EventDetailPage.tsx
    AIAssistantPage.tsx
    SettingsPage.tsx
  services/
    ai.ts
    sync.ts
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

### Required Environment Variables

Create `.env.local` in project root:

```bash
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

Without these variables, the app shows a setup message and login/sync are disabled.

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

- Users authenticate with Supabase email/password.
- App data is stored locally in IndexedDB (`gearvault-db`) and synced to Supabase.
- Sync is per-user and isolated by Row Level Security policy.
- OpenAI API usage is optional and only active if selected in Settings with an API key.
- Import/Export supports complete local database backup/restore as JSON.
- PWA service worker is configured through `vite-plugin-pwa` in `vite.config.ts`.

---

## Supabase Setup (step-by-step)

1. Create a new Supabase project.
2. In **Authentication → Providers**, keep Email enabled.
3. In **SQL Editor**, run:

```sql
create table if not exists public.gearvault_user_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.gearvault_user_data enable row level security;

create policy "Users can read own data"
on public.gearvault_user_data
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert own data"
on public.gearvault_user_data
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update own data"
on public.gearvault_user_data
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
```

4. Go to **Project Settings → API** and copy:
   - Project URL → `VITE_SUPABASE_URL`
   - anon public key → `VITE_SUPABASE_ANON_KEY`
5. Add these values in `.env.local` (local) and in Vercel Environment Variables (production).

---

## Vercel Deployment

This repo is already configured for Vercel (`vercel.json`).

1. Import GitHub repo into Vercel.
2. Add env vars in Vercel Project Settings:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Deploy.

Your production URL is shown in Vercel Deployments (typically `https://<project>.vercel.app`).

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
