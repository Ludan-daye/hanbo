import { BadRequestException } from "@nestjs/common";
import { attendanceDefaultsError, worktimeRuleError } from "@construction/domain";
import { z } from "zod";

import type {
  CompanyAttendanceDefaultsWrite,
  CompanyProfileWrite,
} from "./company-settings.types.js";

const clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const defaultsSchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    name: z.string().trim().min(1).max(60),
    points: z
      .array(
        z
          .object({
            code: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
            graceMins: z.number().int().min(0).max(120),
            kind: z.enum(["START", "END", "CHECKPOINT"]),
            label: z.string().trim().min(1).max(30),
            time: clock,
          })
          .strict(),
      )
      .min(2)
      .max(48),
    workdays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
    worktime: z
      .object({
        lunchEnd: clock.nullable(),
        lunchStart: clock.nullable(),
        overtimeStart: clock.nullable(),
        projectKind: z.enum(["REGULAR", "REPAIR"]),
      })
      .strict(),
  })
  .strict();

/** Same rules as a project's plan and worktime rule, shared with the client (domain). */
export const parseCompanyAttendanceDefaults = (body: unknown): CompanyAttendanceDefaultsWrite => {
  const result = defaultsSchema.safeParse(body);
  if (!result.success)
    throw new BadRequestException({ issues: result.error.issues, message: "INVALID_COMPANY_DEFAULTS" });
  const problem = attendanceDefaultsError(result.data) ?? worktimeRuleError(result.data.worktime);
  if (problem !== null)
    throw new BadRequestException({ message: "INVALID_COMPANY_DEFAULTS", reason: problem });
  return result.data;
};

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => (value === null || value.length === 0 ? null : value));

export const parseCompanyProfile = (body: unknown): CompanyProfileWrite => {
  const result = z
    .object({
      address: optionalText(120),
      contactName: optionalText(30),
      contactPhone: z
        .string()
        .trim()
        .regex(/^(?:1\d{10}|0\d{2,3}-?\d{7,8})$/)
        .nullable()
        .or(z.literal("").transform(() => null)),
      expectedUpdatedAt: z.string().datetime({ offset: true }),
    })
    .strict()
    .safeParse(body);
  if (!result.success)
    throw new BadRequestException({ issues: result.error.issues, message: "INVALID_COMPANY_PROFILE" });
  return result.data;
};
