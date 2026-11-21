import { BadRequestException } from "@nestjs/common";
import { z } from "zod";

import {
  additionalRoleSchema,
  validManagementAssignment,
} from "./participants.parsers.js";
import type {
  TransferCandidatesQuery,
  TransferRequestWrite,
  TransferStatusValue,
} from "./transfer-requests.types.js";

const fail = (message: string, issues: z.ZodIssue[]): never => {
  throw new BadRequestException({ issues, message });
};

const writeSchema = z
  .object({
    additionalRoles: z.array(additionalRoleSchema).max(20).optional(),
    enteredAt: z.string().datetime({ offset: true }),
    // Q11 (2026-11-21): 调走 exits the source membership on approval; 兼任 keeps it.
    mode: z.enum(["MOVE", "CONCURRENT"]).default("MOVE"),
    participantType: z.enum(["WORKER", "MANAGER"]),
    projectRoleLabel: z.string().trim().min(1).max(40),
    requiresAttendance: z.boolean(),
    sourceMemberId: z.string().min(1),
    sourceProjectId: z.string().min(1),
    teamId: z.string().min(1).nullable(),
  })
  .strict()
  .superRefine((value, context): void => {
    if (!validManagementAssignment(value))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Choose a project administrator or a team leader with a team.",
        path: ["projectRoleLabel"],
      });
  });

export const parseTransferRequest = (body: unknown): TransferRequestWrite => {
  const result = writeSchema.safeParse(body);
  return result.success
    ? result.data
    : fail("INVALID_TRANSFER_REQUEST", result.error.issues);
};

export const parseTransferCandidates = (
  query: unknown,
): TransferCandidatesQuery => {
  const result = z
    .object({
      page: z.coerce.number().int().min(1).max(100_000),
      pageSize: z.coerce.number().int().min(1).max(50),
      search: z.string().trim().max(40).default(""),
      sourceProjectId: z.string().min(1),
    })
    .strict()
    .safeParse(query ?? {});
  return result.success
    ? result.data
    : fail("INVALID_TRANSFER_CANDIDATES_QUERY", result.error.issues);
};

export type TransferListQuery = {
  readonly cursor: string | null;
  /** Source or target project. */
  readonly projectId: string | null;
  readonly status: "PENDING" | "DONE";
};

export const parseTransferList = (query: unknown): TransferListQuery => {
  const result = z
    .object({
      cursor: z.string().min(1).optional(),
      projectId: z.string().min(1).optional(),
      status: z.enum(["PENDING", "DONE"]).default("PENDING"),
    })
    .strict()
    .safeParse(query ?? {});
  return result.success
    ? {
        cursor: result.data.cursor ?? null,
        projectId: result.data.projectId ?? null,
        status: result.data.status,
      }
    : fail("INVALID_TRANSFER_LIST_QUERY", result.error.issues);
};

export const parseTransferReview = (
  body: unknown,
): { readonly reason: string | null } => {
  const result = z
    .object({ reason: z.string().trim().max(200).optional() })
    .strict()
    .safeParse(body ?? {});
  return result.success
    ? { reason: result.data.reason || null }
    : fail("INVALID_TRANSFER_REVIEW", result.error.issues);
};

export type { TransferStatusValue };
