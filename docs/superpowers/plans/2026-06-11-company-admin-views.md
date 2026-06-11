# Company-Admin Views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the company-admin role panel's two inert tiles into real screens — a list of projects under the admin's company and a flat company-wide participants list — backed by two new COMPANY-scoped GET endpoints.

**Architecture:** Add two GET handlers to the existing `ManagementController` (no new modules, no permission rule changes). Each uses `@RequirePermission(attendance.view, { source: "companyParam", paramName: "companyId" })`. `COMPANY_ADMIN` inherits `attendance.view` from `PROJECT_ADMIN` via the role hierarchy, so a `COMPANY_ADMIN@COMPANY` assignment passes. The frontend reuses the warm-earthen design system; only two new pages, one new helper, and an extension to the existing management service are added.

**Tech Stack:** NestJS 10, Prisma 6, Vitest + Supertest with in-memory Prisma doubles. Taro 4.2 React + TS for the miniprogram.

**Spec:** `docs/superpowers/specs/2026-06-10-company-admin-views-design.md`.

---

## File Structure

- Modify: `apps/api/src/management/management.service.ts` — add `listCompanyProjects(companyId)` and `listCompanyParticipants(companyId)`.
- Modify: `apps/api/src/management/management.controller.ts` — add the two GET routes.
- Modify: `apps/api/src/management/management.types.ts` — add `CompanyParticipantResponse = ProjectParticipantResponse & { projectName }`.
- Modify: `apps/api/test/management.e2e.test.ts` — extend the in-memory double + 4 new tests.
- Create: `apps/miniprogram/src/routing/companyAdmin.ts` + Test `apps/miniprogram/test/companyAdmin.test.ts`.
- Modify: `apps/miniprogram/src/services/management.types.ts` — add `CompanyProject` (alias for the existing wire shape) + `CompanyParticipant`.
- Modify: `apps/miniprogram/src/services/management.ts` — add `fetchCompanyProjects` and `fetchCompanyParticipants`.
- Modify: `apps/miniprogram/test/management.service.test.ts` — add two tests.
- Create: `apps/miniprogram/src/pages/company-projects/{index.tsx,index.config.ts}`.
- Create: `apps/miniprogram/src/pages/company-people/{index.tsx,index.config.ts}`.
- Modify: `apps/miniprogram/src/app.config.ts` — register the two new pages.
- Modify: `apps/miniprogram/src/components/role-panels/index.tsx` — make the `companyAdmin` tiles navigable.

---

## Background facts the implementer must use

- The existing `ProjectResponse` (`apps/api/src/management/management.types.ts`) already has exactly the fields the company projects list needs: `id, companyId, name, status, address, centerLatitude, centerLongitude, geofenceRadiusM, plannedStartDate, plannedEndDate`. Reuse it as the response type for endpoint #1 — do NOT introduce a parallel `CompanyProjectResponse`.
- The existing `ProjectParticipantResponse` has `displayName, memberId, participantType, phone, profileId, projectId, projectRoleLabel, requiresAttendance, status, teamId, teamName`. Endpoint #2 extends it with `projectName`. Define a NEW type `CompanyParticipantResponse = ProjectParticipantResponse & { readonly projectName: string }` and a small helper that wraps the existing `createWorkerParticipantResponse` / `createManagerParticipantResponse` shapes with the project name.
- `authorization-context.service.ts` line 150 already supports `source: "companyParam"`. No plumbing changes needed.
- The existing management e2e file's in-memory double already supports `project.findUnique`, `projectWorkerMember.findMany`, `projectManagerMember.findMany`, `team.findUnique` (added in recent slices). Extend it with `project.findMany({ where: { companyId } })` and let the worker/manager member queries accept `where.projectId.in: string[]`.
- Frontend extensionless relative imports; `Segmented`'s `onChange={setX}` must be wrapped as `(v) => { setX(v); }` due to a TS variance issue. The shared `apiClient` lives at `apps/miniprogram/src/services/client.ts`.

---

## Task 1: Backend — `GET /management/companies/:companyId/projects`

**Files:**
- Modify: `apps/api/src/management/management.service.ts`
- Modify: `apps/api/src/management/management.controller.ts`
- Test: `apps/api/test/management.e2e.test.ts`

