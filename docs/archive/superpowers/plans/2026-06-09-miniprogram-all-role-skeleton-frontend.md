# Mini Program All-Role Skeleton — Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Taro (React + TS) frontend skeleton — launch → dev login → `GET /auth/me` → binding check → role-based home — on the already-scaffolded `apps/miniprogram`, applying the "Warm Earthen / Human" design system.

**Architecture:** A small React context holds the session (tokens + `/auth/me` result). An `apiClient` wraps `Taro.request` with JWT injection and a single `401 → /auth/refresh → retry`. The app launch flow reads stored tokens, calls `/auth/me`, and routes to login / bind / a single `home` page that renders one of five role panels (or a no-role state) by `highestRoleCode`. Real feature screens are inert placeholder tiles.

**Tech Stack:** Taro 4.2 (webpack5), React 18, TypeScript, Sass; Vitest for pure-logic unit tests (with `@tarojs/taro` mocked). Backend: the Plan A enablers (`/auth/wechat/login` dev login, `/auth/me`, CORS) running on `http://localhost:3000`.

**Prerequisite:** Plan A is merged on this branch (GET /auth/me, dev login, CORS, dev seed) and `apps/miniprogram` is scaffolded and builds for h5 + weapp.

---

## File Structure

- `apps/miniprogram/src/config/env.ts` — API base URL from `TARO_APP_API_BASE_URL`.
- `apps/miniprogram/src/styles/tokens.scss` — design tokens (CSS variables).
- `apps/miniprogram/src/services/apiClient.ts` — request wrapper (auth + 401 refresh/retry).
- `apps/miniprogram/src/services/auth.ts` — devLogin / fetchMe / bind / logout.
- `apps/miniprogram/src/services/auth.types.ts` — client copy of the `/auth/me` response shape.
- `apps/miniprogram/src/store/sessionReducer.ts` — pure reducer + phase selector.
- `apps/miniprogram/src/store/session.tsx` — React context/provider + Taro storage persistence.
- `apps/miniprogram/src/routing/roleHome.ts` — `highestRoleCode → panel key`.
- `apps/miniprogram/src/components/ui/*` — Screen, Button, Tile, RoleChip, Field, StateView (+ scss).
- `apps/miniprogram/src/components/role-panels/*` — five role panels + NoRolePanel.
- `apps/miniprogram/src/pages/{login,bind,home}/*` — the three screens.
- `apps/miniprogram/src/app.tsx` (replaces `app.ts`) — wraps children in `SessionProvider`.
- `apps/miniprogram/src/app.config.ts` — pages list + window theming.
- `apps/miniprogram/vitest.config.ts`, `apps/miniprogram/test/setup.ts` — test harness.
- Remove `apps/miniprogram/src/pages/index/*` (replaced by login/bind/home).

---

## Task B1: Design tokens, env, app config, base styles

**Files:** Create `src/config/env.ts`, `src/styles/tokens.scss`; replace `src/app.config.ts`, `src/app.scss`; create `.env.development`. Verify build.

- [ ] **Step 1: Create `src/config/env.ts`**

```ts
// Build-time injected (Taro injects TARO_APP_* from .env.<mode>). Falls back for local h5.
export const API_BASE_URL: string = process.env.TARO_APP_API_BASE_URL || "http://localhost:3000";
```

- [ ] **Step 2: Create `.env.development`** (Taro reads this for `dev:h5`)

```
TARO_APP_API_BASE_URL=http://localhost:3000
```

- [ ] **Step 3: Create `src/styles/tokens.scss`** (Warm Earthen / Human design system)

```scss
:root {
  /* surfaces */
  --bg: #F3ECE1;
  --surface: #FFFFFF;
  --surface-sunk: #EDE4D6;
  /* ink */
  --ink: #2E2A26;
  --ink-soft: #6B5D4D;
  --line: #D8CDBB;
  /* brand */
  --clay: #C5512F;
  --clay-pressed: #A8401F;
  --clay-tint: #F6E4DB;
  --steel: #3A4A4F;
  /* status */
  --gold: #E0B24A;
  --success: #4F7A4E;
  --danger: #B23B2E;
  /* shape */
  --radius-card: 24rpx;
  --radius-pill: 999rpx;
  --shadow-soft: 0 8rpx 24rpx rgba(58, 40, 24, 0.08);
  --tap-min: 88rpx;
}
```

- [ ] **Step 4: Replace `src/app.scss`**

```scss
@import "./styles/tokens.scss";

page,
.taro_router {
  background: var(--bg);
  color: var(--ink);
  font-family: -apple-system, "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif;
}
```

- [ ] **Step 5: Replace `src/app.config.ts`**

```ts
export default defineAppConfig({
  pages: ["pages/login/index", "pages/bind/index", "pages/home/index"],
  window: {
    backgroundColor: "#F3ECE1",
    backgroundTextStyle: "dark",
    navigationBarBackgroundColor: "#F3ECE1",
    navigationBarTitleText: "工地考勤",
    navigationBarTextStyle: "black"
  }
});
```

