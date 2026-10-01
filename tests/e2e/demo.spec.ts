import { expect, test } from "@playwright/test";

test("opens demo manuscript and views word counts", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Writing progress for Notion")).toBeVisible();
  await page.getByRole("button", { name: /inspect manuscript/i }).click();
  await expect(page.getByText("Chapter 1: The Lantern Room")).toBeVisible();
  await page.getByRole("button", { name: /sync now/i }).click();
  await expect(page.getByRole("heading", { name: "Demo Manuscript" })).toBeVisible();
  await expect(page.getByText("net words today")).toBeVisible();
});
