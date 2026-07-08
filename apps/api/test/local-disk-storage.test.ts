import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { LocalDiskStorage } from "../src/infrastructure/storage/local-disk-storage.js";

describe("LocalDiskStorage", (): void => {
  let rootDir: string;

  beforeEach(async (): Promise<void> => {
    rootDir = await mkdtemp(join(tmpdir(), "local-disk-storage-"));
  });

  afterEach(async (): Promise<void> => {
    await rm(rootDir, { force: true, recursive: true });
  });

  test("put writes the bytes beneath the root, creating nested directories", async (): Promise<void> => {
    const storage = new LocalDiskStorage(rootDir);
    const data = Buffer.from("fake-jpeg-bytes");

    await storage.put("uploads/2026-07-07/abc.jpg", data, "image/jpeg");

    const written = await readFile(join(rootDir, "uploads/2026-07-07/abc.jpg"));
    expect(written.equals(data)).toBe(true);
  });

  test("put overwrites an existing object at the same key", async (): Promise<void> => {
    const storage = new LocalDiskStorage(rootDir);
    await storage.put("uploads/a.jpg", Buffer.from("first"), "image/jpeg");
    await storage.put("uploads/a.jpg", Buffer.from("second"), "image/jpeg");

    const written = await readFile(join(rootDir, "uploads/a.jpg"));
    expect(written.toString()).toBe("second");
  });
});