- [ ] **Step 1: Write the failing tests** — append two tests to the existing `describe("ManagementModule", …)` in `apps/api/test/management.e2e.test.ts`. Read the file's existing patterns first: the in-memory double (look for the class with `project.findUnique`, `team.findUnique`, the role/permission seeding helpers, the JWT helper). Mirror those patterns.

```ts
test("GET /management/companies/:companyId/projects returns projects of that company only", async () => {
  // Seed: company-1 with project-A and project-B; company-2 with project-C.
  // Seed: COMPANY_ADMIN role with attendance.view (inherited from PROJECT_ADMIN);
  //       the calling user has COMPANY_ADMIN@COMPANY(company-1).
  // Call GET /management/companies/company-1/projects with bearer token.
  // Expect 200 and exactly two items: project-A and project-B (any order); project-C must NOT be present.
  // Assert each row has the ProjectResponse shape fields:
  //   { id, companyId, name, status, address, centerLatitude, centerLongitude,
  //     geofenceRadiusM, plannedStartDate, plannedEndDate }
});

test("GET /management/companies/:companyId/projects returns 403 without attendance.view at the company scope", async () => {
  // Same seed; a different calling user has no role at company-1 (e.g. WORKER@PROJECT(project-C) of another company).
  // Expect 403.
});
```

If the existing double lacks `project.findMany({ where: { companyId } })`, extend it: return all seeded projects whose `companyId === args.where.companyId`. Match the file's existing return-shape conventions for project records.

- [ ] **Step 2: Run → fail**
`corepack pnpm --filter @construction/api exec vitest run test/management.e2e.test.ts` (404 on the new route).

- [ ] **Step 3: Add the service method** — in `apps/api/src/management/management.service.ts`:

```ts
  async listCompanyProjects(companyId: string): Promise<readonly ProjectResponse[]> {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (company === null) {
      throw new NotFoundException({ companyId, message: "COMPANY_NOT_FOUND" });
    }
    const projects = await this.prisma.project.findMany({
      orderBy: { createdAt: "asc" },
      where: { companyId }
    });
    return projects.map(createProjectResponse);
  }
```

(`createProjectResponse`, `ProjectResponse`, `NotFoundException` already exist in the file.)

- [ ] **Step 4: Add the controller route** — in `apps/api/src/management/management.controller.ts`:

```ts
  @Get("companies/:companyId/projects")
  @RequirePermission({
    permissionCode: "attendance.view",
    target: { paramName: "companyId", source: "companyParam" }
  })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async listCompanyProjects(
    @Param("companyId") companyId: string
  ): Promise<readonly ProjectResponse[]> {
    return this.managementService.listCompanyProjects(companyId);
  }
```

(`Get`, `Param`, `UseGuards`, `RequirePermission`, `PermissionsGuard`, `AccessTokenGuard`, `ProjectResponse` are all already imported in this file.)

- [ ] **Step 5: Run → pass + typecheck + commit**
```bash
corepack pnpm --filter @construction/api exec vitest run test/management.e2e.test.ts
corepack pnpm --filter @construction/api typecheck
git add apps/api/src/management apps/api/test/management.e2e.test.ts
git commit -m "feat(api): list a company's projects"
```

---

## Task 2: Backend — `GET /management/companies/:companyId/participants` + `CompanyParticipantResponse`

**Files:**
- Modify: `apps/api/src/management/management.types.ts`
- Modify: `apps/api/src/management/management.service.ts`
- Modify: `apps/api/src/management/management.controller.ts`
- Test: `apps/api/test/management.e2e.test.ts`

- [ ] **Step 1: Write the failing tests** — append to the same `describe("ManagementModule", …)`:

```ts
test("GET /management/companies/:companyId/participants returns all participants across the company's projects", async () => {
  // Seed: company-1 with project-A and project-B; company-2 with project-C.
  // Seed: worker-A1 active member of a team in project-A; worker-B1 active member of a team in project-B;
  //       worker-C1 active member of a team in project-C; manager-A1 active member of project-A.
  // Seed: COMPANY_ADMIN with attendance.view; the calling user has COMPANY_ADMIN@COMPANY(company-1).
  // Call GET /management/companies/company-1/participants.
  // Expect 200; result includes worker-A1, manager-A1, worker-B1 (length 3); worker-C1 absent.
  // Assert each row has a `projectName` field matching its project's name.
});

test("GET /management/companies/:companyId/participants returns 403 without permission at the company scope", async () => {
  // Same seed; calling user has no role at company-1.
  // Expect 403.
});
```

