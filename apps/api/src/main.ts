import "reflect-metadata";

import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module.js";
import { loadEnv } from "./config/env.js";

const bootstrap = async (): Promise<void> => {
  const env = loadEnv(process.env);
  const app = await NestFactory.create(AppModule);

  app.enableShutdownHooks();

  await app.listen(env.API_PORT);
};

await bootstrap();
