import { BadRequestException } from "@nestjs/common";
import { z } from "zod";

import { contactPhoneSchema, optionalText } from "../management/company-settings.parsers.js";

import type {
  CompanyAdminAppointment,
  SystemAccountQuery,
  SystemCompanyQuery,
  SystemCompanyStatusChange,
  SystemCompanyUpdate,
  SystemCompanyWrite,
} from "./system.types.js";

const fail = (message: string, issues: z.ZodIssue[]): never => {
  throw new BadRequestException({ issues, message });
};

/**
 * 统一社会信用代码 (GB 32100-2015): 18 digits and capital letters without I, O, S, V, Z.
 * Lower case is accepted and stored in capitals.
 */
const CREDIT_CODE = /^[0-9A-HJ-NP-RTUW-Y]{18}$/;

const companyFields = {
  address: optionalText(120),
  contactName: optionalText(30),
  contactPhone: contactPhoneSchema,
  // Length and characters are checked after parsing, so a wrong code says INVALID_CREDIT_CODE.
  creditCode: optionalText(40),
  name: z.string().trim().min(1).max(60),
  shortName: optionalText(20),
};

/** Creating: the optional fields may be left out. Editing sends all of them. */
const createFields = {
  ...companyFields,
  address: companyFields.address.default(null),
  contactName: companyFields.contactName.default(null),
  contactPhone: companyFields.contactPhone.default(null),
  creditCode: companyFields.creditCode.default(null),
  shortName: companyFields.shortName.default(null),
};

const normalizedCreditCode = (value: string | null): string | null => {
  if (value === null) return null;
  const code = value.toUpperCase();
  if (!CREDIT_CODE.test(code))
    throw new BadRequestException({ message: "INVALID_CREDIT_CODE" });
  return code;
};

/** New company (Q7): name required, the rest optional; status is always ACTIVE. */
export const parseSystemCompanyCreate = (body: unknown): SystemCompanyWrite => {
  const result = z.object(createFields).strict().safeParse(body);
  if (!result.success) return fail("INVALID_SYSTEM_COMPANY_REQUEST", result.error.issues);
  return { ...result.data, creditCode: normalizedCreditCode(result.data.creditCode) };
};

/** Edit every field of a company, including name and credit code (Q12 of level 4). */
export const parseSystemCompanyUpdate = (body: unknown): SystemCompanyUpdate => {
  const result = z
    .object({ ...companyFields, expectedUpdatedAt: z.string().datetime({ offset: true }) })
    .strict()
    .safeParse(body);
  if (!result.success) return fail("INVALID_SYSTEM_COMPANY_REQUEST", result.error.issues);
  return { ...result.data, creditCode: normalizedCreditCode(result.data.creditCode) };
};

/** Suspend or resume (phase 3): the target status and the updatedAt the page read. */
export const parseSystemCompanyStatusChange = (body: unknown): SystemCompanyStatusChange => {
  const result = z
    .object({ expectedUpdatedAt: z.string().datetime({ offset: true }), status: z.enum(["ACTIVE", "SUSPENDED"]) })
    .strict()
    .safeParse(body);
  if (!result.success) return fail("INVALID_SYSTEM_COMPANY_STATUS_REQUEST", result.error.issues);
  return result.data;
};

export const parseSystemCompanyQuery = (query: unknown): SystemCompanyQuery => {
  const result = z
    .object({
      cursor: z.string().min(1).optional(),
      search: z.string().trim().max(60).optional(),
      status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
    })
    .safeParse(query);
  if (!result.success) return fail("INVALID_SYSTEM_COMPANY_QUERY", result.error.issues);
  return {
    cursor: result.data.cursor ?? null,
    search: result.data.search ?? "",
    status: result.data.status ?? null,
  };
};

export const parseCandidateSearch = (query: unknown): string => {
  const result = z.object({ search: z.string().trim().max(30).optional() }).safeParse(query);
  if (!result.success) return fail("INVALID_SYSTEM_COMPANY_QUERY", result.error.issues);
  return result.data.search ?? "";
};

/** Q1: pick an existing manager profile, or enter a new person's name and mobile number. */
export const parseCompanyAdminAppointment = (body: unknown): CompanyAdminAppointment => {
  const result = z
    .union([
      z.object({ managerProfileId: z.string().min(1) }).strict(),
      z
        .object({
          name: z.string().trim().min(1).max(30),
          phone: z.string().trim().regex(/^1\d{10}$/),
        })
        .strict(),
    ])
    .safeParse(body);
  if (!result.success) return fail("INVALID_COMPANY_ADMIN_REQUEST", result.error.issues);
  return result.data;
};

/** Accounts: search by name or mobile number, filter by status or a role the account holds. */
export const parseSystemAccountQuery = (query: unknown): SystemAccountQuery => {
  const result = z
    .object({
      cursor: z.string().min(1).optional(),
      role: z.enum(["SYSTEM_ADMIN", "COMPANY_ADMIN", "PROJECT_ADMIN", "TEAM_LEADER", "WORKER"]).optional(),
      search: z.string().trim().max(30).optional(),
      status: z.enum(["ACTIVE", "DISABLED"]).optional(),
    })
    .safeParse(query);
  if (!result.success) return fail("INVALID_SYSTEM_ACCOUNT_QUERY", result.error.issues);
  return {
    cursor: result.data.cursor ?? null,
    role: result.data.role ?? null,
    search: result.data.search ?? "",
    status: result.data.status ?? null,
  };
};