If the existing double's `projectWorkerMember.findMany` / `projectManagerMember.findMany` don't yet accept `where: { projectId: { in: string[] } }`, extend them — when `args.where.projectId` is `{ in: [...] }`, return rows whose `projectId` is in that array (the existing single-projectId path can stay for backward compatibility).

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Add the response type** — in `apps/api/src/management/management.types.ts`, append (after `ProjectParticipantResponse`):

```ts
export type CompanyParticipantResponse = ProjectParticipantResponse & {
  readonly projectName: string;
};
```

- [ ] **Step 4: Add the service method** — in `apps/api/src/management/management.service.ts`, alongside the existing project / team participants methods:

```ts
  async listCompanyParticipants(companyId: string): Promise<readonly CompanyParticipantResponse[]> {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (company === null) {
      throw new NotFoundException({ companyId, message: "COMPANY_NOT_FOUND" });
    }
    const projects = await this.prisma.project.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
      where: { companyId }
    });
    if (projects.length === 0) {
      return [];
    }
    const projectIds = projects.map((p) => p.id);
    const projectNamesById = new Map(projects.map((p) => [p.id, p.name]));
    const [workerMembers, managerMembers] = await Promise.all([
      this.prisma.projectWorkerMember.findMany({
        include: { team: true, worker: true },
        orderBy: { createdAt: "asc" },
        where: { projectId: { in: projectIds } }
      }),
      this.prisma.projectManagerMember.findMany({
        include: { manager: true, teamScope: true },
        orderBy: { createdAt: "asc" },
        where: { projectId: { in: projectIds } }
      })
    ]);
    const workerRows: CompanyParticipantResponse[] = workerMembers.map((m) => ({
      ...createWorkerParticipantResponse(m),
      projectName: projectNamesById.get(m.projectId) ?? ""
    }));
    const managerRows: CompanyParticipantResponse[] = managerMembers.map((m) => ({
      ...createManagerParticipantResponse(m),
      projectName: projectNamesById.get(m.projectId) ?? ""
    }));
    return [...workerRows, ...managerRows];
  }
```

(`createWorkerParticipantResponse`, `createManagerParticipantResponse`, `CompanyParticipantResponse`, `NotFoundException` are already imported / defined in or by Step 3.)

- [ ] **Step 5: Add the controller route**:

```ts
  @Get("companies/:companyId/participants")
  @RequirePermission({
    permissionCode: "attendance.view",
    target: { paramName: "companyId", source: "companyParam" }
  })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async listCompanyParticipants(
    @Param("companyId") companyId: string
  ): Promise<readonly CompanyParticipantResponse[]> {
    return this.managementService.listCompanyParticipants(companyId);
  }
```

Add `CompanyParticipantResponse` to the existing `./management.types.js` type import in the controller.

- [ ] **Step 6: Run → pass + typecheck + commit**
```bash
corepack pnpm --filter @construction/api exec vitest run test/management.e2e.test.ts
corepack pnpm --filter @construction/api typecheck
git add apps/api/src/management apps/api/test/management.e2e.test.ts
git commit -m "feat(api): list company-wide participants with projectName"
```

---

## Task 3: Frontend — `resolveCompanyAdminCompanyId`

**Files:**
- Create: `apps/miniprogram/src/routing/companyAdmin.ts`
- Test: `apps/miniprogram/test/companyAdmin.test.ts`

- [ ] **Step 1: Write the failing test** — `apps/miniprogram/test/companyAdmin.test.ts`:

