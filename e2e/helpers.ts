import { expect, type Page } from "@playwright/test";

/**
 * Shared E2E helpers.
 *
 * Onboarding strategy: every spec drives the REAL onboarding flow through the
 * UI (guest gate -> name -> voice -> persona -> intro video) instead of
 * seeding localStorage/IndexedDB. Rationale: the user profile lives in Dexie
 * (DB "hometongue", schema-versioned), so hand-seeding rows would couple the
 * suite to the schema version and silently rot on the next migration. The UI
 * path exercises the app's own persistence and stays valid across schema
 * bumps. The cosmetic gates are fast: "Continue as Guest" bypasses the fake
 * 1.2s sign-in delay entirely.
 *
 * Tours: each page's feature tour auto-starts ~600ms after the first visit
 * (useTourAutoTrigger). Helpers deterministically wait for the tour dialog
 * and dismiss it via its Skip button.
 */

/** Fixed outputs of the offline mock translator (translateWithMock). */
export const MOCK_HELLO = {
  casualText: "喂，你好呀！",
  casualPronunciation: "wai3, nei5 hou2 aa3!",
  formalText: "您好！",
  predictedReply: "你好！你係邊位？",
} as const;

/** Dismiss the page tour that auto-starts on a page's first visit. */
export async function skipTour(page: Page): Promise<void> {
  const tour = page.getByRole("dialog", { name: "Feature tour" });
  // The tour arms itself 600ms after mount; give slow CI some headroom.
  await expect(tour).toBeVisible({ timeout: 15_000 });
  await tour.getByRole("button", { name: "Skip" }).click();
  await expect(tour).toBeHidden();
}

/**
 * Drive the full first-run flow up to (but not including) the chat tour:
 * guest email gate -> name -> voice -> persona -> intro video.
 */
export async function completeOnboarding(page: Page, name = "Testy"): Promise<void> {
  await page.goto("/");
  // Local-mode AuthPage is a cosmetic no-backend form; guest entry skips
  // the artificial submit delay.
  await page.getByRole("button", { name: "Continue as Guest" }).click();

  // Step 1: name.
  await page.getByPlaceholder("Enter your name").fill(name);
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 2: voice (Cantonese pack always has display voices).
  await expect(page.getByRole("heading", { name: "Pick your voice" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 3: persona.
  await expect(page.getByRole("heading", { name: "How will you use HomeTongue?" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 4: intro video — skip straight through.
  await page.getByRole("button", { name: "Get Started" }).click();
}

/** Onboard, land on the chat page, and dismiss the chat tour. */
export async function onboardToChat(page: Page, name = "Testy"): Promise<void> {
  await completeOnboarding(page, name);
  await skipTour(page);
  await expect(page.getByRole("button", { name: "Type", exact: true })).toBeVisible();
}

/**
 * Navigate to a bottom-nav tab and dismiss that page's first-visit tour.
 * Only use for a page's FIRST visit in a test (tours run once per page).
 */
export async function gotoTabFirstVisit(
  page: Page,
  tab: "Chat" | "Learn" | "Saved" | "Profile"
): Promise<void> {
  await page.getByRole("link", { name: tab }).click();
  await skipTour(page);
}

/**
 * Type an English phrase via the Type overlay and submit it for translation.
 * With the keyless server, translation resolves through the deterministic
 * offline mock.
 */
export async function typeAndTranslate(page: Page, english: string): Promise<void> {
  await page.getByRole("button", { name: "Type", exact: true }).click();
  const input = page.getByPlaceholder("e.g. Nice to meet you!");
  await input.fill(english);
  await input.press("Enter");
}
