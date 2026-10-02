import {
  createHash,
  createHmac,
  randomBytes,
  scrypt,
  timingSafeEqual,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppConfig } from "./environment.js";
import type { AdminStore } from "./adminStore.js";
const derive = (password: string, salt: string) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const key = await derive(password, salt);
  return ["scrypt", salt, key.toString("base64url")].join("$");
}
export async function verifyPassword(password: string, encoded: string) {
  const [, salt, key] = encoded.split("$");
  if (!salt || !key || password.length > 512) return false;
  const actual = await derive(password, salt);
  const expected = Buffer.from(key, "base64url");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export const digest = (text: string) => createHash("sha256").update(text).digest("hex");
export function encryptToken(token: string, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", createHash("sha256").update(secret).digest(), iv);
  const data = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}
export function decryptToken(value: string, secret: string) {
  const [iv, tag, data] = value.split(".").map((s) => Buffer.from(s, "base64url"));
  const decipher = createDecipheriv(
    "aes-256-gcm",
    createHash("sha256").update(secret).digest(),
    iv!,
  );
  decipher.setAuthTag(tag!);
  return Buffer.concat([decipher.update(data!), decipher.final()]).toString("utf8");
}
export function registerAdminAuth(server: FastifyInstance, config: AppConfig, store: AdminStore) {
  const cookieName = "__Host-wordsmith-session";
  const signature = (value: string) =>
    createHmac("sha256", config.SESSION_SECRET!)
      .update(value + config.ADMIN_PASSWORD_HASH)
      .digest("base64url");
  const cookieValue = (r: FastifyRequest) => {
    const value = r.headers.cookie
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(cookieName + "="))
      ?.slice(cookieName.length + 1);
    if (!value || !/^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/.test(value)) return null;
    const [id, sig] = value.split(".");
    return timingSafeEqual(Buffer.from(sig!), Buffer.from(signature(id!))) ? value : null;
  };
  const attributes = "; Path=/; HttpOnly; Secure; SameSite=Strict";
  let attempts = 0;
  let signingIn = false;
  let windowStart = Date.now();
  server.addHook("onRequest", async (r, reply) => {
    const path = r.url.split("?")[0]!;
    if (
      !path.startsWith("/api/") ||
      path === "/api/health" ||
      path === "/api/webhooks/notion" ||
      path.startsWith("/api/embed/")
    )
      return;
    reply.header("Cache-Control", "no-store");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(r.method) &&
      (r.headers.origin !== config.PUBLIC_ORIGIN || r.headers["x-wordsmith-request"] !== "1")
    )
      return reply
        .code(403)
        .send({
          error: {
            code: "CSRF",
            message: "Use the hosted Wordsmith app on its configured origin.",
          },
        });
    if (path === "/api/auth/login" || path === "/api/auth/session") return;
    const value = cookieValue(r);
    if (!value || !(await store.hasSession(digest(value))))
      return reply
        .code(401)
        .send({ error: { code: "AUTH_REQUIRED", message: "Sign in to Wordsmith." } });
  });
  server.get("/api/auth/session", async (r) => {
    const value = cookieValue(r);
    return { required: true, authenticated: !!value && (await store.hasSession(digest(value))) };
  });
  server.post("/api/auth/login", { bodyLimit: 2048 }, async (r, reply) => {
    if (Date.now() - windowStart > 15 * 60 * 1000) {
      attempts = 0;
      windowStart = Date.now();
    }
    if (++attempts > 10)
      return reply
        .code(429)
        .header("Retry-After", "900")
        .send({ error: { message: "Too many sign-in attempts. Try again in 15 minutes." } });
    if (signingIn)
      return reply
        .code(429)
        .header("Retry-After", "2")
        .send({
          error: { message: "A sign-in attempt is already processing. Try again shortly." },
        });
    signingIn = true;
    try {
      const body = r.body as { password?: unknown };
      if (
        !body ||
        typeof body.password !== "string" ||
        !(await verifyPassword(body.password, config.ADMIN_PASSWORD_HASH!))
      )
        return reply.code(401).send({ error: { message: "Incorrect password." } });
      const id = randomBytes(32).toString("base64url");
      const value = id + "." + signature(id);
      await store.saveSession(digest(value), new Date(Date.now() + 8 * 60 * 60 * 1000));
      reply.header("Set-Cookie", cookieName + "=" + value + attributes + "; Max-Age=28800");
      return { authenticated: true };
    } finally {
      signingIn = false;
    }
  });
  server.post("/api/auth/logout", async (r, reply) => {
    const value = cookieValue(r);
    if (value) await store.revokeSession(digest(value));
    reply.header("Set-Cookie", cookieName + "=" + attributes + "; Max-Age=0");
    return { authenticated: false };
  });
  server.post("/api/webhook/setup", async () => {
    if (!config.NOTION_WEBHOOK_SETUP || config.NOTION_WEBHOOK_VERIFICATION_TOKEN)
      return {
        error: { message: "Enable initial webhook setup in the hosting environment first." },
      };
    const nonce = randomBytes(32).toString("base64url");
    await store.prepareSetup(digest(nonce), new Date(Date.now() + 15 * 60 * 1000));
    return {
      url: config.PUBLIC_ORIGIN + "/api/webhooks/notion?setup=" + nonce,
      expiresInMinutes: 15,
    };
  });
  server.get("/api/webhook/setup", async () => {
    if (!config.NOTION_WEBHOOK_SETUP || config.NOTION_WEBHOOK_VERIFICATION_TOKEN)
      return { enabled: false, token: null };
    const setup = await store.setup();
    return {
      enabled: true,
      token:
        setup?.setupTokenCipher && setup.setupExpiresAt && setup.setupExpiresAt > new Date()
          ? decryptToken(setup.setupTokenCipher, config.SESSION_SECRET!)
          : null,
    };
  });
}
