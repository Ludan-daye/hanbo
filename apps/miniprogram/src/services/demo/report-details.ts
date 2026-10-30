import { ROLE_LEVEL } from "@construction/domain/roles.js";
import { participantPermissionRole } from "../../routing/permissionLevels";
import { ApiError } from "../apiClient";
import type {
  ProjectEvaluation,
  ReportPersonDetail,
} from "../management.types";
import { chinaToday } from "../time";
import { demoMemberOn, demoMemberEligible } from "./member-history";
import { effectiveDemoPlan, demoPlanLevel } from "./plans";
import { dailyPerson, scheduled } from "./reports";
import { demoId, demoMe, type DemoState } from "./state";

export const demoReportPerson = (
  state: DemoState,
  userId: string,
  projectId: string,
  memberId: string,
  teamId: string | null,
  from: string,
  to: string,
): ReportPersonDetail => {
  const person = state.people.find(
    (row) => row.projectId === projectId && row.memberId === memberId,
  );
  if (!person)
    throw new ApiError(404, "未找到该项目人员。", { projectId, memberId });
  if (demoPlanLevel(state, userId, projectId, teamId) < 2)
    throw new ApiError(403, "没有该范围的报表权限。", { projectId, teamId });
  const count = (Date.parse(to) - Date.parse(from)) / 86400000 + 1;
  if (!Number.isInteger(count) || count < 1 || count > 31)
    throw new ApiError(400, "明细查询范围须为 1–31 天。", { from, to });
  const dates = Array.from({ length: count }, (_, index) =>
    new Date(Date.parse(from) + index * 86400000).toISOString().slice(0, 10),
  ).filter(
    (date) =>
      date <= chinaToday() &&
      (teamId === null ||
        demoMemberOn(state, person, date).teamId === teamId) &&
      demoMemberEligible(demoMemberOn(state, person, date), date),
  );
  if (dates.length === 0)
    throw new ApiError(404, "所选范围没有该人员的记录。", { from, to });
  const me = demoMe(state, userId);
  return {
    person: dailyPerson(state, person, dates[0]),
    canEvaluate:
      demoPlanLevel(state, userId, projectId, null) >= 3 &&
      demoPlanLevel(state, userId, projectId, null) >
        ROLE_LEVEL[participantPermissionRole(person)] &&
      person.profileId !== me.profile.id,
    startDate: from,
    endDate: to,
    days: dates.map((date) => {
      const row = dailyPerson(state, person, date);
      const plan = effectiveDemoPlan(state, person, date);
      const makeups = state.makeups.filter(
        (m) =>
          m.projectId === projectId &&
          m.participantId === person.profileId &&
          m.attendanceDate === date,
      );
      return {
        date,
        teamName: row.teamName,
        planName: plan.name,
        isScheduled: scheduled(state, person, date),
        workedMinutes: row.workedMinutes,
        flags: [
          row.isAbsent ? "缺勤" : "",
          row.isMissingPunch ? "缺卡" : "",
          row.isLate ? "迟到" : "",
          row.isEarlyLeave ? "早退" : "",
          row.abnormalRecordCount
            ? `核验未通过 ${row.abnormalRecordCount} 次`
            : "",
        ].filter(Boolean),
        points: plan.points,
        records: [
          ...state.records
            .filter(
              (r) =>
                r.projectId === projectId &&
                r.participantId === person.profileId &&
                r.attendanceDate === date,
            )
            .map((r) => ({
              id: r.id,
              pointCode: r.pointCode,
              occurredAt: r.occurredAt,
              isValid: r.status === "VALID",
              source: "DEVICE",
            })),
          ...makeups
            .filter((m) => m.status === "APPROVED")
            .map((m) => ({
              id: m.id,
              pointCode: m.pointCode,
              occurredAt: m.requestedOccurredAt,
              isValid: true,
              source: "MAKEUP",
            })),
        ],
        makeups: makeups.map((m) => ({
          id: m.id,
          pointLabel: m.pointLabel ?? m.pointCode,
          requestedOccurredAt: m.requestedOccurredAt,
          status: m.status,
          reason: m.reason,
          approvalReason: m.approvalReason,
          approverName:
            m.approverUserId === null
              ? null
              : (state.accounts.find((a) => a.id === m.approverUserId)?.name ??
                "演示审批人"),
          approvedAt: m.approvedAt,
        })),
      };
    }),
  };
};
export const saveDemoEvaluation = (
  state: DemoState,
  userId: string,
  projectId: string,
  memberId: string,
  body: Readonly<Record<string, unknown>>,
): { readonly state: DemoState; readonly data: ProjectEvaluation } => {
  const person = state.people.find(
    (row) => row.projectId === projectId && row.memberId === memberId,
  );
  if (!person)
    throw new ApiError(404, "未找到该项目人员。", { projectId, memberId });
  const level = demoPlanLevel(state, userId, projectId, null);
  if (
    level < 3 ||
    level <= ROLE_LEVEL[participantPermissionRole(person)] ||
    person.profileId === demoMe(state, userId).profile.id
  )
    throw new ApiError(403, "只能评价授权项目内的下级。", {
      projectId,
      memberId,
    });
  const previous =
    state.evaluations?.find(
      (row) => row.projectId === projectId && row.memberId === memberId,
    )?.evaluation ?? null;
  if ((previous?.updatedAt ?? null) !== body.expectedUpdatedAt)
    throw new ApiError(409, "评分已被更新，请刷新后重试。", { memberId });
  if (
    typeof body.score !== "number" ||
    !Number.isInteger(body.score) ||
    body.score < 0 ||
    body.score > 100 ||
    typeof body.comment !== "string" ||
    body.comment.length > 1000
  )
    throw new ApiError(400, "评分须为 0–100 整数，评语不超过 1000 字。", {
      memberId,
    });
  const now = new Date(
    Math.max(
      Date.now(),
      previous === null ? 0 : Date.parse(previous.updatedAt) + 1,
    ),
  ).toISOString();
  const data: ProjectEvaluation = {
    id: previous?.id ?? demoId("evaluation"),
    score: body.score,
    comment: body.comment.trim() || null,
    reviewerName:
      state.accounts.find((a) => a.id === userId)?.name ?? "演示管理员",
    reviewedAt: now,
    updatedAt: now,
  };
  return {
    state: {
      ...state,
      audit: [
        ...state.audit,
        {
          id: demoId("audit"),
          action: `项目评分 ${projectId} / ${memberId}：${body.score}`,
          actor: userId,
          createdAt: now,
        },
      ],
      evaluations: [
        ...(state.evaluations ?? []).filter(
          (e) => e.projectId !== projectId || e.memberId !== memberId,
        ),
        { projectId, memberId, evaluation: data },
      ],
    },
    data,
  };
};
