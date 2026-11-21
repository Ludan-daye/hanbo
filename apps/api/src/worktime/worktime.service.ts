import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, ProjectWorktimeRule } from "@prisma/client";
import { defaultWorktimeRule, resolveWorktimeRule, worktimeChinaDate, type WorktimeRule, type WorktimeRuleVersion } from "@construction/domain";
import { PrismaService } from "../infrastructure/database/prisma.service.js";
import { worktimeRuleSchema, type WorktimeRuleInput } from "./worktime.parsers.js";

export type WorktimeConfiguration = {
  readonly current: WorktimeRuleVersion;
  readonly versions: readonly WorktimeRuleVersion[];
  readonly defaultConfig: WorktimeRule;
  readonly latestVersion: number;
};
const versionFromRow = (row: ProjectWorktimeRule): WorktimeRuleVersion => ({
  config: worktimeRuleSchema.parse({ projectKind: row.projectKind, lunchStart: row.lunchStart, lunchEnd: row.lunchEnd, overtimeStart: row.overtimeStart }),
  startsOn: row.startsOn.toISOString().slice(0, 10), version: row.version,
});
const configuration = (versions: readonly WorktimeRuleVersion[]): WorktimeConfiguration => ({
  current: resolveWorktimeRule(versions, worktimeChinaDate(new Date())),
  versions, defaultConfig: defaultWorktimeRule, latestVersion: Math.max(0, ...versions.map((row) => row.version)),
});
export const readWorktimeRules = async (database: Prisma.TransactionClient, projectIds: readonly string[]): Promise<ReadonlyMap<string, readonly WorktimeRuleVersion[]>> => {
    const rows = await database.projectWorktimeRule.findMany({
      where: { projectId: { in: [...projectIds] } }, orderBy: [{ startsOn: "asc" }, { version: "asc" }],
    });
    return new Map(projectIds.map((id) => [id, rows.filter((row) => row.projectId === id).map(versionFromRow)]));
};
@Injectable()
export class WorktimeService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  async rulesForProjects(projectIds: readonly string[]): Promise<ReadonlyMap<string, readonly WorktimeRuleVersion[]>> {
    return this.rulesForProjectsIn(this.db, projectIds);
  }

  async rulesForProjectsIn(database: Prisma.TransactionClient, projectIds: readonly string[]): Promise<ReadonlyMap<string, readonly WorktimeRuleVersion[]>> {
    return readWorktimeRules(database, projectIds);
  }

  async get(projectId: string): Promise<WorktimeConfiguration> {
    const project = await this.db.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (project === null) throw new NotFoundException({ message: "PROJECT_NOT_FOUND" });
    const rules = await this.rulesForProjects([projectId]);
    return configuration(rules.get(projectId) ?? []);
  }

  async save(projectId: string, actorId: string, input: WorktimeRuleInput): Promise<WorktimeConfiguration> {
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`project-worktime:${projectId}`}, 0))`;
      const project = await tx.project.findUnique({ where: { id: projectId } });
      if (project === null || project.status !== "ACTIVE") throw new NotFoundException({ message: "PROJECT_NOT_ACTIVE" });
      const rows = await tx.projectWorktimeRule.findMany({ where: { projectId }, orderBy: { version: "asc" } });
      const latest = rows.at(-1)?.version ?? 0;
      if (latest !== input.expectedVersion) throw new ConflictException({ message: "WORKTIME_RULE_VERSION_CONFLICT" });
      const created = await tx.projectWorktimeRule.create({ data: {
        projectId, version: latest + 1, startsOn: new Date(input.startsOn), createdByUserId: actorId, ...input.config,
      } });
      await tx.auditLog.create({ data: {
        action: "WORKTIME_RULE_SAVED", actorUserId: actorId, entityId: created.id, entityType: "project_worktime_rule",
        metadata: { startsOn: input.startsOn, version: created.version }, projectId,
      } });
      return configuration([...rows, created].map(versionFromRow));
    });
  }
}
