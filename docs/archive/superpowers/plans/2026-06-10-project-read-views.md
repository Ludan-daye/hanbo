# Project Read Views — Functional Screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the project-admin role panel's inert tiles into three working screens (participants list, attendance reports, binding invitation) against the existing backend endpoints, and seed the demo data so the screens render real numbers.

**Architecture:** A frontend-only slice in `apps/miniprogram` plus a dev-only seed expansion in `apps/api/prisma/seed.dev.ts`. Three Taro pages compose new UI primitives over the existing warm-earthen design system. A small `services/management.ts` + `services/bindings.ts` wrap the existing endpoints via the existing `apiClient`. No backend code changes.

**Tech Stack:** Taro 4.2 (React + TS, webpack5), Vitest with `@tarojs/taro` mocked. Backend (running unchanged) is NestJS 10 + Prisma 6.

**Spec:** `docs/superpowers/specs/2026-06-10-project-read-views-design.md`.

---

## File Structure

- `apps/miniprogram/src/services/auth.types.ts` (modify) — broaden `MeResponse` `RoleCode` mapping note: this slice uses what is already exported; no change here unless a missing type is needed.
- `apps/miniprogram/src/services/management.types.ts` (create) — narrow client mirrors of the server's `ProjectParticipantResponse`, the daily/range report shapes, and the invitation response.
- `apps/miniprogram/src/services/management.ts` (create) — `fetchParticipants`, `fetchDailyReport`, `fetchWeeklyReport`, `fetchMonthlyReport`.
- `apps/miniprogram/src/services/bindings.ts` (create) — `createInvitation`.
- `apps/miniprogram/src/routing/projectAdmin.ts` (create) — `resolveAdminProjectId(me)` pure helper.
- `apps/miniprogram/src/components/ui/page-header.tsx` (create) — header with back arrow + title.
- `apps/miniprogram/src/components/ui/segmented.tsx` (create) — pill segmented control.
- `apps/miniprogram/src/components/ui/list-item.tsx` (create) — two-line row + trailing chip.
- `apps/miniprogram/src/components/ui/stat-card.tsx` (create) — labelled number block.
- `apps/miniprogram/src/components/ui/copy-button.tsx` (create) — `Taro.setClipboardData`.
- `apps/miniprogram/src/components/ui/ui.scss` (modify) — styles for the 5 new primitives.
- `apps/miniprogram/src/components/ui/index.tsx` (modify) — re-export the 5 new primitives.
- `apps/miniprogram/src/pages/participants/{index.tsx,index.config.ts}` (create).
- `apps/miniprogram/src/pages/reports/{index.tsx,index.config.ts}` (create), plus `apps/miniprogram/src/pages/reports/view-model.ts` for the pure mapper.
- `apps/miniprogram/src/pages/invitation/{index.tsx,index.config.ts}` (create).
- `apps/miniprogram/src/app.config.ts` (modify) — register the three new pages.
- `apps/miniprogram/src/components/role-panels/index.tsx` (modify) — make the three projectAdmin tiles navigable; drop their `stub` flag.
- `apps/miniprogram/test/projectAdmin.test.ts` (create), `test/management.service.test.ts` (create), `test/bindings.service.test.ts` (create), `test/reports.view-model.test.ts` (create).
- `apps/api/prisma/seed.dev.ts` (modify) — add project memberships + 3 attendance_results rows.

---

## Background facts the implementer must know

- The api-client (`src/services/apiClient.ts`) takes a path and an options object (`{ method, data, auth }`) and is created via `createApiClient(baseUrl)`. The auth service module already instantiates one and stores it as `client` inside `services/auth.ts`. For consistency, reuse a SHARED client instance: import it from a new tiny module `src/services/client.ts` rather than newing one up in each service. (See Task 2.)
- Taro hooks for navigation: `Taro.navigateTo({ url })`, `Taro.navigateBack()`, `Taro.setClipboardData({ data })`, `Taro.showToast({ title, icon })`. The `@tarojs/taro` mock in `test/taro-mock.ts` already exposes `request`, `getStorageSync`, `setStorageSync`, `removeStorageSync`. Some pages call new Taro APIs; the test files for pure logic do NOT import the pages, so the mock does not need to grow.
- The MeResponse type (already in `src/services/auth.types.ts`) has `roles.assignments: ReadonlyArray<{ roleCode: RoleCode; scope: { scopeType: string; scopeId: string } }>`.
- The vitest config (`apps/miniprogram/vitest.config.ts`) aliases `@tarojs/taro` to `test/taro-mock.ts` and includes `test/**/*.test.ts`.
- The project's Taro pages use extensionless relative imports (e.g. `from "../../components/ui/index"`, not `index.js`). Keep that convention.
- Backend endpoint quirk: the WEEKLY report query parameter is named `weekStartDate` (NOT `startDate`); MONTHLY is `month=YYYY-MM`; DAILY is `date=YYYY-MM-DD`.

---

## Task 1: Pure helper — `resolveAdminProjectId`

**Files:**
- Create: `apps/miniprogram/src/routing/projectAdmin.ts`
- Test: `apps/miniprogram/test/projectAdmin.test.ts`

- [ ] **Step 1: Write the failing test** — `apps/miniprogram/test/projectAdmin.test.ts`:

```ts
import { describe, expect, test } from "vitest";

import { resolveAdminProjectId } from "../src/routing/projectAdmin";

const me = (assignments: ReadonlyArray<{ roleCode: string; scopeType: string; scopeId: string }>) => ({
  user: { id: "u1", isBound: true, status: "ACTIVE" },
  profile: { type: "MANAGER" as const, id: "m1" },
  roles: {
    assignments: assignments.map((a) => ({ roleCode: a.roleCode, scope: { scopeType: a.scopeType, scopeId: a.scopeId } })),
    highestRoleCode: "PROJECT_ADMIN" as const
  }
});

describe("resolveAdminProjectId", () => {
  test("returns the first PROJECT_ADMIN assignment's scopeId", () => {
    expect(
      resolveAdminProjectId(me([
        { roleCode: "PROJECT_ADMIN", scopeType: "PROJECT", scopeId: "p-1" },
        { roleCode: "PROJECT_ADMIN", scopeType: "PROJECT", scopeId: "p-2" }
      ]) as never)
    ).toBe("p-1");
  });

  test("ignores PROJECT_ADMIN assignments whose scope is not PROJECT", () => {
    expect(
      resolveAdminProjectId(me([
        { roleCode: "PROJECT_ADMIN", scopeType: "GLOBAL", scopeId: "GLOBAL" }
      ]) as never)
    ).toBeNull();
  });

  test("returns null when there are no PROJECT_ADMIN assignments", () => {
    expect(resolveAdminProjectId(me([{ roleCode: "WORKER", scopeType: "PROJECT", scopeId: "p-1" }]) as never)).toBeNull();
  });

  test("returns null when me is null", () => {
    expect(resolveAdminProjectId(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run → fail**
Run: `corepack pnpm --filter @construction/miniprogram exec vitest run test/projectAdmin.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `apps/miniprogram/src/routing/projectAdmin.ts`:

