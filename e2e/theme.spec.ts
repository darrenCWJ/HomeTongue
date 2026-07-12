import { test, expect } from "@playwright/test";
import { onboardToChat, gotoTabFirstVisit } from "./helpers";

/** Computed body background plus the resolved --background token. */
async function readThemeColors(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.backgroundColor = "var(--background)";
    document.body.appendChild(probe);
    const tokenBackground = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return {
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      tokenBackground,
    };
  });
}

/**
 * Appearance: Dark applies the .dark class and the dark --background token
 * to the body, survives a reload (localStorage "ht_theme"), and Light
 * reverts it.
 */
test("dark theme applies, persists across reload, and reverts", async ({ page }) => {
  await onboardToChat(page);
  await gotoTabFirstVisit(page, "Profile");

  const html = page.locator("html");
  await expect(html).not.toHaveClass(/dark/);
  const light = await readThemeColors(page);

  // Switch to Dark.
  await page.getByRole("button", { name: /^dark$/i }).click();
  await expect(html).toHaveClass(/dark/);
  const dark = await readThemeColors(page);
  // Body renders the dark token, and it actually differs from light mode.
  expect(dark.bodyBackground).toBe(dark.tokenBackground);
  expect(dark.bodyBackground).not.toBe(light.bodyBackground);

  // Reload: the preference persists and is applied before first paint.
  await page.reload();
  await expect(html).toHaveClass(/dark/);
  const reloaded = await readThemeColors(page);
  expect(reloaded.bodyBackground).toBe(dark.bodyBackground);

  // Back to Light.
  await page.getByRole("button", { name: /^light$/i }).click();
  await expect(html).not.toHaveClass(/dark/);
  const reverted = await readThemeColors(page);
  expect(reverted.bodyBackground).toBe(light.bodyBackground);
});
