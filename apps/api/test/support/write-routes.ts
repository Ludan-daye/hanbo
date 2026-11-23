import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { RequestMethod } from "@nestjs/common";
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants.js";

import { ActiveCompanyGuard } from "../../src/authorization/active-company.guard.js";
import {
  REQUIRED_ACTIVE_COMPANY_METADATA_KEY,
  REQUIRED_PERMISSION_METADATA_KEY,
  type ActiveCompanyTarget,
  type PermissionTarget,
  type RequiredPermissionMetadata,
} from "../../src/authorization/authorization.types.js";
import { PermissionsGuard } from "../../src/authorization/permissions.guard.js";

// Every write route of the API and how a suspended company (system admin plan phase 3, Q5)
// is enforced on it. company-suspension-routes.test.ts fails when a new write route is not
// classified here; company-suspension.integration.test.ts calls each enforced one.

export type WriteMethod = "DELETE" | "PATCH" | "POST" | "PUT";

export type WriteRoute = {
  readonly activeCompany: ActiveCompanyTarget | null;
  readonly guards: readonly unknown[];
  readonly key: string;
  readonly method: WriteMethod;
  readonly path: string;
  readonly permission: RequiredPermissionMetadata | null;
};

export type Enforcement =
  /** PermissionsGuard: the route's company/project/team target, after the permission check. */
  | "PERMISSIONS_GUARD"
  /** ActiveCompanyGuard: the route's project/team param, permission checked in the service. */
  | "ACTIVE_COMPANY_GUARD"
  /** CompanyStatusService called in the service, once the record behind the id is loaded. */
  | "SERVICE"
  /** Static GLOBAL target: platform administrators only, who are never held back. */
  | "PLATFORM"
  /** Deliberately open while suspended; the reason is in ALLOWED_WHILE_SUSPENDED. */
  | "ALLOWED";

/** Writes without a company param: the service finds the company and checks it. */
export const SERVICE_CHECKED: Readonly<Record<string, string>> = {
  "POST /makeups/requests/:requestId/approve": "补卡记录 → 项目 → 公司（MakeupService）",
  "POST /makeups/requests/:requestId/reject": "补卡记录 → 项目 → 公司（MakeupService）",
  "POST /safety-credit/me/violations/:id/appeals": "违规记录 → 项目 → 公司（SafetyCreditService.appeal）",
  "POST /team-work/me/briefings/:id/acknowledge": "交底 → 班组 → 公司（TeamWorkService.acknowledge）",
  "POST /team-work/me/join": "临时工邀请码 → 任务 → 班组 → 公司（TemporaryInvitationsService.accept）",
};

/** Writes that stay open for a suspended company, with the reason (Q5 and the plan's record). */
export const ALLOWED_WHILE_SUSPENDED: Readonly<Record<string, string>> = {
  "POST /account/avatar": "本人头像，属于个人账号，不是公司的数据",
  "PUT /account/profile": "本人昵称、手机号，属于个人账号",
  "PUT /account/worker-registration": "本人的用工资料，跨公司共用一份；管理员核实另有接口，会被拦",
  "POST /auth/bind": "用邀请码绑定账号：等同登录（Q5 能登录）；任职早已存在，不新建公司数据",
  "POST /auth/logout": "登录、退出不受影响（Q5）",
  "POST /auth/refresh": "登录、退出不受影响（Q5）",
  "POST /auth/test/login": "登录、退出不受影响（Q5）",
  "POST /auth/wechat/login": "登录、退出不受影响（Q5）",
  "POST /face-profiles/me": "本人人脸底照，属于个人；审核底照另有接口，会被拦",
  "POST /face-profiles/me/liveness-tests": "本人试刷脸，不写考勤",
  "POST /face-profiles/me/liveness-tests/:sessionId/video": "本人试刷脸，不写考勤",
  "POST /report-exports": "导出历史（Q5 明确允许）",
  "POST /safety-credit/policies": "全平台一份的信用规则，只有超级管理员能发布，不属于哪家公司",
  "POST /uploads": "只存文件；用到文件的打卡、补卡、违规登记都会被拦",
};

const controllerFiles = (directory: string): string[] =>
  readdirSync(directory, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".controller.ts"))
    .map((file) => join(directory, file));

const joinPath = (...parts: readonly string[]): string =>
  `/${parts
    .flatMap((part) => part.split("/"))
    .filter((part) => part.length > 0)
    .join("/")}`;

const WRITE_METHODS: Readonly<Partial<Record<RequestMethod, WriteMethod>>> = {
  [RequestMethod.DELETE]: "DELETE",
  [RequestMethod.PATCH]: "PATCH",
  [RequestMethod.POST]: "POST",
  [RequestMethod.PUT]: "PUT",
};

type Constructor = abstract new (...args: never[]) => unknown;

const metadata = <T>(key: string, handler: object, controller: Constructor): T | undefined =>
  (Reflect.getMetadata(key, handler) as T | undefined) ?? (Reflect.getMetadata(key, controller) as T | undefined);

/** Reads the routes from the controllers' Nest metadata, so a new controller is picked up too. */
export const loadWriteRoutes = async (): Promise<readonly WriteRoute[]> => {
  const source = fileURLToPath(new URL("../../src", import.meta.url));
  const routes: WriteRoute[] = [];
  for (const file of controllerFiles(source).sort()) {
    // A plain path: a file URL would percent-encode the Chinese folder names for Vite.
    const exported = (await import(file)) as Record<string, unknown>;
    for (const candidate of Object.values(exported)) {
      if (typeof candidate !== "function") continue;
      const controller = candidate as Constructor;
      const base = Reflect.getMetadata(PATH_METADATA, controller) as string | undefined;
      if (base === undefined) continue;
      const prototype = controller.prototype as Record<string, unknown>;
      for (const name of Object.getOwnPropertyNames(prototype)) {
        const handler = prototype[name];
        if (name === "constructor" || typeof handler !== "function") continue;
        const method = WRITE_METHODS[Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod];
        if (method === undefined) continue;
        const path = joinPath(base, (Reflect.getMetadata(PATH_METADATA, handler) as string | undefined) ?? "");
        routes.push({
          activeCompany: metadata<ActiveCompanyTarget>(REQUIRED_ACTIVE_COMPANY_METADATA_KEY, handler, controller) ?? null,
          guards: [
            ...((Reflect.getMetadata(GUARDS_METADATA, controller) as unknown[] | undefined) ?? []),
            ...((Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[] | undefined) ?? []),
          ],
          key: `${method} ${path}`,
          method,
          path,
          permission: metadata<RequiredPermissionMetadata>(REQUIRED_PERMISSION_METADATA_KEY, handler, controller) ?? null,
        });
      }
    }
  }
  return routes;
};

const companyTarget = (target: PermissionTarget): boolean => target.source !== "static";

/** How the route is held back for a suspended company; null when it is not classified. */
export const enforcementOf = (route: WriteRoute): Enforcement | null => {
  const listed = [SERVICE_CHECKED[route.key] !== undefined, ALLOWED_WHILE_SUSPENDED[route.key] !== undefined];
  if (route.permission !== null && route.guards.includes(PermissionsGuard)) {
    if (listed.some(Boolean)) return null;
    return companyTarget(route.permission.target) ? "PERMISSIONS_GUARD" : "PLATFORM";
  }
  if (route.activeCompany !== null) return route.guards.includes(ActiveCompanyGuard) && !listed.some(Boolean) ? "ACTIVE_COMPANY_GUARD" : null;
  if (listed[0] && !listed[1]) return "SERVICE";
  if (listed[1] && !listed[0]) return "ALLOWED";
  return null;
};
