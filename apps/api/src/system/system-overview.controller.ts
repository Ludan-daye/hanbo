import { Controller, Get, Header, Inject, UseGuards } from "@nestjs/common";
import { GLOBAL_SCOPE_ID } from "@construction/domain/roles.js";

import { AccessTokenGuard } from "../auth/access-token.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { PermissionsGuard } from "../authorization/permissions.guard.js";
import { RequirePermission } from "../authorization/require-permission.decorator.js";

import { SystemOverviewService } from "./system-overview.service.js";
import type { SystemOverview } from "./system.types.js";

/** GET /system/overview: the super administrator's home (phase 5, Q10). */
@Controller("system")
export class SystemOverviewController {
  constructor(@Inject(SystemOverviewService) private readonly overview: SystemOverviewService) {}

  @Get("overview")
  @Header("Cache-Control", "no-store")
  @RequirePermission({
    permissionCode: "system.manage",
    target: { source: "static", targetScope: { scopeId: GLOBAL_SCOPE_ID, scopeType: "GLOBAL" } },
  })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async home(@CurrentUser() actor: AuthenticatedUser): Promise<SystemOverview> {
    return this.overview.overview(actor.userId);
  }
}
