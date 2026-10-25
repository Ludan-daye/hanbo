// @ts-check
import automator from "miniprogram-automator";

/** @returns {Promise<void>} Verify login using an explicitly enabled DevTools automation endpoint. */
const checkWechatLogin = async () => {
  const baseUrl = process.env.WECHAT_TEST_API_BASE_URL;
  if (baseUrl === undefined || baseUrl.length === 0) {
    throw new Error("Set WECHAT_TEST_API_BASE_URL to the running backend URL.");
  }
  const wsEndpoint = process.env.WECHAT_TEST_WS_ENDPOINT;
  if (wsEndpoint === undefined || wsEndpoint.length === 0) {
    throw new Error(
      "Set WECHAT_TEST_WS_ENDPOINT to the enabled DevTools automation WebSocket URL.",
    );
  }
  const miniProgram = await automator.connect({ wsEndpoint });
  /** @type {string | null} */
  let accessToken = null;
  try {
    /** @type {unknown} */
    const wechat = await miniProgram.callWxMethod("login");
    if (
      wechat === null ||
      typeof wechat !== "object" ||
      !("code" in wechat) ||
      typeof wechat.code !== "string" ||
      wechat.code.length === 0
    ) {
      throw new Error("WeChat did not return a valid login code.");
    }
    const loginResponse = await fetch(new URL("/auth/wechat/login", baseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: wechat.code }),
      signal: AbortSignal.timeout(15000),
    });
    /** @type {unknown} */
    const login = await loginResponse.json();
    if (
      !loginResponse.ok ||
      login === null ||
      typeof login !== "object" ||
      !("accessToken" in login) ||
      typeof login.accessToken !== "string" ||
      login.accessToken.length === 0
    ) {
      throw new Error(
        `WeChat login failed: POST /auth/wechat/login, HTTP ${loginResponse.status}. Check backend logs.`,
      );
    }
    accessToken = login.accessToken;
    const meResponse = await fetch(new URL("/auth/me", baseUrl), {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15000),
    });
    /** @type {unknown} */
    const me = await meResponse.json();
    if (
      !meResponse.ok ||
      me === null ||
      typeof me !== "object" ||
      !("user" in me) ||
      me.user === null ||
      typeof me.user !== "object" ||
      !("isBound" in me.user) ||
      typeof me.user.isBound !== "boolean"
    ) {
      throw new Error(
        `Identity check failed: GET /auth/me, HTTP ${meResponse.status}.`,
      );
    }
    console.log(
      JSON.stringify({
        event: "wechat_login_verified",
        identityLoaded: true,
        isBound: me.user.isBound,
      }),
    );
  } finally {
    try {
      if (accessToken !== null) {
        const response = await fetch(new URL("/auth/logout", baseUrl), {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) {
          throw new Error(
            `Login-check session revocation failed: POST /auth/logout, HTTP ${response.status}.`,
          );
        }
      }
    } finally {
      await miniProgram.disconnect();
    }
  }
};

await checkWechatLogin();