```ts
import { describe, expect, test } from "vitest";

import { resolveCompanyAdminCompanyId } from "../src/routing/companyAdmin";

const me = (assignments: ReadonlyArray<{ roleCode: string; scopeType: string; scopeId: string }>) => ({
  user: { id: "u1", isBound: true, status: "ACTIVE" },
  profile: { type: "MANAGER" as const, id: "m1" },
  roles: {
    assignments: assignments.map((a) => ({ roleCode: a.roleCode, scope: { scopeType: a.scopeType, scopeId: a.scopeId } })),
    highestRoleCode: "COMPANY_ADMIN" as const
  }
});

describe("resolveCompanyAdminCompanyId", () => {
  test("returns the first COMPANY_ADMIN@COMPANY assignment's scopeId", () => {
    expect(
      resolveCompanyAdminCompanyId(me([
        { roleCode: "COMPANY_ADMIN", scopeType: "COMPANY", scopeId: "c-1" },
        { roleCode: "COMPANY_ADMIN", scopeType: "COMPANY", scopeId: "c-2" }
      ]) as never)
    ).toBe("c-1");
  });

  test("ignores COMPANY_ADMIN assignments whose scope is not COMPANY", () => {
    expect(
      resolveCompanyAdminCompanyId(me([
        { roleCode: "COMPANY_ADMIN", scopeType: "GLOBAL", scopeId: "GLOBAL" }
      ]) as never)
    ).toBeNull();
  });

  test("returns null when there are no COMPANY_ADMIN assignments", () => {
    expect(resolveCompanyAdminCompanyId(me([{ roleCode: "PROJECT_ADMIN", scopeType: "PROJECT", scopeId: "p-1" }]) as never)).toBeNull();
  });

  test("returns null when me is null", () => {
    expect(resolveCompanyAdminCompanyId(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement** — `apps/miniprogram/src/routing/companyAdmin.ts`:

```ts
import type { MeResponse } from "../services/auth.types";

export const resolveCompanyAdminCompanyId = (me: MeResponse | null): string | null => {
  if (me === null) {
    return null;
  }
  for (const assignment of me.roles.assignments) {
    if (assignment.roleCode === "COMPANY_ADMIN" && assignment.scope.scopeType === "COMPANY") {
      return assignment.scope.scopeId;
    }
  }
  return null;
};
```

- [ ] **Step 4: Run → pass + typecheck + commit**
```bash
corepack pnpm --filter @construction/miniprogram exec vitest run test/companyAdmin.test.ts
corepack pnpm --filter @construction/miniprogram exec tsc --noEmit -p tsconfig.json
git add apps/miniprogram/src/routing/companyAdmin.ts apps/miniprogram/test/companyAdmin.test.ts
git commit -m "feat(miniprogram): resolveCompanyAdminCompanyId helper"
```

---

## Task 4: Frontend — `services/management.ts` company variants + types

**Files:**
- Modify: `apps/miniprogram/src/services/management.types.ts`
- Modify: `apps/miniprogram/src/services/management.ts`
- Modify: `apps/miniprogram/test/management.service.test.ts`

- [ ] **Step 1: Append two tests** to `apps/miniprogram/test/management.service.test.ts` inside the existing describe block (reuse the file's existing `setToken` and `recordRequests` helpers):

```ts
  test("fetchCompanyProjects -> GET /management/companies/:companyId/projects", async () => {
    setToken();
    const calls = recordRequests();
    await fetchCompanyProjects("c-1");
    expect(calls[0]?.method).toBe("GET");
    expect(calls[0]?.url.endsWith("/management/companies/c-1/projects")).toBe(true);
  });

  test("fetchCompanyParticipants -> GET /management/companies/:companyId/participants", async () => {
    setToken();
    const calls = recordRequests();
    await fetchCompanyParticipants("c-1");
    expect(calls[0]?.url.endsWith("/management/companies/c-1/participants")).toBe(true);
  });
```
Broaden the existing top-of-file import to include the two new functions:
```ts
import {
  fetchCompanyParticipants,
  fetchCompanyProjects,
  fetchDailyReport,
  fetchMonthlyReport,
  fetchParticipants,
  fetchTeamDailyReport,
  fetchTeamMonthlyReport,
  fetchTeamParticipants,
  fetchTeamWeeklyReport,
  fetchWeeklyReport
} from "../src/services/management";
```

- [ ] **Step 2: Run → fail** — modules missing.

- [ ] **Step 3: Extend the types** — append to `apps/miniprogram/src/services/management.types.ts`:

```ts
export type ProjectStatus = "PREPARING" | "ACTIVE" | "SUSPENDED" | "COMPLETED";

