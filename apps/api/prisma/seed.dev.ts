import { createHash, randomBytes } from "node:crypto";

import { PrismaClient, type RoleCode, type UserRoleScopeType } from "@prisma/client";

import { encryptPersonnelName, personnelNameSearchHashes } from "../src/management/personnel-name.js";
import { TEST_ACCOUNTS, type TestAccountCode } from "../src/auth/test-accounts.js";

const nameData = (name: string): { readonly encryptedName: string; readonly nameSearchHashes: string[] } => {
  const key: string | undefined = process.env.PERSONNEL_ENCRYPTION_KEY;
  if (key === undefined) throw new Error("PERSONNEL_ENCRYPTION_KEY is required for development seed identities.");
  return { encryptedName: encryptPersonnelName(name, key, randomBytes(12)), nameSearchHashes: [...personnelNameSearchHashes(name, key)] };
};

const prisma = new PrismaClient();

const GLOBAL_SCOPE_ID = "GLOBAL";
const DEV_BIND_CODE = "DEV-BIND-CODE";

const hash = (value: string): string => createHash("sha256").update(value).digest("hex");

type DemoManager = {
  readonly openid: TestAccountCode;
  readonly name: string;
  readonly roleCode: RoleCode;
  readonly scopeType: UserRoleScopeType;
};

const upsertUser = async (openid: string, isBound: boolean): Promise<string> => {
  const user = await prisma.user.upsert({
    create: { isBound, openid, status: "ACTIVE" },
    update: { isBound, status: "ACTIVE" },
    where: { openid }
  });
  return user.id;
};

const upsertUserRole = async (
  userId: string,
  roleCode: RoleCode,
  scopeType: UserRoleScopeType,
  scopeId: string
): Promise<void> => {
  const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } });
  await prisma.userRole.upsert({
    create: { roleId: role.id, scopeId, scopeType, userId },
    update: {},
    where: {
      userId_roleId_scopeType_scopeId: { roleId: role.id, scopeId, scopeType, userId }
    }
  });
};

