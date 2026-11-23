import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from "@nestjs/common";
import type {
  MySafetyCredit,
  SafetyCreditBoard,
  SafetyCreditPolicyView,
  SafetyViolationView,
} from "@construction/domain";
import { AccessTokenGuard } from "../auth/access-token.guard.js";
import { ActiveCompanyGuard } from "../authorization/active-company.guard.js";
import { RequireActiveCompany } from "../authorization/require-active-company.decorator.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { SafetyCreditService } from "./safety-credit.service.js";
import {
  parseSafetyAppealReview,
  parseSafetyPolicy,
  parseSafetyReason,
  parseSafetyReview,
  parseSafetyViolation,
} from "./safety-credit.parsers.js";

@Controller("safety-credit")
@UseGuards(AccessTokenGuard)
export class SafetyCreditController {
  constructor(
    @Inject(SafetyCreditService) private readonly safety: SafetyCreditService,
  ) {}
  @Get("policies")
  @Header("Cache-Control", "no-store")
  policies(): Promise<readonly SafetyCreditPolicyView[]> {
    return this.safety.policies();
  }
  @Post("policies")
  policy(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() body: unknown,
  ): Promise<SafetyCreditPolicyView> {
    return this.safety.createPolicy(actor.userId, parseSafetyPolicy(body));
  }
  @Get("me")
  @Header("Cache-Control", "no-store")
  mine(@CurrentUser() actor: AuthenticatedUser): Promise<MySafetyCredit> {
    return this.safety.mine(actor.userId);
  }
  @Get("teams/:teamId")
  @Header("Cache-Control", "no-store")
  team(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("teamId") teamId: string,
  ): Promise<SafetyCreditBoard> {
    return this.safety.teamBoard(actor.userId, teamId);
  }
  @Get("projects/:projectId")
  @Header("Cache-Control", "no-store")
  project(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("projectId") projectId: string,
  ): Promise<SafetyCreditBoard> {
    return this.safety.projectBoard(actor.userId, projectId);
  }
  // Writes for a suspended company are refused (system admin plan phase 3); appeals check in the service.
  @Post("teams/:teamId/violations")
  @RequireActiveCompany({ paramName: "teamId", source: "teamParam" })
  @UseGuards(ActiveCompanyGuard)
  record(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Body() body: unknown,
  ): Promise<SafetyViolationView> {
    return this.safety.record(actor.userId, teamId, parseSafetyViolation(body));
  }
  @Post("projects/:projectId/violations/:id/review")
  @RequireActiveCompany({ paramName: "projectId", source: "projectParam" })
  @UseGuards(ActiveCompanyGuard)
  review(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("projectId") projectId: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<void> {
    const input = parseSafetyReview(body);
    return this.safety.review(
      actor.userId,
      projectId,
      id,
      input.action,
      input.reason,
    );
  }
  @Post("me/violations/:id/appeals")
  appeal(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<void> {
    return this.safety.appeal(actor.userId, id, parseSafetyReason(body));
  }
  @Post("projects/:projectId/violations/:id/appeals/:appealId/review")
  @RequireActiveCompany({ paramName: "projectId", source: "projectParam" })
  @UseGuards(ActiveCompanyGuard)
  appealReview(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("projectId") projectId: string,
    @Param("id") id: string,
    @Param("appealId") appealId: string,
    @Body() body: unknown,
  ): Promise<void> {
    const input = parseSafetyAppealReview(body);
    return this.safety.reviewAppeal(
      actor.userId,
      projectId,
      id,
      appealId,
      input.accept,
      input.reason,
    );
  }
  @Get("violations/:id/evidence/:index")
  @Header("Cache-Control", "no-store")
  evidence(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("id") id: string,
    @Param("index", ParseIntPipe) index: number,
  ): Promise<{ readonly contentType: string; readonly base64: string }> {
    return this.safety.evidence(actor.userId, id, index);
  }
}
