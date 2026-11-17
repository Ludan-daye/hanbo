import { BadRequestException } from "@nestjs/common";
import { z } from "zod";
import { tomorrowChina } from "../attendance/attendance-plans.js";

const clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).nullable();
export const worktimeRuleSchema = z.object({
  projectKind: z.enum(["REGULAR", "REPAIR"]),
  lunchStart: clock,
  lunchEnd: clock,
  overtimeStart: clock,
}).strict().refine((rule) =>
  (rule.lunchStart === null && rule.lunchEnd === null) ||
  (rule.lunchStart !== null && rule.lunchEnd !== null && rule.lunchStart < rule.lunchEnd),
{ message: "午休开始、结束时间须同时设置，结束晚于开始。" });
const inputSchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }),
  config: worktimeRuleSchema,
}).strict();
export type WorktimeRuleInput = z.infer<typeof inputSchema>;
export const parseWorktimeRuleInput = (body: unknown): WorktimeRuleInput => {
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) throw new BadRequestException({ message: "工时规则无效。", issues: parsed.error.issues });
  if (parsed.data.startsOn < tomorrowChina()) throw new BadRequestException({ message: "工时规则最早次日生效，历史记录保留。" });
  return parsed.data;
};
