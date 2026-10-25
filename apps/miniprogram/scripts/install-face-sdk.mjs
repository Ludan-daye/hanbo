// @ts-check
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** @type {{readonly version: string; readonly documentationUrl: string; readonly archiveUrl: string; readonly sha256: string; readonly sdkPath: string}} */
const manifest = JSON.parse(await readFile(new URL("./tencent-face-sdk.json", import.meta.url), "utf8"));
const sdkDestination = fileURLToPath(new URL("../src/verify_mpsdk", import.meta.url));
if (existsSync(sdkDestination)) {
  throw new Error(`The SDK directory already exists: ${sdkDestination}. Existing vendor files will not be overwritten. Check its version before replacing it.`);
}

/** Download the pinned official package; retry transport errors without changing sources. @returns {Promise<Buffer>} */
const downloadArchive = async () => {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(manifest.archiveUrl, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`Official SDK download returned HTTP ${response.status}: ${manifest.archiveUrl}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (attempt === 3) throw error;
      console.warn(JSON.stringify({ message: "TENCENT_FACE_SDK_DOWNLOAD_RETRY", attempt, url: manifest.archiveUrl, error: error instanceof Error ? error.message : String(error) }));
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
  throw new Error("TENCENT_FACE_SDK_DOWNLOAD_RETRY_STATE_INVALID");
};

const archive = await downloadArchive();
const sha256 = createHash("sha256").update(archive).digest("hex");
if (sha256 !== manifest.sha256) {
  throw new Error(`Official SDK archive checksum changed. Expected ${manifest.sha256}, received ${sha256}. Inspect the new package and update scripts/tencent-face-sdk.json before installing.`);
}
const temporaryRoot = await mkdtemp(join(tmpdir(), "hanbo-tencent-face-sdk-"));
try {
  const archivePath = join(temporaryRoot, "sdk.zip");
  await writeFile(archivePath, archive);
  const listing = spawnSync("unzip", ["-Z1", archivePath], { encoding: "utf8" });
  if (listing.error) throw listing.error;
  if (listing.status !== 0) throw new Error(`Official SDK ZIP cannot be inspected: ${listing.stderr}`);
  const entries = listing.stdout.split("\n").filter((entry) => entry.startsWith(`${manifest.sdkPath}/`));
  if (entries.length === 0 || entries.some((entry) => entry.split("/").includes("..") || entry.includes("\\"))) {
    throw new Error("Official SDK archive contains an invalid source path.");
  }
  const extraction = spawnSync("unzip", ["-q", archivePath, `${manifest.sdkPath}/*`, "-d", temporaryRoot], { encoding: "utf8" });
  if (extraction.error) throw extraction.error;
  if (extraction.status !== 0) throw new Error(`Official SDK ZIP extraction failed: ${extraction.stderr}`);
  const extractedSdk = join(temporaryRoot, manifest.sdkPath);
  const versionSource = await readFile(join(extractedSdk, "utils/log.js"), "utf8");
  if (!versionSource.includes(`version:"${manifest.version}"`)) {
    throw new Error(`Official SDK version does not match the pinned version ${manifest.version}.`);
  }
  await cp(extractedSdk, sdkDestination, {
    recursive: true,
    filter: (source) => !basename(source).startsWith("."),
  });
  console.info(JSON.stringify({ message: "TENCENT_FACE_SDK_INSTALLED", version: manifest.version, sha256, directory: sdkDestination, documentation: manifest.documentationUrl }));
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
