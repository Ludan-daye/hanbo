import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import { loadEnv } from "../src/config/env.js";
import { TencentFaceComparisonConnector } from "../src/infrastructure/face/tencent-face-comparison.connector.js";

/** Run one explicit photo comparison; this does not mark the employee's attendance. */
const main = async (): Promise<void> => {
  const { values } = parseArgs({
    options: { reference: { type: "string" }, probe: { type: "string" } },
    strict: true,
    allowPositionals: false,
  });
  if (values.reference === undefined || values.probe === undefined)
    throw new Error("Provide --reference /absolute/path/reference.jpg and --probe /absolute/path/current.jpg. Both photos will be sent to Tencent Cloud CompareFace.");
  const provider: TencentFaceComparisonConnector = new TencentFaceComparisonConnector(loadEnv(process.env));
  const [reference, probe]: readonly [Buffer, Buffer] = await Promise.all([readFile(values.reference), readFile(values.probe)]);
  const result = await provider.compare(reference, probe, randomUUID());
  console.info(JSON.stringify({ provider: "TENCENT_IAI", action: "CompareFace", purpose: "PHOTO_COMPARISON_ONLY", ...result }));
};

await main();
