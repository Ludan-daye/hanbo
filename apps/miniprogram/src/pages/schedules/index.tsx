import { Picker, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useRef, useState } from "react";
import {
  defaultAttendancePoints,
  validateAttendancePoints,
  type ScheduledAttendancePoint,
} from "@construction/domain/attendance.js";
import {
  Button,
  Field,
  Notice,
  Section,
  ListItem,
  PageHeader,
  Screen,
  StateView,
} from "../../components/ui/index";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { useSessionGuard } from "../../hooks/use-session-guard";
import {
  fetchPlanScopes,
  fetchPlanConfiguration,
  savePlanConfiguration,
  inheritPlanConfiguration,
  type PlanScope,
  type PlanConfiguration,
  type PlanInput,
} from "../../services/attendance-plans";
import { chinaToday } from "../../services/time";

const tomorrow = (): string =>
  new Date(Date.parse(`${chinaToday()}T00:00:00Z`) + 86400_000)
    .toISOString()
    .slice(0, 10);
const KINDS = [
  { value: "START", label: "上班" },
  { value: "END", label: "下班" },
  { value: "CHECKPOINT", label: "中途签到" },
] as const;
const weekdays = ["一", "二", "三", "四", "五", "六", "日"];

export default function Schedules(): JSX.Element {
  useSessionGuard();
  const requestedProject = Taro.useRouter().params.projectId;
  const { revision, refresh } = usePageRefresh();
  const [scopes, setScopes] = useState<readonly PlanScope[] | null>(null);
  const [scopeIndex, setScopeIndex] = useState<number>(0);
  const scope = scopes?.[scopeIndex] ?? null;
  const [configuration, setConfiguration] = useState<PlanConfiguration | null>(
    null,
  );
  const [name, setName] = useState<string>("每日两次");
  const [points, setPoints] = useState<readonly ScheduledAttendancePoint[]>(
    defaultAttendancePoints,
  );
  const [startsOn, setStartsOn] = useState<string>(tomorrow());
  const [endsOn, setEndsOn] = useState<string | null>(null);
  const [workdays, setWorkdays] = useState<readonly number[]>([
    1, 2, 3, 4, 5, 6, 7,
  ]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const operation = useRef<boolean>(false);
  useEffect(() => {
    let cancelled = false;
    setError(null);
    void fetchPlanScopes().then(
      (rows) => {
        if (!cancelled)
          setScopes(
            requestedProject
              ? rows.filter((row) => row.projectId === requestedProject)
              : rows,
          );
      },
      (cause: unknown) => {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : "无法读取排班对象");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [requestedProject, revision]);
  useEffect(() => {
    if (scope === null) return;
    let cancelled = false;
    setConfiguration(null);
    setError(null);
    setSaved(null);
    void fetchPlanConfiguration(scope).then(
      (config) => {
        if (cancelled) return;
        setConfiguration(config);
        setName(config.name);
        setPoints(config.points);
        setStartsOn(
          config.startsOn > tomorrow() ? config.startsOn : tomorrow(),
        );
        setEndsOn(
          config.endsOn !== null && config.endsOn < tomorrow()
            ? null
            : config.endsOn,
        );
        setWorkdays(config.workdays);
      },
      (cause: unknown) => {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : "无法读取排班");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [scope, revision]);
  const updatePoint = (
    code: string,
    values: Partial<ScheduledAttendancePoint>,
  ): void => {
    setPoints((rows) =>
      rows.map((row) => (row.code === code ? { ...row, ...values } : row)),
    );
    setSaved(null);
  };
  const addPoint = (): void => {
    const before = points[points.length - 2];
    const last = points[points.length - 1];
    if (!before || !last) return;
    const minutes = (value: string): number =>
      Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
    const middle = Math.floor((minutes(before.time) + minutes(last.time)) / 2);
    if (middle <= minutes(before.time)) {
      setError("请先调整打卡时间，为新打卡点留出时间。");
      return;
    }
    const point: ScheduledAttendancePoint = {
      code: `POINT_${Date.now()}_${points.length}`,
      label: "中途签到",
      kind: "CHECKPOINT",
      time: `${String(Math.floor(middle / 60)).padStart(2, "0")}:${String(middle % 60).padStart(2, "0")}`,
      graceMins: 0,
    };
    setPoints([...points.slice(0, -1), point, last]);
    setSaved(null);
  };
  const input = (): PlanInput => ({
    expectedId: configuration?.id ?? null,
    name: name.trim(),
    points,
    startsOn,
    endsOn,
    workdays,
  });
  const save = async (): Promise<void> => {
    if (scope === null || configuration === null || operation.current) return;
    setError(null);
    setSaved(null);
    try {
      validateAttendancePoints(points);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "打卡点配置无效");
      return;
    }
    if (
      !name.trim() ||
      workdays.length === 0 ||
      startsOn < tomorrow() ||
      (endsOn !== null && endsOn < startsOn)
    ) {
      setError("请填写名称、工作日和有效日期；调整最早从明天生效。");
      return;
    }
    operation.current = true;
    setBusy(true);
    try {
      setConfiguration(await savePlanConfiguration(scope, input()));
      setSaved(
        `已保存：从 ${startsOn} 起每天 ${points.length} 次，只对授权范围内的下级生效。`,
      );
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "保存失败，请重试");
    } finally {
      operation.current = false;
      setBusy(false);
    }
  };
  const inherit = async (): Promise<void> => {
    if (
      scope === null ||
      scope.scopeType === "PROJECT" ||
      configuration === null ||
      operation.current
    )
      return;
    operation.current = true;
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const confirmation = await Taro.showModal({
        title: "恢复上级排班",
        content: `从 ${startsOn} 起继承上级规则，历史排班保留。`,
      });
      if (!confirmation.confirm) return;
      setConfiguration(
        await inheritPlanConfiguration(scope, {
          ...input(),
          name: "继承上级排班",
          points: defaultAttendancePoints,
          endsOn: null,
          workdays: [1, 2, 3, 4, 5, 6, 7],
        }),
      );
      setSaved(`已设置从 ${startsOn} 起继承上级排班。`);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "操作失败，请重试");
    } finally {
      operation.current = false;
      setBusy(false);
    }
  };
  return (
    <Screen>
      <PageHeader title="打卡安排" />
      <Notice>
        默认每天上、下班两次。上级可调整下级的次数和时间，个人安排优先于班组，班组优先于项目；新规则最早次日生效。
      </Notice>
      {error ? (
        <StateView title="操作未完成" sub={error} onRetry={refresh} />
      ) : null}
      {saved ? <Notice>{saved}</Notice> : null}
      {scopes === null && !error ? <StateView title="加载中…" /> : null}
      {scopes?.length === 0 ? (
        <StateView title="暂无可设置的下级" sub="自己的打卡要求由上级安排。" />
      ) : null}
      {scope ? (
        <Picker
          mode="selector"
          disabled={busy}
          range={(scopes ?? []).map((row) => row.label)}
          value={scopeIndex}
          onChange={(event) => setScopeIndex(Number(event.detail.value))}
        >
          <ListItem primary="安排对象" secondary={scope.label} chip="切换" />
        </Picker>
      ) : null}
      {scope && configuration === null && !error ? (
        <StateView title="读取排班中…" />
      ) : null}
      {configuration ? (
        <View>
          {configuration.id === null && scope?.scopeType !== "PROJECT" ? (
            <Notice>尚未设置专属安排，当前继承上级。以下设置保存后才生效。</Notice>
          ) : null}
          {configuration.inherit ? (
            <Notice>
              已设置继承上级排班。保存新的打卡安排可重新启用专属规则。
            </Notice>
          ) : null}
          <Section
            title={`每天 ${points.length} 次打卡`}
            sub="上班和下班成对设置；中途签到不增加工时。"
          >
            <Field
              placeholder=""
              label="安排名称"
              value={name}
              onInput={setName}
              disabled={busy}
            />
            {points.map((point, index) => (
              <View className="form-card" key={point.code}>
                <Field
                  placeholder=""
                  label={`第 ${index + 1} 次 · 名称`}
                  value={point.label}
                  disabled={busy}
                  onInput={(label) => updatePoint(point.code, { label })}
                />
                <Picker
                  mode="selector"
                  disabled={busy}
                  range={KINDS.map((kind) => kind.label)}
                  value={KINDS.findIndex((kind) => kind.value === point.kind)}
                  onChange={(event) => {
                    const kind = KINDS[Number(event.detail.value)];
                    if (kind) updatePoint(point.code, { kind: kind.value });
                  }}
                >
                  <ListItem
                    primary="类型"
                    secondary={
                      KINDS.find((kind) => kind.value === point.kind)?.label
                    }
                    chip="选择"
                  />
                </Picker>
                <Picker
                  mode="time"
                  disabled={busy}
                  value={point.time}
                  onChange={(event) =>
                    updatePoint(point.code, { time: event.detail.value })
                  }
                >
                  <ListItem
                    primary="打卡时间"
                    secondary={point.time}
                    chip="选择"
                  />
                </Picker>
                <Field
                  placeholder=""
                  label={
                    point.kind === "END" ? "早退宽限 / 分钟" : "迟到宽限 / 分钟"
                  }
                  value={String(point.graceMins)}
                  type="number"
                  disabled={busy}
                  onInput={(value) =>
                    updatePoint(point.code, {
                      graceMins: value === "" ? 0 : Number(value),
                    })
                  }
                />
                <Button
                  variant="outline"
                  disabled={busy || points.length <= 2}
                  onClick={() =>
                    setPoints(points.filter((row) => row.code !== point.code))
                  }
                >
                  移除本次打卡
                </Button>
              </View>
            ))}
            <Button variant="outline" disabled={busy} onClick={addPoint}>
              添加打卡点
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setPoints(defaultAttendancePoints);
                setName("每日两次");
              }}
            >
              使用每天两次
            </Button>
          </Section>
          <Section title="生效日期和工作日">
            <Picker
              mode="date"
              disabled={busy}
              start={tomorrow()}
              value={startsOn}
              onChange={(event) => setStartsOn(event.detail.value)}
            >
              <ListItem primary="生效日期" secondary={startsOn} chip="选择" />
            </Picker>
            {endsOn === null ? (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setEndsOn(startsOn)}
              >
                设置截止日期
              </Button>
            ) : (
              <View>
                <Picker
                  mode="date"
                  disabled={busy}
                  start={startsOn}
                  value={endsOn}
                  onChange={(event) => setEndsOn(event.detail.value)}
                >
                  <ListItem primary="截止日期" secondary={endsOn} />
                </Picker>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => setEndsOn(null)}
                >
                  长期有效
                </Button>
              </View>
            )}
            <View className="weekday-grid">
              {weekdays.map((label, index) => (
                <View
                  key={label}
                  className={`ui-segmented__item ${workdays.includes(index + 1) ? "ui-segmented__item--active" : ""}`}
                  onClick={() => {
                    if (!busy)
                      setWorkdays(
                        workdays.includes(index + 1)
                          ? workdays.filter((day) => day !== index + 1)
                          : [...workdays, index + 1].sort(),
                      );
                  }}
                >
                  周{label}
                </View>
              ))}
            </View>
          </Section>
          <Button loading={busy} onClick={() => void save()}>
            保存打卡安排
          </Button>
          {scope?.scopeType !== "PROJECT" && configuration.id !== null ? (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void inherit()}
            >
              恢复继承上级排班
            </Button>
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}
