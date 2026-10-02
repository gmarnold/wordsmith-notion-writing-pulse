import { randomBytes, scrypt } from "node:crypto";
import { writeFile } from "node:fs/promises";
const password = randomBytes(24).toString("base64url");
const salt = randomBytes(16).toString("base64url");
const key = await new Promise((resolve, reject) =>
  scrypt(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (error, result) =>
    error ? reject(error) : resolve(result),
  ),
);
await writeFile(
  new URL("../.wordsmith-admin-credentials", import.meta.url),
  [
    "Keep the password in your password manager. Set only ADMIN_PASSWORD_HASH and SESSION_SECRET in hosting.",
    "Delete this ignored local file after saving those values. Never paste them into chat.",
    "ADMIN_PASSWORD=" + password,
    "ADMIN_PASSWORD_HASH=" + ["scrypt", salt, key.toString("base64url")].join("$"),
    "SESSION_SECRET=" + randomBytes(32).toString("base64url"),
    "",
  ].join("\n"),
  { flag: "wx", mode: 0o600 },
);
console.log("Credentials generated in .wordsmith-admin-credentials (ignored). No values printed.");
