import { spawn } from "node:child_process";

const commands = [
  { name: "api", command: "npm run dev:api" },
  { name: "web", command: "npm run dev:web" }
];

const children = commands.map(({ name, command }) => {
  const child = process.platform === "win32"
    ? spawn("cmd.exe", ["/d", "/s", "/c", command], { stdio: "pipe", env: process.env })
    : spawn("sh", ["-c", command], { stdio: "pipe", env: process.env });

  child.stdout.on("data", (chunk) => process.stdout.write(`[${name}] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[${name}] ${chunk}`));
  child.on("exit", (code) => {
    if (code && code !== 0) {
      process.exitCode = code;
      for (const other of children) {
        if (other !== child && !other.killed) other.kill();
      }
    }
  });

  return child;
});

function shutdown() {
  for (const child of children) {
    if (!child.killed) child.kill();
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
