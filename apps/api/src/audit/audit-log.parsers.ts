import { BadRequestException } from "@nestjs/common";
import { AUDIT_CATEGORIES, type AuditCategory } from "@construction/domain";
import { z } from "zod";

import type { AuditLogQuery } from "./audit-log.types.js";

const categories = AUDIT_CATEGORIES.map((item) => item.value) as [
  AuditCategory,
  ...AuditCategory[],
];

const querySchema = z.object({
  cursor: z.string().min(1).max(200).optional(),
  projectId: z.string().trim().min(1).max(64).optional(),
  type: z.enum(categories).optional(),
});

const cursorSchema = z.tuple([z.string().datetime(), z.string().min(1).max(64)]);

const invalid = (issues: unknown): BadRequestException =>
  new BadRequestException({ issues, message: "INVALID_AUDIT_LOG_QUERY" });

/** Cursor = base64url of [createdAt, id] of the last entry on the previous page. */
export const encodeAuditCursor = (createdAt: Date, id: string): string =>
  Buffer.from(JSON.stringify([createdAt.toISOString(), id])).toString("base64url");

export const parseAuditLogQuery = (query: unknown): AuditLogQuery => {
  const result = querySchema.safeParse(query);
  if (!result.success) throw invalid(result.error.issues);
  let cursor: AuditLogQuery["cursor"] = null;
  if (result.data.cursor !== undefined) {
    let decoded: unknown;
    try {
      decoded = JSON.parse(
        Buffer.from(result.data.cursor, "base64url").toString("utf8"),
      );
    } catch {
      throw invalid([{ message: "Invalid cursor", path: ["cursor"] }]);
    }
    const parsed = cursorSchema.safeParse(decoded);
    if (!parsed.success) throw invalid(parsed.error.issues);
    cursor = { createdAt: new Date(parsed.data[0]), id: parsed.data[1] };
  }
  return {
    cursor,
    projectId: result.data.projectId ?? null,
    type: result.data.type ?? null,
  };
};
