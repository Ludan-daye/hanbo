import { Picker, Textarea, View } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useEffect, useRef, useState } from "react";
import { useSessionGuard } from "../../hooks/use-session-guard";

import {
  Button,
  ListItem,
  Notice,
  PageHeader,
  Screen,
  Section,
  Segmented,
  StateView,
} from "../../components/ui/index";
import {
  fetchMyProjects,
  fetchTaskAttendanceToday,
  submitMakeup,
} from "../../services/me";
import {
  fetchMyAttendancePlan,
  type EffectivePlan,
} from "../../services/attendance-plans";
import { chinaToday } from "../../services/time";
import type {
  AttendancePointCode,
  MyProjectMembership,
} from "../../services/me.types";
import { useSession } from "../../store/session";
import { FlowScreen } from "../../components/worker-flow";
import { canSubmitWorkerMakeup, makeupPlanContext } from "./form-state";
import "./index.scss";

export default function SubmitMakeup(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  const workerAppearance = state.me?.roles.highestRoleCode === "WORKER";
  const { taskId, projectId: requestedProjectId } = useRouter().params;
  const [projects, setProjects] = useState<
    readonly MyProjectMembership[] | null
  >(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [date, setDate] = useState<string>(chinaToday());
  const [time, setTime] = useState<string>("08:00");
  const [point, setPoint] = useState<AttendancePointCode>("");
  const [plan, setPlan] = useState<EffectivePlan | null>(null);
  const [reason, setReason] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [projectRevision, setProjectRevision] = useState(0);
  const [planRevision, setPlanRevision] = useState(0);
  const [loadedContext, setLoadedContext] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const busyRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    setProjectError(null);
    void fetchMyProjects().then(
      (rows) => {
        if (!cancelled) {
          setProjects(rows);
          setProjectId(
            rows.find((row) => row.projectId === requestedProjectId)
              ?.projectId ??
              rows[0]?.projectId ??
              null,
          );
        }
      },
      (cause) => {
        if (!cancelled) {
          const message =
            cause instanceof Error ? cause.message : "无法读取项目";
          setError(message);
          setProjectError(message);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [projectRevision, requestedProjectId]);
  useEffect(() => {
    if (projectId === null) return;
    let cancelled = false;
    setPlan(null);
    setPoint("");
    setError(null);
    setPlanError(null);
    setLoadedContext(null);
    const readPlan = async (): Promise<EffectivePlan> => {
      if (!taskId) return fetchMyAttendancePlan(projectId, date);
      const task = await fetchTaskAttendanceToday(projectId, taskId);
      const end = task.points.find((row) => row.kind === "END");
      return {
        name: task.shiftName ?? "临时任务",
        isWorkday:
          task.isWorkday &&
          task.points.some(
            (row) => row.kind === "START" && row.record !== null,
          ) &&
          end?.record === null,
        points: end
          ? [
              {
                code: end.pointCode,
                label: "任务完工",
                kind: "END",
                time: end.scheduledTime,
                graceMins: 0,
              },
            ]
          : [],
      };
    };
    void readPlan().then(
      (value) => {
        if (cancelled) return;
        setPlan(value);
        setPoint(value.isWorkday ? (value.points[0]?.code ?? "") : "");
        setTime(value.points[0]?.time ?? "08:00");
        setLoadedContext(makeupPlanContext(projectId, date));
      },
      (cause: unknown) => {
        if (!cancelled) {
          const message =
            cause instanceof Error ? cause.message : "无法读取当天排班";
          setError(message);
          setPlanError(message);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [projectId, date, taskId, planRevision]);
  const selectPoint = (value: AttendancePointCode): void => {
    if (busyRef.current) return;
    setPoint(value);
    setTime(plan?.points.find((row) => row.code === value)?.time ?? "08:00");
  };
  const returnToMakeups = async (): Promise<void> => {
    try {
      await Taro.redirectTo({ url: "/pages/my-makeups/index?status=PENDING" });
    } catch {
      setError("申请已提交，返回失败。点击“查看我的补卡”，勿重复提交。");
    }
  };
  const workerCanSubmit = canSubmitWorkerMakeup({
    projectId,
    date,
    loadedContext,
    plan,
    point,
    reason,
    busy,
    submitted,
  });
  const submit = async (): Promise<void> => {
    if (
      projectId === null ||
      !plan?.isWorkday ||
      !point ||
      reason.trim().length === 0 ||
      busy ||
      busyRef.current ||
      (workerAppearance && !workerCanSubmit)
    )
      return;
    const requestedOccurredAt = `${date}T${time}:00+08:00`;
    if (new Date(requestedOccurredAt).getTime() > Date.now()) {
      setError("不能申请未来时间的补卡，请检查日期和时间。");
      return;
    }
    busyRef.current = true;
    let saved = false;
    setBusy(true);
    setError(null);
    try {
      await submitMakeup(projectId, {
        attendanceDate: date,
        pointCode: point,
        reason: reason.trim(),
        requestedOccurredAt,
      });
      saved = true;
      if (workerAppearance) {
        setSubmitted(true);
        void Taro.showToast({ icon: "success", title: "申请已提交" }).catch(
          () => {},
        );
        await returnToMakeups();
      } else {
        await Taro.showToast({ icon: "success", title: "申请已提交" });
        if (Taro.getCurrentPages().length > 1) await Taro.navigateBack();
        else await Taro.redirectTo({ url: "/pages/my-makeups/index" });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "申请未提交，请重试");
    } finally {
      if (!saved || !workerAppearance) busyRef.current = false;
      setBusy(false);
    }
  };
  if (workerAppearance) {
    const projectIndex =
      projects?.findIndex((row) => row.projectId === projectId) ?? -1;
    const selectedProject = projectIndex >= 0 ? projects?.[projectIndex] : null;
    const currentPlan =
      loadedContext === makeupPlanContext(projectId, date) ? plan : null;
    const pointIndex =
      currentPlan?.points.findIndex((row) => row.code === point) ?? -1;
    const selectedPoint =
      pointIndex >= 0 ? currentPlan?.points[pointIndex] : null;
    const locked = busy || submitted;
    return (
      <FlowScreen title={taskId ? "申请完工补卡" : "申请补卡"}>
        <View className="worker-makeup-form">
          {taskId && (
            <View className="worker-makeup-form__hint">
              实际完工须晚于开工，间隔不超过 24 小时。审批后计工。
            </View>
          )}
          {projectError ? (
            <StateView
              title="项目加载失败"
              sub={projectError}
              onRetry={() => setProjectRevision((value) => value + 1)}
            />
          ) : projects === null ? (
            <StateView title="正在读取项目…" />
          ) : projects.length === 0 ? (
            <StateView
              title="还没有加入项目"
              sub="请联系管理员分配项目。"
              onRetry={() => setProjectRevision((value) => value + 1)}
            />
          ) : (
            <>
              <Picker
                mode="selector"
                range={projects.map((row) => row.projectName)}
                value={Math.max(0, projectIndex)}
                disabled={locked || Boolean(taskId)}
                onChange={(event) => {
                  if (busyRef.current || taskId) return;
                  const selected = projects[Number(event.detail.value)];
                  if (!selected || selected.projectId === projectId) return;
                  setLoadedContext(null);
                  setPlan(null);
                  setPoint("");
                  setProjectId(selected.projectId);
                }}
              >
                <View
                  className="worker-makeup-form__field"
                  data-makeup-field="project"
                >
                  <View className="worker-makeup-form__label">项目</View>
                  <View className="worker-makeup-form__value-row">
                    <View>{selectedProject?.projectName ?? "选择项目"}</View>
                    {!taskId && (
                      <View className="worker-makeup-form__change">选择</View>
                    )}
                  </View>
                  {selectedProject?.teamName ? (
                    <View className="worker-makeup-form__hint">
                      {selectedProject.teamName}
                    </View>
                  ) : null}
                </View>
              </Picker>
              <Picker
                mode="date"
                value={date}
                end={chinaToday()}
                disabled={locked}
                onChange={(event) => {
                  if (busyRef.current || event.detail.value === date) return;
                  setLoadedContext(null);
                  setPlan(null);
                  setPoint("");
                  setDate(event.detail.value);
                }}
              >
                <View
                  className="worker-makeup-form__field"
                  data-makeup-field="date"
                >
                  <View className="worker-makeup-form__label">日期</View>
                  <View className="worker-makeup-form__value-row">
                    <View>{date}</View>
                    <View className="worker-makeup-form__change">选择</View>
                  </View>
                </View>
              </Picker>
              {planError ? (
                <StateView
                  title="当天排班读取失败"
                  sub={planError}
                  onRetry={() => setPlanRevision((value) => value + 1)}
                />
              ) : currentPlan === null ? (
                <StateView title="正在读取当天排班…" />
              ) : !currentPlan.isWorkday || currentPlan.points.length === 0 ? (
                <Notice>
                  {taskId
                    ? "该任务不属于已开工、未完工状态，不能补完工。"
                    : "当天没有安排可补卡的时点，请确认项目和日期。"}
                </Notice>
              ) : (
                <>
                  <Picker
                    mode="selector"
                    range={currentPlan.points.map(
                      (row) => `${row.label}（计划 ${row.time}）`,
                    )}
                    value={Math.max(0, pointIndex)}
                    disabled={locked}
                    onChange={(event) => {
                      const selected =
                        currentPlan.points[Number(event.detail.value)];
                      if (selected) selectPoint(selected.code);
                    }}
                  >
                    <View
                      className="worker-makeup-form__field"
                      data-makeup-field="point"
                    >
                      <View className="worker-makeup-form__label">时点</View>
                      <View className="worker-makeup-form__value-row">
                        <View>
                          {selectedPoint
                            ? `${selectedPoint.label}（计划 ${selectedPoint.time}）`
                            : "选择时点"}
                        </View>
                        <View className="worker-makeup-form__change">选择</View>
                      </View>
                      <View className="worker-makeup-form__hint">
                        按当天实际安排选择。
                      </View>
                    </View>
                  </Picker>
                  <Picker
                    mode="time"
                    value={time}
                    disabled={locked}
                    onChange={(event) => {
                      if (!busyRef.current) setTime(event.detail.value);
                    }}
                  >
                    <View
                      className="worker-makeup-form__field"
                      data-makeup-field="time"
                    >
                      <View className="worker-makeup-form__label">
                        {taskId ? "实际完工时间" : "实际时间"}
                      </View>
                      <View className="worker-makeup-form__value-row">
                        <View>{time}</View>
                        <View className="worker-makeup-form__change">选择</View>
                      </View>
                    </View>
                  </Picker>
                </>
              )}
              <View className="worker-makeup-form__reason">
                <View className="worker-makeup-form__label">申请原因</View>
                <Textarea
                  className="worker-makeup-form__textarea"
                  value={reason}
                  disabled={locked}
                  maxlength={500}
                  placeholder="请描述漏打卡的实际情况。"
                  onInput={(event) => {
                    if (!busyRef.current) setReason(event.detail.value);
                  }}
                />
                <View className="worker-makeup-form__count">
                  {reason.length}/500
                </View>
              </View>
              {error && error !== planError && error !== projectError ? (
                <Notice>{error}</Notice>
              ) : null}
              {submitted ? (
                <>
                  <Notice>申请已提交，待审批。</Notice>
                  <Button
                    loading={busy}
                    onClick={() => {
                      void returnToMakeups();
                    }}
                  >
                    查看我的补卡
                  </Button>
                </>
              ) : (
                <Button
                  loading={busy}
                  disabled={!workerCanSubmit}
                  onClick={() => {
                    void submit();
                  }}
                >
                  提交申请
                </Button>
              )}
            </>
          )}
        </View>
      </FlowScreen>
    );
  }
  return (
    <Screen>
      <PageHeader title="发起补卡" />
      <Notice>
        {taskId
          ? "实际完工须晚于开工，间隔不超过 24 小时。审批后计工。"
          : "按实际出勤填写，班组长审批。"}
      </Notice>
      {projects === null && error === null ? (
        <StateView title="加载中…" />
      ) : null}
      {projects?.length === 0 ? (
        <StateView title="还没有加入项目" sub="请先联系管理员分配项目。" />
      ) : null}
      {(projects ?? [])
        .filter(
          (project) => !taskId || project.projectId === requestedProjectId,
        )
        .map((project) => (
          <ListItem
            key={project.projectId}
            primary={project.projectName}
            secondary={project.teamName ?? "未分配班组"}
            chip={projectId === project.projectId ? "已选择" : undefined}
            onClick={() => {
              if (!busy) setProjectId(project.projectId);
            }}
          />
        ))}
      {projectId ? (
        <View>
          {plan && !plan.isWorkday ? (
            <Notice>
              {taskId
                ? "该任务不属于已开工、未完工状态，不能补完工。"
                : "当天没有安排打卡，不能申请补卡。"}
            </Notice>
          ) : null}
          <Section title="补卡时段">
            <Segmented
              options={(plan?.points ?? []).map((row) => ({
                label: row.label,
                value: row.code,
              }))}
              value={point}
              onChange={selectPoint}
            />
          </Section>
          <View className="form-card">
            <Picker
              disabled={busy ? true : undefined}
              mode="date"
              value={date}
              end={chinaToday()}
              onChange={(event) => {
                setDate(event.detail.value);
              }}
            >
              <ListItem primary="补卡日期" secondary={date} />
            </Picker>
            <Picker
              disabled={busy ? true : undefined}
              mode="time"
              value={time}
              onChange={(event) => {
                setTime(event.detail.value);
              }}
            >
              <ListItem primary="实际打卡时间" secondary={time} />
            </Picker>
          </View>
          <Section title="补卡原因" sub="填写缺卡原因">
            <Textarea
              className="reason-textarea"
              value={reason}
              disabled={busy ? true : undefined}
              maxlength={500}
              placeholder="如：现场搬运材料，未及时打卡。"
              onInput={(event) => {
                setReason(event.detail.value);
              }}
            />
            <View className="text-count">{reason.length} / 500</View>
          </Section>
          <Button
            loading={busy}
            disabled={!plan?.isWorkday || !point || reason.trim().length === 0}
            onClick={() => {
              void submit();
            }}
          >
            提交补卡申请
          </Button>
        </View>
      ) : null}
      {error ? <Notice>{error}</Notice> : null}
    </Screen>
  );
}
