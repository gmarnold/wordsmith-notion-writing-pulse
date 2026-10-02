import { expect, test } from "@playwright/test";

test("opens demo manuscript and views word counts", async ({ page }) => {
  page.on("pageerror", (error) => console.error("Browser error:", error.message));
  await page.goto("/");
  await expect(page.getByText("Writing progress for Notion")).toBeVisible();
  await page.getByRole("button", { name: /inspect manuscript/i }).click();
  await expect(page.getByText("Chapter 1: The Lantern Room")).toBeVisible();
  await page.getByRole("button", { name: /sync now/i }).click();
  await expect(page.getByRole("heading", { name: "Demo Manuscript" })).toBeVisible();
  await expect(page.getByText("net words today")).toBeVisible();
});

test("configures goals, simulates automatic sync and previews a narrow revocable embed", async ({
  page,
}) => {
  const inspection = await (
    await page.request.post("/api/manuscripts/inspect", { data: { notionUrlOrId: "demo" } })
  ).json();
  const m = await (
    await page.request.post("/api/manuscripts", {
      data: { ...inspection, name: "Embed demo", notionRootType: "database" },
    })
  ).json();
  await page.request.post(`/api/manuscripts/${m.id}/sync`);
  await page.goto("/");
  await page
    .locator(".savedManuscript")
    .filter({ hasText: "Embed demo" })
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await page.getByLabel("Writer timezone").fill("America/Chicago");
  await page.getByLabel("daily goal", { exact: true }).fill("500");
  await page.getByRole("combobox", { name: "Word Count (Number)", exact: true }).selectOption("wc");
  await page.getByRole("button", { name: "Save settings", exact: true }).click();
  await expect(page.getByText(/Settings saved/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Inspect manuscript" })).toHaveCount(0);
  await page
    .locator(".savedManuscript")
    .filter({ hasText: "Embed demo" })
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await expect(page.getByLabel("daily goal", { exact: true })).toHaveValue("500");
  const edited = page.waitForResponse(
    (response) => response.url().includes("/api/demo/") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Simulate scene edit", exact: true }).click();
  expect((await (await edited).json()).status).toBe("queued");
  await expect
    .poll(
      async () =>
        (await (await page.request.get(`/api/manuscripts/${m.id}/stats`)).json()).netWordsToday,
      { timeout: 10000 },
    )
    .toBe(100);
  await expect(
    page.locator(".stat").filter({ hasText: "net words today" }).locator("strong"),
  ).toHaveText("+100", { timeout: 20000 });
  await page.getByRole("button", { name: "Create embed link", exact: true }).click();
  const url = await page.getByLabel("Embed URL").inputValue();
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(url);
  await expect(page.getByRole("heading", { name: "Embed demo" })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Today goal progress" })).toHaveAttribute(
    "value",
    "100",
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: "test-results/embed-narrow.png", fullPage: true });
  await page.request.delete(`/api/manuscripts/${m.id}/embed`);
  await page.reload();
  await expect(page.getByText("Embed unavailable")).toBeVisible();
});
