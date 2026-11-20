import { View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
import type {
  NewTaskInvitation,
  TaskInvitation,
  TeamTask,
  TeamTaskWorker,
  TeamTaskDetails,
  TeamTaskDefaults,
  TeamTaskTemplate,
} from "@construction/domain";
import {
  BottomBar,
  Button,
  FormRow,
  FormSwitch,
  Notice,
  PageHeader,
  Screen,
  Sheet,
  SkeletonRows,
} from "../../components/ui/index";
import { workTimestamp } from "../../components/team-work-fields";
import { useLeaveGuard } from "../../hooks/use-leave-guard";
import { useSessionGuard } from "../../hooks/use-session-guard";
import { useManagedTeamId } from "../../hooks/use-management-scope";
import { NoTeamScreen } from "../../components/team-site/index";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { useSession } from "../../store/session";
import { TeamTaskForm } from "../../components/team-task-form";
import { TaskWorkerPicker } from "../../components/task-worker-picker";
import {
  closeTeamTask,
  confirmTaskExit,
  createTaskInvitation,
  createTeamTask,
  fetchTaskInvitations,
  fetchTeamTasks,
  revokeTaskInvitation,
  fetchTaskWorkers,
  addTeamTaskMembers,
  updateTeamTask,
  removeTeamTaskMember,
  fetchTeamTaskDefaults,
} from "../../services/team-work";
import { TeamTaskTemplates } from "../../components/team-task-templates";
import {
  newTaskDetails,
  taskChinaParts,
  reuseTaskTemplate,
} from "../../services/team-task-draft";
import { chinaToday } from "../../services/time";
import { errorMessage } from "../../services/error-messages";
import { peopleSummary, taskPeople } from "./task-view";
import { DetailView } from "./views/detail";
import { InviteView } from "./views/invite";
import { ListView } from "./views/list";

import "./index.scss";

/**
 * 同一个页面里的几个视图：列表、套用历史、新建、选人，
 * 以及点开一项安排之后的详情、修改、加人、邀请临时工。
 * 页头的返回键回到上一个视图。
 */
type View =
  | { readonly name: "list" | "history" | "new" | "pick" }
  | {
      readonly name: "detail" | "edit" | "add" | "invite";
      readonly taskId: string;
      /** 重新读取时安排还没回来，页头先用这个名字。 */
      readonly title: string;
    };
type TaskView = Extract<View, { readonly taskId: string }>;
const LIST: View = { name: "list" };
const taskView = (
  name: TaskView["name"],
  task: { readonly id: string; readonly title: string },
): View => ({ name, taskId: task.id, title: task.title });
/** 正在做哪件事：只用来把那个按钮的字换成“…中”。 */
type Working = "publish" | "save" | "add" | "invite" | "complete" | null;
const DANGER = "#D7261E";

export default function TeamWork(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  const teamId = useManagedTeamId(state.me);
  const { revision, refresh } = usePageRefresh();
  const [date, setDate] = useState<string>(chinaToday());
  const [tasks, setTasks] = useState<readonly TeamTask[] | null>(null);
  // 每次重新读取 tasks 都先清空。详情这几个视图用上一次读到的顶着，不闪成骨架。
  const [knownTasks, setKnownTasks] = useState<readonly TeamTask[]>([]);
  const [members, setMembers] = useState<readonly TeamTaskWorker[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [taskError, setTaskError] = useState<{
    readonly taskId: string;
    readonly message: string;
  } | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const [working, setWorking] = useState<Working>(null);
  const [defaults, setDefaults] = useState<TeamTaskDefaults | null>(null);
  const [draft, setDraft] = useState<TeamTaskDetails | null>(null);
  const [draftKey, setDraftKey] = useState<number>(0);
  const [timeNotice, setTimeNotice] = useState<string | null>(null);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const [inviteAfterSave, setInviteAfterSave] = useState<boolean>(false);
  const [view, setView] = useState<View>(LIST);
  // 新建是从哪个视图进来的（列表、套用历史、某项安排的详情）：返回时回到那里。
  const [draftFrom, setDraftFrom] = useState<View>(LIST);
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [addedMemberIds, setAddedMemberIds] = useState<readonly string[]>([]);
  // invites 里放的是哪一项安排的邀请记录
  const [invitesTaskId, setInvitesTaskId] = useState<string | null>(null);
  const [realName, setRealName] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [invites, setInvites] = useState<readonly TaskInvitation[]>([]);
  const [issued, setIssued] = useState<NewTaskInvitation | null>(null);
  useEffect(() => {
    if (teamId === null) return;
    let active: boolean = true;
    setTasks(null);
    setMembers(null);
    setDefaults(null);
    setError(null);
    void Promise.all([
      fetchTeamTasks(teamId, date),
      fetchTaskWorkers(teamId),
      fetchTeamTaskDefaults(teamId, date),
    ]).then(
      ([rows, people, taskDefaults]) => {
        if (active) {
          setTasks(rows);
          setKnownTasks(rows);
          setMembers(people);
          setDefaults(taskDefaults);
          setSelected((current) =>
            current.filter((id) =>
              people.some((person) => person.memberId === id),
            ),
          );
        }
      },
      (cause: unknown) => {
        if (active) setError(errorMessage(cause, "读取工作安排失败"));
      },
    );
    return () => {
      active = false;
    };
  }, [teamId, date, revision]);
  const resetView = (): void => {
    setView(LIST);
    setAddedMemberIds([]);
    setInvitesTaskId(null);
    setIssued(null);
    setSelected([]);
    setTaskError(null);
  };
  useEffect(resetView, [teamId]);
  // 换了视图就回到顶上：同一个页面里切换，滚动位置不会自己复位。
  useEffect(() => {
    void Taro.pageScrollTo({ scrollTop: 0, duration: 0 });
  }, [view.name]);
  const byId = (task: TeamTask): boolean =>
    "taskId" in view && task.id === view.taskId;
  const openTask: TeamTask | null =
    "taskId" in view
      ? (tasks?.find(byId) ?? knownTasks.find(byId) ?? null)
      : null;
  // 点开的那项安排在重新读取之后不在这一天了：回到列表。
  const gone: boolean = "taskId" in view && tasks !== null && openTask === null;
  useEffect(() => {
    if (gone) setView(LIST);
  }, [gone]);
  // 列表以外的视图都在同一个页面里：系统返回会关掉整页，先问一下。
  useLeaveGuard(
    view.name !== "list" && !gone
      ? "离开工作安排，这一步填的内容不保留。"
      : null,
  );

  const workTypes: readonly string[] = [
    ...new Set(
      [
        defaults?.workType ?? "",
        ...(members?.map((member) => member.workType) ?? []),
      ].filter(Boolean),
    ),
  ];
  /** 换视图。上一个视图里没办成的事的提示不带过去；没读到数据的提示要留着。 */
  const show = (next: View): void => {
    setTaskError(null);
    if (tasks !== null) setError(null);
    setView(next);
  };
  const applyTemplate = (template: TeamTaskTemplate, from: View): void => {
    if (members === null || busy) return;
    const copied = reuseTaskTemplate(template, date, members);
    setDraft(copied.details);
    setSelected(copied.memberIds);
    setDraftKey((value) => value + 1);
    setTimeNotice(null);
    setCopyNotice(
      copied.omittedCount > 0
        ? `${copied.omittedCount} 人没带过来（临时工或已离场），请重新选人或邀请。`
        : null,
    );
    setInviteAfterSave(false);
    setDraftFrom(from);
    show({ name: "new" });
  };
  const perform = async (
    action: () => Promise<void>,
    forTaskId: string | null = null,
    label: Working = null,
  ): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setWorking(label);
    // 数据没读到的提示（带重试）要留着，只清掉上一次操作留下的。
    if (tasks !== null) setError(null);
    setTaskError(null);
    try {
      await action();
    } catch (cause: unknown) {
      const message = errorMessage(cause, "操作失败，请重试");
      if (forTaskId === null) setError(message);
      else setTaskError({ taskId: forTaskId, message });
      await Taro.showToast({ icon: "none", title: message });
    } finally {
      setBusy(false);
      setWorking(null);
    }
  };
  const changeTaskStatus = (
    task: TeamTask,
    status: "COMPLETED" | "CANCELLED",
  ): Promise<void> =>
    perform(
      async () => {
        const result = await Taro.showModal(
          status === "COMPLETED"
            ? {
                title: "确认任务完成",
                content: "没用过的邀请码会失效，考勤记录保留。",
                confirmText: "确认完成",
              }
            : {
                title: "取消任务",
                content: "没用过的邀请码会失效，考勤记录保留。",
                confirmText: "取消任务",
                cancelText: "不取消",
                confirmColor: DANGER,
              },
        );
        if (!result.confirm) return;
        await closeTeamTask(task.teamId, task.id, status);
        setInvitesTaskId(null);
        setIssued(null);
        setAddedMemberIds([]);
        refresh();
      },
      task.id,
      status === "COMPLETED" ? "complete" : null,
    );
  if (teamId === null)
    return (
      <NoTeamScreen title="工作安排" me={state.me} />
    );

  const today: string = chinaToday();
  const shown: View = gone ? LIST : view;
  /** 从修改、加人、邀请回到详情。完整的邀请码离开那一页就不再显示。 */
  const backToDetail = (task: {
    readonly id: string;
    readonly title: string;
  }): void => {
    setAddedMemberIds([]);
    setIssued(null);
    show(taskView("detail", task));
  };
  const back: (() => void) | undefined =
    shown.name === "list"
      ? undefined
      : shown.name === "pick"
        ? () => show({ name: "new" })
        : shown.name === "new"
          ? () => show(draftFrom)
          : "taskId" in shown && shown.name !== "detail"
            ? () => backToDetail({ id: shown.taskId, title: shown.title })
            : () => show(LIST);
  const title: string =
    shown.name === "list"
      ? "工作安排"
      : shown.name === "history"
        ? "套用历史"
        : shown.name === "new"
          ? "新建安排"
          : shown.name === "pick"
            ? "选择人员"
            : shown.name === "detail"
              ? (openTask?.title ?? shown.title)
              : shown.name === "edit"
                ? "修改安排"
                : shown.name === "add"
                  ? "添加本班人员"
                  : "邀请临时工";
  // 重新读取期间先不让操作，免得对着旧数据再点一次。
  const locked: boolean = busy || tasks === null;
  const loadError: string | null = tasks === null ? error : null;
  const actionError: string | null = tasks !== null ? error : null;
  const taskProblem: string | null =
    openTask !== null && taskError?.taskId === openTask.id
      ? taskError.message
      : actionError;
  const selectedNames: string = peopleSummary(
    members
      ?.filter((person) => selected.includes(person.memberId))
      .map((person) => person.name) ?? [],
  );

  const startNew = (): void => {
    if (defaults === null) return;
    void perform(async () => {
      setDraft(newTaskDetails(date, defaults));
      setSelected([]);
      setDraftKey((value) => value + 1);
      setCopyNotice(null);
      setInviteAfterSave(false);
      setTimeNotice(
        defaults.isWorkday ? null : "这天是休息日，请确认安排的时间。",
      );
      setDraftFrom(LIST);
      show({ name: "new" });
    });
  };
  const publish = (details: TeamTaskDetails): Promise<void> =>
    perform(
      async () => {
        const saved = await createTeamTask(teamId, {
          ...details,
          memberIds: selected,
        });
        const savedDate: string = taskChinaParts(saved.startsAt)[0];
        setSelected([]);
        setKnownTasks((rows) => [
          ...rows.filter((row) => row.id !== saved.id),
          saved,
        ]);
        if (inviteAfterSave) {
          setInvitesTaskId(saved.id);
          setIssued(null);
          setInvites([]);
          setRealName("");
          setPhone("");
          show(taskView("invite", saved));
        } else show(taskView("detail", saved));
        if (savedDate === date) refresh();
        else setDate(savedDate);
        await Taro.showToast({ title: "安排已发布", icon: "success" });
      },
      null,
      "publish",
    );
  const saveEdit = (task: TeamTask, details: TeamTaskDetails): Promise<void> =>
    perform(
      async () => {
        const result = await Taro.showModal({
          title: "保存修改",
          content: "已经在安排里的人会看到新的内容，没用过的邀请码会作废。",
          confirmText: "保存",
        });
        if (!result.confirm) return;
        await updateTeamTask(teamId, task.id, details);
        setInvitesTaskId(null);
        show(taskView("detail", { id: task.id, title: details.title }));
        refresh();
      },
      task.id,
      "save",
    );
  const removeMember = (
    task: TeamTask,
    person: { readonly memberId: string; readonly name: string },
  ): void => {
    void perform(async () => {
      const result = await Taro.showModal({
        title: `撤下 ${person.name}`,
        content: "只取消这一次安排，档案和项目身份都保留。",
        confirmText: "撤下",
        confirmColor: DANGER,
      });
      if (!result.confirm) return;
      await removeTeamTaskMember(teamId, task.id, person.memberId);
      refresh();
    }, task.id);
  };
  const confirmExit = (
    task: TeamTask,
    person: { readonly memberId: string; readonly name: string },
  ): void => {
    void perform(async () => {
      const result = await Taro.showModal({
        title: `确认 ${person.name} 退场`,
        content: "退出本项目，档案保留。还没干完的任务要先结束。",
        confirmText: "确认退场",
        confirmColor: DANGER,
      });
      if (!result.confirm) return;
      await confirmTaskExit(teamId, task.id, person.memberId);
      refresh();
    }, task.id);
  };
  const addMembers = (task: TeamTask): void => {
    void perform(
      async () => {
        await addTeamTaskMembers(teamId, task.id, addedMemberIds);
        setAddedMemberIds([]);
        show(taskView("detail", task));
        refresh();
        await Taro.showToast({ title: "人员已安排", icon: "success" });
      },
      task.id,
      "add",
    );
  };
  const openInvite = (task: TeamTask): void => {
    void perform(async () => {
      setInvites(await fetchTaskInvitations(teamId, task.id));
      if (invitesTaskId !== task.id) {
        setRealName("");
        setPhone("");
      }
      setInvitesTaskId(task.id);
      setIssued(null);
      show(taskView("invite", task));
    }, task.id);
  };
  const createInvitation = (task: TeamTask): void => {
    void perform(
      async () => {
        if (!realName.trim() || !/^1[3-9]\d{9}$/.test(phone))
          throw new Error("请填写真实姓名和有效手机号。");
        const result = await createTaskInvitation(teamId, task.id, {
          realName: realName.trim(),
          phone,
        });
        setIssued(result);
        setRealName("");
        setPhone("");
        setInvites(await fetchTaskInvitations(teamId, task.id));
      },
      task.id,
      "invite",
    );
  };
  const copyInvitation = (task: TeamTask): void => {
    if (issued === null) return;
    void perform(async () => {
      await Taro.setClipboardData({
        data: `${task.projectName}，${task.teamName}\n${task.title}\n临时工邀请码：${issued.code}\n有效至 ${workTimestamp(issued.expiresAt)}\n请微信登录后输入邀请码，完成资料和底照登记。`,
      });
    }, task.id);
  };
  const revokeInvitation = (task: TeamTask, invite: TaskInvitation): void => {
    void perform(async () => {
      const result = await Taro.showModal({
        title: `作废 ${invite.name} 的邀请码`,
        content: "作废后这个邀请码马上失效，要用得重新生成。",
        confirmText: "作废",
        confirmColor: DANGER,
      });
      if (!result.confirm) return;
      await revokeTaskInvitation(teamId, task.id, invite.id);
      setInvites(await fetchTaskInvitations(teamId, task.id));
      if (issued?.id === invite.id) setIssued(null);
    }, task.id);
  };

  return (
    <Screen header={<PageHeader title={title} onBack={back} />}>
      {shown.name === "list" ? (
        <ListView
          date={date}
          today={today}
          tasks={tasks}
          loadError={loadError}
          problem={actionError}
          canCreate={!busy && defaults !== null && members !== null}
          canReuse={!busy && members !== null}
          onDate={(value) => {
            resetView();
            setDate(value);
          }}
          onRetry={refresh}
          onOpen={(task) => show(taskView("detail", task))}
          onCreate={startNew}
          onHistory={() => show({ name: "history" })}
        />
      ) : null}
      {shown.name === "history" ? (
        <TeamTaskTemplates
          teamId={teamId}
          disabled={busy}
          onSelect={(template) => applyTemplate(template, { name: "history" })}
        />
      ) : null}
      {shown.name === "new" && copyNotice !== null ? (
        <Notice tone="warning">{copyNotice}</Notice>
      ) : null}
      {/* 去选人时表单不卸载，只是不显示：回来时填过的内容都还在。 */}
      {(shown.name === "new" || shown.name === "pick") && draft !== null ? (
        <TeamTaskForm
          key={draftKey}
          hidden={shown.name === "pick"}
          initialValue={draft}
          busy={busy || members === null}
          submitLabel={
            working === "publish"
              ? "发布中…"
              : inviteAfterSave
                ? "发布并邀请临时工"
                : "发布安排"
          }
          timeNotice={timeNotice}
          workTypes={workTypes}
          problem={actionError}
          people={
            <FormRow
              label="安排人员"
              placeholder="请选择"
              chevron
              onClick={() => show({ name: "pick" })}
            >
              {selected.length > 0 ? (
                <View className="team-work-value">
                  {selectedNames || `已选 ${selected.length} 人`}
                </View>
              ) : undefined}
            </FormRow>
          }
          onSave={publish}
        >
          <Sheet gap>
            <FormSwitch
              label="发布后邀请临时工"
              checked={inviteAfterSave}
              disabled={busy}
              onChange={setInviteAfterSave}
            />
          </Sheet>
        </TeamTaskForm>
      ) : null}
      {shown.name === "pick" ? (
        <>
          <TaskWorkerPicker
            workers={members}
            selectedIds={selected}
            assignedIds={[]}
            disabled={busy}
            onChange={setSelected}
          />
          <BottomBar
            primary={`确定，已选 ${selected.length} 人`}
            onPrimary={() => show({ name: "new" })}
          />
        </>
      ) : null}
      {"taskId" in shown && openTask === null ? (
        <>
          <View className="team-work-sk sk" />
          <SkeletonRows rows={3} gap />
        </>
      ) : null}
      {shown.name === "detail" && openTask !== null ? (
        <DetailView
          task={openTask}
          people={taskPeople(openTask, members)}
          today={today}
          busy={locked}
          completing={working === "complete"}
          validInvites={
            invitesTaskId === openTask.id
              ? invites.filter((invite) => invite.status === "PENDING").length
              : null
          }
          problem={taskProblem}
          onRemove={(person) => removeMember(openTask, person)}
          onExit={(person) => confirmExit(openTask, person)}
          onAdd={() => {
            setAddedMemberIds([]);
            show(taskView("add", openTask));
          }}
          onInvite={() => openInvite(openTask)}
          onReuse={() =>
            applyTemplate(
              {
                ...openTask,
                memberIds: openTask.assignments
                  .filter(
                    (person) =>
                      person.source === "ASSIGNED" &&
                      !person.taskAttendanceOnly,
                  )
                  .map((person) => person.memberId),
                previousMemberCount: openTask.assignments.length,
              },
              taskView("detail", openTask),
            )
          }
          onEdit={() => show(taskView("edit", openTask))}
          onComplete={() => {
            void changeTaskStatus(openTask, "COMPLETED");
          }}
          onCancel={() => {
            void changeTaskStatus(openTask, "CANCELLED");
          }}
        />
      ) : null}
      {shown.name === "edit" && openTask !== null ? (
        <TeamTaskForm
          key={`edit:${openTask.id}`}
          initialValue={openTask}
          submitLabel={working === "save" ? "保存中…" : "保存修改"}
          timeNotice={null}
          workTypes={workTypes}
          busy={locked}
          problem={taskProblem}
          onSave={(details) => saveEdit(openTask, details)}
        />
      ) : null}
      {shown.name === "add" && openTask !== null ? (
        <>
          <TaskWorkerPicker
            workers={members}
            selectedIds={addedMemberIds}
            assignedIds={openTask.assignments.map((person) => person.memberId)}
            disabled={locked}
            onChange={setAddedMemberIds}
          />
          {taskProblem !== null ? (
            <Notice tone="error">{taskProblem}</Notice>
          ) : null}
          <BottomBar
            primary={
              working === "add"
                ? "添加中…"
                : addedMemberIds.length === 0
                  ? "先选人"
                  : `添加 ${addedMemberIds.length} 人`
            }
            busy={locked}
            disabled={addedMemberIds.length === 0}
            onPrimary={() => addMembers(openTask)}
          />
        </>
      ) : null}
      {shown.name === "invite" && openTask !== null ? (
        <InviteView
          realName={realName}
          phone={phone}
          issued={issued}
          invites={invitesTaskId === openTask.id ? invites : []}
          busy={busy}
          creating={working === "invite"}
          problem={taskProblem}
          onRealName={setRealName}
          onPhone={setPhone}
          onCreate={() => createInvitation(openTask)}
          onCopy={() => copyInvitation(openTask)}
          onRevoke={(invite) => revokeInvitation(openTask, invite)}
        />
      ) : null}
      {shown.name !== "list" && loadError !== null ? (
        <>
          <Notice tone="error">{loadError}</Notice>
          <Button variant="outline" onClick={refresh}>
            重新读取
          </Button>
        </>
      ) : null}
    </Screen>
  );
}
