import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { AuthorizationModule } from "../authorization/authorization.module.js";
import { PrismaModule } from "../infrastructure/database/prisma.module.js";

import { CompanyPeopleController } from "./company-people.controller.js";
import { CompanyPeopleService } from "./company-people.service.js";
import { CompanySettingsController } from "./company-settings.controller.js";
import { CompanySettingsService } from "./company-settings.service.js";
import { ManagementController } from "./management.controller.js";
import { ManagementService } from "./management.service.js";
import { ParticipantsService } from "./participants.service.js";
import { RegistrationReviewService } from "./registration-review.service.js";
import { TransferRequestsService } from "./transfer-requests.service.js";
import { TeamsService } from "./teams.service.js";

@Module({
  imports: [AuthModule, AuthorizationModule, PrismaModule],
  controllers: [CompanyPeopleController, CompanySettingsController, ManagementController],
  providers: [CompanyPeopleService, CompanySettingsService, ManagementService, ParticipantsService, RegistrationReviewService, TeamsService, TransferRequestsService],
  exports: [ManagementService]
})
export class ManagementModule {}
