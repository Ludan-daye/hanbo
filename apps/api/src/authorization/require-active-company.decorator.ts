import { SetMetadata } from "@nestjs/common";

import { REQUIRED_ACTIVE_COMPANY_METADATA_KEY, type ActiveCompanyTarget } from "./authorization.types.js";

/**
 * For a write that checks permissions in its service (no @RequirePermission): the company
 * found through the route param must not be suspended. Use with ActiveCompanyGuard.
 */
export const RequireActiveCompany = (target: ActiveCompanyTarget): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_ACTIVE_COMPANY_METADATA_KEY, target);
