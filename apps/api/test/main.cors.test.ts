import { describe, expect, test } from "vitest";

import { parseAllowedOrigins } from "../src/main.cors.js";

describe("parseAllowedOrigins", () => {
  test("returns an empty array for an empty string", () => {
    expect(parseAllowedOrigins("")).toEqual([]);
  });

  test("splits a comma-separated list and trims whitespace", () => {
    expect(parseAllowedOrigins("http://localhost:10086, https://example.com")).toEqual([
      "http://localhost:10086",
      "https://example.com"
    ]);
  });

  test("drops empty entries", () => {
    expect(parseAllowedOrigins("http://a.com,,http://b.com,")).toEqual(["http://a.com", "http://b.com"]);
  });
});
