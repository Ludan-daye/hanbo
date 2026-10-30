import type {
  MemberStatus,
  ProjectMemberHistory,
  RoleCode,
} from "@prisma/client";

export type MemberState = {
  readonly memberId: string;
  readonly teamId: string | null;
  readonly status: MemberStatus;
  readonly requiresAttendance: boolean;
  readonly enteredAt: Date;
  readonly exitedAt: Date | null;
  readonly roleCode: RoleCode;
  readonly projectRoleLabel: string;
};

export const workerRole = (label: string): "WORKER" | "TEAM_LEADER" | "PROJECT_ADMIN" =>
  label === "PROJECT_ADMIN" ? "PROJECT_ADMIN" : label === "TEAM_LEADER" ? "TEAM_LEADER" : "WORKER";

const chinaDay = (date: Date): string =>
  new Date(date.getTime() + 8 * 3600_000).toISOString().slice(0, 10);

/** Resolve the latest daily snapshot. The first snapshot defines the known entry state. */
export const memberStateOn = (
  member: MemberState,
  histories: readonly ProjectMemberHistory[],
  date: string,
): MemberState => {
  const ordered = histories
    .filter(
      (row) =>
        row.workerMemberId === member.memberId ||
        row.managerMemberId === member.memberId,
    )
    .sort(
      (a, b) =>
        b.recordedAt.getTime() - a.recordedAt.getTime() ||
        b.version - a.version,
    );
  const snapshot =
    ordered.find((row) => chinaDay(row.recordedAt) <= date) ?? ordered.at(-1);
  if (snapshot === undefined) return member;
  const recordedExit = ordered.find(
    (row) =>
      row.version > snapshot.version &&
      row.exitedAt !== null &&
      chinaDay(row.exitedAt) < date,
  );
  return {
    memberId: member.memberId,
    teamId: snapshot.teamId,
    status: recordedExit === undefined ? snapshot.status : "EXITED",
    requiresAttendance: snapshot.requiresAttendance,
    enteredAt: snapshot.enteredAt,
    exitedAt: recordedExit?.exitedAt ?? snapshot.exitedAt,
    roleCode: snapshot.roleCode ?? member.roleCode,
    projectRoleLabel:
      snapshot.projectRoleLabel ?? snapshot.roleCode ?? member.projectRoleLabel,
  };
};

/** Entry and exit dates are inclusive; suspension excludes the effective day. */
export const isAttendanceMemberOn = (
  state: MemberState,
  date: string,
): boolean =>
  state.requiresAttendance &&
  state.status !== "SUSPENDED" &&
  date >= chinaDay(state.enteredAt) &&
  (state.exitedAt === null
    ? state.status === "ACTIVE"
    : date <= chinaDay(state.exitedAt));

export const attendanceLockKey = (
  projectId: string,
  type: string,
  id: string,
  date: string,
): string => `attendance:${projectId}:${type}:${id}:${date}`;
