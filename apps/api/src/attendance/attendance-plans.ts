import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import type {
  AttendancePlan,
  Prisma,
  ProjectMemberHistory,
  Schedule,
  Shift,
  ShiftSegment,
} from "@prisma/client";
import { z } from "zod";
import {
  defaultAttendancePoints,
  legacyAttendancePoints,
  validateAttendancePoints,
  type ScheduledAttendancePoint,
} from "@construction/domain/attendance.js";
import {
  ROLE_LEVEL,
  scopeIncludesTarget,
  type RoleCode,
  type AuthorizationTargetScope,
} from "@construction/domain/roles.js";
import type { AuthorizationData } from "../authorization/authorization.types.js";

export type PlanScopeType = "PROJECT" | "TEAM" | "MEMBER";
export type PlanPerson = {
  readonly memberId: string;
  readonly participantId: string;
  readonly teamId: string | null;
  readonly roleLevel: number;
  readonly userId: string | null;
};
export type EffectivePlan = {
  readonly name: string;
  readonly points: readonly ScheduledAttendancePoint[];
  readonly isWorkday: boolean;
};
type LegacyShift = Shift & { readonly segments: readonly ShiftSegment[] };
type LegacySchedule = Schedule & { readonly shift: LegacyShift };
export type PlanningData = {
  readonly rules: readonly (AttendancePlan & {
    readonly author: {
      readonly workerProfile: { readonly id: string } | null;
      readonly managerProfile: { readonly id: string } | null;
    } | null;
  })[];
  readonly schedules: readonly LegacySchedule[];
  readonly shifts: readonly LegacyShift[];
  readonly histories: readonly ProjectMemberHistory[];
};
const pointSchema = z
  .object({
    code: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    label: z.string().trim().min(1).max(30),
    kind: z.enum(["START", "END", "CHECKPOINT"]),
    time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
    graceMins: z.number().int().min(0).max(120),
  })
  .strict();
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  });
export const planBodySchema = z
  .object({
    expectedId: z.string().nullable(),
    name: z.string().trim().min(1).max(60),
    startsOn: dateSchema,
    endsOn: dateSchema.nullable(),
    workdays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
    points: z.array(pointSchema).min(2).max(1440),
  })
  .strict();
