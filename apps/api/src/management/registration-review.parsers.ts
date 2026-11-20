import { BadRequestException } from "@nestjs/common";
import { z } from "zod";

import type { RegistrationVerificationRequest } from "./registration-review.types.js";

// Decision 3 (2026-11-20): marking needs no reason and no upload.
const verificationSchema = z
  .object({
    expectedVersion: z.number().int().min(0),
    status: z.enum(["VERIFIED", "NEEDS_UPDATE"]),
  })
  .strict();

export const parseRegistrationVerification = (
  body: unknown,
): RegistrationVerificationRequest => {
  const result = verificationSchema.safeParse(body);
  if (!result.success)
    throw new BadRequestException({
      issues: result.error.issues,
      message: "INVALID_REGISTRATION_VERIFICATION_REQUEST",
    });
  return result.data;
};
