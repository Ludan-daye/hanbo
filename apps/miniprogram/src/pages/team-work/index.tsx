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
  Button,
  Field,
  ListItem,
  Notice,
  PageHeader,
  Screen,
  Section,
  StateView,
  Subtitle,
} from "../../components/ui/index";
import {
  TaskDetails,
  taskStatusLabel,
  WorkDate,
  workTimestamp,
} from "../../components/team-work-fields";
import { useSessionGuard } from "../../hooks/use-session-guard";
import { useManagedTeamId } from "../../hooks/use-management-scope";
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

export default function TeamWork(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  const teamId = useManagedTeamId(state.me);
  const { revision, refresh } = usePageRefresh();
  const [date, setDate] = useState<string>(chinaToday());
  const [tasks, setTasks] = useState<readonly TeamTask[] | null>(null);
  const [members, setMembers] = useState<readonly TeamTaskWorker[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const [defaults, setDefaults] = useState<TeamTaskDefaults | null>(null);
  const [draft, setDraft] = useState<TeamTaskDetails | null>(null);
  const [draftKey, setDraftKey] = useState<number>(0);
  const [timeNotice, setTimeNotice] = useState<string | null>(null);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState<boolean>(false);
  const [picking, setPicking] = useState<boolean>(false);
  const [inviteAfterSave, setInviteAfterSave] = useState<boolean>(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [moreTaskId, setMoreTaskId] = useState<string | null>(null);
  const [creating, setCreating] = useState<boolean>(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [addingTaskId, setAddingTaskId] = useState<string | null>(null);
  const [addedMemberIds, setAddedMemberIds] = useState<readonly string[]>([]);
  const [taskId, setTaskId] = useState<string | null>(null);
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
        if (active)
          setError(cause instanceof Error ? cause.message : "读取工作安排失败");
      },
    );
    return () => {
      active = false;
    };
  }, [teamId, date, revision]);
  const resetView = (): void => {
    setCreating(false);
    setEditingTaskId(null);
    setAddingTaskId(null);
    setAddedMemberIds([]);
    setTaskId(null);
    setIssued(null);
    setSelected([]);
    setExpandedId(null);
    setMoreTaskId(null);
    setShowTemplates(false);
  };
  useEffect(resetView, [teamId]);
  const workTypes: readonly string[] = [
    ...new Set(
      [
        defaults?.workType ?? "",
        ...(members?.map((member) => member.workType) ?? []),
      ].filter(Boolean),
    ),
  ];
  const applyTemplate = (template: TeamTaskTemplate): void => {
    if (members === null || busy) return;
    const copied = reuseTaskTemplate(template, date, members);
    setDraft(copied.details);
    setSelected(copied.memberIds);
    setDraftKey((value) => value + 1);
    setTimeNotice(null);
    setCopyNotice(
      copied.omittedCount > 0
        ? `${copied.omittedCount} 人未带入（临时工或已离场），请重新选择或邀请。`
        : null,
    );
    setShowTemplates(false);
    setCreating(true);
    setPicking(false);
    setInviteAfterSave(false);
  };
  const perform = async (action: () => Promise<void>): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "操作失败，请重试");
    } finally {
      setBusy(false);
    }
  };
  const changeTaskStatus = (
    task: TeamTask,
    status: "COMPLETED" | "CANCELLED",
  ): Promise<void> =>
    perform(async () => {
      const result = await Taro.showModal({
        title: status === "COMPLETED" ? "确认任务完成" : "取消任务",
        content: "未使用邀请码将失效，考勤记录保留。",
      });
      if (!result.confirm) return;
      await closeTeamTask(task.teamId, task.id, status);
      setMoreTaskId(null);
      setTaskId(null);
      setIssued(null);
      setEditingTaskId(null);
      setAddingTaskId(null);
      refresh();
    });
  if (teamId === null)
    return (
      <Screen>
        <PageHeader title="工作安排" />
        <StateView title="请先选择负责的班组" />
      </Screen>
    );
  return (
    <Screen>
      <PageHeader title="工作安排" />
      <WorkDate
        value={date}
        onChange={(value) => {
          resetView();
          setDate(value);
        }}
      />
      {error && <Notice>{error}</Notice>}
      <Button
        disabled={busy || defaults === null || members === null}
        onClick={() => {
          if (creating) {
            setCreating(false);
            return;
          }
          if (defaults === null) return;
          void perform(async () => {
            setDraft(newTaskDetails(date, defaults));
            setSelected([]);
            setPicking(false);
            setDraftKey((value) => value + 1);
            setCopyNotice(null);
            setInviteAfterSave(false);
            setTimeNotice(
              defaults.isWorkday ? null : "休息日，请确认安排时间。",
            );
            setShowTemplates(false);
            setCreating(true);
          });
        }}
      >
        {creating ? "收起" : "＋ 新建安排"}
      </Button>
      <Button
        variant="outline"
        disabled={busy || members === null}
        onClick={() => {
          setShowTemplates(!showTemplates);
        }}
      >
        套用模板
      </Button>
      {showTemplates && (
        <TeamTaskTemplates
          teamId={teamId}
          disabled={busy}
          onSelect={applyTemplate}
          onClose={() => setShowTemplates(false)}
        />
      )}
      {creating && draft && !showTemplates && (
        <Section title="新建安排">
          {copyNotice && <Notice>{copyNotice}</Notice>}
          <TeamTaskForm
            key={draftKey}
            initialValue={draft}
            busy={busy || members === null}
            submitLabel={inviteAfterSave ? "发布并邀请临时工" : "发布安排"}
            timeNotice={timeNotice}
            workTypes={workTypes}
            onSave={(details) =>
              perform(async () => {
                const saved = await createTeamTask(teamId, {
                  ...details,
                  memberIds: selected,
                });
                setCreating(false);
                setSelected([]);
                setDate(taskChinaParts(saved.startsAt)[0]);
                setExpandedId(saved.id);
                setMoreTaskId(null);
                if (inviteAfterSave) {
                  setTaskId(saved.id);
                  setIssued(null);
                  setInvites([]);
                  setRealName("");
                  setPhone("");
                }
                refresh();
                await Taro.showToast({ title: "安排已发布", icon: "success" });
              })
            }
          >
            <ListItem
              primary="安排人员"
              secondary={
                selected.length > 0
                  ? members
                      ?.filter((person) => selected.includes(person.memberId))
                      .map((person) => person.name)
                      .join("、")
                  : undefined
              }
              chip={selected.length > 0 ? `已选 ${selected.length} 人` : "选择"}
              onClick={() => setPicking(!picking)}
            />
            {picking && (
              <>
                <TaskWorkerPicker
                  workers={members}
                  selectedIds={selected}
                  assignedIds={[]}
                  disabled={busy}
                  onChange={setSelected}
                />
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setInviteAfterSave(true);
                    setPicking(false);
                  }}
                >
                  邀请临时工
                </Button>
                <Button variant="outline" onClick={() => setPicking(false)}>
                  确定 · {selected.length} 人
                </Button>
              </>
            )}
            {inviteAfterSave && (
              <ListItem
                primary="临时工邀请"
                chip="取消邀请"
                onClick={() => setInviteAfterSave(false)}
              />
            )}
          </TeamTaskForm>
        </Section>
      )}
      {!creating &&
        !showTemplates &&
        (tasks === null ? (
          <StateView
            title={error ? "工作安排加载失败" : "正在读取工作安排…"}
            onRetry={refresh}
          />
        ) : tasks.length === 0 ? (
          <StateView title="暂无工作安排" />
        ) : (
          tasks.map((task) => (
            <View key={task.id} className="ui-section">
              <ListItem
                primary={task.title}
                secondary={`${workTimestamp(task.startsAt)} — ${workTimestamp(task.endsAt)} · ${task.assignments.length} 人`}
                chip={taskStatusLabel(task.status)}
                onClick={() =>
                  setExpandedId(expandedId === task.id ? null : task.id)
                }
              />
              {expandedId === task.id && (
                <>
                  <TaskDetails task={task} />
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      applyTemplate({
                        ...task,
                        memberIds: task.assignments
                          .filter(
                            (person) =>
                              person.source === "ASSIGNED" &&
                              !person.taskAttendanceOnly,
                          )
                          .map((person) => person.memberId),
                        previousMemberCount: task.assignments.length,
                      })
                    }
                  >
                    套用此安排
                  </Button>
                  {task.status === "OPEN" && (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        setMoreTaskId(moreTaskId === task.id ? null : task.id)
                      }
                    >
                      {moreTaskId === task.id ? "收起操作" : "更多操作"}
                    </Button>
                  )}
                  {moreTaskId === task.id &&
                    task.status === "OPEN" &&
                    !task.assignments.some((person) => person.startedAt) && (
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          setEditingTaskId(
                            editingTaskId === task.id ? null : task.id,
                          )
                        }
                      >
                        {editingTaskId === task.id
                          ? "收起修改"
                          : "修改工作安排"}
                      </Button>
                    )}
                  {editingTaskId === task.id && (
                    <TeamTaskForm
                      initialValue={task}
                      submitLabel="保存修改"
                      timeNotice={null}
                      workTypes={workTypes}
                      busy={busy}
                      onSave={(details) =>
                        perform(async () => {
                          const result = await Taro.showModal({
                            title: "保存修改",
                            content:
                              "更新已加入人员的安排，作废未使用邀请码。",
                          });
                          if (!result.confirm) return;
                          await updateTeamTask(teamId, task.id, details);
                          setEditingTaskId(null);
                          refresh();
                        })
                      }
                    />
                  )}
                  {moreTaskId === task.id &&
                    task.status === "OPEN" &&
                    task.assignments
                      .filter((person) => !person.startedAt)
                      .map((person) => (
                        <ListItem
                          key={`remove:${person.memberId}`}
                          primary={person.name}
                          secondary="尚未开工"
                          chip="撤下人员"
                          onClick={() => {
                            void perform(async () => {
                              const result = await Taro.showModal({
                                title: `撤下 ${person.name}`,
                                content:
                                  "取消本次安排，保留档案和项目身份。",
                              });
                              if (!result.confirm) return;
                              await removeTeamTaskMember(
                                teamId,
                                task.id,
                                person.memberId,
                              );
                              refresh();
                            });
                          }}
                        />
                      ))}

                  <Subtitle>
                    已安排：
                    {task.assignments
                      .map(
                        (assignment) =>
                          `${assignment.name}${assignment.source === "TEMPORARY_INVITE" ? "（临时）" : ""}`,
                      )
                      .join("、") || "暂无人员"}
                  </Subtitle>
                  {task.status === "OPEN" && (
                    <>
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          setAddingTaskId(
                            addingTaskId === task.id ? null : task.id,
                          );
                          setAddedMemberIds([]);
                        }}
                      >
                        {addingTaskId === task.id
                          ? "收起人员选择"
                          : "选择本班人员"}
                      </Button>
                      {addingTaskId === task.id && (
                        <>
                          <TaskWorkerPicker
                            workers={members}
                            selectedIds={addedMemberIds}
                            assignedIds={task.assignments.map(
                              (person) => person.memberId,
                            )}
                            disabled={busy}
                            onChange={setAddedMemberIds}
                          />
                          <Button
                            loading={busy}
                            disabled={addedMemberIds.length === 0}
                            onClick={() => {
                              void perform(async () => {
                                await addTeamTaskMembers(
                                  teamId,
                                  task.id,
                                  addedMemberIds,
                                );
                                setAddingTaskId(null);
                                setAddedMemberIds([]);
                                refresh();
                                await Taro.showToast({
                                  title: "人员已安排",
                                  icon: "success",
                                });
                              });
                            }}
                          >
                            确认安排 {addedMemberIds.length} 人
                          </Button>
                        </>
                      )}
                    </>
                  )}
                  {task.assignments
                    .filter((person) => person.taskAttendanceOnly)
                    .map((person) => (
                      <ListItem
                        key={person.memberId}
                        primary={person.name}
                        secondary={
                          person.finishedAt
                            ? `实际用工 ${person.workedMinutes ?? 0} 分钟`
                            : person.startedAt
                              ? "已开工，等待完工打卡"
                              : "尚未开工"
                        }
                        chip={
                          person.exitConfirmedAt
                            ? "已退场"
                            : person.finishedAt
                              ? "确认退场"
                              : "计时用工"
                        }
                        onClick={
                          !person.finishedAt || person.exitConfirmedAt
                            ? undefined
                            : () => {
                                void perform(async () => {
                                  const result = await Taro.showModal({
                                    title: `确认 ${person.name} 退场`,
                                    content:
                                      "退出本项目，保留档案；未完成任务须先结束。",
                                  });
                                  if (result.confirm) {
                                    await confirmTaskExit(
                                      teamId,
                                      task.id,
                                      person.memberId,
                                    );
                                    refresh();
                                  }
                                });
                              }
                        }
                      />
                    ))}
                  {task.status === "OPEN" && (
                    <>
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          void perform(async () => {
                            setInvites(
                              await fetchTaskInvitations(teamId, task.id),
                            );
                            setTaskId(task.id);
                            setIssued(null);
                          });
                        }}
                      >
                        邀请临时工 / 管理邀请码
                      </Button>
                      {moreTaskId === task.id && (
                        <>
                          <Button
                            variant="outline"
                            disabled={busy}
                            onClick={() => {
                              void changeTaskStatus(task, "COMPLETED");
                            }}
                          >
                            确认已完成
                          </Button>
                          <Button
                            variant="danger"
                            disabled={busy}
                            onClick={() => {
                              void changeTaskStatus(task, "CANCELLED");
                            }}
                          >
                            取消任务
                          </Button>
                        </>
                      )}
                    </>
                  )}
                  {taskId === task.id && (
                    <>
                      <Field
                        label="临时工真实姓名"
                        value={realName}
                        onInput={setRealName}
                        placeholder="与本人登记姓名一致"
                      />
                      <Field
                        label="手机号"
                        value={phone}
                        onInput={setPhone}
                        type="number"
                        maxLength={11}
                        placeholder="11 位手机号"
                      />
                      <Button
                        loading={busy}
                        onClick={() => {
                          void perform(async () => {
                            if (
                              !realName.trim() ||
                              !/^1[3-9]\d{9}$/.test(phone)
                            )
                              throw new Error("请填写真实姓名和有效手机号。");
                            const result = await createTaskInvitation(
                              teamId,
                              task.id,
                              { realName: realName.trim(), phone },
                            );
                            setIssued(result);
                            setInvites(
                              await fetchTaskInvitations(teamId, task.id),
                            );
                          });
                        }}
                      >
                        生成六位邀请码
                      </Button>
                      {issued && (
                        <Section
                          title="邀请码已生成"
                          sub={`有效至 ${workTimestamp(issued.expiresAt)}，仅供 ${issued.name} 本人使用`}
                        >
                          <ListItem
                            primary={issued.code}
                            chip="复制"
                            onClick={() => {
                              void perform(async () => {
                                await Taro.setClipboardData({
                                  data: `${task.projectName} · ${task.teamName}\n${task.title}\n临时工邀请码：${issued.code}\n有效至 ${workTimestamp(issued.expiresAt)}\n请微信登录后输入邀请码，完成资料和底照登记。`,
                                });
                              });
                            }}
                          />
                          <Subtitle>
                            离开后不显示完整邀请码，请及时复制。
                          </Subtitle>
                        </Section>
                      )}
                      {invites.map((invite) => (
                        <ListItem
                          key={invite.id}
                          primary={`${invite.name} · ${invite.phoneMasked}`}
                          secondary={`有效至 ${workTimestamp(invite.expiresAt)}`}
                          chip={
                            {
                              PENDING: "作废邀请",
                              ACCEPTED: "已加入",
                              EXPIRED: "已过期",
                              REVOKED: "已作废",
                            }[invite.status]
                          }
                          onClick={
                            invite.status !== "PENDING"
                              ? undefined
                              : () => {
                                  void perform(async () => {
                                    await revokeTaskInvitation(
                                      teamId,
                                      task.id,
                                      invite.id,
                                    );
                                    setInvites(
                                      await fetchTaskInvitations(
                                        teamId,
                                        task.id,
                                      ),
                                    );
                                    if (issued?.id === invite.id)
                                      setIssued(null);
                                  });
                                }
                          }
                        />
                      ))}
                    </>
                  )}
                </>
              )}
            </View>
          ))
        ))}
    </Screen>
  );
}
