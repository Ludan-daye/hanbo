import { BadRequestException } from "@nestjs/common";
import { z } from "zod";

import type {
  ConfigureDefaultScheduleRequest,
  ConfigureDefaultShiftRequest,
  SubmitAttendanceRecordRequest
} from "./attendance.types.js";

const attendancePointCodes = ["SEGMENT_1_START", "SEGMENT_1_END", "SEGMENT_2_START", "SEGMENT_2_END"] as const;
const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^\d{2}:\d{2}$/;
const coordinatePattern = /^-?\d{1,3}(\.\d{1,7})?$/;
const decimalPattern = /^\d+(\.\d+)?$/;

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

const isValidTime = (value: string): boolean => {
  if (!timePattern.test(value)) {
    return false;
  }

  const [hourText, minuteText] = value.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);

  return Number.isInteger(hour) && Number.isInteger(minute) && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
};

const isCoordinate = (value: string, min: number, max: number): boolean => {
  if (!coordinatePattern.test(value)) {
    return false;
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= min && numberValue <= max;
};

const nonEmptyStringSchema = z.string().min(1);
const dateOnlySchema = z.string().refine(isValidDateOnly);
const timeSchema = z.string().refine(isValidTime);
const positiveDecimalStringSchema = z.string().refine((value: string): boolean => decimalPattern.test(value));

const shiftSegmentSchema = z.object({
  earlyGraceMins: z.number().int().min(0),
  endTime: timeSchema,
  lateGraceMins: z.number().int().min(0),
  sequence: z.union([z.literal(1), z.literal(2)]),
  startTime: timeSchema
});

const isoWeekdaySchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
  z.literal(7)
]);

const configureDefaultShiftRequestSchema = z
  .object({
    name: nonEmptyStringSchema,
    segments: z.tuple([shiftSegmentSchema, shiftSegmentSchema])
  })
  .superRefine((value: ConfigureDefaultShiftRequest, context: z.RefinementCtx): void => {
    const [firstSegment, secondSegment] = value.segments;

    if (firstSegment.sequence !== 1 || secondSegment.sequence !== 2) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "SHIFT_SEGMENTS_MUST_USE_SEQUENCE_1_THEN_2",
        path: ["segments"]
      });
    }

    if (firstSegment.startTime >= firstSegment.endTime) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "SHIFT_SEGMENT_1_START_MUST_BE_BEFORE_END",
        path: ["segments", 0]
      });
    }

    if (secondSegment.startTime >= secondSegment.endTime) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "SHIFT_SEGMENT_2_START_MUST_BE_BEFORE_END",
        path: ["segments", 1]
      });
    }
  });

const configureDefaultScheduleRequestSchema = z
  .object({
    endsOn: z.union([dateOnlySchema, z.null()]),
    startsOn: dateOnlySchema,
    workdays: z.array(isoWeekdaySchema).min(1)
  })
  .superRefine((value: ConfigureDefaultScheduleRequest, context: z.RefinementCtx): void => {
    if (value.endsOn !== null && value.endsOn < value.startsOn) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "DEFAULT_SCHEDULE_ENDS_ON_MUST_NOT_BE_BEFORE_STARTS_ON",
        path: ["endsOn"]
      });
    }

    if (new Set(value.workdays).size !== value.workdays.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "DEFAULT_SCHEDULE_WORKDAYS_MUST_BE_UNIQUE",
        path: ["workdays"]
      });
    }
  });

const submitAttendanceRecordRequestSchema = z.object({
  faceVerificationSessionId: z.string().uuid().optional(),
  attendanceDate: dateOnlySchema,
  latitude: z.string().refine((value: string): boolean => isCoordinate(value, -90, 90)),
  locationAccuracyM: z.union([positiveDecimalStringSchema, z.null()]),
  longitude: z.string().refine((value: string): boolean => isCoordinate(value, -180, 180)),
  occurredAt: z.string().datetime({ offset: true }),
  pointCode: z.enum(attendancePointCodes),
  selfieHash: nonEmptyStringSchema.optional(),
  selfieObjectKey: nonEmptyStringSchema.optional(),
  sitePhotoHash: nonEmptyStringSchema,
  sitePhotoObjectKey: nonEmptyStringSchema
});

export const parseFaceVerificationPoint = (body: unknown): (typeof attendancePointCodes)[number] => {
  const result = z.object({ pointCode: z.enum(attendancePointCodes) }).safeParse(body);
  if (!result.success) throw new BadRequestException({ message: "INVALID_FACE_VERIFICATION_POINT" });
  return result.data.pointCode;
};

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

export const parseConfigureDefaultShiftRequest = (body: unknown): ConfigureDefaultShiftRequest =>
  parseBody(body, configureDefaultShiftRequestSchema, "INVALID_CONFIGURE_DEFAULT_SHIFT_REQUEST");

export const parseConfigureDefaultScheduleRequest = (body: unknown): ConfigureDefaultScheduleRequest =>
  parseBody(body, configureDefaultScheduleRequestSchema, "INVALID_CONFIGURE_DEFAULT_SCHEDULE_REQUEST");

export const parseSubmitAttendanceRecordRequest = (body: unknown): SubmitAttendanceRecordRequest =>
  parseBody(body, submitAttendanceRecordRequestSchema, "INVALID_SUBMIT_ATTENDANCE_RECORD_REQUEST");
