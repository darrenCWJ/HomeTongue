import { test, expect } from "@playwright/test";
import { onboardToChat } from "./helpers";

/**
 * Dialect sheet: availability gating (Hokkien experimental/text-only,
 * Hakka/Teochew coming soon) and the voice-less chat surface after
 * switching to Hokkien.
 */
test("dialect sheet gates availability and Hokkien hides voice input", async ({ page }) => {
  await onboardToChat(page);

  // Open the dialect sheet from the chat header.
  await page.getByRole("button", { name: "Cantonese" }).click();
  await expect(page.getByRole("heading", { name: "Select Dialect" })).toBeVisible();

  // Hokkien is selectable but text-only; Hakka/Teochew are locked.
  const hokkienOption = page.getByRole("button", { name: /Hokkien/ });
  await expect(hokkienOption).toContainText("Experimental — text only");
  const hakka = page.getByRole("button", { name: /Hakka/ });
  const teochew = page.getByRole("button", { name: /Teochew/ });
  await expect(hakka).toContainText("Coming soon");
  await expect(hakka).toBeDisabled();
  await expect(teochew).toContainText("Coming soon");
  await expect(teochew).toBeDisabled();

  // Select Hokkien: header updates, the Dialect mic disappears and the
  // "coming soon" pill explains why. (English mic + Type stay available;
  // "Non-Dialect"/"Type" don't match the exact "Dialect" name.)
  await hokkienOption.click();
  await expect(page.getByRole("heading", { name: "Select Dialect" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Hokkien" })).toBeVisible();
  await expect(page.getByText("Voice input coming soon for Hokkien")).toBeVisible();
  await expect(page.getByRole("button", { name: "Dialect", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Non-Dialect", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Type", exact: true })).toBeVisible();

  // Switch back to Cantonese: the Dialect mic returns. (Wait for the sheet's
  // exit animation to finish before matching header buttons — sheet options
  // share accessible-name substrings with the header selector.)
  await page.getByRole("button", { name: "Hokkien" }).click();
  await page.getByRole("button", { name: /Cantonese/ }).click();
  await expect(page.getByRole("heading", { name: "Select Dialect" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Cantonese" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Dialect", exact: true })).toBeVisible();
  await expect(page.getByText("Voice input coming soon for Hokkien")).toBeHidden();
});
