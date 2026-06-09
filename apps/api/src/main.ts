import "reflect-metadata";

import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module.js";
import { loadEnv } from "./config/env.js";
import { parseAllowedOrigins } from "./main.cors.js";

const bootstrap = async (): Promise<void> => {
  const env = loadEnv(process.env);
  const app = await NestFactory.create(AppModule);

  const allowedOrigins = parseAllowedOrigins(env.CORS_ALLOWED_ORIGINS);
  if (allowedOrigins.length > 0) {
    app.enableCors({ origin: allowedOrigins });
  }

  app.enableShutdownHooks();

  await app.listen(env.API_PORT);
};

await bootstrap();