const main = async (): Promise<void> => {
  const company = await prisma.company.upsert({
    create: { id: "dev-company", name: "示例建筑公司", status: "ACTIVE" },
    update: { name: "示例建筑公司", status: "ACTIVE" },
    where: { id: "dev-company" }
  });
  const project = await prisma.project.upsert({
    create: {
      address: "示例市示例区示例路 1 号",
      centerLatitude: "31.2304000",
      centerLongitude: "121.4737000",
      companyId: company.id,
      geofenceRadiusM: 300,
      id: "dev-project",
      name: "示例工地一号",
      plannedStartDate: new Date("2026-01-01T00:00:00.000Z"),
      status: "ACTIVE"
    },
    update: { companyId: company.id, name: "示例工地一号", status: "ACTIVE" },
    where: { id: "dev-project" }
  });
  const team = await prisma.team.upsert({
    create: { id: "dev-team", name: "一号班组", projectId: project.id, status: "ACTIVE" },
    update: { name: "一号班组", projectId: project.id, status: "ACTIVE" },
    where: { id: "dev-team" }
  });

  // Default shift + default project schedule. Required by:
  //   - attendance submission (punch-in points)
  //   - makeup-request creation (`DEFAULT_SHIFT_NOT_CONFIGURED_FOR_MAKEUP`).
  const shift = await prisma.shift.upsert({
    create: { id: "dev-shift", isDefault: true, name: "标准两段班", projectId: project.id },
    update: { isDefault: true, name: "标准两段班", projectId: project.id },
    where: { id: "dev-shift" }
  });
  const shiftSegments: ReadonlyArray<{ sequence: number; startTime: string; endTime: string }> = [
    { endTime: "12:00", sequence: 1, startTime: "08:00" },
    { endTime: "17:30", sequence: 2, startTime: "13:30" }
  ];
  for (const segment of shiftSegments) {
    await prisma.shiftSegment.upsert({
      create: { earlyGraceMins: 10, endTime: segment.endTime, lateGraceMins: 10, sequence: segment.sequence, shiftId: shift.id, startTime: segment.startTime },
      update: { earlyGraceMins: 10, endTime: segment.endTime, lateGraceMins: 10, startTime: segment.startTime },
      where: { shiftId_sequence: { sequence: segment.sequence, shiftId: shift.id } }
    });
  }
  const mondayToSaturdayMask = 1 + 2 + 4 + 8 + 16 + 32; // ISO weekdays 1..6
  const existingProjectSchedule = await prisma.schedule.findFirst({
    where: { ownerId: project.id, ownerType: "PROJECT" }
  });
  if (existingProjectSchedule === null) {
    await prisma.schedule.create({
      data: {
        endsOn: null,
        ownerId: project.id,
        ownerType: "PROJECT",
        shiftId: shift.id,
        startsOn: new Date("2026-01-01T00:00:00.000Z"),
        workdayMask: mondayToSaturdayMask
      }
    });
  } else {
    await prisma.schedule.update({
      data: { endsOn: null, shiftId: shift.id, startsOn: new Date("2026-01-01T00:00:00.000Z"), workdayMask: mondayToSaturdayMask },
      where: { id: existingProjectSchedule.id }
    });
  }

  const managers: readonly DemoManager[] = [
    { name: "系统管理员", openid: "dev-system", roleCode: "SYSTEM_ADMIN", scopeType: "GLOBAL" },
    { name: "公司管理员", openid: "dev-company", roleCode: "COMPANY_ADMIN", scopeType: "COMPANY" },
    { name: "项目管理员", openid: "dev-project", roleCode: "PROJECT_ADMIN", scopeType: "PROJECT" },
    { name: "班组长", openid: "dev-team", roleCode: "TEAM_LEADER", scopeType: "TEAM" }
  ];
  const scopeIdFor = (scopeType: UserRoleScopeType): string =>
    scopeType === "GLOBAL"
      ? GLOBAL_SCOPE_ID
      : scopeType === "COMPANY"
        ? company.id
        : scopeType === "PROJECT"
          ? project.id
          : team.id;

  for (const manager of managers) {
    const userId = await upsertUser(manager.openid, true);
    await prisma.managerProfile.upsert({
      create: { name: manager.name, phone: TEST_ACCOUNTS[manager.openid].phone, status: "ACTIVE", userId },
      update: { name: manager.name, userId },
      where: { userId }
    });
    await upsertUserRole(userId, manager.roleCode, manager.scopeType, scopeIdFor(manager.scopeType));
  }

  const workerUserId = await upsertUser("dev-worker", true);
  await prisma.workerProfile.upsert({
    create: {
      employmentStatus: "ACTIVE",
      ...nameData("测试工人"),
      faceProfileStatus: "PENDING",
      phone: "13800000001",
      realNameStatus: "PENDING",
      userId: workerUserId,
      workType: "钢筋工"
    },
    update: { userId: workerUserId },
    where: { userId: workerUserId }
  });
  await upsertUserRole(workerUserId, "WORKER", "PROJECT", project.id);

  // Project memberships so PROJECT_ADMIN read views have real data.
  const workerProfileForMembership = await prisma.workerProfile.findUniqueOrThrow({ where: { userId: workerUserId } });
  await prisma.projectWorkerMember.upsert({
    create: {
      enteredAt: new Date("2026-05-01T00:00:00.000Z"),
      projectId: project.id,
      projectRoleLabel: "钢筋工",
      requiresAttendance: true,
      status: "ACTIVE",
      teamId: team.id,
      workerId: workerProfileForMembership.id
    },
    update: { status: "ACTIVE", requiresAttendance: true, teamId: team.id },
    where: { projectId_workerId: { projectId: project.id, workerId: workerProfileForMembership.id } }
  });

  const teamLeaderUserId = await upsertUser("dev-team", true);
  const teamLeaderProfile = await prisma.managerProfile.findUniqueOrThrow({ where: { userId: teamLeaderUserId } });
  await prisma.projectManagerMember.upsert({
    create: {
      managerId: teamLeaderProfile.id,
      projectId: project.id,
      requiresAttendance: true,
      roleCode: "TEAM_LEADER",
      status: "ACTIVE",
      teamScopeId: team.id
    },
    update: { status: "ACTIVE", requiresAttendance: true, teamScopeId: team.id, roleCode: "TEAM_LEADER" },
    where: { projectId_managerId: { managerId: teamLeaderProfile.id, projectId: project.id } }
  });

  const projectAdminUserId = await upsertUser("dev-project", true);
  const projectAdminProfile = await prisma.managerProfile.findUniqueOrThrow({ where: { userId: projectAdminUserId } });
  await prisma.projectManagerMember.upsert({
    create: {
      managerId: projectAdminProfile.id,
      projectId: project.id,
      requiresAttendance: false,
      roleCode: "PROJECT_ADMIN",
      status: "ACTIVE",
      teamScopeId: null
    },
    update: { status: "ACTIVE", roleCode: "PROJECT_ADMIN", teamScopeId: null, requiresAttendance: false },
    where: { projectId_managerId: { managerId: projectAdminProfile.id, projectId: project.id } }
  });

  // Sample daily attendance results for the past 3 days so the report screens have data.
  const today = new Date();
  const toDateOnly = (d: Date): Date => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const minus = (n: number): Date => {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - n);
    return toDateOnly(d);
  };
  const seededResults = [
    { attendanceDate: minus(0), isAbsent: false, isEarlyLeave: false, isLate: false, isMissingPunch: false, workedMinutes: 480 },
    { attendanceDate: minus(1), isAbsent: false, isEarlyLeave: false, isLate: true, isMissingPunch: false, workedMinutes: 450 },
    { attendanceDate: minus(2), isAbsent: true, isEarlyLeave: false, isLate: false, isMissingPunch: false, workedMinutes: 0 }
  ];
  for (const r of seededResults) {
    await prisma.attendanceResult.upsert({
      create: {
        ...r,
        abnormalRecordCount: r.isAbsent || r.isLate ? 1 : 0,
        approvedMakeupCount: 0,
        participantId: workerProfileForMembership.id,
        participantType: "WORKER",
        projectId: project.id
      },
      update: { ...r, abnormalRecordCount: r.isAbsent || r.isLate ? 1 : 0, approvedMakeupCount: 0 },
      where: {
        projectId_attendanceDate_participantType_participantId: {
          attendanceDate: r.attendanceDate,
          participantId: workerProfileForMembership.id,
          participantType: "WORKER",
          projectId: project.id
        }
      }
    });
  }

  const creatorUserId = await upsertUser("dev-project", true);
  await upsertUser("dev-unbound", false);
  const existingUnboundWorker = await prisma.workerProfile.findFirst({ where: { phone: "13800000002" } });
  const unboundWorker = await prisma.workerProfile.upsert({
    create: {
      id: "dev-unbound-worker-profile",
      employmentStatus: "ACTIVE",
      ...nameData("待绑定测试工人"),
      faceProfileStatus: "PENDING",
      phone: "13800000002",
      realNameStatus: "PENDING",
      workType: "木工"
    },
    update: {},
    where: { id: existingUnboundWorker?.id ?? "dev-unbound-worker-profile" }
  });
  // Make the unbound worker a project member so the invitation page can demo
  // generating an invitation against an existing, not-yet-bound participant.
  await prisma.projectWorkerMember.upsert({
    create: {
      enteredAt: new Date("2026-05-01T00:00:00.000Z"),
      projectId: project.id,
      projectRoleLabel: "木工",
      requiresAttendance: true,
      status: "ACTIVE",
      teamId: team.id,
      workerId: unboundWorker.id
    },
    update: { status: "ACTIVE", requiresAttendance: true, teamId: team.id },
    where: { projectId_workerId: { projectId: project.id, workerId: unboundWorker.id } }
  });
  await prisma.bindingInvitation.upsert({
    create: {
      codeHash: hash(DEV_BIND_CODE),
      createdByUserId: creatorUserId,
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      status: "PENDING",
      targetType: "WORKER",
      workerProfileId: unboundWorker.id
    },
    update: {
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      status: "PENDING",
      workerProfileId: unboundWorker.id
    },
    where: { codeHash: hash(DEV_BIND_CODE) }
  });

  // One PENDING makeup so the team-leader page has something to act on.
  const yesterday = new Date(today);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayDateOnly = new Date(Date.UTC(yesterday.getUTCFullYear(), yesterday.getUTCMonth(), yesterday.getUTCDate()));
  const existingPending = await prisma.makeupRequest.findFirst({
    where: {
      attendanceDate: yesterdayDateOnly,
      participantId: workerProfileForMembership.id,
      participantType: "WORKER",
      pointCode: "SEGMENT_1_START",
      projectId: project.id,
      status: "PENDING"
    }
  });
  if (existingPending === null) {
    await prisma.makeupRequest.create({
      data: {
        attendanceDate: yesterdayDateOnly,
        participantId: workerProfileForMembership.id,
        participantType: "WORKER",
        pointCode: "SEGMENT_1_START",
        projectId: project.id,
        reason: "忘记打卡了",
        requestedOccurredAt: new Date(Date.UTC(yesterday.getUTCFullYear(), yesterday.getUTCMonth(), yesterday.getUTCDate(), 1, 0, 0)),
        requesterUserId: workerUserId,
        status: "PENDING"
      }
    });
  }

  // ---- Demo extras: extra workers + a second team + a second project ----
  // Idempotent. Adds enough breadth so test screens are not visibly empty
  // and so cross-team / cross-project filtering is observable.

  const upsertWorker = async (
    openid: string,
    name: string,
    phone: string,
    workType: string,
    projectId: string,
    teamId: string,
    projectRoleLabel: string
  ): Promise<void> => {
    const userId = await upsertUser(openid, true);
    await upsertUserRole(userId, "WORKER", "PROJECT", projectId);
    const profile = await prisma.workerProfile.upsert({
      create: {
        employmentStatus: "ACTIVE",
        ...nameData(name),
        faceProfileStatus: "PENDING",
        phone,
        realNameStatus: "PENDING",
        userId,
        workType
      },
      update: { phone, userId, workType },
      where: { userId }
    });
    await prisma.projectWorkerMember.upsert({
      create: {
        enteredAt: new Date("2026-05-01T00:00:00.000Z"),
        projectId,
        projectRoleLabel,
        requiresAttendance: true,
        status: "ACTIVE",
        teamId,
        workerId: profile.id
      },
      update: { projectRoleLabel, requiresAttendance: true, status: "ACTIVE", teamId },
      where: { projectId_workerId: { projectId, workerId: profile.id } }
    });
  };

  const upsertManager = async (
    openid: string,
    name: string,
    phone: string,
    roleCode: RoleCode,
    scopeType: UserRoleScopeType,
    scopeId: string,
    projectId: string,
    teamScopeId: string | null
  ): Promise<void> => {
    const userId = await upsertUser(openid, true);
    await prisma.managerProfile.upsert({
      create: { name, phone, status: "ACTIVE", userId },
      update: { name, phone, status: "ACTIVE", userId },
      where: { userId }
    });
    await upsertUserRole(userId, roleCode, scopeType, scopeId);
    const profile = await prisma.managerProfile.findUniqueOrThrow({ where: { userId } });
    await prisma.projectManagerMember.upsert({
      create: {
        managerId: profile.id,
        projectId,
        requiresAttendance: teamScopeId !== null,
        roleCode,
        status: "ACTIVE",
        teamScopeId
      },
      update: { requiresAttendance: teamScopeId !== null, roleCode, status: "ACTIVE", teamScopeId },
      where: { projectId_managerId: { managerId: profile.id, projectId } }
    });
  };

  // dev-project: 3 more workers in 一号班组
  await upsertWorker("dev-worker-2", "李二", "13800000003", "钢筋工", project.id, team.id, "钢筋工");
  await upsertWorker("dev-worker-3", "王三", "13800000004", "焊工", project.id, team.id, "焊工");
  await upsertWorker("dev-worker-4", "赵四", "13800000005", "钢筋工", project.id, team.id, "钢筋工");

  // dev-project: 二号班组 + 班组长 + 1 工人
  const team2 = await prisma.team.upsert({
    create: { id: "dev-team-2", name: "二号班组", projectId: project.id, status: "ACTIVE" },
    update: { name: "二号班组", projectId: project.id, status: "ACTIVE" },
    where: { id: "dev-team-2" }
  });
  await upsertManager("dev-leader-2", "二号班组长", "13800000006", "TEAM_LEADER", "TEAM", team2.id, project.id, team2.id);
  await upsertWorker("dev-worker-5", "孙五", "13800000007", "木工", project.id, team2.id, "木工");

  // 第二个项目(同公司) + 项目管理员 + 一个班组 + 班组长 + 一个工人
  const project2 = await prisma.project.upsert({
    create: {
      address: "示例市示例区示例路 88 号",
      centerLatitude: "31.2350000",
      centerLongitude: "121.4800000",
      companyId: company.id,
      geofenceRadiusM: 250,
      id: "dev-project-2",
      name: "示例工地二号",
      plannedStartDate: new Date("2026-02-01T00:00:00.000Z"),
      status: "ACTIVE"
    },
    update: { companyId: company.id, name: "示例工地二号", status: "ACTIVE" },
    where: { id: "dev-project-2" }
  });
  // Default shift + schedule for project 2 (so makeup/punch work here too).
  const shift2 = await prisma.shift.upsert({
    create: { id: "dev-shift-2", isDefault: true, name: "标准两段班", projectId: project2.id },
    update: { isDefault: true, name: "标准两段班", projectId: project2.id },
    where: { id: "dev-shift-2" }
  });
  for (const segment of shiftSegments) {
    await prisma.shiftSegment.upsert({
      create: { earlyGraceMins: 10, endTime: segment.endTime, lateGraceMins: 10, sequence: segment.sequence, shiftId: shift2.id, startTime: segment.startTime },
      update: { earlyGraceMins: 10, endTime: segment.endTime, lateGraceMins: 10, startTime: segment.startTime },
      where: { shiftId_sequence: { sequence: segment.sequence, shiftId: shift2.id } }
    });
  }
  const existingProject2Schedule = await prisma.schedule.findFirst({
    where: { ownerId: project2.id, ownerType: "PROJECT" }
  });
  if (existingProject2Schedule === null) {
    await prisma.schedule.create({
      data: {
        endsOn: null,
        ownerId: project2.id,
        ownerType: "PROJECT",
        shiftId: shift2.id,
        startsOn: new Date("2026-02-01T00:00:00.000Z"),
        workdayMask: mondayToSaturdayMask
      }
    });
  }
  const teamP2 = await prisma.team.upsert({
    create: { id: "dev-team-p2", name: "二号工地·一号班组", projectId: project2.id, status: "ACTIVE" },
    update: { name: "二号工地·一号班组", projectId: project2.id, status: "ACTIVE" },
    where: { id: "dev-team-p2" }
  });
  await upsertManager("dev-project-2-admin", "项目二管理员", "13800000008", "PROJECT_ADMIN", "PROJECT", project2.id, project2.id, null);
  await upsertManager("dev-leader-p2", "项目二班组长", "13800000009", "TEAM_LEADER", "TEAM", teamP2.id, project2.id, teamP2.id);
  await upsertWorker("dev-worker-p2", "周六", "13800000010", "钢筋工", project2.id, teamP2.id, "钢筋工");

  console.log(JSON.stringify({ devBindCode: DEV_BIND_CODE, message: "dev seed complete" }));
};

try {
  await main();
} finally {
  await prisma.$disconnect();
}
