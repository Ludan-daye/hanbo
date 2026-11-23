import "reflect-metadata";

import { describe, expect, test } from "vitest";

import {
  ALLOWED_WHILE_SUSPENDED,
  SERVICE_CHECKED,
  enforcementOf,
  loadWriteRoutes,
  type Enforcement,
} from "./support/write-routes.js";

// A suspended company is read-only (system admin plan phase 3, Q5). The main risk is a write
// route nobody thought of, so every POST/PUT/PATCH/DELETE must be classified: held back by a
// guard, checked in its service, platform-only, or deliberately left open with a reason.

describe("write routes while a company is suspended", (): void => {
  test("every write route is classified exactly once", async (): Promise<void> => {
    const routes = await loadWriteRoutes();
    expect(routes.length).toBeGreaterThan(60);
    const unclassified = routes.filter((route) => enforcementOf(route) === null).map((route) => route.key);
    expect(unclassified).toEqual([]);
    expect(new Set(routes.map((route) => route.key)).size).toBe(routes.length);
  });

  test("the service and allowed lists name only routes that exist", async (): Promise<void> => {
    const keys = new Set((await loadWriteRoutes()).map((route) => route.key));
    expect([...Object.keys(SERVICE_CHECKED), ...Object.keys(ALLOWED_WHILE_SUSPENDED)].filter((key) => !keys.has(key))).toEqual([]);
  });

  test("the punch, makeup, safety and planning writes are held back", async (): Promise<void> => {
    const byKey = new Map((await loadWriteRoutes()).map((route) => [route.key, enforcementOf(route)] as const));
    const expected: Readonly<Record<string, Enforcement>> = {
      "POST /attendance/planning/:projectId/:scopeType/:scopeId": "ACTIVE_COMPANY_GUARD",
      "POST /attendance/planning/:projectId/:scopeType/:scopeId/inherit": "ACTIVE_COMPANY_GUARD",
      "POST /attendance/projects/:projectId/face-verifications": "ACTIVE_COMPANY_GUARD",
      "POST /attendance/projects/:projectId/face-verifications/:sessionId/complete": "ACTIVE_COMPANY_GUARD",
      "POST /attendance/projects/:projectId/face-verifications/:sessionId/video": "ACTIVE_COMPANY_GUARD",
      "POST /attendance/projects/:projectId/face-verifications/video": "ACTIVE_COMPANY_GUARD",
      "POST /attendance/projects/:projectId/records": "ACTIVE_COMPANY_GUARD",
      "POST /attendance/projects/:projectId/safety-confirmations": "ACTIVE_COMPANY_GUARD",
      "POST /makeups/projects/:projectId/requests": "ACTIVE_COMPANY_GUARD",
      "POST /makeups/requests/:requestId/approve": "SERVICE",
      "POST /management/companies/:companyId/projects": "PERMISSIONS_GUARD",
      "POST /report-exports": "ALLOWED",
      "POST /safety-credit/teams/:teamId/violations": "ACTIVE_COMPANY_GUARD",
      "POST /system/companies/:companyId/status": "PLATFORM",
      // Phase 5: one row for the whole platform, saved by super administrators only.
      "PUT /system/settings": "PLATFORM",
      "PUT /management/companies/:companyId/profile": "PERMISSIONS_GUARD",
      "PUT /team-work/teams/:teamId/tasks/:taskId": "PERMISSIONS_GUARD",
    };
    for (const [key, enforcement] of Object.entries(expected)) expect([key, byKey.get(key)]).toEqual([key, enforcement]);
  });
});
