import { BadRequestException } from "@nestjs/common";
import { z } from "zod";

import type { ParticipantTypeValue } from "./management.types.js";
import type { CompanyPeoplePageQuery, OffboardRequest } from "./company-people.types.js";

const isValidDateOnly = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

export const parseParticipantTypeParam = (value: string): ParticipantTypeValue => {
  if (value === "WORKER" || value === "MANAGER") return value;
  throw new BadRequestException({ message: "INVALID_PARTICIPANT_TYPE", participantType: value });
};

export const parseOffboard = (body: unknown): OffboardRequest => {
  const result = z
    .object({
      effectiveDate: z.string().refine(isValidDateOnly),
      mode: z.enum(["EXIT_ALL", "REVOKE_ADMIN"]).default("REVOKE_ADMIN"),
    })
    .strict()
    .safeParse(body ?? {});
  if (!result.success)
    throw new BadRequestException({ issues: result.error.issues, message: "INVALID_OFFBOARD_REQUEST" });
  return result.data;
};

export const parseCompanyPeoplePage = (query: unknown): CompanyPeoplePageQuery => {
  const result = z
    .object({
      faceStatus: z.enum(["APPROVED", "NONE", "PENDING", "REJECTED"]).optional(),
      page: z.coerce.number().int().min(1).max(100_000).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(30),
      participantType: z.enum(["WORKER", "MANAGER"]).optional(),
      permissionRole: z.enum(["WORKER", "TEAM_LEADER", "PROJECT_ADMIN"]).optional(),
      projectId: z.string().min(1).optional(),
      registrationStatus: z.enum(["NEEDS_UPDATE", "PENDING", "VERIFIED"]).optional(),
      search: z.string().trim().max(40).default(""),
      status: z.enum(["ACTIVE", "EXITED", "SUSPENDED"]).optional(),
    })
    .strict()
    .safeParse(query ?? {});
  if (!result.success)
    throw new BadRequestException({ issues: result.error.issues, message: "INVALID_COMPANY_PEOPLE_PAGE" });
  const value = result.data;
  return {
    faceStatus: value.faceStatus ?? null,
    page: value.page,
    pageSize: value.pageSize,
    participantType: value.participantType ?? null,
    permissionRole: value.permissionRole ?? null,
    projectId: value.projectId ?? null,
    registrationStatus: value.registrationStatus ?? null,
    search: value.search,
    status: value.status ?? null,
  };
};
