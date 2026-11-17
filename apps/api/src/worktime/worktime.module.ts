import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { AuthorizationModule } from "../authorization/authorization.module.js";
import { PrismaModule } from "../infrastructure/database/prisma.module.js";
import { WorktimeController } from "./worktime.controller.js";
import { WorktimeService } from "./worktime.service.js";

@Module({ imports: [AuthModule, AuthorizationModule, PrismaModule], controllers: [WorktimeController], providers: [WorktimeService], exports: [WorktimeService] })
export class WorktimeModule {}
