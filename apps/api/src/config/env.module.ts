import { Global, Module } from "@nestjs/common";

import { type ApiEnv, loadEnv } from "./env.js";

export const API_ENV = Symbol("API_ENV");

@Global()
@Module({
  providers: [
    {
      provide: API_ENV,
      useFactory: (): ApiEnv => loadEnv(process.env)
    }
  ],
  exports: [API_ENV]
})
export class EnvModule {}
