import { BadRequestException } from "@nestjs/common";
import { z } from "zod";
import type { TeamWriteRequest } from "./teams.types.js";

import type {
  CreateProjectRequest,
  CreateTeamRequest,
  UpdateProjectRequest
} from "./management.types.js";

const projectStatusValues = ["ACTIVE", "COMPLETED", "PREPARING", "SUSPENDED"] as const;
const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
const decimalPattern = /^-?\d{1,3}(\.\d{1,7})?$/;

const isValidDateOnly = (value: string): boolean => {
  if (!dateOnlyPattern.test(value)) {
    return false;
  }

  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

const isCoordinate = (value: string, min: number, max: number): boolean => {
  if (!decimalPattern.test(value)) {
    return false;
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= min && numberValue <= max;
};

const nonEmptyStringSchema = z.string().min(1);
const dateOnlySchema = z.string().refine(isValidDateOnly);
const dateTimeSchema = z.string().datetime({ offset: true });

const projectWriteFieldsSchema = z.object({
  address: nonEmptyStringSchema,
  centerLatitude: z.string().refine((value: string): boolean => isCoordinate(value, -90, 90)),
  centerLongitude: z.string().refine((value: string): boolean => isCoordinate(value, -180, 180)),
  geofenceRadiusM: z.number().int().min(50).max(3000),
  name: nonEmptyStringSchema,
  plannedEndDate: z.union([dateOnlySchema, z.null()]),
  plannedStartDate: dateOnlySchema,
  status: z.enum(projectStatusValues)
});

const createProjectRequestSchema = projectWriteFieldsSchema.extend({
  // Q6 (2026-11-21): copy the company's default plan and worktime rule into the new project.
  applyCompanyDefaults: z.boolean().default(true),
  managerProfileIds: z.array(z.string().trim().min(1)).max(20)
    .refine((ids): boolean => new Set(ids).size === ids.length, "Duplicate project administrators."),
  // Q4 (2026-11-21): administrators not yet in any project of the company, bound later by invitation.
  newManagers: z.array(z.object({
    name: z.string().trim().min(1).max(30),
    phone: z.string().regex(/^1\d{10}$/)
  }).strict()).max(3).default([])
    .refine((rows): boolean => new Set(rows.map((row) => row.phone)).size === rows.length, "Duplicate new administrator phones.")
}).refine((value): boolean => value.plannedEndDate === null || value.plannedEndDate >= value.plannedStartDate, {
  path: ["plannedEndDate"], message: "Project end date must follow the start date."
}).refine((value): boolean => value.managerProfileIds.length + value.newManagers.length > 0, {
  path: ["managerProfileIds"], message: "Choose or enter at least one project administrator."
});

const createTeamRequestSchema = z.object({
  name: z.string().trim().min(1).max(30),
  status: z.enum(["ACTIVE", "SUSPENDED"])
});

const parseBody = <T>(body: unknown, schema: z.ZodType<T>, message: string): T => {
  const result = schema.safeParse(body);

  if (!result.success) {
    throw new BadRequestException({
      issues: result.error.issues,
      message
    });
  }

  return result.data;
};

export const parseCreateProjectRequest = (body: unknown): CreateProjectRequest =>
  parseBody(body, createProjectRequestSchema, "INVALID_CREATE_PROJECT_REQUEST");

export const parseProjectManagerSearch = (query: unknown): { readonly search: string } =>
  parseBody(query, z.object({ search: z.string().trim().max(60) }), "INVALID_PROJECT_MANAGER_SEARCH");

export const parseCreateTeamRequest = (body: unknown): CreateTeamRequest =>
  parseBody(body, createTeamRequestSchema, "INVALID_CREATE_TEAM_REQUEST");

export const parseUpdateProjectRequest = (body: unknown): UpdateProjectRequest =>
  parseBody(body, projectWriteFieldsSchema.extend({
    id: nonEmptyStringSchema,
    companyId: nonEmptyStringSchema,
    code: z.string().trim().min(1).max(60).nullable(),
    contactName: z.string().trim().min(1).max(60).nullable(),
    contactPhone: z.string().regex(/^1\d{10}$/).nullable(),
    remark: z.string().trim().max(1000).nullable(),
    expectedUpdatedAt: dateTimeSchema
  }).refine((value): boolean => value.plannedEndDate === null || value.plannedEndDate >= value.plannedStartDate, { path: ["plannedEndDate"], message: "Project end date must follow the start date." }), "INVALID_UPDATE_PROJECT_REQUEST");

export const parseUpdateTeamRequest = (body: unknown): TeamWriteRequest =>
  parseBody(body, z.object({
    name: z.string().trim().min(1).max(30), status: z.enum(["ACTIVE", "SUSPENDED"]),
    workType: z.string().trim().min(1).max(40).nullable(), remark: z.string().trim().max(1000).nullable(),
    leader: z.object({ memberId: z.string().min(1), participantType: z.enum(["WORKER", "MANAGER"]) }).strict().nullable(),
    expectedUpdatedAt: dateTimeSchema
  }).strict(), "INVALID_UPDATE_TEAM_REQUEST");
