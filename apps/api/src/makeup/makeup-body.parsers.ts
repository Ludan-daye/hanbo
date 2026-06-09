import { BadRequestException } from "@nestjs/common";
import { z } from "zod";

import type { CreateMakeupRequestBody, ReviewMakeupRequestBody } from "./makeup.types.js";

const attendancePointCodes = ["SEGMENT_1_START", "SEGMENT_1_END", "SEGMENT_2_START", "SEGMENT_2_END"] as const;
const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
const chinaDateFormatter = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "Asia/Shanghai",
  year: "numeric"
});

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

const getChinaDateOnly = (value: Date): string => {
  const parts = chinaDateFormatter.formatToParts(value);
  const partValues = new Map<string, string>(
    parts.map((part: Intl.DateTimeFormatPart): readonly [string, string] => [part.type, part.value])
  );
  const year = partValues.get("year");
  const month = partValues.get("month");
  const day = partValues.get("day");

  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(
      JSON.stringify({
        message: "Failed to format China date from requestedOccurredAt",
        requestedOccurredAt: value.toISOString()
      })
    );
  }

  return `${year}-${month}-${day}`;
};

const nonEmptyStringSchema = z.string().min(1);
const dateOnlySchema = z.string().refine(isValidDateOnly);

const createMakeupRequestBodySchema = z
  .object({
    attendanceDate: dateOnlySchema,
    pointCode: z.enum(attendancePointCodes),
    reason: nonEmptyStringSchema,
    requestedOccurredAt: z.string().datetime({ offset: true })
  })
  .superRefine((value: CreateMakeupRequestBody, context: z.RefinementCtx): void => {
    const occurredDate = getChinaDateOnly(new Date(value.requestedOccurredAt));

    if (occurredDate !== value.attendanceDate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "REQUESTED_OCCURRED_AT_DATE_MISMATCH",
        path: ["requestedOccurredAt"]
      });
    }
  });

const reviewMakeupRequestBodySchema = z.object({
  approvalReason: nonEmptyStringSchema
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

export const parseCreateMakeupRequestBody = (body: unknown): CreateMakeupRequestBody =>
  parseBody(body, createMakeupRequestBodySchema, "INVALID_CREATE_MAKEUP_REQUEST");

export const parseReviewMakeupRequestBody = (body: unknown): ReviewMakeupRequestBody =>
  parseBody(body, reviewMakeupRequestBodySchema, "INVALID_REVIEW_MAKEUP_REQUEST");
