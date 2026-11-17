import { BadRequestException } from "@nestjs/common";
import { z } from "zod";
import type {
  SafetyCreditPolicyInput,
  SafetyViolationInput,
} from "@construction/domain";

const violation = z
  .object({
    memberId: z.string().min(1).max(100),
    category: z.string().trim().min(1).max(40),
    severity: z.enum(["GENERAL", "SERIOUS", "MAJOR"]),
    occurredAt: z.string().datetime({ offset: true }),
    description: z.string().trim().min(1).max(2000),
    evidence: z
      .array(
        z
          .object({
            objectKey: z.string().min(1).max(255),
            hash: z.string().regex(/^[a-f0-9]{64}$/),
          })
          .strict(),
      )
      .min(1)
      .max(5),
  })
  .strict();
const reason = z.string().trim().min(1).max(1000);
const review = z
  .object({ action: z.enum(["CONFIRM", "REJECT", "REVOKE"]), reason })
  .strict();
const policy = z
  .object({
    startsOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((value) => {
        const date = new Date(value);
        return (
          Number.isFinite(date.getTime()) &&
          date.toISOString().slice(0, 10) === value
        );
      }),
    generalPoints: z.number().int().min(1).max(100),
    seriousPoints: z.number().int().min(1).max(100),
    majorPoints: z.number().int().min(1).max(100),
    recoveryWorkdays: z.number().int().min(1).max(365),
    recoveryPoints: z.number().int().min(1).max(100),
  })
  .strict()
  .refine(
    (row) =>
      row.generalPoints <= row.seriousPoints &&
      row.seriousPoints <= row.majorPoints,
    "扣分需随违规等级递增",
  );
const parse = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const result = schema.safeParse(body);
  if (!result.success)
    throw new BadRequestException({
      message: "安全信用填写内容有误",
      fields: result.error.issues.map((row) => ({
        path: row.path,
        message: row.message,
      })),
    });
  return result.data;
};
export const parseSafetyViolation = (body: unknown): SafetyViolationInput =>
  parse(violation, body);
export const parseSafetyReview = (body: unknown): z.infer<typeof review> =>
  parse(review, body);
export const parseSafetyReason = (body: unknown): string =>
  parse(z.object({ reason }).strict(), body).reason;
export const parseSafetyAppealReview = (
  body: unknown,
): { readonly accept: boolean; readonly reason: string } =>
  parse(z.object({ accept: z.boolean(), reason }).strict(), body);
export const parseSafetyPolicy = (body: unknown): SafetyCreditPolicyInput =>
  parse(policy, body);
