# HomeTongue Admin

Standalone data-labeling and oversight app for HomeTongue. Non-technical admins use it to
review consented speech samples (expected text vs. STT transcript, with audio playback),
record a verdict per sample, and watch dataset stats grow.

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
- **Stats** — total samples, reviewed count/% by verdict, correction events, and a
  per-language breakdown.

## Deploying (Vercel)

Deploy as a **second Vercel project pointing at the same repo**:

1. Vercel → *Add New Project* → import the same Git repository.
2. **Root Directory**: `admin` (Framework preset: **Vite**; defaults for build
   `pnpm build` / output `dist` are correct).
3. Set the two environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
4. Deploy. Consider keeping the URL unlisted and/or adding Vercel password protection —
   defense in depth on top of the RLS boundary.
