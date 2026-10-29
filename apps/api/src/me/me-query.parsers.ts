import { BadRequestException } from "@nestjs/common";
import { z } from "zod";

const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
const isValidDateOnly = (value: string): boolean => {
  if (!dateOnlyPattern.test(value)) return false;
  const parts = value.split("-").map(Number);
  const y = parts[0] ?? NaN;
  const m = parts[1] ?? NaN;
  const d = parts[2] ?? NaN;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
};

const dateOnlySchema = z.string().refine(isValidDateOnly);

const myAttendanceRecordsQuerySchema = z
  .object({ from: dateOnlySchema, to: dateOnlySchema })
  .refine((q) => Date.parse(q.to) - Date.parse(q.from) <= 92 * 86400_000, {
    message: "单次最多查询 93 天。",
    path: ["to"],
  })
  .refine((q) => q.from <= q.to, {
    message: "FROM_MUST_BE_BEFORE_OR_EQUAL_TO_TO",
    path: ["from"],
  });

export type MyAttendanceRecordsQuery = z.infer<
  typeof myAttendanceRecordsQuerySchema
>;

export const parseMyAttendanceRecordsQuery = (
  q: unknown,
): MyAttendanceRecordsQuery => {
  const result = myAttendanceRecordsQuerySchema.safeParse(q);
  if (!result.success) {
    throw new BadRequestException({
      issues: result.error.issues,
      message: "INVALID_MY_ATTENDANCE_RECORDS_QUERY",
    });
  }
  return result.data;
};
