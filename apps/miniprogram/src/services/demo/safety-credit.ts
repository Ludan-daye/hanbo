import {
  calculateSafetyCredit,
  completedSafetyWorkDates,
  overtimeWorkIntervals,
  safetyCreditDay,
  safetyStatusAt,
  scheduledWorkIntervals,
  taskWorkIntervals,
  type SafetyCreditBoard,
  type SafetyCreditPolicyInput,
  type SafetyCreditPolicyView,
  type SafetyCreditSummary,
  type SafetyDecisionAction,
  type SafetyViolationInput,
  type SafetyViolationView,
  type WorktimeInterval,
} from "@construction/domain";
import type { AttendanceRecordInput } from "@construction/domain/attendance.js";
import { ApiError, type RequestOptions } from "../apiClient";
import { demoMemberOn } from "./member-history";
import { demoPlanLevel, effectiveDemoPlan } from "./plans";
import { demoId, demoMe, type DemoState } from "./state";

type DemoViolation = SafetyViolationView & { readonly authorUserId: string };
export type DemoSafetyCredit = {
  readonly violations: readonly DemoViolation[];
  readonly policies: readonly SafetyCreditPolicyView[];
};
type Result = { readonly state: DemoState; readonly data: unknown };
const initial = (): DemoSafetyCredit => ({
  violations: [],
  policies: [
    {
      version: 1,
      startsOn: "2026-11-17",
      createdAt: "2026-11-16T16:00:00.000Z",
      generalPoints: 5,
      seriousPoints: 10,
      majorPoints: 20,
      recoveryWorkdays: 10,
      recoveryPoints: 5,
    },
  ],
});
const safetyState = (state: DemoState): DemoSafetyCredit =>
  state.safetyCredit ?? initial();
const historicalView = (
  row: SafetyViolationView,
  snapshotAt: Date,
): SafetyViolationView => {
  const decisions = row.decisions.filter(
    (decision) => Date.parse(decision.createdAt) <= snapshotAt.getTime(),
  );
  const last = decisions.at(-1);
  return {
    ...row,
    status: safetyStatusAt(decisions, snapshotAt),
    decisions,
    reviewedAt: last?.createdAt ?? null,
    reviewReason: last?.reason ?? null,
    appeals: row.appeals
      .filter((appeal) => Date.parse(appeal.createdAt) <= snapshotAt.getTime())
      .map((appeal) =>
        appeal.reviewedAt !== null &&
        Date.parse(appeal.reviewedAt) > snapshotAt.getTime()
          ? {
              ...appeal,
              status: "PENDING",
              reviewedAt: null,
              reviewReason: null,
            }
          : appeal,
      ),
  };
};
const workedDates = (
  state: DemoState,
  workerId: string,
  asOf: Date,
  snapshotAt: Date,
): readonly string[] => {
  const intervals = state.people
    .filter(
      (person) =>
        person.profileId === workerId && person.participantType === "WORKER",
    )
    .flatMap((person): WorktimeInterval[] => {
      const rows = state.records.filter(
        (row) =>
          row.projectId === person.projectId &&
          row.participantId === workerId &&
          row.status === "VALID" &&
          Date.parse(row.occurredAt) <= asOf.getTime(),
      );
      const makeups = state.makeups.filter(
        (row) =>
          row.projectId === person.projectId &&
          row.participantId === workerId &&
          row.status === "APPROVED" &&
          row.approvedAt !== null &&
          Date.parse(row.approvedAt) <= snapshotAt.getTime() &&
          Date.parse(row.requestedOccurredAt) <= asOf.getTime(),
      );
      const evidence: readonly AttendanceRecordInput[] = [
        ...rows.map((row) => ({
          id: row.id,
          pointCode: row.pointCode,
          occurredAt: new Date(row.occurredAt),
          isValid: true,
          source: "DEVICE" as const,
        })),
        ...makeups.map((row) => ({
          id: row.id,
          pointCode: row.pointCode,
          occurredAt: new Date(row.requestedOccurredAt),
          isValid: true,
          source: "MAKEUP" as const,
        })),
      ];
      const dates = [
        ...new Set([
          ...rows.map((row) => row.attendanceDate),
          ...makeups.map((row) => row.attendanceDate),
        ]),
      ];
      return [
        ...dates.flatMap((date): readonly WorktimeInterval[] => {
          const plan = effectiveDemoPlan(
            state,
            demoMemberOn(state, person, date),
            date,
          );
          return plan.points.length === 0
            ? []
            : scheduledWorkIntervals(
                plan.points,
                date,
                evidence.filter(
                  (row) => safetyCreditDay(row.occurredAt) === date,
                ),
                asOf,
                "REGULAR",
              );
        }),
        ...overtimeWorkIntervals(evidence),
        ...taskWorkIntervals(
          (state.teamWork?.tasks ?? []).flatMap((task) =>
            task.assignments
              .filter((row) => row.memberId === person.memberId)
              .map((row) => ({
                startsAt: new Date(task.startsAt),
                endsAt: new Date(task.endsAt),
                cancelled: task.status === "CANCELLED",
                startedAt: row.startedAt ? new Date(row.startedAt) : null,
                finishedAt: row.finishedAt ? new Date(row.finishedAt) : null,
              })),
          ),
        ),
      ];
    });
  return completedSafetyWorkDates(intervals, asOf);
};
export const demoSafetySummaries = (
  state: DemoState,
  workerIds: readonly string[],
  asOf: Date,
  snapshotAt: Date,
): ReadonlyMap<string, SafetyCreditSummary> => {
  const safety = safetyState(state);
  return new Map(
    [...new Set(workerIds)].map((workerId) => [
      workerId,
      calculateSafetyCredit(
        workerId,
        safety.violations,
        workedDates(state, workerId, asOf, snapshotAt),
        safety.policies,
        asOf,
        snapshotAt,
      ),
    ]),
  );
};
export const demoSafetyReportEvents = (
  state: DemoState,
  projectIds: readonly string[],
  workerIds: readonly string[],
  fromDate: string,
  toDate: string,
  asOf: Date,
  snapshotAt: Date,
): readonly SafetyViolationView[] =>
  safetyState(state)
    .violations.filter(
      (row) =>
        projectIds.includes(row.projectId) &&
        workerIds.includes(row.workerId) &&
        safetyCreditDay(new Date(row.occurredAt)) >= fromDate &&
        safetyCreditDay(new Date(row.occurredAt)) <= toDate &&
        Date.parse(row.occurredAt) <= asOf.getTime() &&
        Date.parse(row.createdAt) <= snapshotAt.getTime(),
    )
    .map((row) => historicalView(row, snapshotAt));
