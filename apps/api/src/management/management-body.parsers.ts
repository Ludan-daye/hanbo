import { BadRequestException } from "@nestjs/common";
import { z } from "zod";
import type { TeamWriteRequest } from "./teams.types.js";

import type {
  CreateCompanyRequest,
  CreateProjectManagerRequest,
  CreateProjectRequest,
  CreateProjectWorkerRequest,
  CreateTeamRequest,
  UpdateProjectRequest
} from "./management.types.js";

const projectStatusValues = ["ACTIVE", "COMPLETED", "PREPARING", "SUSPENDED"] as const;
const memberStatusValues = ["ACTIVE", "EXITED", "SUSPENDED"] as const;
const projectManagerRoleCodes = ["PROJECT_ADMIN", "TEAM_LEADER"] as const;
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
const nullableDateTimeSchema = z.union([dateTimeSchema, z.null()]);

const createCompanyRequestSchema = z.object({
  name: nonEmptyStringSchema,
  status: nonEmptyStringSchema
});

const projectWriteFieldsSchema = z.object({
  address: nonEmptyStringSchema,
  centerLatitude: z.string().refine((value: string): boolean => isCoordinate(value, -90, 90)),
  centerLongitude: z.string().refine((value: string): boolean => isCoordinate(value, -180, 180)),
  geofenceRadiusM: z.number().int().positive(),
  name: nonEmptyStringSchema,
  plannedEndDate: z.union([dateOnlySchema, z.null()]),
  plannedStartDate: dateOnlySchema,
  status: z.enum(projectStatusValues)
});

const createProjectRequestSchema = projectWriteFieldsSchema.extend({
  managerProfileIds: z.array(z.string().trim().min(1)).min(1).max(20)
    .refine((ids): boolean => new Set(ids).size === ids.length, "Duplicate project administrators.")
}).refine((value): boolean => value.plannedEndDate === null || value.plannedEndDate >= value.plannedStartDate, {
  path: ["plannedEndDate"], message: "Project end date must follow the start date."
});

const createTeamRequestSchema = z.object({
  name: z.string().trim().min(1).max(30),
  status: z.enum(["ACTIVE", "SUSPENDED"])
});

const createProjectWorkerRequestSchema = z.object({
  employmentStatus: nonEmptyStringSchema,
  encryptedIdNumber: nonEmptyStringSchema,
  encryptedName: nonEmptyStringSchema,
  enteredAt: dateTimeSchema,
  exitedAt: nullableDateTimeSchema,
  faceProfileStatus: nonEmptyStringSchema,
  idNumberHash: nonEmptyStringSchema,
  memberStatus: z.enum(memberStatusValues),
  phone: nonEmptyStringSchema,
  projectRoleLabel: nonEmptyStringSchema,
  realNameStatus: nonEmptyStringSchema,
  requiresAttendance: z.boolean(),
  teamId: z.union([nonEmptyStringSchema, z.null()]),
  workType: nonEmptyStringSchema
});

const createProjectManagerRequestSchema = z.object({
  memberStatus: z.enum(memberStatusValues),
  name: nonEmptyStringSchema,
  phone: nonEmptyStringSchema,
  profileStatus: nonEmptyStringSchema,
  requiresAttendance: z.boolean(),
  roleCode: z.enum(projectManagerRoleCodes),
  teamScopeId: z.union([nonEmptyStringSchema, z.null()])
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

export const parseCreateCompanyRequest = (body: unknown): CreateCompanyRequest =>
  parseBody(body, createCompanyRequestSchema, "INVALID_CREATE_COMPANY_REQUEST");

export const parseCreateProjectRequest = (body: unknown): CreateProjectRequest =>
  parseBody(body, createProjectRequestSchema, "INVALID_CREATE_PROJECT_REQUEST");

export const parseProjectManagerSearch = (query: unknown): { readonly search: string } =>
  parseBody(query, z.object({ search: z.string().trim().max(60) }), "INVALID_PROJECT_MANAGER_SEARCH");

export const parseCreateTeamRequest = (body: unknown): CreateTeamRequest =>
  parseBody(body, createTeamRequestSchema, "INVALID_CREATE_TEAM_REQUEST");

export const parseCreateProjectWorkerRequest = (body: unknown): CreateProjectWorkerRequest =>
  parseBody(body, createProjectWorkerRequestSchema, "INVALID_CREATE_PROJECT_WORKER_REQUEST");

export const parseCreateProjectManagerRequest = (body: unknown): CreateProjectManagerRequest =>
  parseBody(body, createProjectManagerRequestSchema, "INVALID_CREATE_PROJECT_MANAGER_REQUEST");

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
