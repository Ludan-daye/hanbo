import { BadRequestException } from "@nestjs/common";
import { z } from "zod";

import type { CreateBindingInvitationRequest } from "./bindings.types.js";

const createBindingInvitationRequestSchema = z.object({
  profileId: z.string().min(1),
  targetType: z.enum(["MANAGER", "WORKER"])
});

export const parseCreateBindingInvitationRequest = (body: unknown): CreateBindingInvitationRequest => {
  const result = createBindingInvitationRequestSchema.safeParse(body);

  if (!result.success) {
    throw new BadRequestException({
      issues: result.error.issues,
      message: "INVALID_CREATE_BINDING_INVITATION_REQUEST"
    });
  }

  return result.data;
};
