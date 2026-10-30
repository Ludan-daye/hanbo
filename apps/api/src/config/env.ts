import { z } from "zod";

const booleanStringSchema = z
  .enum(["true", "false"])
  .default("false")
  .transform((value): boolean => value === "true");

const envSchema = z
  .object({
    AUTH_REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive(),
    API_PORT: z.coerce.number().int().positive(),
    CORS_ALLOWED_ORIGINS: z.string().default(""),
    DATABASE_URL: z.string().min(1),
    DEPLOYMENT_ENV: z.enum(["production", "test"]).default("production"),
    TEST_LOGIN_SECRET_HASH: z.string().regex(/^$|^[a-f0-9]{64}$/).default(""),
    FACE_DEV_STUB: booleanStringSchema,
    FACE_DEV_STUB_SCORE: z.coerce.number().min(0).max(100).default(95),
    FACE_SCORE_THRESHOLD: z.coerce.number().min(0).max(100).default(80),
    FACE_SERVICE_API_KEY: z.string().min(1),
    FACE_SERVICE_BASE_URL: z.string().url(),
    JWT_ACCESS_TOKEN_SECRET: z.string().min(32),
    JWT_ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive(),
    NODE_ENV: z.enum(["development", "test", "production"]),
    PERSONNEL_ENCRYPTION_KEY: z.string().regex(/^$|^[a-fA-F0-9]{64}$/).default(""),
    OBJECT_STORAGE_ACCESS_KEY: z.string().min(1),
    OBJECT_STORAGE_BUCKET: z.string().min(1),
    OBJECT_STORAGE_ENDPOINT: z.string().url(),
    OBJECT_STORAGE_SECRET_KEY: z.string().min(1),
    TENCENT_FACE_REGION: z.string().default(""),
    TENCENT_FACE_MODE: z.enum(["WECHAT_NATIVE", "VIDEO_ACTION"]).default("WECHAT_NATIVE"),
    TENCENT_FACE_RULE_ID: z.string().default(""),
    TENCENT_SECRET_ID: z.string().default(""),
    TENCENT_SECRET_KEY: z.string().default(""),
    UPLOADS_DIR: z.string().min(1).default("./var/uploads"),
    WECHAT_APP_ID: z.string().min(1),
    WECHAT_APP_SECRET: z.string().min(1),
    WECHAT_DEV_LOGIN: booleanStringSchema
  })
  .superRefine((env, ctx): void => {
    if (env.TEST_LOGIN_SECRET_HASH.length > 0 && env.DEPLOYMENT_ENV !== "test") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["TEST_LOGIN_SECRET_HASH"], message: "Test login is only allowed in an explicitly designated test deployment" });
    }
    if ((env.TENCENT_SECRET_ID.length > 0) !== (env.TENCENT_SECRET_KEY.length > 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["TENCENT_SECRET_KEY"], message: "Configure both Tencent server credentials together" });
    }
    if (env.TENCENT_FACE_MODE === "VIDEO_ACTION" && env.FACE_DEV_STUB) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["FACE_DEV_STUB"], message: "Disable FACE_DEV_STUB before selecting video action verification" });
    }
    if (env.TENCENT_FACE_RULE_ID.length > 0) {
      for (const key of ["TENCENT_SECRET_ID", "TENCENT_SECRET_KEY"] as const) {
        if (env[key].length === 0) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `${key} is required for Tencent face verification` });
        }
      }
      if (env.FACE_DEV_STUB) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["FACE_DEV_STUB"], message: "Disable FACE_DEV_STUB when configuring Tencent face verification" });
      }
    }
    if (env.NODE_ENV === "production" && env.WECHAT_DEV_LOGIN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "WECHAT_DEV_LOGIN must be false in production",
        path: ["WECHAT_DEV_LOGIN"]
      });
    }
    if (env.NODE_ENV === "production" && env.FACE_DEV_STUB) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "FACE_DEV_STUB must be false in production",
        path: ["FACE_DEV_STUB"]
      });
    }
  });

export type ApiEnv = z.infer<typeof envSchema>;

export const loadEnv = (env: NodeJS.ProcessEnv): ApiEnv => {
  const result = envSchema.safeParse(env);

  if (!result.success) {
    throw new Error(
      JSON.stringify({
        issues: result.error.issues,
        message: "Invalid environment configuration"
      })
    );
  }

  return result.data;
};
