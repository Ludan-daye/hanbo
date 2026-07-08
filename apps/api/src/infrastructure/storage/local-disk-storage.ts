import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { StoragePort } from "./storage.types.js";

export class LocalDiskStorage implements StoragePort {
  private readonly rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  async put(objectKey: string, data: Buffer, _contentType: string): Promise<void> {
    const filePath = join(this.rootDir, objectKey);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, data);
  }
}
