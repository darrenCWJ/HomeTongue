# HomeTongue Privacy Policy

**Last updated: 13 July 2026**

HomeTongue is an app for learning to speak your family's dialect. This policy explains what data the app handles, where it goes, and what control you have. It is written to match what the app actually does — nothing more.

A hosted copy of this policy lives at <https://home-tongue.vercel.app/privacy.html>. Questions or requests: **deathdarren@gmail.com**.

## The short version

- By default, your data stays **on your device**. There are no accounts and we store nothing about you on our servers.
- AI features (translation, speech-to-text, text-to-speech) send the text or audio you submit through our server to OpenAI and Google Cloud for processing.
- If cloud accounts are enabled and you sign up, your learning data syncs to our database, tied to your email.
- Speech data is collected for model training **only** if you switch on the consent toggles in Profile → Data & privacy. Both are **off by default**.
- No ads. No sale of data. No cross-app tracking.

## Local mode (the default)

Without an account, everything you create — your profile name, personas, saved phrases, chat sessions, lesson progress, and review schedules — is stored only in your browser's or the app's local storage (IndexedDB) on your device. We cannot see it. Deleting the app or clearing site data removes it permanently.

## AI features (both modes)

When you use translation, reply suggestions, speaking exams, or listening features, the app sends the necessary content through our own server functions (hosted on Vercel) to:

- **OpenAI** — the text you type or translate, chat context for suggestions, and recordings you make for transcription and pronunciation scoring.
- **Google Cloud** — the text to be spoken aloud (text-to-speech).

Our servers hold the API keys and pass your content through; they do not keep copies of it. These providers process the content under their API terms to return a result; we do not use it for advertising and we do not send them your identity.

## Cloud mode (optional accounts)

If the deployment you use has accounts enabled and you sign up:

- **What we store**: your account email and the learning data you create — saved phrases, chat sessions and messages, conversation lessons, lesson progress and accuracy, spaced-repetition review schedules, persona and profile settings.
- **Where**: a Postgres database hosted by Supabase. Every row is tied to your account, and database row-level security ensures only you can read or write your data.
- **Importing local data**: you can choose to copy this device's local data to your account. It is a one-way copy that you trigger yourself.

## Optional speech-data collection (consent-gated)

In Profile → Data & privacy there are two toggles, both **off by default**. They only exist in cloud mode.

1. **"Help improve dialect recognition"** — if on, your practice phrases, transcripts, corrections, and scores may be stored to train better dialect models.
2. **"Also keep my recordings"** — available only if the first is on. If on, the actual recordings from speaking exams may also be kept, in a private storage bucket.

If you consent, trained human reviewers may review this data (including recordings, if you consented to those) to correct transcriptions and improve the models. Consent enforcement is layered: the app never uploads without the flag, and the database independently rejects writes for non-consented accounts.

Turning a toggle off stops future collection, and withdrawing consent deletes the data already collected under it. When this data is exported for model training, account identifiers are replaced with salted hashes so exported samples are not tied to your identity.

## Analytics

The **website** uses Vercel Web Analytics: cookieless, aggregated page-view counts. It does not use cookies, does not build profiles, and does not track you across sites. The **mobile apps do not run any analytics**.

## What we don't do

- No advertising and no ad SDKs.
- No sale or rental of personal data — to anyone, ever.
- No tracking across other apps or websites.
- No collection of contacts, location, photos, or anything outside what is described above.

## Data retention and deletion

- **Local mode**: your data lives and dies with your device — uninstall the app or clear site data to erase it.
- **Cloud mode**: your data is kept while your account exists. To delete your account and all associated data, email **deathdarren@gmail.com** from your account address. Deletion removes every row tied to your account, including any consented speech data.
- **Consented speech data**: also deleted, independently of the account, when you withdraw consent in the app.

## Children

HomeTongue is not directed at children under 13, and we do not knowingly collect personal data from them.

## Changes to this policy

If the app's behavior changes in a way that affects your data, this policy will be updated and the "Last updated" date revised. The current version is always at <https://home-tongue.vercel.app/privacy.html>.

## Contact

**deathdarren@gmail.com**
