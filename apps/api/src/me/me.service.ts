import { Inject, Injectable } from "@nestjs/common";

import type { AttendanceRecordResponse } from "../attendance/attendance.types.js";
import { createAttendanceRecordResponse } from "../attendance/attendance.service.js";
import type { MakeupRequestResponse } from "../makeup/makeup.types.js";
import { createMakeupRequestResponse } from "../makeup/makeup.service.js";
import { PrismaService } from "../infrastructure/database/prisma.service.js";

import type { MyProjectMembership } from "./me.types.js";

@Injectable()
export class MeService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listMyAttendanceRecords(userId: string, from: string, to: string): Promise<readonly AttendanceRecordResponse[]> {
    const user = await this.prisma.user.findUnique({
      include: { managerProfile: true, workerProfile: true },
      where: { id: userId }
    });
    if (user === null) return [];
    const dateOnlyToDate = (s: string): Date => {
      const parts = s.split("-").map(Number);
      const y = parts[0] ?? NaN;
      const m = parts[1] ?? NaN;
      const d = parts[2] ?? NaN;
      return new Date(Date.UTC(y, m - 1, d));
    };
    const fromDate = dateOnlyToDate(from);
    const toDate = dateOnlyToDate(to);
    const orList: Array<{ participantType: "WORKER" | "MANAGER"; participantId: string }> = [];
    if (user.workerProfile !== null) orList.push({ participantType: "WORKER", participantId: user.workerProfile.id });
    if (user.managerProfile !== null) orList.push({ participantType: "MANAGER", participantId: user.managerProfile.id });
    if (orList.length === 0) return [];
    const records = await this.prisma.attendanceRecord.findMany({
      orderBy: [{ attendanceDate: "desc" }, { occurredAt: "desc" }],
      where: { attendanceDate: { gte: fromDate, lte: toDate }, OR: orList }
    });
    return records.map(createAttendanceRecordResponse);
  }

  async listMyMakeups(userId: string): Promise<readonly MakeupRequestResponse[]> {
    const requests = await this.prisma.makeupRequest.findMany({
      orderBy: { createdAt: "desc" },
      where: { requesterUserId: userId }
    });
    return requests.map(createMakeupRequestResponse);
  }

  async listMyProjects(userId: string): Promise<readonly MyProjectMembership[]> {
    const user = await this.prisma.user.findUnique({
      include: { managerProfile: true, workerProfile: true },
      where: { id: userId }
    });
    if (user === null) return [];
    const out: MyProjectMembership[] = [];
    if (user.workerProfile !== null) {
      const memberships = await this.prisma.projectWorkerMember.findMany({
        include: { project: true, team: true },
        orderBy: { createdAt: "asc" },
        where: { status: "ACTIVE", workerId: user.workerProfile.id }
      });
      for (const m of memberships) {
        out.push({
          projectId: m.projectId,
          projectName: m.project.name,
          projectRoleLabel: m.projectRoleLabel,
          teamId: m.teamId,
          teamName: m.team?.name ?? null
        });
      }
    }
    if (user.managerProfile !== null) {
      const memberships = await this.prisma.projectManagerMember.findMany({
        include: { project: true, teamScope: true },
        orderBy: { createdAt: "asc" },
        where: { status: "ACTIVE", managerId: user.managerProfile.id }
      });
      for (const m of memberships) {
        out.push({
          projectId: m.projectId,
          projectName: m.project.name,
          projectRoleLabel: m.roleCode,
          teamId: m.teamScopeId,
          teamName: m.teamScope?.name ?? null
        });
      }
    }
    return out;
  }
}
