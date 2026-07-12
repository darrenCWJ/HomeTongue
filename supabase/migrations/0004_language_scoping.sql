-- ============================================================================
-- 0004 — language scoping for user data
--
-- Adds language_code to the three user-data tables that gained an optional
-- languageCode in src/types.ts (Phrase, Session, ConversationLesson).
--
-- Nullable, NO default — NULL means legacy yue-HK (Cantonese) data, exactly
-- mirroring the client convention where an absent languageCode always means
-- DEFAULT_LANGUAGE_CODE (see src/languages/scope.ts). New rows are stamped by
-- the client with the active pack's BCP-47 code (e.g. "yue-HK").
--
-- No index: consumers load the user's rows and scope in memory.
-- ============================================================================

alter table public.phrases
  add column if not exists language_code text;

alter table public.sessions
  add column if not exists language_code text;

alter table public.conversation_lessons
  add column if not exists language_code text;
