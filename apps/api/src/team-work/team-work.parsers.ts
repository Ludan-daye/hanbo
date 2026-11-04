import { BadRequestException } from "@nestjs/common";
import { z } from "zod";

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed: Date = new Date(`${value}T00:00:00Z`);
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "请选择有效日期");
const taskDetails = z
  .object({
    title: z.string().trim().min(1).max(80),
    description: z.string().trim().max(2000),
    workType: z.string().trim().max(50),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
  })
  .strict();
const validDuration = (input: z.infer<typeof taskDetails>): boolean => {
  const duration: number =
    Date.parse(input.endsAt) - Date.parse(input.startsAt);
  return duration > 0 && duration <= 86400000;
};
const task = taskDetails
  .extend({
    memberIds: z
      .array(z.string().min(1))
      .max(200)
      .refine((ids) => new Set(ids).size === ids.length, "人员不能重复"),
  })
  .refine(validDuration, "任务时长需大于 0 且不超过 24 小时");
const invitation = z
  .object({
    realName: z.string().trim().min(2).max(50),
    phone: z.string().regex(/^1[3-9]\d{9}$/),
  })
  .strict();
const briefing = z
  .object({
    workDate: day,
    title: z.string().trim().min(1).max(80),
    content: z.string().trim().min(1).max(3000),
  })
  .strict();
const issue = z
  .object({
    workDate: day,
    memberId: z.string().min(1).nullable(),
    description: z.string().trim().min(1).max(2000),
    severity: z.enum(["GENERAL", "SERIOUS"]),
  })
  .strict();
const parse = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const result = schema.safeParse(body);
  if (!result.success)
    throw new BadRequestException({
      message: "填写内容有误，请检查日期、时间和必填项。",
      fields: result.error.issues.map((item) => ({
        path: item.path,
        message: item.message,
      })),
    });
  return result.data;
};
export const parseTask = (body: unknown): z.infer<typeof task> =>
  parse(task, body);
export const parseTaskDetails = (body: unknown): z.infer<typeof taskDetails> =>
  parse(
    taskDetails.refine(validDuration, "任务时长需大于 0 且不超过 24 小时"),
    body,
  );
export const parseTaskMembers = (body: unknown): readonly string[] =>
  parse(
    z
      .object({
        memberIds: z
          .array(z.string().min(1))
          .min(1)
          .max(200)
          .refine((ids) => new Set(ids).size === ids.length, "人员不能重复"),
      })
      .strict(),
    body,
  ).memberIds;
export const parseInvitation = (body: unknown): z.infer<typeof invitation> =>
  parse(invitation, body);
export const parseBriefing = (body: unknown): z.infer<typeof briefing> =>
  parse(briefing, body);
export const parseIssue = (body: unknown): z.infer<typeof issue> =>
  parse(issue, body);
export const parseDay = (value: unknown): string => parse(day, value);
export const parseCode = (body: unknown): string =>
  parse(z.object({ code: z.string().regex(/^\d{6}$/) }).strict(), body).code;
export const parseTaskStatus = (body: unknown): "COMPLETED" | "CANCELLED" =>
  parse(z.object({ status: z.enum(["COMPLETED", "CANCELLED"]) }).strict(), body)
    .status;
export const parseResolution = (body: unknown): string =>
  parse(
    z.object({ resolution: z.string().trim().min(1).max(2000) }).strict(),
    body,
  ).resolution;