const requireText = (value: string, max: number): void => {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new ApiError(400, "请填写完整内容", {});
};
const board = (
  state: DemoState,
  projectId: string,
  teamId: string | null,
): SafetyCreditBoard => {
  const now = new Date();
  const people = state.people.filter(
    (row) =>
      row.participantType === "WORKER" &&
      row.status === "ACTIVE" &&
      row.projectId === projectId &&
      (teamId === null || row.teamId === teamId),
  );
  const summaries = demoSafetySummaries(
    state,
    people.map((row) => row.profileId),
    now,
    now,
  );
  const workers = people
    .map((row) => ({
      ...summaries.get(row.profileId)!,
      memberId: row.memberId,
      name: row.displayName ?? "待补录",
    }))
    .sort(
      (a, b) =>
        b.confirmedViolationCount - a.confirmedViolationCount ||
        a.score - b.score ||
        a.workerId.localeCompare(b.workerId),
    );
  return {
    workers: workers.map((row, index) => ({ ...row, rank: index + 1 })),
    violations: safetyState(state)
      .violations.filter(
        (row) =>
          row.projectId === projectId &&
          (teamId === null || row.teamId === teamId),
      )
      .map((row) => historicalView(row, now)),
    policies: safetyState(state).policies,
  };
};
export const demoSafetyCreditRequest = (
  state: DemoState,
  userId: string,
  parts: readonly string[],
  options: RequestOptions,
): Result => {
  const saved = safetyState(state);
  const method = options.method ?? "GET";
  const now = new Date();
  const iso = now.toISOString();
  const me = demoMe(state, userId);
  const respond = (next: DemoSafetyCredit, data: unknown): Result => ({
    state: { ...state, safetyCredit: next },
    data,
  });
  if (parts[1] === "policies") {
    if (method === "GET") return respond(saved, saved.policies);
    if (
      !me.roles.assignments.some(
        (row) =>
          row.roleCode === "SYSTEM_ADMIN" && row.scope.scopeType === "GLOBAL",
      )
    )
      throw new ApiError(403, "仅系统管理员可调整全局规则", {});
    const input = options.data as SafetyCreditPolicyInput;
    const previous = saved.policies.at(-1)!;
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(input.startsOn) ||
      !Number.isFinite(Date.parse(input.startsOn)) ||
      new Date(input.startsOn).toISOString().slice(0, 10) !== input.startsOn ||
      input.startsOn <= safetyCreditDay(now) ||
      input.startsOn <= previous.startsOn
    )
      throw new ApiError(400, "生效日期须晚于今天和已有版本", {});
    if (
      ![
        input.generalPoints,
        input.seriousPoints,
        input.majorPoints,
        input.recoveryPoints,
      ].every(
        (value) => Number.isInteger(value) && value >= 1 && value <= 100,
      ) ||
      !Number.isInteger(input.recoveryWorkdays) ||
      input.recoveryWorkdays < 1 ||
      input.recoveryWorkdays > 365 ||
      input.generalPoints > input.seriousPoints ||
      input.seriousPoints > input.majorPoints
    )
      throw new ApiError(400, "规则分值或恢复天数有误", {});
    const row: SafetyCreditPolicyView = {
      ...input,
      version: previous.version + 1,
      createdAt: iso,
    };
    return respond({ ...saved, policies: [...saved.policies, row] }, row);
  }
  if (parts[1] === "me") {
    if (me.profile.id === null || me.profile.type !== "WORKER")
      throw new ApiError(404, "未关联工人档案", {});
    if (method === "GET")
      return respond(saved, {
        summary: demoSafetySummaries(state, [me.profile.id], now, now).get(
          me.profile.id,
        ),
        violations: saved.violations
          .filter((row) => row.workerId === me.profile.id)
          .map((row) => historicalView(row, now)),
        policies: saved.policies,
      });
    const row = saved.violations.find(
      (item) =>
        item.id === parts[3] &&
        item.workerId === me.profile.id &&
        item.status === "CONFIRMED",
    );
    if (
      parts[2] !== "violations" ||
      parts[4] !== "appeals" ||
      row === undefined
    )
      throw new ApiError(404, "无可申诉的本人已确认记录", {});
    if (row.appeals.some((appeal) => appeal.status === "PENDING"))
      throw new ApiError(409, "已有待处理申诉", {});
    const input = options.data as { readonly reason: string };
    requireText(input.reason, 1000);
    return respond(
      {
        ...saved,
        violations: saved.violations.map((item) =>
          item.id === row.id
            ? {
                ...item,
                appeals: [
                  ...item.appeals,
                  {
                    id: demoId("appeal"),
                    reason: input.reason,
                    status: "PENDING",
                    createdAt: iso,
                    reviewedAt: null,
                    reviewReason: null,
                  },
                ],
              }
            : item,
        ),
      },
      undefined,
    );
  }
  if (parts[1] === "violations" && parts[3] === "evidence") {
    const row = saved.violations.find((item) => item.id === parts[2]);
    if (
      row === undefined ||
      (row.workerId !== me.profile.id &&
        demoPlanLevel(state, userId, row.projectId, row.teamId) < 2)
    )
      throw new ApiError(403, "无权查看该凭证", {});
    throw new ApiError(404, "演示环境不保存凭证原图，请在真实环境查看", {});
  }
  const team =
    parts[1] === "teams"
      ? state.teams.find((row) => row.id === parts[2])
      : null;
  const projectId = parts[1] === "projects" ? parts[2]! : team?.projectId;
  if (!projectId || (parts[1] === "teams" && !team))
    throw new ApiError(404, "班组或项目不存在", {});
  const level = demoPlanLevel(state, userId, projectId, team?.id ?? null);
  if (level < (team ? 2 : 3))
    throw new ApiError(403, "无权访问该范围安全记录", {});
  if (method === "GET")
    return respond(saved, board(state, projectId, team?.id ?? null));
  if (team && parts[3] === "violations") {
    const input = options.data as SafetyViolationInput;
    const person = state.people.find(
      (row) =>
        row.memberId === input.memberId &&
        row.projectId === projectId &&
        row.teamId === team.id &&
        row.participantType === "WORKER" &&
        row.status === "ACTIVE",
    );
    if (!person) throw new ApiError(404, "请选择本班在岗工人", {});
    requireText(input.category, 40);
    requireText(input.description, 2000);
    const occurred = new Date(input.occurredAt);
    if (
      !Number.isFinite(occurred.getTime()) ||
      occurred > now ||
      occurred < new Date(person.enteredAt)
    )
      throw new ApiError(400, "违规时间有误", {});
    if (
      !Array.isArray(input.evidence) ||
      input.evidence.length < 1 ||
      input.evidence.length > 5 ||
      new Set(input.evidence.map((row) => row.objectKey)).size !==
        input.evidence.length
    )
      throw new ApiError(400, "请添加 1—5 张凭证", {});
    const policy = saved.policies
      .filter((row) => row.startsOn <= safetyCreditDay(occurred))
      .at(-1);
    if (!policy) throw new ApiError(400, "该日期尚未启用规则", {});
    if (
      saved.violations.some(
        (row) =>
          row.workerId === person.profileId &&
          row.projectId === projectId &&
          row.category.normalize("NFKC").trim() ===
            input.category.normalize("NFKC").trim() &&
          Math.floor(Date.parse(row.occurredAt) / 60000) ===
            Math.floor(occurred.getTime() / 60000),
      )
    )
      throw new ApiError(409, "该事件已登记", {});
    const points = {
      GENERAL: policy.generalPoints,
      SERIOUS: policy.seriousPoints,
      MAJOR: policy.majorPoints,
    }[input.severity];
    if (points === undefined) throw new ApiError(400, "违规等级有误", {});
    const row: DemoViolation = {
      id: demoId("violation"),
      workerId: person.profileId,
      projectId,
      teamId: team.id,
      memberId: person.memberId,
      category: input.category,
      severity: input.severity,
      occurredAt: occurred.toISOString(),
      description: input.description,
      points,
      policyVersion: policy.version,
      status: "PENDING",
      evidenceObjectKeys: input.evidence.map((item) => item.objectKey),
      createdAt: iso,
      reviewedAt: null,
      reviewReason: null,
      decisions: [],
      appeals: [],
      authorUserId: userId,
    };
    return respond({ ...saved, violations: [row, ...saved.violations] }, row);
  }
  const row = saved.violations.find(
    (item) => item.id === parts[4] && item.projectId === projectId,
  );
  if (!row || parts[3] !== "violations")
    throw new ApiError(404, "违规记录不存在", {});
  if (
    row.authorUserId === userId ||
    row.workerId === me.profile.id ||
    level <= demoPlanLevel(state, row.authorUserId, projectId, row.teamId)
  )
    throw new ApiError(403, "须由上级审核，不能审核本人或同级记录", {});
  if (parts[5] === "appeals" && parts[7] === "review") {
    const input = options.data as {
      readonly accept: boolean;
      readonly reason: string;
    };
    requireText(input.reason, 1000);
    if (typeof input.accept !== "boolean")
      throw new ApiError(400, "申诉处理参数有误", {});
    const appeal = row.appeals.find(
      (item) => item.id === parts[6] && item.status === "PENDING",
    );
    if (!appeal || row.status !== "CONFIRMED")
      throw new ApiError(409, "申诉状态已变化", {});
    const next: DemoViolation = {
      ...row,
      status: input.accept ? "REVOKED" : row.status,
      reviewedAt: input.accept ? iso : row.reviewedAt,
      reviewReason: input.accept ? input.reason : row.reviewReason,
      decisions: input.accept
        ? [
            ...row.decisions,
            { action: "REVOKE", reason: input.reason, createdAt: iso },
          ]
        : row.decisions,
      appeals: row.appeals.map((item) =>
        item.id === appeal.id
          ? {
              ...item,
              status: input.accept ? "ACCEPTED" : "REJECTED",
              reviewedAt: iso,
              reviewReason: input.reason,
            }
          : item,
      ),
    };
    return respond(
      {
        ...saved,
        violations: saved.violations.map((item) =>
          item.id === row.id ? next : item,
        ),
      },
      undefined,
    );
  }
  if (parts[5] === "review") {
    const input = options.data as {
      readonly action: SafetyDecisionAction;
      readonly reason: string;
    };
    requireText(input.reason, 1000);
    if (
      !["CONFIRM", "REJECT", "REVOKE"].includes(input.action) ||
      row.status !== (input.action === "REVOKE" ? "CONFIRMED" : "PENDING")
    )
      throw new ApiError(409, "记录状态已变化", {});
    const next: DemoViolation = {
      ...row,
      status:
        input.action === "CONFIRM"
          ? "CONFIRMED"
          : input.action === "REJECT"
            ? "REJECTED"
            : "REVOKED",
      reviewedAt: iso,
      reviewReason: input.reason,
      decisions: [
        ...row.decisions,
        { action: input.action, reason: input.reason, createdAt: iso },
      ],
      appeals: row.appeals.map((appeal) =>
        input.action === "REVOKE" && appeal.status === "PENDING"
          ? {
              ...appeal,
              status: "ACCEPTED",
              reviewedAt: iso,
              reviewReason: input.reason,
            }
          : appeal,
      ),
    };
    return respond(
      {
        ...saved,
        violations: saved.violations.map((item) =>
          item.id === row.id ? next : item,
        ),
      },
      undefined,
    );
  }
  throw new ApiError(404, "安全信用接口不存在", {});
};
