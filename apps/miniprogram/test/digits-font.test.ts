import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("digits font", () => {
  const css = readFileSync(
    new URL("../src/styles/digits-font.scss", import.meta.url),
    "utf8",
  );
  it("declares the embedded digits face", () => {
    expect(css).toContain('font-family: "HanboDigits"');
    expect(css).toContain('format("truetype")');
  });
  it("stays under 15KB", () => {
    const payload = /base64,([A-Za-z0-9+/=]+)/.exec(css)?.[1] ?? "";
    expect(payload.length).toBeGreaterThan(1000);
    expect(Buffer.from(payload, "base64").byteLength).toBeLessThan(15 * 1024);
  });
});
