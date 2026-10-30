import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { AppModule } from "../src/app.module.js";
import { AttendanceService } from "../src/attendance/attendance.service.js";
import { PrismaService } from "../src/infrastructure/database/prisma.service.js";

const projectId: string = "database-test-project";
const companyId: string = "database-test-company";
const workerId: string = "database-test-worker";
const workerMemberId: string = "database-test-worker-member";
const managerMemberId: string = "database-test-manager-member";
const reviewerId: string = "database-test-reviewer";
const workerUserId: string = "database-test-worker-user";

describe.skipIf(process.env.DATABASE_FOUNDATION_TEST_URL === undefined)(
  "database foundation on real PostgreSQL",
  (): void => {
    let app: INestApplication;
    let database: PrismaService;
    let attendance: AttendanceService;

    beforeAll(async (): Promise<void> => {
      const configuredUrl: string | undefined =
        process.env.DATABASE_FOUNDATION_TEST_URL;
      if (
        configuredUrl === undefined ||
        !new URL(configuredUrl).searchParams
          .get("schema")
          ?.startsWith("database_foundation_")
      ) {
        throw new Error(
          "Database tests must run through test:database in an isolated schema.",
        );
      }
      process.env.DATABASE_URL = configuredUrl;
      const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = moduleRef.createNestApplication();
      await app.init();
      database = app.get(PrismaService);
      attendance = app.get(AttendanceService);
      await database.user.createMany({
        data: [
          { id: reviewerId, openid: "database-test-reviewer-openid" },
          { id: workerUserId, openid: "database-test-worker-openid" },
        ],
      });
      await database.workerProfile.update({
        data: { userId: workerUserId },
        where: { id: workerId },
      });
    });

    afterAll(async (): Promise<void> => {
      if (database !== undefined)
        await database.reportExport.deleteMany({
          where: { requestedByUserId: reviewerId },
        });
      if (app !== undefined) await app.close();
    });

    test("upgrades existing people without inventing an earlier membership history", async (): Promise<void> => {
      const history = await database.projectMemberHistory.findMany({
        where: { projectId, event: "BASELINE" },
      });
      expect(history).toHaveLength(2);
      expect(history.every((entry): boolean => entry.version === 1)).toBe(true);
      const manager = await database.projectManagerMember.findUniqueOrThrow({
        where: { id: managerMemberId },
      });
      expect(manager.enteredAt).toEqual(manager.createdAt);
      expect(
        (
          await database.workerProfile.findUniqueOrThrow({
            where: { id: workerId },
          })
        ).workType,
      ).toBe("木工");
      const worker = await database.workerProfile.create({
        data: {
          encryptedName: "No identity document required",
          phone: "test-optional-id",
          workType: "电工",
          realNameStatus: "PENDING",
          faceProfileStatus: "PENDING",
          employmentStatus: "ACTIVE",
        },
      });
      expect(worker.encryptedIdNumber).toBeNull();
      expect(worker.idNumberHash).toBeNull();
    });

    test("records transfers and exits once per real change and keeps membership identity stable", async (): Promise<void> => {
      const team = await database.team.create({
        data: {
          name: "Carpentry",
          projectId,
          workType: "木工",
          status: "ACTIVE",
        },
      });
      await database.projectWorkerMember.update({
        where: { id: workerMemberId },
        data: { teamId: team.id },
      });
      await database.projectWorkerMember.update({
        where: { id: workerMemberId },
        data: { updatedAt: new Date() },
      });
      await database.projectWorkerMember.update({
        where: { id: workerMemberId },
        data: { status: "EXITED", exitedAt: new Date("2026-10-26T00:00:00Z") },
      });
      const history = await database.projectMemberHistory.findMany({
        where: { workerMemberId },
        orderBy: { version: "asc" },
      });
      expect(history.map((entry): number => entry.version)).toEqual([1, 2, 3]);
      expect(history.map((entry): string => entry.status)).toEqual([
        "ACTIVE",
        "ACTIVE",
        "EXITED",
      ]);
      expect(history[0]?.teamId).toBeNull();
      expect(history[1]?.teamId).toBe(team.id);
      await expect(
        database.projectWorkerMember.update({
          where: { id: workerMemberId },
          data: { projectId: "different-project" },
        }),
      ).rejects.toThrow("MEMBERSHIP_IDENTITY_IMMUTABLE");
      await database.team.update({
        where: { id: team.id },
        data: { leaderWorkerMemberId: workerMemberId },
      });
      await expect(
        database.team.update({
          where: { id: team.id },
          data: { leaderManagerMemberId: managerMemberId },
        }),
      ).rejects.toThrow("teams_single_leader_check");
    });

    test("keeps one 0–100 rating per person and project, rejects self-rating, and audits revisions", async (): Promise<void> => {
      const secondProject = await database.project.create({
        data: {
          companyId,
          name: "Second project",
          address: "Test address",
          centerLatitude: "31",
          centerLongitude: "121",
          geofenceRadiusM: 300,
          status: "ACTIVE",
          plannedStartDate: new Date("2026-01-01"),
        },
      });
      const secondMember = await database.projectWorkerMember.create({
        data: {
          projectId: secondProject.id,
          workerId,
          enteredAt: new Date("2026-01-01"),
          projectRoleLabel: "木工",
          status: "ACTIVE",
        },
      });
      const evaluation = await database.projectMemberEvaluation.create({
        data: {
          projectId,
          workerMemberId,
          score: 85,
          comment: "Project evaluation",
          reviewerUserId: reviewerId,
        },
      });
      await database.projectMemberEvaluation.create({
        data: {
          projectId: secondProject.id,
          workerMemberId: secondMember.id,
          score: 95,
          reviewerUserId: reviewerId,
        },
      });
      const average = await database.projectMemberEvaluation.aggregate({
        where: { workerMember: { workerId } },
        _avg: { score: true },
        _count: true,
      });
      expect(average._avg.score).toBe(90);
      expect(average._count).toBe(2);
      await expect(
        database.projectMemberEvaluation.create({
          data: {
            projectId,
            workerMemberId,
            score: 80,
            reviewerUserId: reviewerId,
          },
        }),
      ).rejects.toThrow();
      await expect(
        database.projectMemberEvaluation.update({
          where: { id: evaluation.id },
          data: { score: 101 },
        }),
      ).rejects.toThrow("member_evaluations_score_check");
      await expect(
        database.projectMemberEvaluation.update({
          where: { id: evaluation.id },
          data: { reviewerUserId: workerUserId },
        }),
      ).rejects.toThrow("PROJECT_EVALUATION_SELF_REVIEW_FORBIDDEN");
      await expect(
        database.projectMemberEvaluation.create({
          data: {
            projectId: secondProject.id,
            workerMemberId,
            score: 80,
            reviewerUserId: reviewerId,
          },
        }),
      ).rejects.toThrow();
      await expect(
        database.team.create({
          data: {
            projectId: secondProject.id,
            name: "Invalid leader",
            status: "ACTIVE",
            leaderWorkerMemberId: workerMemberId,
          },
        }),
      ).rejects.toThrow();
      await database.projectMemberEvaluation.update({
        where: { id: evaluation.id },
        data: { score: 90, reviewedAt: new Date() },
      });
      expect(
        await database.auditLog.count({
          where: {
            entityId: evaluation.id,
            action: "project.evaluation.update",
          },
        }),
      ).toBe(1);
    });

    test("preserves old shifts and non-overlapping schedule versions through the existing service", async (): Promise<void> => {
      const oldShift = await attendance.configureDefaultShift(projectId, {
        name: "Original shift",
        segments: [
          {
            sequence: 1,
            startTime: "08:00",
            endTime: "12:00",
            lateGraceMins: 10,
            earlyGraceMins: 0,
          },
          {
            sequence: 2,
            startTime: "13:30",
            endTime: "17:30",
            lateGraceMins: 0,
            earlyGraceMins: 10,
          },
        ],
      });
      const original = await attendance.configureDefaultSchedule(projectId, {
        startsOn: "2000-01-01",
        endsOn: null,
        workdays: [1, 2, 3, 4, 5],
      });
      await attendance.configureDefaultShift(projectId, {
        name: "New shift",
        segments: [
          {
            sequence: 1,
            startTime: "09:00",
            endTime: "12:00",
            lateGraceMins: 10,
            earlyGraceMins: 0,
          },
          {
            sequence: 2,
            startTime: "13:30",
            endTime: "18:30",
            lateGraceMins: 0,
            earlyGraceMins: 10,
          },
        ],
      });
      const future = await attendance.configureDefaultSchedule(projectId, {
        startsOn: "2099-01-01",
        endsOn: null,
        workdays: [1, 2, 3, 4, 5],
      });
      const schedules = await database.schedule.findMany({
        where: { ownerId: projectId, ownerType: "PROJECT" },
        include: { shift: { include: { segments: true } } },
        orderBy: { startsOn: "asc" },
      });
      expect(schedules).toHaveLength(2);
      expect(schedules[0]?.id).toBe(original.id);
      expect(schedules[0]?.endsOn?.toISOString().slice(0, 10)).toBe(
        "2098-12-31",
      );
      expect(schedules[0]?.shiftId).toBe(oldShift.id);
      expect(
        schedules[0]?.shift.segments.find(
          (segment): boolean => segment.sequence === 1,
        )?.startTime,
      ).toBe("08:00");
      expect(
        (
          await attendance.configureDefaultSchedule(projectId, {
            startsOn: "2099-01-01",
            endsOn: null,
            workdays: [1, 2, 3, 4, 5],
          })
        ).id,
      ).toBe(future.id);
      await expect(
        attendance.configureDefaultSchedule(projectId, {
          startsOn: "2000-01-01",
          endsOn: null,
          workdays: [1],
        }),
      ).rejects.toThrow();
      await expect(
        database.schedule.create({
          data: {
            shiftId: oldShift.id,
            ownerType: "PROJECT",
            ownerId: projectId,
            startsOn: new Date("2098-01-01"),
            endsOn: null,
          },
        }),
      ).rejects.toThrow("schedules_owner_validity_excl");
      expect(
        await database.schedule.count({ where: { ownerId: projectId } }),
      ).toBe(2);
    });

    test("rejects outside-geofence submissions before writing attendance or consuming proof", async (): Promise<void> => {
      const fencedProjectId: string = "database-geofence-project";
      await database.project.create({
        data: {
          id: fencedProjectId,
          companyId,
          name: "Geofence test",
          address: "Test site",
          centerLatitude: "31",
          centerLongitude: "121",
          geofenceRadiusM: 300,
          status: "ACTIVE",
          plannedStartDate: new Date("2026-01-01"),
        },
      });
      await database.projectWorkerMember.create({
        data: {
          workerId,
          projectId: fencedProjectId,
          projectRoleLabel: "木工",
          status: "ACTIVE",
          enteredAt: new Date("2026-01-01"),
          requiresAttendance: true,
        },
      });
      await attendance.configureDefaultShift(fencedProjectId, {
        name: "Geofence test shift",
        segments: [
          {
            sequence: 1,
            startTime: "08:00",
            endTime: "12:00",
            lateGraceMins: 0,
            earlyGraceMins: 0,
          },
          {
            sequence: 2,
            startTime: "13:30",
            endTime: "17:30",
            lateGraceMins: 0,
            earlyGraceMins: 0,
          },
        ],
      });
      const occurredAt: Date = new Date();
      const attendanceDate: string = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(occurredAt);
      const consumedBefore: number =
        await database.faceVerificationSession.count({
          where: { status: "CONSUMED" },
        });
      await expect(
        attendance.submitAttendanceRecord(fencedProjectId, workerUserId, {
          attendanceDate,
          occurredAt: occurredAt.toISOString(),
          pointCode: "SEGMENT_1_START",
          latitude: "32",
          longitude: "121",
          locationAccuracyM: "10",
          sitePhotoHash: "test-photo",
          sitePhotoObjectKey: "test/site.jpg",
        }),
      ).rejects.toThrow("OUTSIDE_GEOFENCE");
      expect(
        await database.attendanceRecord.count({
          where: { projectId: fencedProjectId },
        }),
      ).toBe(0);
      expect(
        await database.attendanceResult.count({
          where: { projectId: fencedProjectId },
        }),
      ).toBe(0);
      expect(
        await database.faceVerificationSession.count({
          where: { status: "CONSUMED" },
        }),
      ).toBe(consumedBefore);
    });

    test("links each attendance proof once and rejects a proof from another point", async (): Promise<void> => {
      const profile = await database.faceProfile.create({
        data: {
          ownerType: "WORKER",
          ownerId: workerId,
          baselineObjectKey: "test/baseline.jpg",
          baselineImageHash: "test-hash",
          status: "APPROVED",
        },
      });
      const session = await database.faceVerificationSession.create({
        data: {
          userId: workerUserId,
          projectId,
          participantType: "WORKER",
          participantId: workerId,
          pointCode: "SEGMENT_1_START",
          attendanceDate: new Date("2026-10-26"),
          faceProfileId: profile.id,
          faceProfileVersion: 1,
          provider: "VIDEO_ACTION",
          status: "CONSUMED",
          consumedAt: new Date(),
          expiresAt: new Date("2099-01-01"),
        },
      });
      const record = await database.attendanceRecord.create({
        data: {
          projectId,
          participantType: "WORKER",
          participantId: workerId,
          attendanceDate: new Date("2026-10-26"),
          pointCode: "SEGMENT_1_START",
          source: "DEVICE",
          status: "VALID",
          occurredAt: new Date(),
          latitude: "31",
          longitude: "121",
          selfieObjectKey: "test/selfie.jpg",
          sitePhotoObjectKey: "test/site.jpg",
          selfieHash: "test-selfie",
          sitePhotoHash: "test-site",
          facePassed: true,
          faceVerificationSessionId: session.id,
        },
      });
      const { id: recordId, ...recordData } = record;
      expect(recordId).toBeTruthy();
      await expect(
        database.attendanceRecord.create({ data: recordData }),
      ).rejects.toThrow();
      await expect(
        database.attendanceRecord.create({
          data: { ...recordData, pointCode: "SEGMENT_1_END" },
        }),
      ).rejects.toThrow("ATTENDANCE_FACE_PROOF_CONTEXT_MISMATCH");
    });

    test("enforces monthly export scope, nullable scope uniqueness, and completed-file metadata", async (): Promise<void> => {
      const month: Date = new Date("2026-10-01");
      const dataCutoffAt: Date = new Date("2026-10-26");
      const exportData = {
        companyId,
        projectId,
        scope: "PROJECT" as const,
        month,
        calculationVersion: "integration-v1",
        dataCutoffAt,
        requestedByUserId: reviewerId,
      };
      const pending = await database.reportExport.create({ data: exportData });
      await expect(
        database.reportExport.create({ data: exportData }),
      ).rejects.toThrow();
      await expect(
        database.reportExport.create({
          data: { ...exportData, month: new Date("2026-10-02") },
        }),
      ).rejects.toThrow("report_exports_month_check");
      await expect(
        database.reportExport.update({
          where: { id: pending.id },
          data: { status: "COMPLETED", completedAt: new Date() },
        }),
      ).rejects.toThrow("report_exports_completion_check");
      const file = await database.storedFile.create({
        data: {
          objectKey: "test/month.xlsx",
          uploaderUserId: reviewerId,
          contentType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          sizeBytes: 100,
          hash: "a".repeat(64),
        },
      });
      await database.reportExport.update({
        where: { id: pending.id },
        data: { status: "COMPLETED", fileId: file.id, completedAt: new Date() },
      });
      await database.reportExport.create({
        data: { ...exportData, version: 2 },
      });
      const companyExportData = {
        ...exportData,
        scope: "COMPANY" as const,
        projectId: null,
      };
      await database.reportExport.create({ data: companyExportData });
      await expect(
        database.reportExport.create({ data: companyExportData }),
      ).rejects.toThrow();
      expect(
        await database.reportExport.count({
          where: { requestedByUserId: reviewerId },
        }),
      ).toBe(3);
    });
  },
);