export type CompanyProject = {
  readonly id: string;
  readonly companyId: string;
  readonly name: string;
  readonly status: ProjectStatus;
  readonly address: string;
  readonly centerLatitude: string;
  readonly centerLongitude: string;
  readonly geofenceRadiusM: number;
  readonly plannedStartDate: string;
  readonly plannedEndDate: string | null;
};

export type CompanyParticipant = ProjectParticipant & { readonly projectName: string };
```

- [ ] **Step 4: Extend the service** — append to `apps/miniprogram/src/services/management.ts`:

```ts
import type { CompanyParticipant, CompanyProject } from "./management.types";

export const fetchCompanyProjects = async (companyId: string): Promise<ReadonlyArray<CompanyProject>> =>
  apiClient.request<ReadonlyArray<CompanyProject>>(`/management/companies/${companyId}/projects`, { method: "GET" });

export const fetchCompanyParticipants = async (companyId: string): Promise<ReadonlyArray<CompanyParticipant>> =>
  apiClient.request<ReadonlyArray<CompanyParticipant>>(`/management/companies/${companyId}/participants`, { method: "GET" });
```

If the file already has a `import type { ... } from "./management.types"` line, merge `CompanyParticipant`/`CompanyProject` into it rather than adding a duplicate import.

- [ ] **Step 5: Run → pass + typecheck + commit**
```bash
corepack pnpm --filter @construction/miniprogram exec vitest run test/management.service.test.ts
corepack pnpm --filter @construction/miniprogram exec tsc --noEmit -p tsconfig.json
git add apps/miniprogram/src/services apps/miniprogram/test/management.service.test.ts
git commit -m "feat(miniprogram): company-scoped management API wrappers"
```

---

## Task 5: Frontend — Company projects page

**Files:**
- Create: `apps/miniprogram/src/pages/company-projects/index.config.ts`
- Create: `apps/miniprogram/src/pages/company-projects/index.tsx`

- [ ] **Step 1: Create `index.config.ts`**
```ts
export default definePageConfig({ navigationBarTitleText: "公司与项目" });
```

- [ ] **Step 2: Create `index.tsx`**
```tsx
import { View } from "@tarojs/components";
import { useEffect, useState } from "react";

import { ListItem, PageHeader, Screen, StateView } from "../../components/ui/index";
import { resolveCompanyAdminCompanyId } from "../../routing/companyAdmin";
import { fetchCompanyProjects } from "../../services/management";
import type { CompanyProject } from "../../services/management.types";
import { useSession } from "../../store/session";

const STATUS_LABEL: Record<CompanyProject["status"], string> = {
  ACTIVE: "进行中",
  COMPLETED: "已完工",
  PREPARING: "筹备中",
  SUSPENDED: "已暂停"
};

export default function CompanyProjects(): JSX.Element {
  const { state } = useSession();
  const companyId = resolveCompanyAdminCompanyId(state.me);
  const [items, setItems] = useState<ReadonlyArray<CompanyProject> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (companyId === null) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const rows = await fetchCompanyProjects(companyId);
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
  }, [companyId]);

  if (companyId === null) {
    return (
      <Screen>
        <PageHeader title="公司与项目" />
        <StateView title="无公司" sub="当前账号没有公司管理员身份。" />
      </Screen>
    );
  }

  return (
    <Screen>
      <PageHeader title="公司与项目" />
      {items === null && error === null ? <StateView title="加载中…" /> : null}
      {error !== null ? <StateView title="加载失败" sub={error} /> : null}
      {items !== null && items.length === 0 ? <StateView title="尚无项目" /> : null}
      <View>
        {(items ?? []).map((p) => (
          <ListItem
            key={p.id}
            primary={p.name}
            secondary={`${p.address} · 起 ${p.plannedStartDate}${p.plannedEndDate ? ` · 止 ${p.plannedEndDate}` : ""} · 半径 ${p.geofenceRadiusM}m`}
            chip={STATUS_LABEL[p.status]}
          />
        ))}
      </View>
    </Screen>
  );
}
```

- [ ] **Step 3: Typecheck + commit**
```bash
corepack pnpm --filter @construction/miniprogram exec tsc --noEmit -p tsconfig.json
git add apps/miniprogram/src/pages/company-projects
git commit -m "feat(miniprogram): company-projects page"
```

---

## Task 6: Frontend — Company people page

**Files:**
- Create: `apps/miniprogram/src/pages/company-people/index.config.ts`
- Create: `apps/miniprogram/src/pages/company-people/index.tsx`

- [ ] **Step 1: Create `index.config.ts`**
```ts
export default definePageConfig({ navigationBarTitleText: "公司人员" });
```

- [ ] **Step 2: Create `index.tsx`**
```tsx
import { View } from "@tarojs/components";
import { useEffect, useMemo, useState } from "react";

