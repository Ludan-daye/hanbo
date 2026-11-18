import { BadRequestException } from "@nestjs/common";
import { z } from "zod";

import type { AccountProfileInput } from "./account.types.js";

const accountProfileRequestSchema = z.object({
  nickname: z.string().trim().min(1).max(32).optional(),
  realName: z
    .string()
    .trim()
    .min(1)
    .max(30)
    .regex(/^[\p{L}\p{M} ·•・.'’-]+$/u),
  phone: z
    .string()
    .trim()
    .regex(/^1[3-9]\d{9}$/),
});

export const parseAccountProfileRequest = (
  body: unknown,
): AccountProfileInput => {
  const result = accountProfileRequestSchema.safeParse(body);

  if (!result.success) {
    throw new BadRequestException({
      issues: result.error.issues,
      message: "ACCOUNT_PROFILE_INVALID",
    });
  }

  const { nickname, phone, realName } = result.data;

  return { ...(nickname === undefined ? {} : { nickname }), phone, realName };
};