export type PlanBody = z.infer<typeof planBodySchema>;
export const chinaDate = (date: Date): string =>
  new Date(date.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
export const tomorrowChina = (): string =>
  chinaDate(new Date(Date.now() + 86400_000));
export const parsePlanBody = (body: unknown): PlanBody => {
  const result = planBodySchema.safeParse(body);
  if (!result.success)
    throw new BadRequestException({
      message: "INVALID_ATTENDANCE_PLAN",
      issues: result.error.issues,
    });
  try {
    validateAttendancePoints(result.data.points);
  } catch (error: unknown) {
    throw new BadRequestException({
      message:
        error instanceof Error ? error.message : "INVALID_ATTENDANCE_POINTS",
    });
  }
  if (result.data.startsOn < tomorrowChina())
    throw new BadRequestException({
      message: "排班调整最早次日生效，不能改写今天或历史规则。",
    });
  if (result.data.endsOn !== null && result.data.endsOn < result.data.startsOn)
    throw new BadRequestException({ message: "截止日不能早于生效日。" });
  if (new Set(result.data.workdays).size !== result.data.workdays.length)
    throw new BadRequestException({ message: "工作日不能重复。" });
  return result.data;
};
export const parseStoredPoints = (
  value: Prisma.JsonValue,
): readonly ScheduledAttendancePoint[] => {
  const points = z.array(pointSchema).parse(value);
  validateAttendancePoints(points);
  return points;
};
export const loadPlanningData = async (
  prisma: Prisma.TransactionClient,
  projectIds: readonly string[],
): Promise<PlanningData> => {
  const [rules, schedules, shifts, histories] = await Promise.all([
    prisma.attendancePlan.findMany({
      include: {
        author: {
          select: {
            workerProfile: { select: { id: true } },
            managerProfile: { select: { id: true } },
          },
        },
      },
      where: { projectId: { in: [...projectIds] } },
      orderBy: [{ startsOn: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    }),
    prisma.schedule.findMany({
      where: { ownerType: "PROJECT", ownerId: { in: [...projectIds] } },
      include: { shift: { include: { segments: true } } },
      orderBy: { startsOn: "desc" },
    }),
    prisma.shift.findMany({
      where: { projectId: { in: [...projectIds] }, isDefault: true },
      include: { segments: true },
    }),
    prisma.projectMemberHistory.findMany({
      where: { projectId: { in: [...projectIds] } },
      orderBy: [{ recordedAt: "desc" }, { version: "desc" }],
    }),
  ]);
  return { rules, schedules, shifts, histories };
};

export const historicalPlanPerson = (
  data: PlanningData,
  person: PlanPerson,
  date: string,
): PlanPerson => {
  const histories = data.histories.filter(
    (row) =>
      row.workerMemberId === person.memberId ||
      row.managerMemberId === person.memberId,
  );
  const history =
    histories.find(
      (row) =>
        (row.workerMemberId === person.memberId ||
          row.managerMemberId === person.memberId) &&
        chinaDate(row.recordedAt) <= date,
    ) ?? histories.at(-1);
  return history === undefined
    ? person
    : {
        ...person,
        teamId: history.teamId,
        roleLevel:
          history.roleCode === null
            ? person.roleLevel
            : ROLE_LEVEL[history.roleCode],
      };
};
export const resolveAttendancePlan = (
  data: PlanningData,
  projectId: string,
  participant: PlanPerson,
  date: string,
): EffectivePlan => {
  const person = historicalPlanPerson(data, participant, date);
  const weekday: number = new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
  const scopes: readonly {
    readonly type: PlanScopeType;
    readonly id: string | null;
  }[] = [
    { type: "MEMBER", id: person.memberId },
    { type: "TEAM", id: person.teamId },
    { type: "PROJECT", id: projectId },
  ];
  for (const scope of scopes) {
    const rule = data.rules.find(
      (row) =>
        row.projectId === projectId &&
        row.scopeType === scope.type &&
        row.scopeId === scope.id &&
        row.startsOn.toISOString().slice(0, 10) <= date &&
        row.authorRoleLevel > person.roleLevel &&
        (row.authorUserId === null || row.authorUserId !== person.userId) &&
        row.author?.workerProfile?.id !== person.participantId &&
        row.author?.managerProfile?.id !== person.participantId,
    );
    if (
      rule === undefined ||
      rule.inherit ||
      (rule.endsOn !== null && rule.endsOn.toISOString().slice(0, 10) < date)
    )
      continue;
    return {
      name: rule.name,
      points: parseStoredPoints(rule.points),
      isWorkday: (rule.workdayMask & (1 << (weekday - 1))) !== 0,
    };
  }
  if (
    data.rules.some(
      (rule) =>
        rule.projectId === projectId &&
        rule.authorRoleLevel === 6 &&
        rule.startsOn.toISOString().slice(0, 10) <= date,
    )
  )
    return {
      name: "每日两次",
      points: defaultAttendancePoints,
      isWorkday: true,
    };
  // Explicit adapter for schedules created before configurable point rules existed.
  const schedules = data.schedules.filter((row) => row.ownerId === projectId);
  const schedule = schedules.find(
    (row) =>
      row.startsOn.toISOString().slice(0, 10) <= date &&
      (row.endsOn === null || row.endsOn.toISOString().slice(0, 10) >= date),
  );
  if (schedule !== undefined)
    return {
      name: schedule.shift.name,
      points: legacyAttendancePoints(schedule.shift.segments),
      isWorkday: (schedule.workdayMask & (1 << (weekday - 1))) !== 0,
    };
  const legacy = data.shifts.find((row) => row.projectId === projectId);
  if (legacy !== undefined)
    return {
      name: legacy.name,
      points: legacyAttendancePoints(legacy.segments),
      isWorkday: schedules.length === 0,
    };
  return { name: "每日两次", points: defaultAttendancePoints, isWorkday: true };
};
export const authorizedPlanLevel = (
  authorization: AuthorizationData,
  target: AuthorizationTargetScope,
): number =>
  Math.max(
    0,
    ...authorization.assignments
      .filter((assignment) => scopeIncludesTarget(assignment.scope, target))
      .map((assignment) => ROLE_LEVEL[assignment.roleCode]),
  );

export const assertPlanAuthority = (
  level: number,
  scopeType: PlanScopeType,
  targetLevel: number,
  actorId: string,
  targetUserId: string | null,
): void => {
  if (
    level < (scopeType === "PROJECT" ? 3 : 2) ||
    (scopeType === "MEMBER" &&
      (level <= targetLevel || actorId === targetUserId))
  )
    throw new ForbiddenException({
      message: "只能设置授权范围内下级的排班，不能修改本人或同级的要求。",
    });
};
export const assertPlanVersion = (
  current: AttendancePlan | null,
  expectedId: string | null,
): void => {
  if ((current?.id ?? null) !== expectedId)
    throw new ConflictException({
      message: "排班已被其他管理员更新，请刷新后重试。",
    });
};
export const roleLevelForMember = (role: RoleCode): number => ROLE_LEVEL[role];
