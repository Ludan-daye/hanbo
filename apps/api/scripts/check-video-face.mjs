// @ts-check
import { faceid } from "tencentcloud-sdk-nodejs-faceid";

/** Check server credentials without sending employee photos, videos or identifiers. */
const secretId = process.env.TENCENT_SECRET_ID;
const secretKey = process.env.TENCENT_SECRET_KEY;
if (!secretId || !secretKey) throw new Error("Set TENCENT_SECRET_ID and TENCENT_SECRET_KEY in apps/api/.env first. Never put them in the Mini Program.");
if (process.env.FACE_DEV_STUB !== "false" || process.env.TENCENT_FACE_MODE !== "VIDEO_ACTION")
  throw new Error("Set FACE_DEV_STUB=false and TENCENT_FACE_MODE=VIDEO_ACTION before checking the video service.");
const client = new faceid.v20180301.Client({
  credential: { secretId, secretKey }, region: "",
  profile: { httpProfile: { endpoint: "faceid.tencentcloudapi.com", reqTimeout: 20 } },
});
for (let attempt = 1; attempt <= 3; attempt += 1) {
  try {
    const result = await client.GetActionSequence({});
    if (typeof result.ActionSequence !== "string" || !["1,2", "2,1"].includes(result.ActionSequence)) throw new Error("Tencent returned an unsupported action sequence.");
    console.info(JSON.stringify({ message: "TENCENT_ACTION_API_READY", requestId: result.RequestId }));
    break;
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "UNKNOWN";
    const requestId = typeof error === "object" && error !== null && "requestId" in error ? String(error.requestId) : null;
    const fields = { action: "GetActionSequence", attempt, code, requestId };
    if (/^(InternalError|RequestLimitExceeded|ClientError|RequestError|ETIMEDOUT|ECONNRESET)/.test(code) && attempt < 3) {
      console.warn(JSON.stringify({ ...fields, message: "TENCENT_ACTION_API_RETRY" }));
      await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
      continue;
    }
    throw new Error(JSON.stringify({ ...fields, message: "TENCENT_ACTION_API_CHECK_FAILED" }), { cause: error });
  }
}
