import { Picker, Text, View } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useEffect, useRef, useState } from "react";
import { useSessionGuard } from "../../hooks/use-session-guard";

import {
  BottomBar,
  Button,
  FormArea,
  FormRow,
  Notice,
  PageHeader,
  Screen,
  Sheet,
  StateView,
} from "../../components/ui/index";
import {
  dayLabel,
  fullDateLabel,
} from "../../components/worker-records/day-view";
import {
  fetchMyProjects,
  fetchTaskAttendanceToday,
  fetchOvertimeAttendanceToday,
  submitMakeup,
} from "../../services/me";
import {
  fetchMyAttendancePlan,
  type EffectivePlan,
} from "../../services/attendance-plans";
import { chinaToday, formatChinaHm } from "../../services/time";
import type {
  AttendancePointCode,
  MyProjectMembership,
} from "../../services/me.types";
import { useSession } from "../../store/session";
import { canSubmitWorkerMakeup, makeupPlanContext } from "./form-state";
import "./index.scss";
import { errorMessage } from "../../services/error-messages";

/** 点一下去选的一行。值太长时单行省略；还没有值时显示灰色的提示。 */
const PickRow = ({
  label,
  value,
  placeholder,
  chevron,
  error,
}: {
  readonly label: string;
  readonly value?: string | null;
  readonly placeholder?: string;
  readonly chevron?: boolean;
  readonly error?: boolean;
}): JSX.Element =>
  value ? (
    <FormRow label={label} required chevron={chevron} error={error}>
      <View className="submit-makeup__value">{value}</View>
    </FormRow>
  ) : (
    <FormRow
      label={label}
      required
      placeholder={placeholder}
      chevron={chevron}
      error={error}
    />
  );

