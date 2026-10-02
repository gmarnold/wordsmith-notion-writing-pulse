import { describe, expect, it } from "vitest";
import { localConfigurationOrigins } from "./localAccess.js";
describe("local configuration origins", () => {
  it("accepts equivalent loopback hosts on the configured port", () => {
    expect(localConfigurationOrigins("http://localhost:5174")).toEqual([
      "http://localhost:5174",
      "http://127.0.0.1:5174",
    ]);
    expect(localConfigurationOrigins("http://127.0.0.1:5174")).toEqual([
      "http://127.0.0.1:5174",
      "http://localhost:5174",
    ]);
  });
  it("does not allow other ports, hosts or protocols", () => {
    const origins = localConfigurationOrigins("http://localhost:5174");
    for (const origin of [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "https://localhost:5174",
      "http://localhost.example.com:5174",
      "http://192.168.1.1:5174",
      "null",
    ])
      expect(origins).not.toContain(origin);
  });
});
