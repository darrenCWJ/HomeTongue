import { test, expect } from "@playwright/test";
import { skipTour } from "./helpers";

/**
 * Full first-run journey through the REAL gates: fake email form (cosmetic,
 * no backend in local mode) -> name -> voice picker (gender tabs) -> persona
 * -> Get Started -> chat surface with the action bar.
 */
test("first run: email gate, name, voice tabs, persona, then chat", async ({ page }) => {
  await page.goto("/");

  // Cosmetic email gate — any well-formed values pass after a fake delay.
  await page.getByPlaceholder("hello@example.com").fill("test@example.com");
  await page.getByPlaceholder("••••••••").fill("dummy-password");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();

  // Name step.
  const nameInput = page.getByPlaceholder("Enter your name");
  await expect(nameInput).toBeVisible();
  await nameInput.fill("Testy");
  await page.getByRole("button", { name: "Continue" }).click();

  // Voice step: Female tab is the default and lists the curated female
  // voices; the Male tab swaps in the male ones.
  await expect(page.getByRole("heading", { name: "Pick your voice" })).toBeVisible();
  for (const voice of ["Jamie", "Sarah", "Lucy"]) {
    await expect(page.getByRole("button", { name: voice })).toBeVisible();
  }
  await page.getByRole("button", { name: /^male$/i }).click();
  for (const voice of ["Tom", "John", "Harry"]) {
    await expect(page.getByRole("button", { name: voice })).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Jamie" })).toBeHidden();
  await page.getByRole("button", { name: "Continue" }).click();

  // Persona step.
  await expect(page.getByRole("heading", { name: "How will you use HomeTongue?" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Personal/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Work/ })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // Intro video step -> straight into the app.
  await page.getByRole("button", { name: "Get Started" }).click();

  // Chat page renders (first-visit tour dismissed) with the action bar.
  await skipTour(page);
  await expect(page.getByRole("heading", { name: "Live Translation" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Dialect", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Type", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Non-Dialect", exact: true })).toBeVisible();
});
