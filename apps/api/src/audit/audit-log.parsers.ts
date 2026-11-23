import { BadRequestException } from "@nestjs/common";
import { AUDIT_CATEGORIES, auditCategoriesFor, type AuditCategory } from "@construction/domain";
import { z } from "zod";

import type { AuditLogQuery, PlatformAuditLogQuery } from "./audit-log.types.js";

const categories = AUDIT_CATEGORIES.map((item) => item.value) as [
  AuditCategory,
  ...AuditCategory[],
];
const platformCategories = auditCategoriesFor("PLATFORM").map((item) => item.value) as [
  AuditCategory,
  ...AuditCategory[],
];

const querySchema = z.object({
  cursor: z.string().min(1).max(200).optional(),
  projectId: z.string().trim().min(1).max(64).optional(),
  type: z.enum(categories).optional(),
});

const platformQuerySchema = z.object({
  actorUserId: z.string().trim().min(1).max(64).optional(),
  companyId: z.string().trim().min(1).max(64).optional(),
  cursor: z.string().min(1).max(200).optional(),
  type: z.enum(platformCategories).optional(),
});

const cursorSchema = z.tuple([z.string().datetime(), z.string().min(1).max(64)]);

const invalid = (issues: unknown): BadRequestException =>
  new BadRequestException({ issues, message: "INVALID_AUDIT_LOG_QUERY" });

/** Cursor = base64url of [createdAt, id] of the last entry on the previous page. */
export const encodeAuditCursor = (createdAt: Date, id: string): string =>
  Buffer.from(JSON.stringify([createdAt.toISOString(), id])).toString("base64url");

const decodeCursor = (cursor: string | undefined): AuditLogQuery["cursor"] => {
  if (cursor === undefined) return null;
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw invalid([{ message: "Invalid cursor", path: ["cursor"] }]);
  }
  const parsed = cursorSchema.safeParse(decoded);
  if (!parsed.success) throw invalid(parsed.error.issues);
  return { createdAt: new Date(parsed.data[0]), id: parsed.data[1] };
};

export const parseAuditLogQuery = (query: unknown): AuditLogQuery => {
  const result = querySchema.safeParse(query);
  if (!result.success) throw invalid(result.error.issues);
  return {
    cursor: decodeCursor(result.data.cursor),
    projectId: result.data.projectId ?? null,
    type: result.data.type ?? null,
  };
};

/** The platform log also takes 平台 as a type, and a company or an actor to narrow to. */
export const parsePlatformAuditLogQuery = (query: unknown): PlatformAuditLogQuery => {
  const result = platformQuerySchema.safeParse(query);
  if (!result.success) throw invalid(result.error.issues);
  return {
    actorUserId: result.data.actorUserId ?? null,
    companyId: result.data.companyId ?? null,
    cursor: decodeCursor(result.data.cursor),
    type: result.data.type ?? null,
  };
};