```ts
import type { MeResponse } from "../services/auth.types";

export const resolveAdminProjectId = (me: MeResponse | null): string | null => {
  if (me === null) {
    return null;
  }
  for (const assignment of me.roles.assignments) {
    if (assignment.roleCode === "PROJECT_ADMIN" && assignment.scope.scopeType === "PROJECT") {
      return assignment.scope.scopeId;
    }
  }
  return null;
};
```

- [ ] **Step 4: Run → pass**
Run: `corepack pnpm --filter @construction/miniprogram exec vitest run test/projectAdmin.test.ts` — 4 pass.

- [ ] **Step 5: Commit**

```bash
git add apps/miniprogram/src/routing/projectAdmin.ts apps/miniprogram/test/projectAdmin.test.ts
git commit -m "feat(miniprogram): resolveAdminProjectId helper for project-admin routing"
```

---

## Task 2: Shared api-client + management service

**Files:**
- Create: `apps/miniprogram/src/services/client.ts`
- Create: `apps/miniprogram/src/services/management.types.ts`
- Create: `apps/miniprogram/src/services/management.ts`
- Modify: `apps/miniprogram/src/services/auth.ts` (replace the inline `client` with the shared one)
- Test: `apps/miniprogram/test/management.service.test.ts`

- [ ] **Step 1: Write the failing test** — `apps/miniprogram/test/management.service.test.ts`:

```ts
import { afterEach, describe, expect, test } from "vitest";

import Taro, { __setRequestHandler } from "@tarojs/taro";

import {
  fetchDailyReport,
  fetchMonthlyReport,
  fetchParticipants,
  fetchWeeklyReport
} from "../src/services/management";

afterEach(() => {
  Taro.removeStorageSync("accessToken");
  Taro.removeStorageSync("refreshToken");
});

const setToken = (): void => {
  Taro.setStorageSync("accessToken", "tok");
};

const recordRequests = () => {
  const calls: Array<{ url: string; method?: string }> = [];
  __setRequestHandler(async (o) => {
    calls.push({ url: o.url, method: o.method });
    return { statusCode: 200, data: { ok: true } };
  });
  return calls;
};

describe("management service URLs and methods", () => {
  test("fetchParticipants -> GET /management/projects/:projectId/participants", async () => {
    setToken();
    const calls = recordRequests();
    await fetchParticipants("p-1");
    expect(calls[0]?.method).toBe("GET");
    expect(calls[0]?.url.endsWith("/management/projects/p-1/participants")).toBe(true);
  });

  test("fetchDailyReport -> GET .../daily?date=YYYY-MM-DD", async () => {
    setToken();
    const calls = recordRequests();
    await fetchDailyReport("p-1", "2026-06-10");
    expect(calls[0]?.url.endsWith("/reports/projects/p-1/daily?date=2026-06-10")).toBe(true);
  });

  test("fetchWeeklyReport -> GET .../weekly?weekStartDate=YYYY-MM-DD", async () => {
    setToken();
    const calls = recordRequests();
    await fetchWeeklyReport("p-1", "2026-06-08");
    expect(calls[0]?.url.endsWith("/reports/projects/p-1/weekly?weekStartDate=2026-06-08")).toBe(true);
  });

  test("fetchMonthlyReport -> GET .../monthly?month=YYYY-MM", async () => {
    setToken();
    const calls = recordRequests();
    await fetchMonthlyReport("p-1", "2026-06");
    expect(calls[0]?.url.endsWith("/reports/projects/p-1/monthly?month=2026-06")).toBe(true);
  });
});
```

- [ ] **Step 2: Run → fail**
Run: `corepack pnpm --filter @construction/miniprogram exec vitest run test/management.service.test.ts`
Expected: FAIL (modules missing).

- [ ] **Step 3: Implement the shared client** — `apps/miniprogram/src/services/client.ts`:

```ts
import { API_BASE_URL } from "../config/env";
import { createApiClient } from "./apiClient";

export const apiClient = createApiClient(API_BASE_URL);
```

- [ ] **Step 4: Implement client types** — `apps/miniprogram/src/services/management.types.ts`:

```ts
export type ParticipantType = "WORKER" | "MANAGER";
export type MemberStatus = "ACTIVE" | "EXITED" | "SUSPENDED";

export type ProjectParticipant = {
  readonly displayName: string | null;
  readonly memberId: string;
  readonly participantType: ParticipantType;
  readonly phone: string;
  readonly profileId: string;
  readonly projectId: string;
  readonly projectRoleLabel: string;
  readonly requiresAttendance: boolean;
  readonly status: MemberStatus;
  readonly teamId: string | null;
  readonly teamName: string | null;
};

export type ReportTotals = {
  readonly abnormalRecordCount: number;
  readonly absenceCount: number;
  readonly actualAttendedDays: number;
  readonly approvedMakeupCount: number;
  readonly earlyLeaveCount: number;
  readonly lateCount: number;
  readonly missingPunchCount: number;
  readonly participantCount: number;
  readonly scheduledDays: number;
  readonly workedMinutes: number;
};

export type ReportParticipantBase = {
  readonly displayName: string | null;
  readonly memberId: string;
  readonly memberStatus: MemberStatus;
  readonly participantId: string;
  readonly participantType: ParticipantType;
  readonly phone: string;
  readonly projectRoleLabel: string;
  readonly requiresAttendance: boolean;
  readonly teamId: string | null;
  readonly teamName: string | null;
  readonly workType: string | null;
};

export type DailyReportParticipant = ReportParticipantBase & {
  readonly abnormalRecordCount: number;
  readonly approvedMakeupCount: number;
  readonly isAbsent: boolean;
  readonly isEarlyLeave: boolean;
  readonly isLate: boolean;
  readonly isMissingPunch: boolean;
  readonly workedMinutes: number;
};

export type RangeReportParticipant = ReportParticipantBase & Omit<ReportTotals, "participantCount">;

export type DailyReport = {
  readonly endDate: string;
  readonly participants: ReadonlyArray<DailyReportParticipant>;
  readonly periodType: "DAILY";
  readonly projectId: string;
  readonly startDate: string;
  readonly totals: ReportTotals;
};

export type RangeReport = {
  readonly endDate: string;
  readonly participants: ReadonlyArray<RangeReportParticipant>;
  readonly periodType: "WEEKLY" | "MONTHLY";
  readonly projectId: string;
  readonly startDate: string;
  readonly totals: ReportTotals;
};
```

