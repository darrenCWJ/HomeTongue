import { LocalReviewStateRepository } from "../local/ReviewStateRepository";

/**
 * LOCAL-ONLY (intentional): spaced-repetition review schedules do NOT sync to
 * Supabase yet. A real cloud implementation needs a `review_states` Postgres
 * table + RLS policies (a new migration under supabase/migrations/), which is
 * out of scope for this change.
 *
 * Until that migration exists, cloud mode transparently reuses the local
 * Dexie-backed store, so "Practice my phrases" keeps working in cloud mode —
 * schedules are simply per-device. This class imports nothing from
 * lib/supabase.ts, so the local-mode bundle-gating invariant is unaffected.
 */
export class CloudReviewStateRepository extends LocalReviewStateRepository {}
