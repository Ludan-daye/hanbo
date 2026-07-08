import { Module } from "@nestjs/common";

import { AttendanceModule } from "./attendance/attendance.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { AuthorizationModule } from "./authorization/authorization.module.js";
import { BindingsModule } from "./bindings/bindings.module.js";
import { EnvModule } from "./config/env.module.js";
import { HealthController } from "./health/health.controller.js";
import { PrismaModule } from "./infrastructure/database/prisma.module.js";
import { ManagementModule } from "./management/management.module.js";
import { MakeupModule } from "./makeup/makeup.module.js";
import { MeModule } from "./me/me.module.js";
import { ReportsModule } from "./reports/reports.module.js";
import { UploadsModule } from "./uploads/uploads.module.js";

@Module({
  imports: [
    EnvModule,
    PrismaModule,
    AuthModule,
    AuthorizationModule,
    BindingsModule,
    ManagementModule,
    AttendanceModule,
    MakeupModule,
    MeModule,
    ReportsModule,
    UploadsModule
  ],
  controllers: [HealthController]
})
export class AppModule {}