- [ ] **Step 5: Implement the management service** — `apps/miniprogram/src/services/management.ts`:

```ts
import { apiClient } from "./client";
import type { DailyReport, ProjectParticipant, RangeReport } from "./management.types";

export const fetchParticipants = async (projectId: string): Promise<ReadonlyArray<ProjectParticipant>> =>
  apiClient.request<ReadonlyArray<ProjectParticipant>>(`/management/projects/${projectId}/participants`, { method: "GET" });

export const fetchDailyReport = async (projectId: string, date: string): Promise<DailyReport> =>
  apiClient.request<DailyReport>(`/reports/projects/${projectId}/daily?date=${date}`, { method: "GET" });

export const fetchWeeklyReport = async (projectId: string, weekStartDate: string): Promise<RangeReport> =>
  apiClient.request<RangeReport>(`/reports/projects/${projectId}/weekly?weekStartDate=${weekStartDate}`, { method: "GET" });

export const fetchMonthlyReport = async (projectId: string, month: string): Promise<RangeReport> =>
  apiClient.request<RangeReport>(`/reports/projects/${projectId}/monthly?month=${month}`, { method: "GET" });
```

- [ ] **Step 6: Reuse the shared client in `auth.ts`** — in `apps/miniprogram/src/services/auth.ts`, replace:
```ts
import { createApiClient } from "./apiClient";

const client = createApiClient(API_BASE_URL);
```
with:
```ts
import { apiClient as client } from "./client";
```
and remove the now-unused `API_BASE_URL` and `createApiClient` imports (the lint `noUnusedLocals` will flag them otherwise).

- [ ] **Step 7: Run → pass**
Run: `corepack pnpm --filter @construction/miniprogram exec vitest run` — all (auth-related and new management tests) pass.

- [ ] **Step 8: Typecheck + commit**
```bash
corepack pnpm --filter @construction/miniprogram exec tsc --noEmit -p tsconfig.json
git add apps/miniprogram/src/services apps/miniprogram/test/management.service.test.ts
git commit -m "feat(miniprogram): management/reports API service wrappers"
```

---

## Task 3: Bindings service (invitation)

**Files:**
- Create: `apps/miniprogram/src/services/bindings.ts`
- Test: `apps/miniprogram/test/bindings.service.test.ts`

- [ ] **Step 1: Write the failing test** — `apps/miniprogram/test/bindings.service.test.ts`:

```ts
import { afterEach, describe, expect, test } from "vitest";

import Taro, { __setRequestHandler } from "@tarojs/taro";

import { createInvitation } from "../src/services/bindings";

afterEach(() => {
  Taro.removeStorageSync("accessToken");
});

describe("bindings service", () => {
  test("createInvitation -> POST .../invitations with {profileId,targetType} returns server payload", async () => {
    Taro.setStorageSync("accessToken", "tok");
    let seenUrl = "";
    let seenBody: unknown = null;
    __setRequestHandler(async (o) => {
      seenUrl = o.url;
      seenBody = o.data;
      return {
        statusCode: 201,
        data: { code: "ABC-123", expiresAt: "2030-01-01T00:00:00.000Z", id: "inv-1", profileId: "w-1", projectId: "p-1", targetType: "WORKER" }
      };
    });
    const result = await createInvitation("p-1", { profileId: "w-1", targetType: "WORKER" });
    expect(seenUrl.endsWith("/bindings/projects/p-1/invitations")).toBe(true);
    expect(seenBody).toEqual({ profileId: "w-1", targetType: "WORKER" });
    expect(result.code).toBe("ABC-123");
  });
});
```

- [ ] **Step 2: Run → fail**
Run: `corepack pnpm --filter @construction/miniprogram exec vitest run test/bindings.service.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** — `apps/miniprogram/src/services/bindings.ts`:

```ts
import { apiClient } from "./client";

export type BindingTargetType = "WORKER" | "MANAGER";

export type BindingInvitation = {
  readonly code: string;
  readonly expiresAt: string;
  readonly id: string;
  readonly profileId: string;
  readonly projectId: string;
  readonly targetType: BindingTargetType;
};

export const createInvitation = async (
  projectId: string,
  body: { readonly profileId: string; readonly targetType: BindingTargetType }
): Promise<BindingInvitation> =>
  apiClient.request<BindingInvitation>(`/bindings/projects/${projectId}/invitations`, { data: body, method: "POST" });
```

- [ ] **Step 4: Run → pass + commit**
Run: `corepack pnpm --filter @construction/miniprogram exec vitest run test/bindings.service.test.ts` — pass.
```bash
git add apps/miniprogram/src/services/bindings.ts apps/miniprogram/test/bindings.service.test.ts
git commit -m "feat(miniprogram): bindings invitation API wrapper"
```

---

## Task 4: UI primitives — PageHeader / Segmented / ListItem / StatCard / CopyButton

**Files:**
- Create: `apps/miniprogram/src/components/ui/page-header.tsx`
- Create: `apps/miniprogram/src/components/ui/segmented.tsx`
- Create: `apps/miniprogram/src/components/ui/list-item.tsx`
- Create: `apps/miniprogram/src/components/ui/stat-card.tsx`
- Create: `apps/miniprogram/src/components/ui/copy-button.tsx`
- Modify: `apps/miniprogram/src/components/ui/ui.scss`
- Modify: `apps/miniprogram/src/components/ui/index.tsx` (re-export the 5 components)

- [ ] **Step 1: Append styles to `apps/miniprogram/src/components/ui/ui.scss`**

```scss
.ui-header { display:flex; align-items:center; min-height: 88rpx; }
.ui-header__back { width: 64rpx; height: 64rpx; display:flex; align-items:center; justify-content:center; color: var(--ink); font-size: 36rpx; }
.ui-header__title { font-size: 36rpx; font-weight: 800; color: var(--ink); margin-left: 12rpx; }

