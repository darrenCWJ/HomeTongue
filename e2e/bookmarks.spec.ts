import { test, expect } from "@playwright/test";
import { onboardToChat, gotoTabFirstVisit, typeAndTranslate } from "./helpers";

/**
 * Save Conversation flow: a translated chat saved with a title shows up on
 * the Saved page under Conversations, and the language filter scopes it
 * (a Cantonese session disappears under the Hokkien filter).
 */
test("saved conversation is listed and language-scoped", async ({ page }) => {
  await onboardToChat(page);

  // Produce one deterministic translation ("thank" -> mock output).
  await typeAndTranslate(page, "thank you");
  await expect(page.getByText("唔該晒！")).toBeVisible();

  // Save the conversation with a title.
  await page.getByRole("button", { name: "Save Conversation" }).click();
  await page.getByPlaceholder("e.g. Ordering at a restaurant").fill("Thanks chat");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Session saved!")).toBeVisible();

  // Saved page -> Conversations tab shows the session.
  await gotoTabFirstVisit(page, "Saved");
  await page.getByRole("button", { name: "Conversations" }).click();
  await expect(page.getByText("Thanks chat")).toBeVisible();

  // Language scoping: the session was Cantonese, so the Hokkien filter
  // hides it entirely.
  await page.getByRole("button", { name: /Cantonese/ }).click();
  await page.getByRole("button", { name: /Hokkien/ }).click();
  await expect(page.getByText("Thanks chat")).toBeHidden();
  await expect(page.getByText("No saved sessions")).toBeVisible();

  // Switching back restores it.
  await page.getByRole("button", { name: /Hokkien/ }).first().click();
  await page.getByRole("button", { name: /Cantonese/ }).click();
  await expect(page.getByText("Thanks chat")).toBeVisible();
});
