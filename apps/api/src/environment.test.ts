import { describe, expect, it } from "vitest";
import { parseConfig } from "./environment.js";
import { createDb } from "./db/client.js";

const production = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://fixture:fixture@localhost/fixture",
  NOTION_TOKEN: "fixture-only-notion-token",
  PUBLIC_ORIGIN: "https://wordsmith.example",
  ADMIN_PASSWORD_HASH: "scrypt$" + "a".repeat(22) + "$" + "a".repeat(86),
  SESSION_SECRET: "fixture-only-session-secret-of-at-least-32-characters",
  NOTION_WEBHOOK_VERIFICATION_TOKEN: "fixture-verification-token",
};
describe("production configuration", () => {
  it("requires production secrets and gives actionable names without values", () => {
    for (const name of [
      "DATABASE_URL",
      "NOTION_TOKEN",
      "PUBLIC_ORIGIN",
      "ADMIN_PASSWORD_HASH",
      "SESSION_SECRET",
      "NOTION_WEBHOOK_VERIFICATION_TOKEN",
    ]) {
      const env = { ...production, [name]: undefined };
      expect(() => parseConfig(env)).toThrow(name);
    }
    try {
      parseConfig({ ...production, DATABASE_URL: "private-value-not-a-url" });
    } catch (e) {
      expect(String(e)).not.toContain("private-value-not-a-url");
    }
  });
  it("rejects fixture mode, insecure origins, malformed hashes and weak session secrets", () => {
    expect(() => parseConfig({ ...production, WORDSMITH_DEMO_MODE: "true" })).toThrow(
      "fixture/demo",
    );
    expect(() => parseConfig({ ...production, PUBLIC_ORIGIN: "http://wordsmith.example" })).toThrow(
      "HTTPS",
    );
    expect(() =>
      parseConfig({ ...production, PUBLIC_ORIGIN: "https://wordsmith.example/path" }),
    ).toThrow("origin");
    expect(() => parseConfig({ ...production, ADMIN_PASSWORD_HASH: "plaintext" })).toThrow(
      "admin:credentials",
    );
    expect(() => parseConfig({ ...production, SESSION_SECRET: "short" })).toThrow("32");
  });
  it("supports only explicit initial webhook setup and provider origin configuration", () => {
    expect(
      parseConfig({
        ...production,
        PUBLIC_ORIGIN: undefined,
        RENDER_EXTERNAL_URL: "https://fixture.onrender.com",
      }).PUBLIC_ORIGIN,
    ).toBe("https://fixture.onrender.com");
    expect(
      parseConfig({
        ...production,
        NOTION_WEBHOOK_VERIFICATION_TOKEN: undefined,
        NOTION_WEBHOOK_SETUP: "true",
      }).NOTION_WEBHOOK_SETUP,
    ).toBe(true);
    expect(() => parseConfig({ ...production, NOTION_WEBHOOK_SETUP: "true" })).toThrow("disable");
  });
  it("keeps local/test defaults and isolates demo from credentials and PostgreSQL", () => {
    expect(parseConfig({ NODE_ENV: "test" }).API_PORT).toBe(4141);
    expect(
      createDb(
        parseConfig({
          WORDSMITH_DEMO_MODE: "true",
          DATABASE_URL: production.DATABASE_URL,
          NOTION_TOKEN: production.NOTION_TOKEN,
        }),
      ),
    ).toBeNull();
  });
});
