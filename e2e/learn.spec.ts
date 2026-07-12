import { test, expect } from "@playwright/test";
import { onboardToChat, gotoTabFirstVisit } from "./helpers";

const CANTONESE_CATEGORIES = ["Greetings & Basics", "Ordering Food", "Getting Around", "Street Slang"];

/**
 * Learn page: Cantonese curriculum by default, and the language filter swaps
 * the entire surface to the Hokkien curriculum.
 */
test("learn page is scoped to the selected language", async ({ page }) => {
  await onboardToChat(page);
  await gotoTabFirstVisit(page, "Learn");

  // Cantonese: all four standard-lesson categories plus SRS practice and
  // the roleplay trainer entry.
  for (const category of CANTONESE_CATEGORIES) {
    await expect(page.getByText(category, { exact: true })).toBeVisible();
  }
  await expect(page.getByText("Practice my phrases")).toBeVisible();
  await expect(page.getByText("Rehearse a conversation")).toBeVisible();

  // Switch the language filter to Hokkien.
  await page.getByRole("button", { name: /Cantonese/ }).click();
  await page.getByRole("button", { name: /Hokkien/ }).click();

  // Hokkien curriculum replaces the Cantonese one.
  await expect(page.getByText("Hokkien Basics", { exact: true })).toBeVisible();
  for (const category of CANTONESE_CATEGORIES) {
    await expect(page.getByText(category, { exact: true })).toBeHidden();
  }
  // Cross-language features stay available: SRS practice, and the roleplay
  // card (the nan-TW pack registers its own scenarios in
  // src/languages/roleplayRegistry.ts).
  await expect(page.getByText("Practice my phrases")).toBeVisible();
  await expect(page.getByText("Rehearse a conversation")).toBeVisible();

  // And back: Cantonese categories return.
  await page.getByRole("button", { name: /Hokkien/ }).first().click();
  await page.getByRole("button", { name: /Cantonese/ }).click();
  await expect(page.getByText("Ordering Food", { exact: true })).toBeVisible();
  await expect(page.getByText("Hokkien Basics", { exact: true })).toBeHidden();
});
