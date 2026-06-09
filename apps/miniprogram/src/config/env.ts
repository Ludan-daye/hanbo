// Build-time injected (Taro injects TARO_APP_* from .env.<mode>). Falls back for local h5.
export const API_BASE_URL: string = process.env.TARO_APP_API_BASE_URL || "http://localhost:3000";
