import { test, expect } from "@playwright/test";
import { onboardToChat, typeAndTranslate, MOCK_HELLO } from "./helpers";

/**
 * Core chat flow: typing English produces the deterministic offline mock
 * translation (keyless server -> /api/chat 503 -> translateWithMock), with
 * register chips and the predicted-reply hint.
 */
test("typing 'hello' renders the mock Cantonese translation", async ({ page }) => {
  await onboardToChat(page);

  await typeAndTranslate(page, "hello");

  // Outgoing bubble: original English + casual-register mock output
  // (default tone is casual).
  await expect(page.getByText("hello", { exact: true })).toBeVisible();
  await expect(page.getByText(MOCK_HELLO.casualText)).toBeVisible();
  await expect(page.getByText(MOCK_HELLO.casualPronunciation)).toBeVisible();

  // Register chips on the translated bubble.
  for (const register of ["Formal", "Casual", "Slang"]) {
    await expect(page.getByRole("button", { name: register, exact: true })).toBeVisible();
  }

  // Switching register swaps the displayed variant deterministically.
  await page.getByRole("button", { name: "Formal", exact: true }).click();
  await expect(page.getByText(MOCK_HELLO.formalText)).toBeVisible();

  // Predicted-reply hint from the mock translator.
  await expect(page.getByText("They might reply:")).toBeVisible();
  await expect(page.getByText(MOCK_HELLO.predictedReply)).toBeVisible();
});
