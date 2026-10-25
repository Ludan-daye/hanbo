import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

import type { ReadableStoragePort } from "./storage.types.js";

export class LocalDiskStorage implements ReadableStoragePort {
  private readonly rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  async put(objectKey: string, data: Buffer, _contentType: string): Promise<void> {
    const filePath = this.resolvePath(objectKey);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, data);
  }

  async get(objectKey: string): Promise<Buffer> {
    return readFile(this.resolvePath(objectKey));
  }

  private resolvePath(objectKey: string): string {
    const root = resolve(this.rootDir);
    const target = resolve(join(root, objectKey));
    if (!target.startsWith(`${root}${sep}`)) {
      throw new Error("STORAGE_OBJECT_KEY_OUTSIDE_ROOT");
    }
    return target;
  }
}
