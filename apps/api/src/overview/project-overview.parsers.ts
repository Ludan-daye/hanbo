import { BadRequestException } from "@nestjs/common";
import { z } from "zod";

import { chinaDate } from "../attendance/attendance-plans.js";

const isValidDateOnly = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const overviewQuerySchema = z.object({
  date: z.string().refine(isValidDateOnly).optional(),
});

/** `?date=YYYY-MM-DD`, defaulting to today in Asia/Shanghai. */
export const parseOverviewQuery = (query: unknown): { readonly date: string } => {
  const result = overviewQuerySchema.safeParse(query ?? {});
  if (!result.success)
    throw new BadRequestException({
      issues: result.error.issues,
      message: "INVALID_OVERVIEW_QUERY",
    });
  return { date: result.data.date ?? chinaDate(new Date()) };
};
