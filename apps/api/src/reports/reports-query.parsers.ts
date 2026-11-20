import { BadRequestException } from "@nestjs/common";
import { z } from "zod";

import type { ReportTeamFilter } from "./reports.types.js";

const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
const monthPattern = /^\d{4}-\d{2}$/;

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

const isValidMonth = (value: string): boolean => {
  if (!monthPattern.test(value)) {
    return false;
  }

  const [yearText, monthText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const date = new Date(Date.UTC(year, month - 1, 1));

  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && month >= 1 && month <= 12;
};

const dailyReportQuerySchema = z.object({
  date: z.string().refine(isValidDateOnly)
});

const weeklyReportQuerySchema = z.object({
  weekStartDate: z.string().refine(isValidDateOnly)
});

const monthlyReportQuerySchema = z.object({
  month: z.string().refine(isValidMonth)
});

export const parseDailyReportDate = (query: unknown): string => {
  const result = dailyReportQuerySchema.safeParse(query);

  if (!result.success) {
    throw new BadRequestException({
      issues: result.error.issues,
      message: "INVALID_DAILY_REPORT_QUERY"
    });
  }

  return result.data.date;
};

export const parseWeeklyReportStartDate = (query: unknown): string => {
  const result = weeklyReportQuerySchema.safeParse(query);

  if (!result.success) {
    throw new BadRequestException({
      issues: result.error.issues,
      message: "INVALID_WEEKLY_REPORT_QUERY"
    });
  }

  return result.data.weekStartDate;
};

export const parseMonthlyReportMonth = (query: unknown): string => {
  const result = monthlyReportQuerySchema.safeParse(query);

  if (!result.success) {
    throw new BadRequestException({
      issues: result.error.issues,
      message: "INVALID_MONTHLY_REPORT_QUERY"
    });
  }

  return result.data.month;
};

const idSchema = z.string().trim().min(1).max(64);
const teamFilterSchema = z
  .object({
    leaderMemberId: idSchema.optional(),
    teamId: idSchema.optional(),
  })
  .refine((value) => value.leaderMemberId === undefined || value.teamId === undefined, {
    message: "Filter by team or by leader, not both",
  });

/** Optional `teamId` or `leaderMemberId` on project and company reports. */
export const parseReportTeamFilter = (query: unknown): ReportTeamFilter => {
  const result = teamFilterSchema.safeParse(query);

  if (!result.success) {
    throw new BadRequestException({
      issues: result.error.issues,
      message: "INVALID_REPORT_TEAM_FILTER"
    });
  }

  return {
    leaderMemberId: result.data.leaderMemberId ?? null,
    teamId: result.data.teamId ?? null
  };
};
