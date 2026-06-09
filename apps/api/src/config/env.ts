import { z } from "zod";

const envSchema = z.object({
  AUTH_REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive(),
  API_PORT: z.coerce.number().int().positive(),
  DATABASE_URL: z.string().min(1),
  FACE_SERVICE_API_KEY: z.string().min(1),
  FACE_SERVICE_BASE_URL: z.string().url(),
  JWT_ACCESS_TOKEN_SECRET: z.string().min(32),
  JWT_ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive(),
  NODE_ENV: z.enum(["development", "test", "production"]),
  OBJECT_STORAGE_ACCESS_KEY: z.string().min(1),
  OBJECT_STORAGE_BUCKET: z.string().min(1),
  OBJECT_STORAGE_ENDPOINT: z.string().url(),
  OBJECT_STORAGE_SECRET_KEY: z.string().min(1),
  WECHAT_APP_ID: z.string().min(1),
  WECHAT_APP_SECRET: z.string().min(1)
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
