export const API_BASE_URL: string = process.env.TARO_APP_API_BASE_URL || "http://localhost:3000";
export const FRONTEND_DEMO: boolean = process.env.TARO_APP_DATA_MODE === "demo";
export const TEST_LOGIN_ENABLED: boolean = !FRONTEND_DEMO && process.env.TARO_APP_TEST_LOGIN === "true";
export const ACCESS_TOKEN_KEY: string = FRONTEND_DEMO ? "demoAccessToken" : "accessToken";
export const REFRESH_TOKEN_KEY: string = FRONTEND_DEMO ? "demoRefreshToken" : "refreshToken";
