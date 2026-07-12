# HomeTongue Admin

Standalone data-labeling and oversight app for HomeTongue. Non-technical admins use it to
review consented speech samples (expected text vs. STT transcript, with audio playback),
record a verdict per sample, publish lesson content from a spreadsheet without a deploy,
and watch product usage on the analytics dashboard.

It is deliberately a **separate Vite app** in `admin/` — not part of the main bundle — so
admin-only code never ships to end users. It talks directly to the **same Supabase project**
as the main app.

## Security model

- The Supabase **anon key is public by design**; it ships in any client bundle.
- The real boundary is server-side: Postgres **RLS** plus the `public.is_admin()` check
  against `profiles.is_admin` (added by `supabase/migrations/0005_admin_review.sql`).
- Admins can read `speech_samples` / `corrections`, read the private `recordings` storage
  bucket (playback via short-lived signed URLs), and write one review per sample into
  `sample_reviews` (upsert on `sample_id`).
- Admins can also write `lesson_content` (added by `supabase/migrations/0008_lesson_content.sql`);
  regular authenticated users can only read rows where `published = true`, and there is no
  delete — unpublishing just flips the flag.
- The app itself only *hides* UI from non-admins; a non-admin account hitting the API
  gets empty results / permission errors from RLS either way.

## Setup

```bash
cd admin
pnpm install --ignore-workspace  # REQUIRED flag: keeps the install out of the root pnpm workspace
cp .env.example .env             # then fill in the two values (same as the root .env)
pnpm dev
```

| Script           | What it does                |
| ---------------- | --------------------------- |
| `pnpm dev`       | dev server                  |
| `pnpm build`     | production build to `dist/` |
| `pnpm typecheck` | `tsc --noEmit` (strict)     |
| `pnpm preview`   | serve the production build  |

Environment variables (see `.env.example`):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

If they are unset, the app shows a configuration screen instead of crashing.

## Creating an admin account

There is **no sign-up UI** — admin accounts are created by the project owner:

1. **Create the auth user** in the Supabase dashboard: *Authentication → Users → Add user*
   (email + password; mark the email as confirmed).
2. **Make sure a `profiles` row exists** for that user. It is created automatically the
   first time the account signs in to the **main** HomeTongue app (cloud mode). If the
   account will only ever use the admin app, insert one manually in the SQL editor:

   ```sql
   insert into public.profiles (user_id) values ('<auth-user-uuid>')
   on conflict (user_id) do nothing;
   ```

3. **Grant admin** in the SQL editor:

   ```sql
   update public.profiles set is_admin = true where user_id = '<auth-user-uuid>';
   ```

Then sign in at the admin app with that email + password.

## Pages

- **Review queue** — newest-first list of `speech_samples` without a `sample_reviews` row.
  Each card shows expected text vs. transcript (mismatches highlighted), score, date, and an
  audio player when a recording was retained (signed URL, valid 5 minutes). Verdicts:
  - **Verified** — transcript is what was said.
  - **Corrected** — opens a textarea prefilled with the transcript; requires an actual edit.
  - **Rejected** — unusable sample; optional notes.

  Submitting upserts into `sample_reviews` and removes the card ("reviewed this session"
  counter). A toggle shows the already-reviewed list read-only.
- **Content** — lesson content publishing (**requires `supabase/migrations/0008`**). Upload a
  lesson CSV, validate it in the browser, and publish per language into `lesson_content` —
  live for cloud-mode app users on their next app load, no code change or deploy. See the
  workflow below.
- **Dashboard** — product analytics for the owner, backed by the `admin_dashboard_stats`
  RPC (**requires `supabase/migrations/0007`**) plus the review-pipeline queries:
  - **Overview** — total/new/active users, consent rates, users by dialect.
  - **Content by language** — phrases, sessions, conversation lessons, and speech
    samples per language pack.
  - **Activity** — daily new users / sessions / speech samples over a selectable
    7/30/90-day window.
  - **Engagement** — phrases (total/bookmarked), sessions, lessons started vs.
    completed, SRS activity, exam attempts and average score.
  - **Improvement signals** — hardest lessons (low average accuracy flagged), speech
    recognition quality per language, transcript edits, suggestion ratings.
  - **Speech review pipeline** — total samples, reviewed count/% by verdict,
    correction events, per-language breakdown (the former Stats page).

  Everything is **aggregate-only by design** — the RPC returns counts and averages, so
  admins never see conversation content. Stats cover cloud-mode signed-in users only;
  local-mode (IndexedDB) usage never reaches Supabase.

## Content publishing workflow

The Content page turns the offline lesson pipeline (`docs/LESSON_AUTHORING.md`) into an
instant-publish loop. It **requires `supabase/migrations/0008_lesson_content.sql`** to be
applied.

1. **Author in Google Sheets.** Content authors edit the lesson sheet exactly as described
   in `docs/LESSON_AUTHORING.md` (start from `docs/templates/lessons-template.csv` or a
   `pnpm lessons:export <language>` export).
2. **Download as CSV.** File > Download > Comma Separated Values (.csv).
3. **Upload on the Content page.** The file is parsed and validated **in the browser**
   using the same pure core as the CLI (`scripts/lib/lessonCsv.mjs`, imported via the
   `@lesson-csv` Vite alias — see `vite.config.ts` and `src/lib/lesson-csv.d.ts`). The page
   shows the same summary the CLI dry run prints: per-language category/lesson/level/word
   counts, warnings, and errors with the row numbers you see in Sheets. **Errors block
   publishing** — fix the sheet and re-upload.
4. **Publish per language.** Each valid language gets a Publish button that upserts
   `{ language_code, content, published: true, updated_by }` into `lesson_content`. The
   `content` jsonb is the registry shape `{ categories, lessons }` — exactly what
   `rowsToContent` produces and what `src/data/lessons/<code>/index.ts` exports statically.
5. **Unpublish / republish.** The page lists every stored row (language, lesson/level
   counts, `updated_at`, published flag). Unpublishing flips `published = false`; there is
   no delete, so content can always be republished.

Reach: published content is served to **cloud-mode** app users on their next app load.
Local-mode users (no Supabase account) keep the built-in static lessons — the main app's
database read side ships separately from this admin surface. The static modules also remain
the fallback for languages with no published row.

## Deploying (Vercel)

Deploy as a **second Vercel project pointing at the same repo**:

1. Vercel → *Add New Project* → import the same Git repository.
2. **Root Directory**: `admin` (Framework preset: **Vite**; defaults for build
   `pnpm build` / output `dist` are correct). Keep *"Include source files outside of the
   Root Directory in the Build Step"* **enabled** (the default) — the Content page bundles
   the shared CSV core from `../scripts/lib` and `../api/_lib` at build time.
3. Set the two environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
4. Deploy. Consider keeping the URL unlisted and/or adding Vercel password protection —
   defense in depth on top of the RLS boundary.