import { ListItem, PageHeader, Screen, Segmented, StateView } from "../../components/ui/index";
import { resolveCompanyAdminCompanyId } from "../../routing/companyAdmin";
import { fetchCompanyParticipants } from "../../services/management";
import type { CompanyParticipant, ParticipantType } from "../../services/management.types";
import { useSession } from "../../store/session";

type Filter = "ALL" | ParticipantType;
const FILTER_OPTIONS = [
  { label: "全部", value: "ALL" as const },
  { label: "工人", value: "WORKER" as const },
  { label: "管理员", value: "MANAGER" as const }
];

export default function CompanyPeople(): JSX.Element {
  const { state } = useSession();
  const companyId = resolveCompanyAdminCompanyId(state.me);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [items, setItems] = useState<ReadonlyArray<CompanyParticipant> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (companyId === null) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const rows = await fetchCompanyParticipants(companyId);
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
  }, [companyId]);

  const visible = useMemo(() => {
    if (items === null) {
      return [];
    }
    return filter === "ALL" ? items : items.filter((p) => p.participantType === filter);
  }, [items, filter]);

  if (companyId === null) {
    return (
      <Screen>
        <PageHeader title="公司人员" />
        <StateView title="无公司" sub="当前账号没有公司管理员身份。" />
      </Screen>
    );
  }

  return (
    <Screen>
      <PageHeader title="公司人员" />
      <Segmented options={FILTER_OPTIONS} value={filter} onChange={(v) => { setFilter(v); }} />
      {items === null && error === null ? <StateView title="加载中…" /> : null}
      {error !== null ? <StateView title="加载失败" sub={error} /> : null}
      {items !== null && visible.length === 0 ? <StateView title="尚无人员" /> : null}
      <View>
        {visible.map((p) => (
          <ListItem
            key={p.memberId}
            primary={p.displayName ?? "(未填写姓名)"}
            secondary={`${p.projectRoleLabel} · ${p.teamName ?? "无班组"} · ${p.phone}`}
            chip={p.projectName}
          />
        ))}
      </View>
    </Screen>
  );
}
```

- [ ] **Step 3: Typecheck + commit**
```bash
corepack pnpm --filter @construction/miniprogram exec tsc --noEmit -p tsconfig.json
git add apps/miniprogram/src/pages/company-people
git commit -m "feat(miniprogram): company-people page (flat list with worker/manager filter)"
```

---

## Task 7: Routing wiring

**Files:**
- Modify: `apps/miniprogram/src/app.config.ts`
- Modify: `apps/miniprogram/src/components/role-panels/index.tsx`

- [ ] **Step 1: Register pages** — replace the `pages` array in `apps/miniprogram/src/app.config.ts` with:
```ts
  pages: [
    "pages/login/index",
    "pages/bind/index",
    "pages/home/index",
    "pages/participants/index",
    "pages/reports/index",
    "pages/invitation/index",
    "pages/team-makeups/index",
    "pages/team-attendance/index",
    "pages/company-projects/index",
    "pages/company-people/index"
  ],
```

- [ ] **Step 2: Make companyAdmin tiles navigable** — in `apps/miniprogram/src/components/role-panels/index.tsx`, change the `companyAdmin` entry of the `TILES` Record to:
```ts
  companyAdmin: {
    title: "公司管理员",
    tiles: [
      { title: "公司与项目", sub: "管理公司下的项目", nav: { url: "/pages/company-projects/index" } },
      { title: "人员", sub: "公司人员总览", nav: { url: "/pages/company-people/index" } }
    ]
  },
