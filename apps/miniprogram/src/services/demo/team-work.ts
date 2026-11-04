import type {
  NewTaskInvitation,
  SafetyBriefing,
  SafetyBriefingInput,
  SafetyIssue,
  SafetyIssueInput,
  TaskInvitationInput,
  TeamDailySummary,
  TeamTask,
  TeamTaskInput,
  TeamTaskDetails,
  TeamTaskWorker,
} from "@construction/domain";
import { ApiError, type RequestOptions } from "../apiClient";
import type { DailyReport } from "../management.types";
import { demoReport } from "./reports";
import { demoId, demoMe, type DemoState } from "./state";
import { chinaToday } from "../time";
import { effectiveDemoTeamPlan } from "./plans";
import { memberRoleAssignments } from "../member-roles";

export type DemoTeamWork = {
  readonly tasks: readonly TeamTask[];
  readonly invitations: readonly NewTaskInvitation[];
  readonly briefings: readonly SafetyBriefing[];
  readonly issues: readonly (SafetyIssue & { readonly teamId: string })[];
  readonly logs: readonly TeamDailySummary[];
};
type Result = { readonly state: DemoState; readonly data: unknown };
const initial = (): DemoTeamWork => ({
  tasks: [],
  invitations: [],
  briefings: [],
  issues: [],
  logs: [],
});
const datedTasks = (
  tasks: readonly TeamTask[],
  day: string,
): readonly TeamTask[] => {
  const start: number = Date.parse(`${day}T00:00:00+08:00`);
  return tasks.filter(
    (task) =>
      Date.parse(task.startsAt) < start + 86400000 &&
      Date.parse(task.endsAt) > start,
  );
};
export const demoTeamWorkRequest = (
  state: DemoState,
  userId: string,
  parts: readonly string[],
  date: string | undefined,
  cursor: string | undefined,
  search: string | undefined,
  options: RequestOptions,
): Result => {
  const work: DemoTeamWork = state.teamWork ?? initial();
  const method: string = options.method ?? "GET";
  const me = demoMe(state, userId);
  const respond = (next: DemoTeamWork, data: unknown): Result => ({
    state: { ...state, teamWork: next },
    data,
  });
  const own = state.people.filter(
    (person) => person.profileId === me.profile.id,
  );
  if (parts[1] === "me") {
    if (parts[2] === "join" && method === "POST") {
      const code: string = (options.data as { code: string }).code;
      const invite = work.invitations.find((row) => row.code === code);
      if (
        !invite ||
        invite.status !== "PENDING" ||
        Date.parse(invite.expiresAt) <= Date.now()
      )
        throw new ApiError(409, "邀请码无效或已失效。", {});
      const task = work.tasks.find(
        (row) => row.id === invite.taskId && row.status === "OPEN",
      );
      const profile = state.accountProfiles?.[userId];
      const person = state.people.find(
        (row) =>
          row.projectId === task?.projectId &&
          row.teamId === task.teamId &&
          row.displayName?.replace(/（演示）$/, "") === profile?.realName &&
          row.phone === profile?.phone &&
          row.participantType === "WORKER" &&
          row.status === "ACTIVE",
      );
      if (
        !task ||
        !person ||
        invite.name.replace(/（演示）$/, "") !== profile?.realName ||
        invite.phoneMasked !==
          `${person.phone.slice(0, 3)}****${person.phone.slice(-4)}` ||
        (me.profile.id !== null && person.profileId !== me.profile.id)
      )
        throw new ApiError(
          403,
          "演示邀请须使用本人姓名、手机号对应的本班工人档案。",
          {},
        );
      const assigned: TeamTask = {
        ...task,
        assignments: task.assignments.some(
          (row) => row.memberId === person.memberId,
        )
          ? task.assignments
          : [
              ...task.assignments,
              {
                memberId: person.memberId,
                name: person.displayName!,
                source: "TEMPORARY_INVITE",
                taskAttendanceOnly: person.taskAttendanceOnly === true,
              },
            ],
      };
      const next = respond(
        {
          ...work,
          tasks: work.tasks.map((row) => (row.id === task.id ? assigned : row)),
          invitations: work.invitations.map((row) =>
            row.id === invite.id ? { ...row, status: "ACCEPTED" } : row,
          ),
        },
        {
          taskId: task.id,
          projectId: task.projectId,
          memberId: person.memberId,
        },
      );
      return {
        ...next,
        state: {
          ...next.state,
          boundProfileId:
            userId === "dev-unbound" ? person.profileId : state.boundProfileId,
        },
      };
    }
    if (parts[2] === "tasks" && method === "GET")
      return respond(
        work,
        work.tasks
          .filter(
            (task) =>
              datedTasks([task], date!).length > 0 ||
              (date === chinaToday() &&
                task.assignments.some(
                  (row) =>
                    own.some((person) => person.memberId === row.memberId) &&
                    row.startedAt &&
                    !row.finishedAt,
                )),
          )
          .filter((task) =>
            task.assignments.some((row) =>
              own.some((person) => person.memberId === row.memberId),
            ),
          )
          .map((task) => ({
            ...task,
            assignments: task.assignments.filter((row) =>
              own.some((person) => person.memberId === row.memberId),
            ),
          })),
      );
    if (parts[2] === "briefings" && method === "GET")
      return respond(
        work,
        work.briefings
          .filter(
            (row) =>
              row.workDate === date &&
              own.some((person) => person.teamId === row.teamId),
          )
          .map((row) => ({
            ...row,
            acknowledged: row.acknowledgements.some((ack) =>
              own.some((person) => person.memberId === ack.memberId),
            ),
            acknowledgements: [],
          })),
      );
    if (
      parts[2] === "briefings" &&
      parts[4] === "acknowledge" &&
      method === "POST"
    ) {
      const briefing = work.briefings.find((row) => row.id === parts[3]);
      const person = own.find((row) => row.teamId === briefing?.teamId);
      if (!briefing || !person)
        throw new ApiError(403, "不能确认其他班组的交底。", {});
      const next: SafetyBriefing = {
        ...briefing,
        acknowledgements: briefing.acknowledgements.some(
          (row) => row.memberId === person.memberId,
        )
          ? briefing.acknowledgements
          : [
              ...briefing.acknowledgements,
              {
                memberId: person.memberId,
                name: person.displayName ?? "演示工人",
                acknowledgedAt: new Date().toISOString(),
              },
            ],
      };
      return respond(
        {
          ...work,
          briefings: work.briefings.map((row) =>
            row.id === next.id ? next : row,
          ),
        },
        null,
      );
    }
  }
  const teamId: string = parts[2];
  const team = state.teams.find((row) => row.id === teamId);
  const project = state.projects.find((row) => row.id === team?.projectId);
  if (!team || !project) throw new ApiError(404, "班组不存在。", {});
  const people = state.people.filter(
    (row) =>
      row.teamId === teamId &&
      row.projectId === project.id &&
      row.status === "ACTIVE" &&
      Date.parse(row.enteredAt) <= Date.now() &&
      (row.exitedAt === null || Date.parse(row.exitedAt) > Date.now()) &&
      row.participantType === "WORKER",
  );
  if (
    method !== "GET" &&
    (team.status !== "ACTIVE" || project.status !== "ACTIVE")
  )
    throw new ApiError(409, "班组或项目已停用。", {});
  const task = work.tasks.find(
    (row) => row.id === parts[4] && row.teamId === teamId,
  );
  if (parts[3] === "workers" && method === "GET") {
    if (team.status !== "ACTIVE" || project.status !== "ACTIVE")
      throw new ApiError(409, "班组或项目已停用。", {});
    return respond(
      work,
      people.map(
        (person): TeamTaskWorker => ({
          memberId: person.memberId,
          name: person.displayName ?? "姓名待补录",
          workType: person.workType ?? "工种待补录",
          phoneMasked: `${person.phone.slice(0, 3)}****${person.phone.slice(-4)}`,
          projectId: project.id,
          projectName: project.name,
          teamId,
          teamName: team.name,
        }),
      ),
    );
  }
  if (parts[3] === "task-defaults" && method === "GET")
    return respond(work, {
      workType: team.workType ?? "",
      ...effectiveDemoTeamPlan(state, project.id, teamId, date!),
    });
  if (parts[3] === "task-templates" && method === "GET") {
    const keyword: string = (search ?? "").trim().toLowerCase();
    const rows = [...work.tasks]
      .reverse()
      .filter(
        (row) =>
          row.teamId === teamId &&
          `${row.title} ${row.description} ${row.workType}`
            .toLowerCase()
            .includes(keyword),
      );
    const position: number =
      cursor === undefined ? -1 : rows.findIndex((row) => row.id === cursor);
    if (cursor !== undefined && position < 0)
      throw new ApiError(400, "历史安排分页已失效，请重新读取。", {});
    const page = rows.slice(position + 1, position + 31);
    return respond(work, {
      items: page.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        workType: row.workType,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        memberIds: row.assignments
          .filter(
            (assignment) =>
              assignment.source === "ASSIGNED" &&
              !assignment.taskAttendanceOnly,
          )
          .map((assignment) => assignment.memberId),
        previousMemberCount: row.assignments.length,
      })),
      nextCursor: rows.length > position + 31 ? page[page.length - 1].id : null,
    });
  }
  if (parts[3] === "tasks") {
    if (parts.length === 4 && method === "GET")
      return respond(
        work,
        datedTasks(
          work.tasks.filter((row) => row.teamId === teamId),
          date!,
        ),
      );
    if (parts.length === 4 && method === "POST") {
      const input = options.data as TeamTaskInput;
      if (
        !input.title.trim() ||
        !Number.isFinite(Date.parse(input.startsAt)) ||
        !Number.isFinite(Date.parse(input.endsAt)) ||
        Date.parse(input.endsAt) - Date.parse(input.startsAt) > 86400000 ||
        Date.parse(input.endsAt) <=
          Math.max(Date.now(), Date.parse(input.startsAt)) ||
        input.memberIds.some(
          (id) => !people.some((person) => person.memberId === id),
        )
      )
        throw new ApiError(400, "请检查任务时间、必填内容与班组人员。", {});
      const row: TeamTask = {
        ...input,
        id: demoId("task"),
        teamId,
        teamName: team.name,
        projectId: project.id,
        projectName: project.name,
        supervisorName:
          state.accountProfiles?.[userId]?.realName ?? "演示班组长",
        status: "OPEN",
        assignments: input.memberIds.map((id) => ({
          memberId: id,
          name:
            people.find((person) => person.memberId === id)!.displayName ??
            "演示工人",
          source: "ASSIGNED",
          taskAttendanceOnly:
            people.find((person) => person.memberId === id)!
              .taskAttendanceOnly === true,
        })),
      };
      return respond({ ...work, tasks: [...work.tasks, row] }, row);
    }
    if (!task) throw new ApiError(404, "工作任务不存在。", {});
    if (parts.length === 5 && method === "PUT") {
      const input = options.data as TeamTaskDetails;
      if (
        task.status !== "OPEN" ||
        task.assignments.some((row) => row.startedAt)
      )
        throw new ApiError(
          409,
          "已有实际开工记录或任务已结束，不能修改安排。",
          {},
        );
      const duration: number =
        Date.parse(input.endsAt) - Date.parse(input.startsAt);
      if (
        !input.title.trim() ||
        !Number.isFinite(duration) ||
        duration <= 0 ||
        duration > 86400000 ||
        Date.parse(input.endsAt) <= Date.now()
      )
        throw new ApiError(400, "请检查任务时间与必填内容。", {});
      const updated: TeamTask = { ...task, ...input };
      return respond(
        {
          ...work,
          tasks: work.tasks.map((row) => (row.id === task.id ? updated : row)),
          invitations: work.invitations.map((row) =>
            row.taskId === task.id && row.status === "PENDING"
              ? { ...row, status: "REVOKED" }
              : row,
          ),
        },
        updated,
      );
    }
    if (parts[5] === "members" && parts.length === 7 && method === "DELETE") {
      const member = task.assignments.find((row) => row.memberId === parts[6]);
      if (!member) throw new ApiError(404, "该任务未安排此工人。", {});
      if (task.status !== "OPEN" || member.startedAt)
        throw new ApiError(
          409,
          "已有实际开工记录或任务已结束，不能撤下人员。",
          {},
        );
      return respond(
        {
          ...work,
          tasks: work.tasks.map((row) =>
            row.id === task.id
              ? {
                  ...row,
                  assignments: row.assignments.filter(
                    (person) => person.memberId !== member.memberId,
                  ),
                }
              : row,
          ),
        },
        null,
      );
    }
    if (parts[5] === "members" && parts.length === 6 && method === "POST") {
      const { memberIds } = options.data as {
        readonly memberIds: readonly string[];
      };
      if (task.status !== "OPEN" || Date.parse(task.endsAt) <= Date.now())
        throw new ApiError(409, "任务已经结束，不能继续安排人员。", {});
      if (
        memberIds.length === 0 ||
        new Set(memberIds).size !== memberIds.length ||
        memberIds.some((id) => !people.some((person) => person.memberId === id))
      )
        throw new ApiError(400, "只能选择当前项目、本班组在场的工人。", {});
      const added = memberIds.filter(
        (id) => !task.assignments.some((row) => row.memberId === id),
      );
      if (added.length + task.assignments.length > 200)
        throw new ApiError(400, "单个任务最多安排 200 人。", {});
      const updated: TeamTask = {
        ...task,
        assignments: [
          ...task.assignments,
          ...added.map((id) => {
            const person = people.find((row) => row.memberId === id)!;
            return {
              memberId: id,
              name: person.displayName ?? "姓名待补录",
              source: "ASSIGNED",
              taskAttendanceOnly: person.taskAttendanceOnly === true,
            };
          }),
        ],
      };
      return respond(
        {
          ...work,
          tasks: work.tasks.map((row) => (row.id === task.id ? updated : row)),
        },
        updated,
      );
    }
    if (parts[5] === "members" && parts[7] === "exit" && method === "POST") {
      const assignment = task.assignments.find(
        (row) => row.memberId === parts[6],
      );
      const person = state.people.find(
        (row) => row.memberId === parts[6] && row.teamId === teamId,
      );
      if (!person || !assignment)
        throw new ApiError(403, "只能办理本班任务工人的退场。", {});
      if (assignment.exitConfirmedAt) return respond(work, null);
      if (
        !person.taskAttendanceOnly ||
        memberRoleAssignments(person).some((row) => row.roleCode !== "WORKER")
      )
        throw new ApiError(403, "此人员不是单纯临时工，请项目管理员办理。", {});
      if (
        !assignment.finishedAt ||
        work.tasks.some(
          (row) =>
            row.id !== task.id &&
            row.status === "OPEN" &&
            row.assignments.some(
              (item) => item.memberId === person.memberId && !item.finishedAt,
            ),
        )
      )
        throw new ApiError(409, "还有未结束任务，请先处理后再退场。", {});
      const now: string = new Date().toISOString();
      return {
        state: {
          ...state,
          people: state.people.map((row) =>
            row.memberId === person.memberId
              ? { ...row, status: "EXITED", exitedAt: now, updatedAt: now }
              : row,
          ),
          teamWork: {
            ...work,
            tasks: work.tasks.map((row) =>
              row.id === task.id
                ? {
                    ...row,
                    assignments: row.assignments.map((item) =>
                      item.memberId === person.memberId
                        ? { ...item, exitConfirmedAt: now }
                        : item,
                    ),
                  }
                : row,
            ),
          },
        },
        data: null,
      };
    }
    if (parts[5] === "status" && method === "PUT") {
      if (task.status !== "OPEN") throw new ApiError(409, "任务已经结束。", {});
      const status = (options.data as { status: "COMPLETED" | "CANCELLED" })
        .status;
      if (
        task.assignments.some(
          (row) => row.startedAt && (status === "CANCELLED" || !row.finishedAt),
        )
      )
        throw new ApiError(
          409,
          "有实际开工记录，须完成完工后正常结束任务。",
          {},
        );
      return respond(
        {
          ...work,
          tasks: work.tasks.map((row) =>
            row.id === task.id ? { ...row, status } : row,
          ),
          invitations: work.invitations.map((row) =>
            row.taskId === task.id && row.status === "PENDING"
              ? { ...row, status: "REVOKED" }
              : row,
          ),
        },
        null,
      );
    }
    if (parts[5] === "invitations") {
      if (method === "GET")
        return respond(
          work,
          work.invitations
            .filter((row) => row.taskId === task.id)
            .map(({ code: _code, ...row }) => ({
              ...row,
              status:
                row.status === "PENDING" &&
                Date.parse(row.expiresAt) <= Date.now()
                  ? "EXPIRED"
                  : row.status,
            })),
        );
      if (parts[7] === "revoke")
        return respond(
          {
            ...work,
            invitations: work.invitations.map((row) =>
              row.id === parts[6] &&
              row.taskId === task.id &&
              row.status === "PENDING"
                ? { ...row, status: "REVOKED" }
                : row,
            ),
          },
          null,
        );
      const input = options.data as TaskInvitationInput;
      if (task.status !== "OPEN" || Date.parse(task.endsAt) <= Date.now())
        throw new ApiError(409, "任务已经结束。", {});
      if (
        !people.some(
          (row) =>
            row.displayName?.replace(/（演示）$/, "") === input.realName &&
            row.phone === input.phone,
        )
      )
        throw new ApiError(
          400,
          "本机演示请使用已有本班工人姓名和手机号；真实接口支持新工人入场。",
          {},
        );
      if (
        work.invitations.some(
          (row) =>
            row.taskId === task.id &&
            row.name === input.realName &&
            row.status === "PENDING" &&
            Date.parse(row.expiresAt) > Date.now(),
        )
      )
        throw new ApiError(409, "已有有效邀请，请先作废后重发。", {});
      const row: NewTaskInvitation = {
        id: demoId("temp-invite"),
        taskId: task.id,
        name: input.realName,
        phoneMasked: `${input.phone.slice(0, 3)}****${input.phone.slice(-4)}`,
        status: "PENDING",
        code: String(100000 + work.invitations.length),
        expiresAt: new Date(
          Math.min(Date.now() + 86400000, Date.parse(task.endsAt)),
        ).toISOString(),
      };
      return respond({ ...work, invitations: [...work.invitations, row] }, row);
    }
  }
  if (parts[3] === "briefings") {
    if (method === "GET")
      return respond(
        work,
        work.briefings.filter(
          (row) => row.teamId === teamId && row.workDate === date,
        ),
      );
    const input = options.data as SafetyBriefingInput;
    const row: SafetyBriefing = {
      ...input,
      id: demoId("briefing"),
      teamId,
      teamName: team.name,
      projectName: project.name,
      acknowledged: false,
      acknowledgements: [],
    };
    return respond({ ...work, briefings: [row, ...work.briefings] }, null);
  }
  if (parts[3] === "issues") {
    if (parts[4] === "open" && method === "GET") {
      const rows = work.issues.filter(
        (row) => row.teamId === teamId && row.resolvedAt === null,
      );
      const start: number =
        cursor === undefined
          ? 0
          : rows.findIndex((row) => row.id === cursor) + 1;
      const items = rows.slice(start, start + 50);
      return respond(work, {
        items,
        nextCursor: start + 50 < rows.length ? items[49]!.id : null,
      });
    }
    if (method === "GET")
      return respond(
        work,
        work.issues.filter(
          (row) => row.teamId === teamId && row.workDate === date,
        ),
      );
    if (method === "PUT") {
      const issue = work.issues.find(
        (row) =>
          row.id === parts[4] &&
          row.teamId === teamId &&
          row.resolvedAt === null,
      );
      if (!issue) throw new ApiError(409, "隐患不存在或已关闭。", {});
      const resolution = (options.data as { resolution: string }).resolution;
      return respond(
        {
          ...work,
          issues: work.issues.map((row) =>
            row.id === issue.id
              ? { ...row, resolution, resolvedAt: new Date().toISOString() }
              : row,
          ),
        },
        null,
      );
    }
    const input = options.data as SafetyIssueInput;
    const person = people.find((row) => row.memberId === input.memberId);
    if (input.memberId !== null && !person)
      throw new ApiError(403, "只能关联本班工人。", {});
    const row = {
      ...input,
      id: demoId("safety-issue"),
      teamId,
      memberName: person?.displayName ?? null,
      resolution: null,
      resolvedAt: null,
    };
    return respond({ ...work, issues: [row, ...work.issues] }, null);
  }
  if (parts[3] === "daily") {
    if (method === "GET" && parts[4])
      return respond(work, {
        snapshot:
          work.logs.find(
            (row) => row.teamId === teamId && row.workDate === parts[4],
          ) ?? null,
      });
    const day: string = method === "POST" ? parts[4] : date!;
    const tasks = datedTasks(
      work.tasks.filter((row) => row.teamId === teamId),
      day,
    );
    const report = demoReport(
      state,
      state.people.filter((row) => row.projectId === project.id),
      project.id,
      "DAILY",
      day,
      day,
      teamId,
    ) as DailyReport;
    const briefings = work.briefings.filter(
      (row) => row.teamId === teamId && row.workDate === day,
    );
    const issues = work.issues.filter(
      (row) => row.teamId === teamId && row.workDate === day,
    );
    const data: TeamDailySummary = {
      teamId,
      teamName: team.name,
      projectName: project.name,
      workDate: day,
      generatedAt: new Date().toISOString(),
      taskCount: tasks.length,
      completedTaskCount: tasks.filter((row) => row.status === "COMPLETED")
        .length,
      cancelledTaskCount: tasks.filter((row) => row.status === "CANCELLED")
        .length,
      temporaryWorkerCount: new Set(
        tasks
          .filter((row) => row.status !== "CANCELLED")
          .flatMap((row) =>
            row.assignments
              .filter((item) => item.source === "TEMPORARY_INVITE")
              .map((item) => item.memberId),
          ),
      ).size,
      briefingCount: briefings.length,
      acknowledgementCount: briefings.reduce(
        (sum, row) => sum + row.acknowledgements.length,
        0,
      ),
      openIssueCount: issues.filter((row) => !row.resolvedAt).length,
      resolvedIssueCount: issues.filter((row) => row.resolvedAt).length,
      actualAttendedDays: report.totals.actualAttendedDays,
      workedMinutes: report.totals.workedMinutes,
      missingPunchCount: report.totals.missingPunchCount,
      tasks,
      people: report.participants.map((person) => ({
        name: person.displayName ?? "演示工人",
        workedMinutes: person.workedMinutes,
        flags: [
          person.isMissingPunch ? "缺卡" : "",
          person.isLate ? "迟到" : "",
        ].filter(Boolean),
      })),
    };
    return respond(
      method === "POST"
        ? {
            ...work,
            logs: [
              ...work.logs.filter(
                (row) => row.teamId !== teamId || row.workDate !== day,
              ),
              data,
            ],
          }
        : work,
      data,
    );
  }
  throw new ApiError(404, "不支持的班组演示接口。", { parts });
};
