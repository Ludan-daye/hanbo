import { BadRequestException } from "@nestjs/common";
import { z } from "zod";

import type {
  ParticipantPageQuery,
  ParticipantWriteRequest,
  ReuseParticipantRequest,
} from "./participants.types.js";

const validManagementAssignment = (
  body: Pick<
    ParticipantWriteRequest,
    "participantType" | "projectRoleLabel" | "teamId"
  >,
): boolean =>
  (body.participantType === "WORKER" &&
    !["PROJECT_ADMIN", "COMPANY_ADMIN", "SYSTEM_ADMIN"].includes(
      body.projectRoleLabel,
    ) &&
    (body.projectRoleLabel !== "TEAM_LEADER" || body.teamId !== null)) ||
  (body.participantType === "MANAGER" &&
    ((body.projectRoleLabel === "TEAM_LEADER" && body.teamId !== null) ||
      (body.projectRoleLabel === "PROJECT_ADMIN" && body.teamId === null)));

const participantWriteSchema = z
  .object({
    displayName: z.string().trim().min(1).max(30),
    phone: z.string().regex(/^1\d{10}$/),
    participantType: z.enum(["WORKER", "MANAGER"]),
    projectRoleLabel: z.string().trim().min(1).max(40),
    workType: z.string().trim().min(1).max(40),
    teamId: z.string().min(1).nullable(),
    requiresAttendance: z.boolean(),
    status: z.enum(["ACTIVE", "EXITED", "SUSPENDED"]),
    enteredAt: z.string().datetime({ offset: true }),
    exitedAt: z.string().datetime({ offset: true }).nullable(),
    expectedUpdatedAt: z.string().datetime({ offset: true }).nullable(),
    expectedProfileUpdatedAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict()
  .superRefine((body, context): void => {
    if (
      (body.status === "EXITED") !== (body.exitedAt !== null) ||
      (body.exitedAt !== null &&
        new Date(body.exitedAt) < new Date(body.enteredAt))
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["exitedAt"],
        message: "Exit dates must match status and follow the entry date.",
      });
    }
    if (!validManagementAssignment(body)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["projectRoleLabel"],
        message: "Choose a project administrator or a team leader with a team.",
      });
    }
  });

export const parseParticipantWrite = (
  body: unknown,
): ParticipantWriteRequest => {
  const result = participantWriteSchema.safeParse(body);
  if (!result.success)
    throw new BadRequestException({
      message: "INVALID_PARTICIPANT_REQUEST",
      issues: result.error.issues,
    });
  return result.data;
};

export const parseReuseParticipant = (
  body: unknown,
): ReuseParticipantRequest => {
  const result = participantWriteSchema
    .innerType()
    .pick({
      participantType: true,
      projectRoleLabel: true,
      teamId: true,
      requiresAttendance: true,
      enteredAt: true,
    })
    .extend({
      sourceProjectId: z.string().min(1),
      sourceMemberId: z.string().min(1),
      expectedSourceUpdatedAt: z.string().datetime({ offset: true }),
      expectedProfileUpdatedAt: z.string().datetime({ offset: true }),
    })
    .strict()
    .superRefine((value, context): void => {
      if (!validManagementAssignment(value)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["projectRoleLabel"],
          message:
            "Choose a project administrator or a team leader with a team.",
        });
      }
    })
    .safeParse(body);
  if (!result.success)
    throw new BadRequestException({
      message: "INVALID_REUSE_PARTICIPANT_REQUEST",
      issues: result.error.issues,
    });
  return result.data;
};

export const parseParticipantPage = (query: unknown): ParticipantPageQuery => {
  const result = z
    .object({
      page: z.coerce.number().int().min(1).max(100_000),
      pageSize: z.coerce.number().int().min(1).max(100),
      search: z.string().trim().max(40),
      participantType: z.enum(["WORKER", "MANAGER"]).optional(),
      permissionRole: z
        .enum(["WORKER", "TEAM_LEADER", "PROJECT_ADMIN"])
        .optional(),
      teamId: z.string().min(1).optional(),
      status: z.enum(["ACTIVE", "EXITED", "SUSPENDED"]).optional(),
    })
    .strict()
    .safeParse(query);
  if (!result.success)
    throw new BadRequestException({
      message: "INVALID_PARTICIPANT_PAGE",
      issues: result.error.issues,
    });
  return {
    ...result.data,
    participantType: result.data.participantType ?? null,
    permissionRole: result.data.permissionRole ?? null,
    teamId: result.data.teamId ?? null,
    status: result.data.status ?? null,
  };
};
