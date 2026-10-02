import { expect, test } from "@playwright/test";

test("hosted login keeps the saved dashboard behind authentication and clears it on logout", async ({
  page,
}) => {
  page.on("pageerror", (error) => console.error("Browser error:", error.message));
  let authenticated = false;
  const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown;
    let status = 200;
    if (path === "/api/auth/session") body = { required: true, authenticated };
    else if (path === "/api/auth/login") {
      authenticated = route.request().postDataJSON().password === "fixture-browser-password";
      status = authenticated ? 200 : 401;
      body = authenticated ? { authenticated } : { error: { message: "Incorrect password." } };
    } else if (path === "/api/auth/logout") {
      authenticated = false;
      body = { authenticated };
    } else if (!authenticated) {
      status = 401;
      body = { error: { message: "Sign in to Wordsmith." } };
    } else if (path === "/api/manuscripts")
      body = [{ id, name: "Saved hosted novel", sources: [] }];
    else if (path === "/api/notion/status") body = { mode: "notion", reachable: true };
    else if (path.endsWith("/stats"))
      body = {
        manuscriptName: "Saved hosted novel",
        totalWords: 1100,
        netWordsToday: 100,
        netChangeThisWeek: 100,
        netChangeThisMonth: 100,
        chapters: [],
        recentSyncs: [],
        lastSyncedAt: null,
        timezone: "America/Chicago",
      };
    else body = {};
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sign in to Wordsmith" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Saved hosted novel" })).toHaveCount(0);
  await page.getByLabel("Admin password").fill("wrong");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Incorrect password.")).toBeVisible();
  await page.getByLabel("Admin password").fill("fixture-browser-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Saved hosted novel" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Inspect manuscript" })).toHaveCount(0);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in to Wordsmith" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Saved hosted novel" })).toHaveCount(0);
});
