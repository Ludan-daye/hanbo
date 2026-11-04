import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { AuthorizationModule } from "../authorization/authorization.module.js";
import { ReportsModule } from "../reports/reports.module.js";
import {
  MyTeamWorkController,
  TeamWorkController,
} from "./team-work.controller.js";
import { TeamWorkService } from "./team-work.service.js";
import { TemporaryInvitationsService } from "./temporary-invitations.service.js";

@Module({
  imports: [AuthModule, AuthorizationModule, ReportsModule],
  controllers: [TeamWorkController, MyTeamWorkController],
  providers: [TeamWorkService, TemporaryInvitationsService],
})
export class TeamWorkModule {}
