import { createHash } from "node:crypto";

import { PrismaClient, type RoleCode, type UserRoleScopeType } from "@prisma/client";

const prisma = new PrismaClient();

const GLOBAL_SCOPE_ID = "GLOBAL";
const DEV_BIND_CODE = "DEV-BIND-CODE";

const hash = (value: string): string => createHash("sha256").update(value).digest("hex");

type DemoManager = {
  readonly openid: string;
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
      create: { name: manager.name, phone: `138${manager.openid}`, status: "ACTIVE", userId },
      update: { name: manager.name, userId },
      where: { userId }
    });
    await upsertUserRole(userId, manager.roleCode, manager.scopeType, scopeIdFor(manager.scopeType));
  }

  const workerUserId = await upsertUser("dev-worker", true);
  await prisma.workerProfile.upsert({
    create: {
      employmentStatus: "ACTIVE",
      encryptedIdNumber: "dev-encrypted-id",
      encryptedName: "dev-encrypted-name",
      faceProfileStatus: "PENDING",
      idNumberHash: hash("dev-worker-id"),
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
  const unboundWorker = await prisma.workerProfile.upsert({
    create: {
      employmentStatus: "ACTIVE",
      encryptedIdNumber: "dev-encrypted-id-2",
      encryptedName: "dev-encrypted-name-2",
      faceProfileStatus: "PENDING",
      idNumberHash: hash("dev-unbound-worker-id"),
      phone: "13800000002",
      realNameStatus: "PENDING",
      workType: "木工"
    },
    update: {},
    where: { idNumberHash: hash("dev-unbound-worker-id") }
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

  console.log(JSON.stringify({ devBindCode: DEV_BIND_CODE, message: "dev seed complete" }));
};

try {
  await main();
} finally {
  await prisma.$disconnect();
}
