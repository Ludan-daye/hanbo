import { SetMetadata } from "@nestjs/common";

import { REQUIRED_PERMISSION_METADATA_KEY, type RequiredPermissionMetadata } from "./authorization.types.js";

export const RequirePermission = (metadata: RequiredPermissionMetadata): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_PERMISSION_METADATA_KEY, metadata);