```
Leave the other panel entries unchanged.

- [ ] **Step 3: Verify**
```bash
corepack pnpm --filter @construction/miniprogram exec tsc --noEmit -p tsconfig.json
corepack pnpm --filter @construction/miniprogram exec vitest run
TARO_APP_API_BASE_URL=http://139.59.255.11:3000 corepack pnpm --filter @construction/miniprogram build:h5
```
Expected: typecheck clean; all vitest tests pass; h5 builds and emits `apps/miniprogram/dist/index.html`.

- [ ] **Step 4: Commit**
```bash
git add apps/miniprogram/src/app.config.ts apps/miniprogram/src/components/role-panels/index.tsx
git commit -m "feat(miniprogram): wire company-admin tiles to company-projects/company-people"
```

---

## Task 8: H5 preview smoke (controller-run)

**Files:** none.

- [ ] **Step 1:** Ensure the backend + h5 servers are running. If not, restart:
```bash
( cd apps/api && set -a && . ./.env && set +a && node dist/main.js > /tmp/api.log 2>&1 ) &
( cd apps/miniprogram && python3 -m http.server 8088 --bind 0.0.0.0 --directory dist > /tmp/h5.log 2>&1 ) &
```

If the running backend predates this slice's changes, rebuild + restart:
```bash
corepack pnpm --filter @construction/api build
pkill -f 'node dist/main.js' 2>/dev/null || true
( cd apps/api && set -a && . ./.env && set +a && node dist/main.js > /tmp/api.log 2>&1 ) &
```

- [ ] **Step 2: API smoke as dev-company**
```bash
T=$(curl -s -X POST localhost:3000/auth/wechat/login -H 'content-type: application/json' -d '{"code":"dev-company"}' | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.parse(d).accessToken))')
echo "projects:"; curl -s localhost:3000/management/companies/dev-company/projects -H "Authorization: Bearer $T"
echo "people:"; curl -s localhost:3000/management/companies/dev-company/participants -H "Authorization: Bearer $T"
```
Expected: projects returns at least one row (the dev-project); people returns multiple rows with a `projectName` field.

- [ ] **Step 3: 403 sanity check as dev-project**
```bash
TP=$(curl -s -X POST localhost:3000/auth/wechat/login -H 'content-type: application/json' -d '{"code":"dev-project"}' | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.parse(d).accessToken))')
curl -s -o /dev/null -w "projects %{http_code}\n" localhost:3000/management/companies/dev-company/projects -H "Authorization: Bearer $TP"
curl -s -o /dev/null -w "people %{http_code}\n" localhost:3000/management/companies/dev-company/participants -H "Authorization: Bearer $TP"
```
Expected: both 403 (PROJECT_ADMIN's assignment is PROJECT-scoped, not COMPANY-scoped).

- [ ] **Step 4:** Open `http://139.59.255.11:8088` in a browser. Force refresh. Log in as **公司管理员** (`dev-company`). Tap each of the two tiles — "公司与项目" shows the seeded project with its status / address / dates / geofence; "公司人员" shows the company-wide participants with the 工人/管理员 segmented filter working, and each row's chip is the project name.

- [ ] **Step 5:** Stop background servers when done. No commit.

---

## Self-Review

- **Spec coverage:** GET company projects (T1) ✓; GET company participants with `projectName` + `CompanyParticipantResponse` type (T2) ✓; `resolveCompanyAdminCompanyId` (T3) ✓; frontend wrappers + types (T4) ✓; company-projects page (T5) ✓; company-people page with worker/manager filter and project chips (T6) ✓; routing + role panel (T7) ✓; manual H5 + 403 sanity (T8) ✓. Deferred items (drill-down, system-admin, worker non-punch, editing) explicitly out of scope.
- **Placeholders:** none — every code block is complete; the only "describe-then-paste" is in the seed details of T1/T2 e2e tests, which mirror the existing in-memory double's patterns (those patterns are well established by the team-leader slice's similar test additions).
- **Type consistency:** frontend `CompanyProject` mirrors the server `ProjectResponse` shape exactly; `CompanyParticipant = ProjectParticipant & { projectName }` matches the server's `CompanyParticipantResponse`; both pages use `resolveCompanyAdminCompanyId` and the same null-guard pattern as existing pages; the `Segmented` setter wrap convention is preserved.
- **Note:** Tasks 1 and 2 both edit `management.e2e.test.ts`; execute them in order so the double extensions accumulate cleanly.
