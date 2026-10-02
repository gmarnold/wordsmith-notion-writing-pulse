import { z } from "zod";
const boolean = z.preprocess(
  (v) =>
    typeof v === "string"
      ? ({
          true: true,
          false: false,
          "1": true,
          "0": false,
          "": false,
          yes: true,
          no: false,
          on: true,
          off: false,
        }[v.toLowerCase()] ?? v)
      : v,
  z.boolean(),
);
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(10000),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4141),
  PUBLIC_PORT: z.coerce.number().int().min(1).max(65535).default(4142),
  DATABASE_URL: z.string().url().optional(),
  NOTION_TOKEN: z.string().optional(),
  NOTION_WEBHOOK_VERIFICATION_TOKEN: z.string().optional(),
  NOTION_WEBHOOK_SETUP: boolean.default(false),
  WORDSMITH_DEMO_MODE: boolean.default(false),
  PUBLIC_ORIGIN: z.string().url().optional(),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  ADMIN_PASSWORD_HASH: z.string().optional(),
  SESSION_SECRET: z.string().optional(),
});
export type AppConfig = z.infer<typeof schema>;
export function parseConfig(env: Record<string, unknown>): AppConfig {
  const parsed = schema.safeParse({
    ...env,
    PUBLIC_ORIGIN:
      env.PUBLIC_ORIGIN ?? (env.NODE_ENV === "production" ? env.RENDER_EXTERNAL_URL : undefined),
  });
  if (!parsed.success)
    throw new Error(
      "CONFIGURATION: invalid variables: " +
        [...new Set(parsed.error.issues.map((i) => i.path[0]))].join(", "),
    );
  const c = parsed.data;
  if (c.NODE_ENV === "production") {
    const missing = [
      "DATABASE_URL",
      "NOTION_TOKEN",
      "PUBLIC_ORIGIN",
      "ADMIN_PASSWORD_HASH",
      "SESSION_SECRET",
    ].filter((k) => !c[k as keyof AppConfig]);
    if (!c.NOTION_WEBHOOK_SETUP && !c.NOTION_WEBHOOK_VERIFICATION_TOKEN)
      missing.push(
        "NOTION_WEBHOOK_VERIFICATION_TOKEN (or explicitly enable NOTION_WEBHOOK_SETUP for initial verification)",
      );
    if (missing.length)
      throw new Error("CONFIGURATION: set production variables: " + missing.join(", "));
    if (c.WORDSMITH_DEMO_MODE)
      throw new Error("CONFIGURATION: production cannot use fixture/demo mode");
    const origin = new URL(c.PUBLIC_ORIGIN!);
    if (
      origin.protocol !== "https:" ||
      origin.origin !== c.PUBLIC_ORIGIN ||
      origin.username ||
      origin.password
    )
      throw new Error(
        "CONFIGURATION: PUBLIC_ORIGIN must be an HTTPS origin without path or credentials",
      );
    if ((c.SESSION_SECRET?.length ?? 0) < 32)
      throw new Error("CONFIGURATION: SESSION_SECRET must contain at least 32 random characters");
    if (!/^scrypt\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{86}$/.test(c.ADMIN_PASSWORD_HASH!))
      throw new Error("CONFIGURATION: generate ADMIN_PASSWORD_HASH with npm run admin:credentials");
    if (c.NOTION_WEBHOOK_SETUP && c.NOTION_WEBHOOK_VERIFICATION_TOKEN)
      throw new Error(
        "CONFIGURATION: disable NOTION_WEBHOOK_SETUP after configuring the verification token",
      );
  }
  return c;
}