- [ ] **Step 6: Remove the default index page**

Run: `rm -rf src/pages/index` (from `apps/miniprogram`). The pages above replace it.

- [ ] **Step 7: Verify the app still builds for h5** (pages don't exist yet → expect a build error referencing missing `pages/login/index`). To keep B1 self-contained, instead create minimal placeholder pages so the build passes, OR defer the build check to B5. **Decision:** defer the full build to B5; for B1 just typecheck the new TS files compiles by running `corepack pnpm --filter @construction/miniprogram exec tsc --noEmit -p tsconfig.json` and confirm no errors from `env.ts`/`app.config.ts`.

- [ ] **Step 8: Commit**

```bash
git add apps/miniprogram/src/config apps/miniprogram/src/styles apps/miniprogram/src/app.scss apps/miniprogram/src/app.config.ts apps/miniprogram/.env.development
git rm -r --cached apps/miniprogram/src/pages/index 2>/dev/null || true
git add -A apps/miniprogram/src/pages
git commit -m "feat(miniprogram): design tokens, env config, app pages/theme (B1)"
```

---

## Task B2: Pure logic with Vitest (apiClient, session reducer, roleHome)

**Files:** Create `vitest.config.ts`, `test/setup.ts`, `src/services/auth.types.ts`, `src/services/apiClient.ts`, `src/store/sessionReducer.ts`, `src/routing/roleHome.ts`, and tests under `test/`.

- [ ] **Step 1: Add Vitest dev deps**

Run from repo root:
```bash
corepack pnpm --filter @construction/miniprogram add -D vitest@^2.1.8
```

- [ ] **Step 2: Create `apps/miniprogram/vitest.config.ts`**

```ts
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@construction\/domain\/roles\.js$/, replacement: fileURLToPath(new URL("../../packages/domain/src/roles.ts", import.meta.url)) },
      { find: /^@tarojs\/taro$/, replacement: fileURLToPath(new URL("./test/taro-mock.ts", import.meta.url)) }
    ]
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"]
  }
});
```

- [ ] **Step 3: Create `apps/miniprogram/test/taro-mock.ts`** (in-memory Taro stub for tests)

```ts
const storage = new Map<string, unknown>();

type RequestResult = { statusCode: number; data: unknown };
type RequestHandler = (options: { url: string; method?: string; data?: unknown; header?: Record<string, string> }) => Promise<RequestResult>;

let requestHandler: RequestHandler = async () => ({ statusCode: 200, data: {} });

export const __setRequestHandler = (handler: RequestHandler): void => {
  requestHandler = handler;
};

const Taro = {
  request: (options: { url: string; method?: string; data?: unknown; header?: Record<string, string> }) => requestHandler(options),
  getStorageSync: (key: string): unknown => storage.get(key) ?? "",
  setStorageSync: (key: string, value: unknown): void => {
    storage.set(key, value);
  },
  removeStorageSync: (key: string): void => {
    storage.delete(key);
  }
};

export default Taro;
```

- [ ] **Step 4: Create `src/services/auth.types.ts`** (client mirror of the server `MeResponse`)

```ts
export type RoleCode = "SYSTEM_ADMIN" | "COMPANY_ADMIN" | "PROJECT_ADMIN" | "TEAM_LEADER" | "WORKER";

export type MeResponse = {
  readonly user: { readonly id: string; readonly isBound: boolean; readonly status: string };
  readonly profile: { readonly type: "WORKER" | "MANAGER" | null; readonly id: string | null };
  readonly roles: {
    readonly assignments: ReadonlyArray<{ readonly roleCode: RoleCode; readonly scope: { readonly scopeType: string; readonly scopeId: string } }>;
    readonly highestRoleCode: RoleCode | null;
  };
};

export type LoginResponse = {
  readonly accessToken: string;
  readonly refreshToken: string;
};
```

- [ ] **Step 5: Write the failing `roleHome` test — `test/roleHome.test.ts`**

```ts
import { describe, expect, test } from "vitest";

import { roleHomePanel } from "../src/routing/roleHome.js";

describe("roleHomePanel", () => {
  test("maps each role to its panel key", () => {
    expect(roleHomePanel("WORKER")).toBe("worker");
    expect(roleHomePanel("TEAM_LEADER")).toBe("teamLeader");
    expect(roleHomePanel("PROJECT_ADMIN")).toBe("projectAdmin");
    expect(roleHomePanel("COMPANY_ADMIN")).toBe("companyAdmin");
    expect(roleHomePanel("SYSTEM_ADMIN")).toBe("systemAdmin");
  });

  test("maps null (bound, no role) to the none panel", () => {
    expect(roleHomePanel(null)).toBe("none");
  });
});
```

- [ ] **Step 6: Implement `src/routing/roleHome.ts`**

```ts
import type { RoleCode } from "../services/auth.types.js";

export type PanelKey = "worker" | "teamLeader" | "projectAdmin" | "companyAdmin" | "systemAdmin" | "none";

const PANEL_BY_ROLE: Record<RoleCode, PanelKey> = {
  COMPANY_ADMIN: "companyAdmin",
  PROJECT_ADMIN: "projectAdmin",
  SYSTEM_ADMIN: "systemAdmin",
  TEAM_LEADER: "teamLeader",
  WORKER: "worker"
};

export const roleHomePanel = (highestRoleCode: RoleCode | null): PanelKey =>
  highestRoleCode === null ? "none" : PANEL_BY_ROLE[highestRoleCode];
```

- [ ] **Step 7: Write the failing `sessionReducer` test — `test/sessionReducer.test.ts`**

```ts
import { describe, expect, test } from "vitest";

import { initialSessionState, sessionPhase, sessionReducer } from "../src/store/sessionReducer.js";

const me = (over: Partial<{ isBound: boolean; highest: "WORKER" | null }> = {}) => ({
  user: { id: "u1", isBound: over.isBound ?? true, status: "ACTIVE" },
  profile: { type: "WORKER" as const, id: "w1" },
  roles: { assignments: [], highestRoleCode: (over.highest ?? "WORKER") as "WORKER" | null }
});

describe("sessionReducer / sessionPhase", () => {
  test("starts anonymous with no token", () => {
    expect(sessionPhase(initialSessionState)).toBe("anonymous");
  });

  test("after tokens but before /me it is loading", () => {
    const s = sessionReducer(initialSessionState, { type: "SET_TOKENS", accessToken: "a", refreshToken: "r" });
    expect(sessionPhase(s)).toBe("loading");
  });

  test("bound user with a role is ready", () => {
    let s = sessionReducer(initialSessionState, { type: "SET_TOKENS", accessToken: "a", refreshToken: "r" });
    s = sessionReducer(s, { type: "SET_ME", me: me({ isBound: true, highest: "WORKER" }) });
    expect(sessionPhase(s)).toBe("ready");
  });

  test("bound user without a role is norole", () => {
    let s = sessionReducer(initialSessionState, { type: "SET_TOKENS", accessToken: "a", refreshToken: "r" });
    s = sessionReducer(s, { type: "SET_ME", me: me({ isBound: true, highest: null }) });
    expect(sessionPhase(s)).toBe("norole");
  });

  test("unbound user goes to bind", () => {
    let s = sessionReducer(initialSessionState, { type: "SET_TOKENS", accessToken: "a", refreshToken: "r" });
    s = sessionReducer(s, { type: "SET_ME", me: me({ isBound: false, highest: null }) });
    expect(sessionPhase(s)).toBe("unbound");
  });

  test("CLEAR returns to anonymous", () => {
    let s = sessionReducer(initialSessionState, { type: "SET_TOKENS", accessToken: "a", refreshToken: "r" });
    s = sessionReducer(s, { type: "CLEAR" });
    expect(sessionPhase(s)).toBe("anonymous");
  });
});
```

- [ ] **Step 8: Implement `src/store/sessionReducer.ts`**

```ts
import type { MeResponse } from "../services/auth.types.js";

export type SessionState = {
  readonly accessToken: string | null;
  readonly refreshToken: string | null;
  readonly me: MeResponse | null;
};

export type SessionAction =
  | { type: "SET_TOKENS"; accessToken: string; refreshToken: string }
  | { type: "SET_ACCESS_TOKEN"; accessToken: string }
  | { type: "SET_ME"; me: MeResponse }
  | { type: "CLEAR" };

export type SessionPhase = "anonymous" | "loading" | "unbound" | "norole" | "ready";

export const initialSessionState: SessionState = {
  accessToken: null,
  me: null,
  refreshToken: null
};

export const sessionReducer = (state: SessionState, action: SessionAction): SessionState => {
  switch (action.type) {
    case "SET_TOKENS":
      return { ...state, accessToken: action.accessToken, refreshToken: action.refreshToken };
    case "SET_ACCESS_TOKEN":
      return { ...state, accessToken: action.accessToken };
    case "SET_ME":
      return { ...state, me: action.me };
    case "CLEAR":
      return initialSessionState;
    default:
      return state;
  }
};

export const sessionPhase = (state: SessionState): SessionPhase => {
  if (state.accessToken === null) {
    return "anonymous";
  }
  if (state.me === null) {
    return "loading";
  }
  if (!state.me.user.isBound) {
    return "unbound";
  }
  return state.me.roles.highestRoleCode === null ? "norole" : "ready";
};
```

- [ ] **Step 9: Write the failing `apiClient` test — `test/apiClient.test.ts`**

```ts
import { afterEach, describe, expect, test } from "vitest";

import Taro, { __setRequestHandler } from "@tarojs/taro";
import { createApiClient } from "../src/services/apiClient.js";

afterEach(() => {
  Taro.removeStorageSync("accessToken");
  Taro.removeStorageSync("refreshToken");
});

describe("apiClient", () => {
  test("injects the access token and returns data on 200", async () => {
    Taro.setStorageSync("accessToken", "tok-1");
    let seenHeader = "";
    __setRequestHandler(async (o) => {
      seenHeader = o.header?.Authorization ?? "";
      return { statusCode: 200, data: { ok: true } };
    });
    const client = createApiClient("http://api");
    const data = await client.request<{ ok: boolean }>("/x", { method: "GET" });
    expect(seenHeader).toBe("Bearer tok-1");
    expect(data).toEqual({ ok: true });
  });

  test("on 401 refreshes once and retries with the new token", async () => {
    Taro.setStorageSync("accessToken", "old");
    Taro.setStorageSync("refreshToken", "r1");
    const calls: string[] = [];
    __setRequestHandler(async (o) => {
      calls.push(`${o.method} ${o.url} auth=${o.header?.Authorization ?? ""}`);
      if (o.url.endsWith("/auth/refresh")) {
        return { statusCode: 200, data: { accessToken: "new" } };
      }
      if (o.header?.Authorization === "Bearer old") {
        return { statusCode: 401, data: { message: "expired" } };
      }
      return { statusCode: 200, data: { ok: true } };
    });
    const client = createApiClient("http://api");
    const data = await client.request<{ ok: boolean }>("/protected", { method: "GET" });
    expect(data).toEqual({ ok: true });
    expect(Taro.getStorageSync("accessToken")).toBe("new");
    expect(calls.some((c) => c.includes("/auth/refresh"))).toBe(true);
  });

  test("clears the session and throws when refresh fails", async () => {
    Taro.setStorageSync("accessToken", "old");
    Taro.setStorageSync("refreshToken", "r1");
    __setRequestHandler(async (o) => {
      if (o.url.endsWith("/auth/refresh")) {
        return { statusCode: 401, data: { message: "refresh dead" } };
      }
      return { statusCode: 401, data: { message: "expired" } };
    });
    const client = createApiClient("http://api");
    await expect(client.request("/protected", { method: "GET" })).rejects.toBeDefined();
    expect(Taro.getStorageSync("accessToken")).toBe("");
  });
});
```

- [ ] **Step 10: Implement `src/services/apiClient.ts`**

```ts
import Taro from "@tarojs/taro";

export type RequestOptions = {
  readonly method?: "GET" | "POST" | "PUT" | "DELETE";
  readonly data?: unknown;
  readonly auth?: boolean;
};

export type ApiClient = {
  request<T>(path: string, options?: RequestOptions): Promise<T>;
};

export class ApiError extends Error {
  readonly statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
  }
}

const getAccessToken = (): string => String(Taro.getStorageSync("accessToken") || "");
const getRefreshToken = (): string => String(Taro.getStorageSync("refreshToken") || "");

const clearTokens = (): void => {
  Taro.removeStorageSync("accessToken");
  Taro.removeStorageSync("refreshToken");
};

export const createApiClient = (baseUrl: string): ApiClient => {
  const send = async (path: string, options: RequestOptions, accessToken: string) =>
    Taro.request({
      url: `${baseUrl}${path}`,
      method: options.method ?? "GET",
      data: options.data,
      header: accessToken.length > 0 ? { Authorization: `Bearer ${accessToken}` } : {}
    });

  const refresh = async (): Promise<string | null> => {
    const refreshToken = getRefreshToken();
    if (refreshToken.length === 0) {
      return null;
    }
    const res = await Taro.request({
      url: `${baseUrl}/auth/refresh`,
      method: "POST",
      data: { refreshToken },
      header: {}
    });
    if (res.statusCode === 200 && res.data && typeof (res.data as { accessToken?: string }).accessToken === "string") {
      const next = (res.data as { accessToken: string }).accessToken;
      Taro.setStorageSync("accessToken", next);
      return next;
    }
    return null;
  };

  const request = async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
    const useAuth = options.auth !== false;
    let res = await send(path, options, useAuth ? getAccessToken() : "");

    if (res.statusCode === 401 && useAuth) {
      const next = await refresh();
      if (next === null) {
        clearTokens();
        throw new ApiError(401, "SESSION_EXPIRED");
      }
      res = await send(path, options, next);
    }

    if (res.statusCode >= 200 && res.statusCode < 300) {
      return res.data as T;
    }
    throw new ApiError(res.statusCode, `REQUEST_FAILED_${res.statusCode}`);
  };

  return { request };
};
```

- [ ] **Step 11: Run the tests, verify green**

Run: `corepack pnpm --filter @construction/miniprogram exec vitest run`
Expected: roleHome (2), sessionReducer (6), apiClient (3) — all pass.

- [ ] **Step 12: Commit**

```bash
git add apps/miniprogram/vitest.config.ts apps/miniprogram/test apps/miniprogram/src/services apps/miniprogram/src/store/sessionReducer.ts apps/miniprogram/src/routing apps/miniprogram/package.json
git commit -m "feat(miniprogram): apiClient, session reducer, roleHome with vitest (B2)"
```

---

## Task B3: Session context + auth service

**Files:** Create `src/store/session.tsx`, `src/services/auth.ts`.

- [ ] **Step 1: Create `src/services/auth.ts`**

```ts
import Taro from "@tarojs/taro";

import { API_BASE_URL } from "../config/env.js";
import { createApiClient } from "./apiClient.js";
import type { LoginResponse, MeResponse } from "./auth.types.js";

const client = createApiClient(API_BASE_URL);

export const devLogin = async (code: string): Promise<void> => {
  const res = await client.request<LoginResponse>("/auth/wechat/login", { auth: false, data: { code }, method: "POST" });
  Taro.setStorageSync("accessToken", res.accessToken);
  Taro.setStorageSync("refreshToken", res.refreshToken);
};

export const fetchMe = async (): Promise<MeResponse> => client.request<MeResponse>("/auth/me", { method: "GET" });

export const bindByInvitation = async (invitationCode: string): Promise<void> => {
  await client.request("/auth/bind", { data: { invitationCode }, method: "POST" });
};

export const logout = async (): Promise<void> => {
  try {
    await client.request("/auth/logout", { method: "POST" });
  } finally {
    Taro.removeStorageSync("accessToken");
    Taro.removeStorageSync("refreshToken");
  }
};
```

- [ ] **Step 2: Create `src/store/session.tsx`**

```tsx
import { createContext, useContext, useEffect, useReducer, type PropsWithChildren } from "react";
import Taro from "@tarojs/taro";

import { fetchMe } from "../services/auth.js";
import { initialSessionState, sessionPhase, sessionReducer, type SessionPhase, type SessionState } from "./sessionReducer.js";

type SessionContextValue = {
  readonly state: SessionState;
  readonly phase: SessionPhase;
  readonly refreshMe: () => Promise<void>;
  readonly onLoggedIn: () => Promise<void>;
  readonly clear: () => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export const SessionProvider = ({ children }: PropsWithChildren): JSX.Element => {
  const [state, dispatch] = useReducer(sessionReducer, initialSessionState);

  const loadMe = async (): Promise<void> => {
    try {
      const me = await fetchMe();
      dispatch({ me, type: "SET_ME" });
    } catch {
      dispatch({ type: "CLEAR" });
    }
  };

  useEffect(() => {
    const accessToken = String(Taro.getStorageSync("accessToken") || "");
    const refreshToken = String(Taro.getStorageSync("refreshToken") || "");
    if (accessToken.length > 0) {
      dispatch({ accessToken, refreshToken, type: "SET_TOKENS" });
      void loadMe();
    }
  }, []);

  const value: SessionContextValue = {
    clear: () => {
      Taro.removeStorageSync("accessToken");
      Taro.removeStorageSync("refreshToken");
      dispatch({ type: "CLEAR" });
    },
    onLoggedIn: async () => {
      const accessToken = String(Taro.getStorageSync("accessToken") || "");
      const refreshToken = String(Taro.getStorageSync("refreshToken") || "");
      dispatch({ accessToken, refreshToken, type: "SET_TOKENS" });
      await loadMe();
    },
    phase: sessionPhase(state),
    refreshMe: loadMe,
    state
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
};

export const useSession = (): SessionContextValue => {
  const ctx = useContext(SessionContext);
  if (ctx === null) {
    throw new Error("useSession must be used within SessionProvider");
  }
  return ctx;
};
```

- [ ] **Step 2b: Typecheck**

Run: `corepack pnpm --filter @construction/miniprogram exec tsc --noEmit -p tsconfig.json` — clean.

- [ ] **Step 3: Commit**

```bash
git add apps/miniprogram/src/store/session.tsx apps/miniprogram/src/services/auth.ts
git commit -m "feat(miniprogram): session context + auth service (B3)"
```

---

## Task B4: UI component library (design system)

**Files:** Create `src/components/ui/index.tsx` and `src/components/ui/ui.scss` (one focused module exporting the primitives).

- [ ] **Step 1: Create `src/components/ui/ui.scss`**

```scss
@import "../../styles/tokens.scss";

.ui-screen { min-height: 100vh; padding: 48rpx 40rpx; box-sizing: border-box; }
.ui-title { font-size: 56rpx; font-weight: 800; color: var(--ink); line-height: 1.15; }
.ui-subtitle { font-size: 28rpx; color: var(--ink-soft); margin-top: 12rpx; }
.ui-label { font-size: 24rpx; letter-spacing: 2rpx; text-transform: uppercase; color: var(--clay); font-weight: 700; }

.ui-btn {
  display: flex; align-items: center; justify-content: center;
  min-height: var(--tap-min); padding: 0 40rpx; border-radius: var(--radius-pill);
  font-size: 32rpx; font-weight: 700; margin-top: 20rpx;
}
.ui-btn--primary { background: var(--clay); color: #fff; }
.ui-btn--primary:active { background: var(--clay-pressed); }
.ui-btn--outline { background: var(--surface); color: var(--steel); border: 2rpx solid var(--line); }

.ui-tile {
  background: var(--surface); border-radius: var(--radius-card); padding: 32rpx;
  box-shadow: var(--shadow-soft); margin-top: 24rpx;
  animation: ui-rise 0.4s ease both;
}
.ui-tile__title { font-size: 34rpx; font-weight: 700; color: var(--ink); }
.ui-tile__sub { font-size: 26rpx; color: var(--ink-soft); margin-top: 8rpx; }
.ui-badge { display: inline-block; margin-top: 16rpx; font-size: 22rpx; color: var(--gold); background: rgba(224,178,74,0.14); padding: 4rpx 16rpx; border-radius: var(--radius-pill); }

.ui-field {
  width: 100%; box-sizing: border-box; min-height: var(--tap-min);
  background: var(--surface); border: 2rpx solid var(--line); border-radius: var(--radius-card);
  padding: 0 28rpx; font-size: 30rpx; color: var(--ink); margin-top: 20rpx;
}
.ui-state { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 60vh; text-align: center; }

@keyframes ui-rise { from { opacity: 0; transform: translateY(16rpx); } to { opacity: 1; transform: none; } }
```

- [ ] **Step 2: Create `src/components/ui/index.tsx`**

```tsx
import { Button as TaroButton, Input, Text, View } from "@tarojs/components";
import type { PropsWithChildren } from "react";

import "./ui.scss";

export const Screen = ({ children }: PropsWithChildren): JSX.Element => <View className="ui-screen">{children}</View>;

export const Title = ({ children }: PropsWithChildren): JSX.Element => <View className="ui-title">{children}</View>;
export const Subtitle = ({ children }: PropsWithChildren): JSX.Element => <View className="ui-subtitle">{children}</View>;
export const Label = ({ children }: PropsWithChildren): JSX.Element => <View className="ui-label">{children}</View>;

export const Button = ({
  children,
  onClick,
  variant = "primary"
}: PropsWithChildren<{ onClick?: () => void; variant?: "primary" | "outline" }>): JSX.Element => (
  <TaroButton className={`ui-btn ui-btn--${variant}`} onClick={onClick}>
    {children}
  </TaroButton>
);

export const Tile = ({ title, sub, stub }: { title: string; sub: string; stub?: boolean }): JSX.Element => (
  <View className="ui-tile">
    <View className="ui-tile__title">{title}</View>
    <View className="ui-tile__sub">{sub}</View>
    {stub ? <Text className="ui-badge">敬请期待</Text> : null}
  </View>
);

export const Field = ({
  value,
  placeholder,
  onInput
}: {
  value: string;
  placeholder: string;
  onInput: (value: string) => void;
}): JSX.Element => (
  <Input
    className="ui-field"
    value={value}
    placeholder={placeholder}
    onInput={(e) => onInput((e.detail as { value: string }).value)}
  />
);

export const StateView = ({ title, sub }: { title: string; sub?: string }): JSX.Element => (
  <View className="ui-state">
    <View className="ui-title">{title}</View>
    {sub ? <View className="ui-subtitle">{sub}</View> : null}
  </View>
);
```

- [ ] **Step 3: Typecheck** — `corepack pnpm --filter @construction/miniprogram exec tsc --noEmit -p tsconfig.json` clean.

- [ ] **Step 4: Commit**

```bash
git add apps/miniprogram/src/components/ui
git commit -m "feat(miniprogram): warm-earthen UI component primitives (B4)"
```

---

## Task B5: Role panels, pages, and app wiring

**Files:** Create `src/components/role-panels/index.tsx`; create `src/pages/login/{index.tsx,index.config.ts}`, `src/pages/bind/{index.tsx,index.config.ts}`, `src/pages/home/{index.tsx,index.config.ts}`; replace `src/app.ts` with `src/app.tsx`.

- [ ] **Step 1: Create `src/components/role-panels/index.tsx`**

```tsx
import { View } from "@tarojs/components";

import { Label, Tile, Title } from "../ui/index.js";
import type { PanelKey } from "../../routing/roleHome.js";

const TILES: Record<PanelKey, { title: string; tiles: ReadonlyArray<{ title: string; sub: string }> }> = {
  companyAdmin: { title: "公司管理员", tiles: [{ title: "公司与项目", sub: "管理公司下的项目" }, { title: "人员", sub: "公司人员总览" }] },
  none: { title: "已绑定", tiles: [] },
  projectAdmin: { title: "项目管理员", tiles: [{ title: "项目管理", sub: "班组 / 人员 / 排班" }, { title: "报表", sub: "日 / 周 / 月考勤" }, { title: "邀请", sub: "生成绑定邀请码" }] },
  systemAdmin: { title: "系统管理员", tiles: [{ title: "系统配置", sub: "公司 / 角色 / 全局设置" }] },
  teamLeader: { title: "班组长", tiles: [{ title: "补卡审批", sub: "审批本班组补卡" }, { title: "团队考勤", sub: "查看班组出勤" }] },
  worker: { title: "工人", tiles: [{ title: "打卡", sub: "四点考勤 · 拍照 + 定位" }, { title: "我的记录", sub: "查看出勤明细" }, { title: "补卡", sub: "提交补卡申请" }] }
};

export const RolePanel = ({ panel }: { panel: PanelKey }): JSX.Element => {
  const cfg = TILES[panel];
  return (
    <View>
      <Label>当前身份</Label>
      <Title>{cfg.title}</Title>
      {panel === "none" ? (
        <Tile title="尚未分配角色" sub="你已绑定账号，但还没有被授予项目角色。请联系管理员分配后再使用。" />
      ) : (
        cfg.tiles.map((t) => <Tile key={t.title} title={t.title} sub={t.sub} stub />)
      )}
    </View>
  );
};
```

- [ ] **Step 2: Create `src/pages/login/index.config.ts`**

```ts
export default definePageConfig({ navigationBarTitleText: "登录" });
```

- [ ] **Step 3: Create `src/pages/login/index.tsx`**

```tsx
import { View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useState } from "react";

import { Button, Label, Screen, Subtitle, Title } from "../../components/ui/index.js";
import { devLogin } from "../../services/auth.js";
import { useSession } from "../../store/session.js";

const DEMO_ROLES: ReadonlyArray<{ code: string; label: string }> = [
  { code: "dev-worker", label: "工人" },
  { code: "dev-team", label: "班组长" },
  { code: "dev-project", label: "项目管理员" },
  { code: "dev-company", label: "公司管理员" },
  { code: "dev-system", label: "系统管理员" },
  { code: "dev-unbound", label: "未绑定用户(测绑定流程)" }
];

export default function Login(): JSX.Element {
  const { phase, onLoggedIn } = useSession();
  const [busy, setBusy] = useState(false);

  useDidShow(() => {
    if (phase === "ready" || phase === "norole") {
      void Taro.redirectTo({ url: "/pages/home/index" });
    } else if (phase === "unbound") {
      void Taro.redirectTo({ url: "/pages/bind/index" });
    }
  });

  const pick = async (code: string): Promise<void> => {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      await devLogin(code);
      await onLoggedIn();
      await Taro.redirectTo({ url: "/pages/home/index" });
    } catch {
      await Taro.showToast({ icon: "none", title: "登录失败，请重试" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Label>工地考勤</Label>
      <Title>今天打卡了吗?</Title>
      <Subtitle>开发态登录:选择一个演示身份直接进入</Subtitle>
      {DEMO_ROLES.map((r) => (
        <Button key={r.code} variant={r.code === "dev-worker" ? "primary" : "outline"} onClick={() => void pick(r.code)}>
          {r.label}
        </Button>
      ))}
    </Screen>
  );
}
```

(Note: `home` handles redirecting unbound/no-token cases, so after login we always go to `home` which re-routes as needed.)

- [ ] **Step 4: Create `src/pages/bind/index.config.ts`**

```ts
export default definePageConfig({ navigationBarTitleText: "绑定" });
```

- [ ] **Step 5: Create `src/pages/bind/index.tsx`**

```tsx
import Taro from "@tarojs/taro";
import { useState } from "react";

import { Button, Field, Screen, Subtitle, Title } from "../../components/ui/index.js";
import { bindByInvitation } from "../../services/auth.js";
import { useSession } from "../../store/session.js";

export default function Bind(): JSX.Element {
  const { refreshMe, clear } = useSession();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (): Promise<void> => {
    if (busy || code.trim().length === 0) {
      return;
    }
    setBusy(true);
    try {
      await bindByInvitation(code.trim());
      await refreshMe();
      await Taro.redirectTo({ url: "/pages/home/index" });
    } catch {
      await Taro.showToast({ icon: "none", title: "绑定失败:邀请码无效或已使用" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>绑定身份</Title>
      <Subtitle>输入管理员发放的邀请码完成绑定</Subtitle>
      <Field value={code} placeholder="邀请码,如 DEV-BIND-CODE" onInput={setCode} />
      <Button onClick={() => void submit()}>绑定</Button>
      <Button variant="outline" onClick={() => { clear(); void Taro.redirectTo({ url: "/pages/login/index" }); }}>
        退出登录
      </Button>
    </Screen>
  );
}
```

- [ ] **Step 6: Create `src/pages/home/index.config.ts`**

```ts
export default definePageConfig({ navigationBarTitleText: "工地考勤" });
```

- [ ] **Step 7: Create `src/pages/home/index.tsx`**

```tsx
import Taro, { useDidShow } from "@tarojs/taro";

import { Button, Screen, StateView } from "../../components/ui/index.js";
import { RolePanel } from "../../components/role-panels/index.js";
import { roleHomePanel } from "../../routing/roleHome.js";
import { useSession } from "../../store/session.js";

export default function Home(): JSX.Element {
  const { phase, state, clear } = useSession();

  useDidShow(() => {
    if (phase === "anonymous") {
      void Taro.redirectTo({ url: "/pages/login/index" });
    } else if (phase === "unbound") {
      void Taro.redirectTo({ url: "/pages/bind/index" });
    }
  });

  if (phase === "loading" || phase === "anonymous" || phase === "unbound") {
    return (
      <Screen>
        <StateView title="加载中…" />
      </Screen>
    );
  }

  const panel = roleHomePanel(state.me?.roles.highestRoleCode ?? null);

  return (
    <Screen>
      <RolePanel panel={panel} />
      <Button variant="outline" onClick={() => { clear(); void Taro.redirectTo({ url: "/pages/login/index" }); }}>
        退出登录
      </Button>
    </Screen>
  );
}
```

- [ ] **Step 8: Replace `src/app.ts` with `src/app.tsx`**

Run `rm src/app.ts` (from `apps/miniprogram`), then create `src/app.tsx`:

```tsx
import { type PropsWithChildren } from "react";

import { SessionProvider } from "./store/session.js";
import "./app.scss";

export default function App({ children }: PropsWithChildren): JSX.Element {
  return <SessionProvider>{children}</SessionProvider>;
}
```

- [ ] **Step 9: Typecheck + unit tests**

Run:
```bash
corepack pnpm --filter @construction/miniprogram exec tsc --noEmit -p tsconfig.json
corepack pnpm --filter @construction/miniprogram exec vitest run
```
Expected: typecheck clean; 11 unit tests pass.

- [ ] **Step 10: Commit**

```bash
git add apps/miniprogram/src
git rm --cached apps/miniprogram/src/app.ts 2>/dev/null || true
git commit -m "feat(miniprogram): login/bind/home pages, role panels, app provider (B5)"
```

---

## Task B6: Build, serve, and manual verification (controller-run)

**Files:** none (verification).

- [ ] **Step 1: Build both targets**

Run:
```bash
corepack pnpm --filter @construction/miniprogram build:h5
corepack pnpm --filter @construction/miniprogram build:weapp
```
Expected: both succeed; `apps/miniprogram/dist/index.html` (h5) and `app.json` (weapp) present.

- [ ] **Step 2: Start the backend (Plan A) with dev login + CORS**

Ensure PostgreSQL is up and seeded (Plan A). From `apps/api`, with `.env` having `WECHAT_DEV_LOGIN=true` and `CORS_ALLOWED_ORIGINS=http://localhost:10086`, source `.env` and run `node dist/main.js` (background).

- [ ] **Step 3: Serve the H5 dev server**

Run (background, from `apps/miniprogram`): `corepack pnpm dev:h5`. Taro's webpack-dev-server serves on port 10086. Confirm it is reachable; for a remote host, bind/forward as needed.

- [ ] **Step 4: Manual verification (browser)**

- Visit the H5 URL → login page. Pick each of the five roles → lands on the correct role panel (worker/team-leader/project-admin/company-admin/system-admin).
- Pick "未绑定用户" → routed to bind → enter `DEV-BIND-CODE` → reaches the bound-no-role home state (`NoRolePanel`).
- Confirm logout returns to login.
- (Optional) Expire/clear the access token in storage and trigger a request → confirm the 401 refresh path or redirect to login.

- [ ] **Step 5: Stop background servers.** No commit (verification only).

---

## Self-Review

- **Spec coverage:** Taro app (scaffold + B1) ✓; apiClient with 401→refresh→retry (B2) ✓; session store + phases incl. unbound/norole (B2/B3) ✓; roleHome by highestRoleCode (B2) ✓; login (dev role picker), bind, single home with five panels + NoRolePanel (B5) ✓; design tokens / warm-earthen UI (B1/B4) ✓; build both targets + manual verify against real API (B6) ✓; unit tests on the risky logic (B2) ✓.
- **Placeholder scan:** no TBD; every code step has full code; the only intentional "placeholder" is the inert role-panel tiles (by design — `敬请期待` badge).
- **Type consistency:** `RoleCode`/`MeResponse` defined in `auth.types.ts` and used by roleHome, sessionReducer, session context, auth service, role panels; `PanelKey` from roleHome used by role-panels and home page; `createApiClient` signature matches its test and `auth.ts` usage.
- **Note:** the client mirrors the server `RoleCode`/`MeResponse` rather than importing `@construction/domain` at runtime (Taro's webpack build resolving the domain package's dist-targeted exports is avoided; the unit test aliases the domain source only where needed). This keeps the app build independent of the domain dist while the *server* remains the single source of truth for the contract.