export default function SubmitMakeup(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  // 版式不分角色；只有提交之后去哪一页，工人和管理人员不一样。
  const workerAppearance = state.me?.roles.highestRoleCode === "WORKER";
  const {
    taskId,
    projectId: requestedProjectId,
    mode,
    date: requestedDate,
    pointCode: requestedPoint,
    recorded: recordedParam,
    point: pointParam,
  } = useRouter().params;
  const taskMode = Boolean(taskId) || mode === "overtime";
  // 临时任务漏打开工卡：补的是开工，日期是任务开始那天。
  const startMode = Boolean(taskId) && pointParam === "start";
  const recordedPoints = (recordedParam ?? "").split(",").filter(Boolean);
  const [projects, setProjects] = useState<
    readonly MyProjectMembership[] | null
  >(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [date, setDate] = useState<string>(() =>
    requestedDate &&
    /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) &&
    requestedDate <= chinaToday()
      ? requestedDate
      : chinaToday(),
  );
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
          const message = errorMessage(cause, "无法读取项目");
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
    const readPlan = async (): Promise<EffectivePlan | null> => {
      if (!taskId && mode !== "overtime")
        return fetchMyAttendancePlan(projectId, date);
      const task =
        mode === "overtime"
          ? await fetchOvertimeAttendanceToday(projectId)
          : await fetchTaskAttendanceToday(projectId, taskId!);
      if (startMode) {
        const start = task.points.find((row) => row.kind === "START");
        const end = task.points.find((row) => row.kind === "END");
        return {
          name: task.shiftName ?? "临时任务",
          isWorkday:
            task.isWorkday && start?.record === null && end?.record === null,
          points: start
            ? [
                {
                  code: start.pointCode,
                  label: "任务开工",
                  kind: "START",
                  time: start.scheduledTime,
                  graceMins: 0,
                },
              ]
            : [],
        };
      }
      // 任务与加班补卡只针对当天的任务记录；日期以服务端返回为准，不允许改动。
      // 日期变化会重新触发本次读取，这里返回 null 结束当前这一轮。
      if (task.attendanceDate !== date) {
        if (!cancelled) setDate(task.attendanceDate);
        return null;
      }
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
                label: mode === "overtime" ? "加班退场" : "任务完工",
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
        if (cancelled || value === null) return;
        setPlan(value);
        // 优先选未打卡的时点：显式指定 > 当天尚无有效记录的第一个 > 第一个。
        const preferred =
          value.points.find((row) => row.code === requestedPoint) ??
          value.points.find((row) => !recordedPoints.includes(row.code)) ??
          value.points[0];
        setPoint(value.isWorkday ? (preferred?.code ?? "") : "");
        setTime(preferred?.time ?? "08:00");
        setLoadedContext(makeupPlanContext(projectId, date));
      },
      (cause: unknown) => {
        if (!cancelled) {
          const message = errorMessage(cause, "无法读取当天排班");
          setError(message);
          setPlanError(message);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [projectId, date, taskId, mode, startMode, planRevision]);
  const selectPoint = (value: AttendancePointCode): void => {
    if (busyRef.current) return;
    setPoint(value);
    setTime(plan?.points.find((row) => row.code === value)?.time ?? "08:00");
  };
  const returnToMakeups = async (): Promise<void> => {
    try {
      await Taro.redirectTo({ url: "/pages/my-makeups/index?status=PENDING" });
    } catch {
      setError(
        "申请已经提交，只是没能跳到补卡记录。点“查看我的补卡”，不要重复提交。",
      );
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
      setError(errorMessage(cause, "申请未提交，请重试"));
    } finally {
      if (!saved || !workerAppearance) busyRef.current = false;
      setBusy(false);
    }
  };

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
  const today = chinaToday();
  // 这一天排了卡、能补：才有“补哪张卡”和“实际时间”可选。
  const canPick =
    planError === null &&
    currentPlan !== null &&
    currentPlan.isWorkday &&
    currentPlan.points.length > 0;
  const title = startMode
    ? "申请开工补卡"
    : taskId
      ? "申请完工补卡"
    : mode === "overtime"
      ? "申请加班补卡"
      : "申请补卡";

  return (
    <Screen header={<PageHeader title={title} />}>
      {projectError ? (
        <StateView
          kind="error"
          title="项目没读到"
          sub={projectError}
          onRetry={() => setProjectRevision((value) => value + 1)}
        />
      ) : projects === null ? (
        <StateView title="正在读取项目…" />
      ) : projects.length === 0 ? (
        <StateView
          kind="empty"
          title="还没有加入项目"
          sub="请联系管理员分配项目。"
          retryLabel="重新读取"
          onRetry={() => setProjectRevision((value) => value + 1)}
        />
      ) : (
        <>
          <View className="submit-makeup__form">
            <Sheet>
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
                <PickRow
                  label="项目"
                  value={selectedProject?.projectName}
                  placeholder="选择项目"
                  chevron={!taskId}
                />
              </Picker>
              {selectedProject?.teamName ? (
                <FormRow label="班组">
                  <View className="submit-makeup__value">
                    {selectedProject.teamName}
                  </View>
                </FormRow>
              ) : null}
              <Picker
                mode="date"
                value={date}
                end={today}
                disabled={locked || taskMode}
                onChange={(event) => {
                  if (busyRef.current || event.detail.value === date) return;
                  setLoadedContext(null);
                  setPlan(null);
                  setPoint("");
                  setDate(event.detail.value);
                }}
              >
                <PickRow
                  label="日期"
                  value={
                    date.slice(0, 4) === today.slice(0, 4)
                      ? dayLabel(date)
                      : fullDateLabel(date)
                  }
                  chevron={!taskMode}
                />
              </Picker>
              {canPick ? (
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
                    <PickRow
                      label="补哪张卡"
                      value={
                        selectedPoint
                          ? `${selectedPoint.label}（计划 ${selectedPoint.time}）`
                          : null
                      }
                      placeholder="选择要补的卡"
                      chevron
                    />
                  </Picker>
                  <Picker
                    mode="time"
                    value={time}
                    end={
                      date === today
                        ? formatChinaHm(new Date().toISOString())
                        : undefined
                    }
                    disabled={locked}
                    onChange={(event) => {
                      if (!busyRef.current) setTime(event.detail.value);
                    }}
                  >
                    <FormRow
                      label={
                        startMode
                          ? "实际开工时间"
                          : taskId
                            ? "实际完工时间"
                            : "实际时间"
                      }
                      required
                      chevron
                    >
                      <Text className="num submit-makeup__time">{time}</Text>
                    </FormRow>
                  </Picker>
                </>
              ) : (
                <PickRow
                  label="补哪张卡"
                  placeholder={
                    planError
                      ? "当天排班没读到"
                      : currentPlan === null
                        ? "正在读取当天排班…"
                        : "当天没有可补的卡"
                  }
                  error={planError !== null}
                />
              )}
              <FormArea
                label="申请原因"
                required
                value={reason}
                disabled={locked}
                maxLength={500}
                placeholder={
                  startMode
                    ? "说明什么时候到场开工、为什么没打卡"
                    : taskId
                      ? "说明没打完工卡的实际情况"
                      : "说明漏打卡的实际情况"
                }
                onInput={(value) => {
                  if (!busyRef.current) setReason(value);
                }}
              />
            </Sheet>
          </View>
          {planError ? (
            <>
              <Notice tone="error">
                当天排班没读到
                <View className="ui-notice__sub">{planError}</View>
              </Notice>
              <Button
                variant="outline"
                onClick={() => setPlanRevision((value) => value + 1)}
              >
                重新读取排班
              </Button>
            </>
          ) : currentPlan !== null && !canPick ? (
            <Notice tone="warning">
              {startMode
                ? "这个任务已经有开工记录或已经结束，不能补开工卡。"
                : taskId
                ? "这个任务不是已开工、还没完工的状态，不能补完工卡。"
                : mode === "overtime"
                  ? "今天没有已进场、还没退场的加班，不能补加班卡。"
                  : "这一天没有安排可以补的卡，换个项目或日期看看。"}
            </Notice>
          ) : null}
          <Notice>
            {startMode
              ? "开工时间要在任务的计划时间内。审批通过后记下开工，完工还要另外打卡或补卡。"
              : taskId
              ? "实际完工时间要晚于开工，间隔不超过 24 小时。审批通过后计工。"
              : "提交后由班组长审批，通过后考勤会重新计算。"}
          </Notice>
          {error && error !== planError && error !== projectError ? (
            <Notice tone="error">{error}</Notice>
          ) : submitted ? (
            <Notice tone="success">申请已提交，等待审批。</Notice>
          ) : null}
          {submitted ? (
            <BottomBar
              primary="查看我的补卡"
              busy={busy}
              onPrimary={() => {
                void returnToMakeups();
              }}
            />
          ) : (
            <BottomBar
              primary={busy ? "提交中" : "提交申请"}
              busy={busy}
              disabled={!workerCanSubmit}
              onPrimary={() => {
                void submit();
              }}
            />
          )}
        </>
      )}
    </Screen>
  );
}