.ui-segmented { display:flex; background: var(--surface-sunk); border-radius: var(--radius-pill); padding: 6rpx; margin-top: 20rpx; }
.ui-segmented__item { flex:1; text-align:center; padding: 16rpx 0; border-radius: var(--radius-pill); font-size: 28rpx; color: var(--ink-soft); }
.ui-segmented__item--active { background: var(--clay); color: #fff; font-weight: 700; }

.ui-listitem { background: var(--surface); border-radius: var(--radius-card); padding: 24rpx 28rpx; margin-top: 16rpx; box-shadow: var(--shadow-soft); display:flex; align-items:center; justify-content: space-between; }
.ui-listitem__body { display:flex; flex-direction:column; }
.ui-listitem__primary { font-size: 30rpx; font-weight: 700; color: var(--ink); }
.ui-listitem__secondary { font-size: 24rpx; color: var(--ink-soft); margin-top: 4rpx; }
.ui-listitem__chip { font-size: 22rpx; color: var(--steel); background: var(--clay-tint); padding: 4rpx 16rpx; border-radius: var(--radius-pill); }

.ui-statcard { display:flex; flex-direction:column; background: var(--surface); border-radius: var(--radius-card); padding: 20rpx 24rpx; box-shadow: var(--shadow-soft); margin-top: 16rpx; }
.ui-statcard__label { font-size: 22rpx; color: var(--ink-soft); text-transform: uppercase; letter-spacing: 2rpx; }
.ui-statcard__value { font-size: 44rpx; font-weight: 800; color: var(--ink); margin-top: 4rpx; }
.ui-statcards { display:flex; gap: 16rpx; flex-wrap: wrap; }
.ui-statcards > .ui-statcard { flex: 1 1 30%; margin-top: 16rpx; }
```

- [ ] **Step 2: Create `apps/miniprogram/src/components/ui/page-header.tsx`**

```tsx
import { View } from "@tarojs/components";
import Taro from "@tarojs/taro";

export const PageHeader = ({ title }: { title: string }): JSX.Element => (
  <View className="ui-header">
    <View className="ui-header__back" onClick={() => { void Taro.navigateBack(); }}>‹</View>
    <View className="ui-header__title">{title}</View>
  </View>
);
```

- [ ] **Step 3: Create `apps/miniprogram/src/components/ui/segmented.tsx`**

```tsx
import { View } from "@tarojs/components";

export type SegmentedOption<T extends string> = { readonly value: T; readonly label: string };

export const Segmented = <T extends string>({
  options,
  value,
  onChange
}: {
  readonly options: ReadonlyArray<SegmentedOption<T>>;
  readonly value: T;
  readonly onChange: (next: T) => void;
}): JSX.Element => (
  <View className="ui-segmented">
    {options.map((o) => (
      <View
        key={o.value}
        className={`ui-segmented__item ${o.value === value ? "ui-segmented__item--active" : ""}`}
        onClick={() => onChange(o.value)}
      >
        {o.label}
      </View>
    ))}
  </View>
);
```

- [ ] **Step 4: Create `apps/miniprogram/src/components/ui/list-item.tsx`**

```tsx
import { View } from "@tarojs/components";

export const ListItem = ({
  primary,
  secondary,
  chip,
  onClick
}: {
  readonly primary: string;
  readonly secondary?: string;
  readonly chip?: string;
  readonly onClick?: () => void;
}): JSX.Element => (
  <View className="ui-listitem" onClick={onClick}>
    <View className="ui-listitem__body">
      <View className="ui-listitem__primary">{primary}</View>
      {secondary ? <View className="ui-listitem__secondary">{secondary}</View> : null}
    </View>
    {chip ? <View className="ui-listitem__chip">{chip}</View> : null}
  </View>
);
```

- [ ] **Step 5: Create `apps/miniprogram/src/components/ui/stat-card.tsx`**

```tsx
import { View } from "@tarojs/components";

export const StatCard = ({ label, value }: { readonly label: string; readonly value: string }): JSX.Element => (
  <View className="ui-statcard">
    <View className="ui-statcard__label">{label}</View>
    <View className="ui-statcard__value">{value}</View>
  </View>
);

export const StatCards = ({ items }: { readonly items: ReadonlyArray<{ label: string; value: string }> }): JSX.Element => (
  <View className="ui-statcards">
    {items.map((it) => (
      <StatCard key={it.label} label={it.label} value={it.value} />
    ))}
  </View>
);
```

- [ ] **Step 6: Create `apps/miniprogram/src/components/ui/copy-button.tsx`**

```tsx
import { Button } from "@tarojs/components";
import Taro from "@tarojs/taro";

export const CopyButton = ({ value, label = "复制" }: { readonly value: string; readonly label?: string }): JSX.Element => (
  <Button
    className="ui-btn ui-btn--outline"
    onClick={async () => {
      await Taro.setClipboardData({ data: value });
      await Taro.showToast({ icon: "success", title: "已复制" });
    }}
  >
    {label}
  </Button>
);
```

- [ ] **Step 7: Re-export from `apps/miniprogram/src/components/ui/index.tsx`** — append these exports (after the existing `StateView` export):

```tsx
export { PageHeader } from "./page-header";
export { Segmented, type SegmentedOption } from "./segmented";
export { ListItem } from "./list-item";
export { StatCard, StatCards } from "./stat-card";
export { CopyButton } from "./copy-button";
```

- [ ] **Step 8: Typecheck + commit**
Run: `corepack pnpm --filter @construction/miniprogram exec tsc --noEmit -p tsconfig.json` — clean.
```bash
git add apps/miniprogram/src/components/ui
git commit -m "feat(miniprogram): UI primitives — PageHeader/Segmented/ListItem/StatCard(s)/CopyButton"
```

---

## Task 5: Participants page

**Files:**
- Create: `apps/miniprogram/src/pages/participants/index.tsx`
- Create: `apps/miniprogram/src/pages/participants/index.config.ts`

- [ ] **Step 1: Create `index.config.ts`**

```ts
export default definePageConfig({ navigationBarTitleText: "项目参与者" });
```

- [ ] **Step 2: Create `index.tsx`**

```tsx
import { View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useMemo, useState } from "react";

import { ListItem, PageHeader, Screen, Segmented, StateView } from "../../components/ui/index";
import { resolveAdminProjectId } from "../../routing/projectAdmin";
import { fetchParticipants } from "../../services/management";
import type { ParticipantType, ProjectParticipant } from "../../services/management.types";
import { useSession } from "../../store/session";

type Filter = "ALL" | ParticipantType;
const FILTER_OPTIONS = [
  { label: "全部", value: "ALL" as const },
  { label: "工人", value: "WORKER" as const },
  { label: "管理员", value: "MANAGER" as const }
];

export default function Participants(): JSX.Element {
  const { state } = useSession();
  const projectId = resolveAdminProjectId(state.me);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [items, setItems] = useState<ReadonlyArray<ProjectParticipant> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (projectId === null) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const rows = await fetchParticipants(projectId);
        if (!cancelled) {
          setItems(rows);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "REQUEST_FAILED");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  const visible = useMemo(() => {
    if (items === null) {
      return [];
    }
    return filter === "ALL" ? items : items.filter((p) => p.participantType === filter);
  }, [items, filter]);

  if (projectId === null) {
    return (
      <Screen>
        <PageHeader title="项目参与者" />
        <StateView title="无项目" sub="当前账号没有项目管理员身份。" />
      </Screen>
    );
  }

  return (
    <Screen>
      <PageHeader title="项目参与者" />
      <Segmented options={FILTER_OPTIONS} value={filter} onChange={setFilter} />
      {items === null && error === null ? <StateView title="加载中…" /> : null}
      {error !== null ? <StateView title="加载失败" sub={error} /> : null}
      {items !== null && visible.length === 0 ? <StateView title="尚无参与者" /> : null}
      <View>
        {visible.map((p) => (
          <ListItem
            key={p.memberId}
            primary={p.displayName ?? "(未填写姓名)"}
            secondary={`${p.projectRoleLabel} · ${p.teamName ?? "无班组"} · ${p.phone}`}
            chip={p.participantType === "WORKER" ? "工人" : "管理员"}
            onClick={() => { void Taro.showToast({ icon: "none", title: p.status }); }}
          />
        ))}
      </View>
    </Screen>
  );
}
```

- [ ] **Step 3: Typecheck + commit**
Run: `corepack pnpm --filter @construction/miniprogram exec tsc --noEmit -p tsconfig.json` — clean.
```bash
git add apps/miniprogram/src/pages/participants
git commit -m "feat(miniprogram): participants page"
```

---

## Task 6: Reports page (with pure view-model + unit test)

**Files:**
- Create: `apps/miniprogram/src/pages/reports/index.config.ts`
- Create: `apps/miniprogram/src/pages/reports/view-model.ts`
- Create: `apps/miniprogram/src/pages/reports/index.tsx`
- Test: `apps/miniprogram/test/reports.view-model.test.ts`

- [ ] **Step 1: Write the failing test** — `apps/miniprogram/test/reports.view-model.test.ts`:

```ts
import { describe, expect, test } from "vitest";

import { totalsStatItems } from "../src/pages/reports/view-model";

describe("totalsStatItems", () => {
  test("maps daily totals to labelled cards", () => {
    const items = totalsStatItems({
      abnormalRecordCount: 1,
      absenceCount: 2,
      actualAttendedDays: 3,
      approvedMakeupCount: 4,
      earlyLeaveCount: 5,
      lateCount: 6,
      missingPunchCount: 7,
      participantCount: 8,
      scheduledDays: 9,
      workedMinutes: 600
    });
    expect(items).toContainEqual({ label: "出勤人数", value: "8" });
    expect(items).toContainEqual({ label: "迟到", value: "6" });
    expect(items).toContainEqual({ label: "缺勤", value: "2" });
    expect(items).toContainEqual({ label: "工时", value: "10.0h" });
  });
});
```

- [ ] **Step 2: Run → fail**
Run: `corepack pnpm --filter @construction/miniprogram exec vitest run test/reports.view-model.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement view-model** — `apps/miniprogram/src/pages/reports/view-model.ts`:

```ts
import type { ReportTotals } from "../../services/management.types";

export const totalsStatItems = (totals: ReportTotals): ReadonlyArray<{ label: string; value: string }> => [
  { label: "出勤人数", value: String(totals.participantCount) },
  { label: "应排天数", value: String(totals.scheduledDays) },
  { label: "实出天数", value: String(totals.actualAttendedDays) },
  { label: "迟到", value: String(totals.lateCount) },
  { label: "早退", value: String(totals.earlyLeaveCount) },
  { label: "缺卡", value: String(totals.missingPunchCount) },
  { label: "缺勤", value: String(totals.absenceCount) },
  { label: "补卡通过", value: String(totals.approvedMakeupCount) },
  { label: "异常记录", value: String(totals.abnormalRecordCount) },
  { label: "工时", value: `${(totals.workedMinutes / 60).toFixed(1)}h` }
];
```

- [ ] **Step 4: Run → pass.**

- [ ] **Step 5: Create `apps/miniprogram/src/pages/reports/index.config.ts`**

```ts
export default definePageConfig({ navigationBarTitleText: "考勤报表" });
```

- [ ] **Step 6: Create `apps/miniprogram/src/pages/reports/index.tsx`**

```tsx
import { Picker, View } from "@tarojs/components";
import { useEffect, useState } from "react";

import { ListItem, PageHeader, Screen, Segmented, StateView, StatCards } from "../../components/ui/index";
import { resolveAdminProjectId } from "../../routing/projectAdmin";
import { fetchDailyReport, fetchMonthlyReport, fetchWeeklyReport } from "../../services/management";
import type { DailyReport, RangeReport, ReportTotals } from "../../services/management.types";
import { useSession } from "../../store/session";

import { totalsStatItems } from "./view-model";

type Period = "DAILY" | "WEEKLY" | "MONTHLY";

const PERIOD_OPTIONS = [
  { label: "日", value: "DAILY" as const },
  { label: "周", value: "WEEKLY" as const },
  { label: "月", value: "MONTHLY" as const }
];

const pad = (n: number): string => String(n).padStart(2, "0");

const todayDate = (): string => {
  const d = new Date();
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

const todayMonth = (): string => {
  const d = new Date();
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
};

const lastMondayDate = (): string => {
  const d = new Date();
  const day = d.getUTCDay(); // 0=Sunday
  const diff = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

type Report = DailyReport | RangeReport;

export default function Reports(): JSX.Element {
  const { state } = useSession();
  const projectId = resolveAdminProjectId(state.me);
  const [period, setPeriod] = useState<Period>("DAILY");
  const [date, setDate] = useState<string>(todayDate());
  const [weekStart, setWeekStart] = useState<string>(lastMondayDate());
  const [month, setMonth] = useState<string>(todayMonth());
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (projectId === null) {
      return;
    }
    let cancelled = false;
    setReport(null);
    setError(null);
    void (async () => {
      try {
        const data =
          period === "DAILY"
            ? await fetchDailyReport(projectId, date)
            : period === "WEEKLY"
              ? await fetchWeeklyReport(projectId, weekStart)
              : await fetchMonthlyReport(projectId, month);
        if (!cancelled) {
          setReport(data);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "REQUEST_FAILED");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [projectId, period, date, weekStart, month]);

  if (projectId === null) {
    return (
      <Screen>
        <PageHeader title="考勤报表" />
        <StateView title="无项目" sub="当前账号没有项目管理员身份。" />
      </Screen>
    );
  }

  const totals: ReportTotals | null = report?.totals ?? null;

  return (
    <Screen>
      <PageHeader title="考勤报表" />
      <Segmented options={PERIOD_OPTIONS} value={period} onChange={setPeriod} />
      <View style={{ marginTop: "20rpx" }}>
        {period === "DAILY" ? (
          <Picker mode="date" value={date} onChange={(e) => setDate(String((e.detail as { value: string }).value))}>
            <ListItem primary={`日期 · ${date}`} secondary="点选其它日期" />
          </Picker>
        ) : null}
        {period === "WEEKLY" ? (
          <Picker mode="date" value={weekStart} onChange={(e) => setWeekStart(String((e.detail as { value: string }).value))}>
            <ListItem primary={`周起始 · ${weekStart}`} secondary="点选周一日期" />
          </Picker>
        ) : null}
        {period === "MONTHLY" ? (
          <Picker mode="date" fields="month" value={month} onChange={(e) => setMonth(String((e.detail as { value: string }).value))}>
            <ListItem primary={`月份 · ${month}`} secondary="点选月份" />
          </Picker>
        ) : null}
      </View>
      {error !== null ? <StateView title="加载失败" sub={error} /> : null}
      {report === null && error === null ? <StateView title="加载中…" /> : null}
      {totals !== null ? <StatCards items={totalsStatItems(totals)} /> : null}
      <View>
        {(report?.participants ?? []).map((p) => (
          <ListItem
            key={p.memberId}
            primary={p.displayName ?? "(未填写)"}
            secondary={`${p.projectRoleLabel} · ${p.teamName ?? "无班组"}`}
            chip={`${(p.workedMinutes / 60).toFixed(1)}h`}
          />
        ))}
      </View>
    </Screen>
  );
}
```

- [ ] **Step 7: Typecheck + commit**
```bash
corepack pnpm --filter @construction/miniprogram exec tsc --noEmit -p tsconfig.json
git add apps/miniprogram/src/pages/reports apps/miniprogram/test/reports.view-model.test.ts
git commit -m "feat(miniprogram): reports page (day/week/month) with stat cards"
```

---

## Task 7: Invitation page

**Files:**
- Create: `apps/miniprogram/src/pages/invitation/index.config.ts`
- Create: `apps/miniprogram/src/pages/invitation/index.tsx`

- [ ] **Step 1: Create `index.config.ts`**

```ts
export default definePageConfig({ navigationBarTitleText: "生成绑定邀请码" });
```

- [ ] **Step 2: Create `index.tsx`**

```tsx
import { View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";

import { Button, CopyButton, ListItem, PageHeader, Screen, Segmented, StateView } from "../../components/ui/index";
import { resolveAdminProjectId } from "../../routing/projectAdmin";
import { createInvitation, type BindingInvitation, type BindingTargetType } from "../../services/bindings";
import { fetchParticipants } from "../../services/management";
import type { ProjectParticipant } from "../../services/management.types";
import { useSession } from "../../store/session";

const TARGET_OPTIONS = [
  { label: "工人", value: "WORKER" as const },
  { label: "管理员", value: "MANAGER" as const }
];

export default function Invitation(): JSX.Element {
  const { state } = useSession();
  const projectId = resolveAdminProjectId(state.me);
  const [target, setTarget] = useState<BindingTargetType>("WORKER");
  const [items, setItems] = useState<ReadonlyArray<ProjectParticipant> | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [invitation, setInvitation] = useState<BindingInvitation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (projectId === null) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const rows = await fetchParticipants(projectId);
        if (!cancelled) {
          setItems(rows);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "REQUEST_FAILED");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  const visible = (items ?? []).filter((p) => p.participantType === target);

  if (projectId === null) {
    return (
      <Screen>
        <PageHeader title="生成绑定邀请码" />
        <StateView title="无项目" sub="当前账号没有项目管理员身份。" />
      </Screen>
    );
  }

  const submit = async (): Promise<void> => {
    if (projectId === null || selectedProfileId === null || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await createInvitation(projectId, { profileId: selectedProfileId, targetType: target });
      setInvitation(r);
    } catch (e) {
      const message = e instanceof Error ? e.message : "REQUEST_FAILED";
      setError(message);
      await Taro.showToast({ icon: "none", title: "生成失败" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <PageHeader title="生成绑定邀请码" />
      <Segmented options={TARGET_OPTIONS} value={target} onChange={(v) => { setTarget(v); setSelectedProfileId(null); setInvitation(null); }} />

      {items === null && error === null ? <StateView title="加载中…" /> : null}
      {error !== null ? <StateView title="出错" sub={error} /> : null}

      <View>
        {visible.map((p) => (
          <ListItem
            key={p.profileId}
            primary={p.displayName ?? "(未填写姓名)"}
            secondary={`${p.projectRoleLabel} · ${p.teamName ?? "无班组"} · ${p.phone}`}
            chip={p.profileId === selectedProfileId ? "已选" : undefined}
            onClick={() => { setSelectedProfileId(p.profileId); setInvitation(null); }}
          />
        ))}
      </View>

      {selectedProfileId !== null && invitation === null ? (
        <Button onClick={() => { void submit(); }}>{busy ? "生成中…" : "生成邀请码"}</Button>
      ) : null}

      {invitation !== null ? (
        <View>
          <ListItem primary={`邀请码 · ${invitation.code}`} secondary={`有效期至 ${invitation.expiresAt}`} />
          <CopyButton value={invitation.code} label="复制邀请码" />
        </View>
      ) : null}
    </Screen>
  );
}
```

- [ ] **Step 3: Typecheck + commit**
```bash
corepack pnpm --filter @construction/miniprogram exec tsc --noEmit -p tsconfig.json
git add apps/miniprogram/src/pages/invitation
git commit -m "feat(miniprogram): invitation page (pick → generate → copy)"
```

---

## Task 8: Wire navigation (app.config + role panel)

**Files:**
- Modify: `apps/miniprogram/src/app.config.ts`
- Modify: `apps/miniprogram/src/components/role-panels/index.tsx`

- [ ] **Step 1: Register the three new pages** — replace the `pages` array in `apps/miniprogram/src/app.config.ts`:

```ts
  pages: [
    "pages/login/index",
    "pages/bind/index",
    "pages/home/index",
    "pages/participants/index",
    "pages/reports/index",
    "pages/invitation/index"
  ],
```

- [ ] **Step 2: Make projectAdmin tiles navigable** — replace the body of `apps/miniprogram/src/components/role-panels/index.tsx` with:

```tsx
import { View } from "@tarojs/components";
import Taro from "@tarojs/taro";

import { Label, Tile, Title } from "../ui/index";
import type { PanelKey } from "../../routing/roleHome";

type Nav = { url: string };
type TileCfg = { title: string; sub: string; nav?: Nav };

const TILES: Record<PanelKey, { title: string; tiles: ReadonlyArray<TileCfg> }> = {
  companyAdmin: { title: "公司管理员", tiles: [{ title: "公司与项目", sub: "管理公司下的项目" }, { title: "人员", sub: "公司人员总览" }] },
  none: { title: "已绑定", tiles: [] },
  projectAdmin: {
    title: "项目管理员",
    tiles: [
      { title: "项目参与者", sub: "查看工人 / 管理员", nav: { url: "/pages/participants/index" } },
      { title: "考勤报表", sub: "日 / 周 / 月", nav: { url: "/pages/reports/index" } },
      { title: "邀请", sub: "生成绑定邀请码", nav: { url: "/pages/invitation/index" } }
    ]
  },
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
        cfg.tiles.map((t) => (
          <Tile
            key={t.title}
            title={t.title}
            sub={t.sub}
            stub={t.nav === undefined}
            onClick={t.nav !== undefined ? () => { void Taro.navigateTo({ url: t.nav!.url }); } : undefined}
          />
        ))
      )}
    </View>
  );
};
```

- [ ] **Step 3: Add an `onClick` prop to the `Tile` component** — in `apps/miniprogram/src/components/ui/index.tsx`, update the existing `Tile` signature:

```tsx
export const Tile = ({ title, sub, stub, onClick }: { title: string; sub: string; stub?: boolean; onClick?: () => void }): JSX.Element => (
  <View className="ui-tile" onClick={onClick}>
    <View className="ui-tile__title">{title}</View>
    <View className="ui-tile__sub">{sub}</View>
    {stub ? <Text className="ui-badge">敬请期待</Text> : null}
  </View>
);
```

- [ ] **Step 4: Typecheck, build h5 (sanity), commit**

```bash
corepack pnpm --filter @construction/miniprogram exec tsc --noEmit -p tsconfig.json
TARO_APP_API_BASE_URL=http://139.59.255.11:3000 corepack pnpm --filter @construction/miniprogram build:h5
git add apps/miniprogram/src
git commit -m "feat(miniprogram): wire projectAdmin tiles to participants/reports/invitation"
```

---

## Task 9: Dev seed — project memberships + sample results

**Files:**
- Modify: `apps/api/prisma/seed.dev.ts`

This is a controller-run task — requires the local Postgres to verify (the seed script will fail otherwise).

- [ ] **Step 1: Open `apps/api/prisma/seed.dev.ts`** and inside `main()`, after the existing worker block and BEFORE the unbound section, add the membership and result rows:

```ts
  // Project memberships so PROJECT_ADMIN read views have real data.
  await prisma.projectWorkerMember.upsert({
    create: {
      enteredAt: new Date("2026-05-01T00:00:00.000Z"),
      projectId: project.id,
      projectRoleLabel: "钢筋工",
      requiresAttendance: true,
      status: "ACTIVE",
      teamId: team.id,
      workerId: (await prisma.workerProfile.findUniqueOrThrow({ where: { userId: workerUserId } })).id
    },
    update: { status: "ACTIVE", requiresAttendance: true, teamId: team.id },
    where: {
      projectId_workerId: {
        projectId: project.id,
        workerId: (await prisma.workerProfile.findUniqueOrThrow({ where: { userId: workerUserId } })).id
      }
    }
  });

  const teamLeaderUserId = await upsertUser("dev-team", true);
  const teamLeaderProfile = await prisma.managerProfile.findUniqueOrThrow({ where: { userId: teamLeaderUserId } });
  await prisma.projectManagerMember.upsert({
    create: {
      managerId: teamLeaderProfile.id,
      projectId: project.id,
      requiresAttendance: true,
      roleCode: "TEAM_LEADER",
      status: "ACTIVE",
      teamScopeId: team.id
    },
    update: { status: "ACTIVE", requiresAttendance: true, teamScopeId: team.id, roleCode: "TEAM_LEADER" },
    where: { projectId_managerId: { managerId: teamLeaderProfile.id, projectId: project.id } }
  });

  const projectAdminUserId = await upsertUser("dev-project", true);
  const projectAdminProfile = await prisma.managerProfile.findUniqueOrThrow({ where: { userId: projectAdminUserId } });
  await prisma.projectManagerMember.upsert({
    create: {
      managerId: projectAdminProfile.id,
      projectId: project.id,
      requiresAttendance: false,
      roleCode: "PROJECT_ADMIN",
      status: "ACTIVE",
      teamScopeId: null
    },
    update: { status: "ACTIVE", roleCode: "PROJECT_ADMIN", teamScopeId: null, requiresAttendance: false },
    where: { projectId_managerId: { managerId: projectAdminProfile.id, projectId: project.id } }
  });

  // Sample daily attendance results for the past 3 days so the report screens have data.
  const workerProfileId = (await prisma.workerProfile.findUniqueOrThrow({ where: { userId: workerUserId } })).id;
  const today = new Date();
  const toDateOnly = (d: Date): Date => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const minus = (n: number): Date => {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - n);
    return toDateOnly(d);
  };
  const seededResults = [
    { attendanceDate: minus(0), isAbsent: false, isEarlyLeave: false, isLate: false, isMissingPunch: false, workedMinutes: 480 },
    { attendanceDate: minus(1), isAbsent: false, isEarlyLeave: false, isLate: true, isMissingPunch: false, workedMinutes: 450 },
    { attendanceDate: minus(2), isAbsent: true, isEarlyLeave: false, isLate: false, isMissingPunch: false, workedMinutes: 0 }
  ];
  for (const r of seededResults) {
    await prisma.attendanceResult.upsert({
      create: {
        ...r,
        abnormalRecordCount: r.isAbsent || r.isLate ? 1 : 0,
        approvedMakeupCount: 0,
        participantId: workerProfileId,
        participantType: "WORKER",
        projectId: project.id
      },
      update: { ...r, abnormalRecordCount: r.isAbsent || r.isLate ? 1 : 0, approvedMakeupCount: 0 },
      where: {
        projectId_attendanceDate_participantType_participantId: {
          attendanceDate: r.attendanceDate,
          participantId: workerProfileId,
          participantType: "WORKER",
          projectId: project.id
        }
      }
    });
  }
```

(`upsertUser`, `project`, `team`, `workerUserId` already exist earlier in the file.)

- [ ] **Step 2: Run the seed (background DB must be up)**

Run:
```bash
corepack pnpm --filter @construction/api seed:dev
```
Expected: prints `{"devBindCode":"DEV-BIND-CODE","message":"dev seed complete"}`. Re-run a second time and confirm it still succeeds (idempotent).

- [ ] **Step 3: Verify rows**

Run:
```bash
sudo -u postgres psql -d construction_personnel -c "SELECT count(*) AS workers FROM project_worker_members WHERE \"projectId\"='dev-project';"
sudo -u postgres psql -d construction_personnel -c "SELECT count(*) AS mgrs FROM project_manager_members WHERE \"projectId\"='dev-project';"
sudo -u postgres psql -d construction_personnel -c "SELECT \"attendanceDate\",\"isAbsent\",\"isLate\",\"workedMinutes\" FROM attendance_results WHERE \"projectId\"='dev-project' ORDER BY \"attendanceDate\";"
```
Expected: workers=1, mgrs=2, three result rows including one absent + one late + one normal.

- [ ] **Step 4: Commit**
```bash
git add apps/api/prisma/seed.dev.ts
git commit -m "feat(api): seed project memberships + sample attendance results for dev"
```

---

## Task 10: H5 preview smoke (controller-run)

**Files:** none (verification).

- [ ] **Step 1:** Build the H5 with the public-IP API URL and ensure the static server picks up the fresh `dist/`:
```bash
TARO_APP_API_BASE_URL=http://139.59.255.11:3000 corepack pnpm --filter @construction/miniprogram build:h5
```

- [ ] **Step 2:** Ensure the backend and h5 servers are running (they have been throughout previous slices). If not:
```bash
( cd apps/api && set -a && . ./.env && set +a && node dist/main.js > /tmp/api.log 2>&1 ) &
( cd apps/miniprogram && python3 -m http.server 8088 --bind 0.0.0.0 --directory dist > /tmp/h5.log 2>&1 ) &
```

- [ ] **Step 3:** From a browser, open `http://139.59.255.11:8088` (force-refresh once). Log in as **项目管理员** (`dev-project`). Tap each of the three tiles — Participants shows real workers/managers; Reports shows numbers for at least one of 日 / 周 / 月; Invitation lets you pick a worker and produces a plaintext code with a Copy button.

- [ ] **Step 4:** Confirm the other role panels' tiles remain marked `敬请期待`.

No commit (verification only).

---

## Self-Review

- **Spec coverage:** participants/reports/invitation pages (T5/T6/T7) ✓; services (T2/T3) ✓; `resolveAdminProjectId` (T1) ✓; UI primitives PageHeader/Segmented/ListItem/StatCard/CopyButton (T4) ✓; routing + tile navigation (T8) ✓; dev seed memberships + results (T9) ✓; manual H5 verification (T10) ✓; deferred work (team-leader, punch, management create-forms, worker self-view) explicitly out of scope.
- **Placeholders:** none — every code step contains real code; commands include expected output where it matters.
- **Type consistency:** the client `ParticipantType`/`MemberStatus`/`ReportTotals`/`DailyReport`/`RangeReport` shapes match the server's exported types in `management.types.ts` and `reports.types.ts`; `fetchWeeklyReport` uses the real backend query parameter `weekStartDate` (not `startDate`); `createInvitation` returns `BindingInvitationResponse` shape; the reports page uses `totalsStatItems` from `view-model.ts` with the exact `ReportTotals` field names.
- **Note:** if the dev DB has been wiped between sessions, T9 will fail until migrations + the base seed run again; the previous slice's instructions still apply (`prisma migrate deploy` then `prisma db seed` then `seed:dev`).
