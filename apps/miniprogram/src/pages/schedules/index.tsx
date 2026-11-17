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
import { errorMessage } from "../../services/error-messages";

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
  const router = Taro.useRouter();
  const requestedProject = router.params.projectId;
  const requestedTeam = router.params.teamId;
  const { revision, refresh } = usePageRefresh();
  const [scopes, setScopes] = useState<readonly PlanScope[] | null>(null);
  const [scopeIndex, setScopeIndex] = useState<number>(0);
  const [dirty, setDirty] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
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
  const requestedTeamApplied = useRef<boolean>(false);
  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    void fetchPlanScopes().then(
      (rows) => {
        if (cancelled) return;
        const available = requestedProject
          ? rows.filter((row) => row.projectId === requestedProject)
          : rows;
        setScopes(available);
        // 只在首次进入时定位到入口指定的班组；之后再次显示页面保留当前选择。
        if (requestedTeamApplied.current) return;
        requestedTeamApplied.current = true;
        const teamIndex = requestedTeam
          ? available.findIndex(
              (row) => row.scopeType === "TEAM" && row.scopeId === requestedTeam,
            )
          : -1;
        if (teamIndex >= 0) setScopeIndex(teamIndex);
      },
      (cause: unknown) => {
        if (!cancelled)
          setLoadError(errorMessage(cause, "无法读取排班对象"));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [requestedProject, requestedTeam, revision]);
  useEffect(() => {
    if (scope === null) return;
    let cancelled = false;
    setConfiguration(null);
    setError(null);
    setLoadError(null);
    setSaved(null);
    setDirty(false);
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
          setLoadError(errorMessage(cause, "无法读取排班"));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [scope, revision]);
  const touch = (): void => {
    setSaved(null);
    setDirty(true);
  };
  const updatePoint = (
    code: string,
    values: Partial<ScheduledAttendancePoint>,
  ): void => {
    setPoints((rows) =>
      rows.map((row) => (row.code === code ? { ...row, ...values } : row)),
    );
    touch();
  };
  const switchScope = async (index: number): Promise<void> => {
    if (index === scopeIndex) return;
    if (dirty) {
      const confirmation = await Taro.showModal({
        title: "放弃未保存的修改",
        content: "切换安排对象后，当前未保存的打卡安排将丢失。",
        confirmText: "放弃并切换",
        confirmColor: "#c33845",
      });
      if (!confirmation.confirm) return;
    }
    setScopeIndex(index);
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
    touch();
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
      setError(errorMessage(cause, "打卡点配置无效"));
      return;
    }
    if (
      !name.trim() ||
      workdays.length === 0 ||
      startsOn < tomorrow() ||
      (endsOn !== null && endsOn < startsOn)
    ) {
      setError("填写名称、工作日及日期，最早次日生效。");
      return;
    }
    operation.current = true;
    setBusy(true);
    try {
      setConfiguration(await savePlanConfiguration(scope, input()));
      setDirty(false);
      setSaved(
        `已保存：从 ${startsOn} 起每天 ${points.length} 次，只对授权范围内的下级生效。`,
      );
      await Taro.showToast({ icon: "success", title: "已保存" });
    } catch (cause: unknown) {
      setError(errorMessage(cause, "保存失败，请重试"));
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
      setDirty(false);
      setSaved(`已设置从 ${startsOn} 起继承上级排班。`);
    } catch (cause: unknown) {
      setError(errorMessage(cause, "操作失败，请重试"));
    } finally {
      operation.current = false;
      setBusy(false);
    }
  };
  return (
    <Screen>
      <PageHeader title="打卡安排" />
      <Notice>
        <View>默认上、下班各一次，上级可调整下级安排。</View>
        <View>优先级：个人 ＞ 班组 ＞ 项目。最早次日生效。</View>
      </Notice>
      {loadError ? (
        <StateView title="打卡安排读取失败" sub={loadError} onRetry={refresh} />
      ) : null}
      {scopes === null && !loadError ? (
        <StateView title="正在读取安排对象…" />
      ) : null}
      {scopes?.length === 0 ? (
        <StateView title="暂无可设置的下级" sub="自己的打卡要求由上级安排。" />
      ) : null}
      {scope ? (
        <Picker
          mode="selector"
          disabled={busy}
          range={(scopes ?? []).map((row) => row.label)}
          value={scopeIndex}
          onChange={(event) => {
            void switchScope(Number(event.detail.value));
          }}
        >
          <ListItem
            primary="安排对象"
            secondary={scope.label}
            chip={(scopes?.length ?? 0) > 1 ? "切换" : "当前"}
          />
        </Picker>
      ) : null}
      {scope && configuration === null && !loadError ? (
        <StateView title="正在读取打卡安排…" />
      ) : null}
      {configuration ? (
        <View>
          {configuration.inherit ||
          (configuration.id === null && scope?.scopeType !== "PROJECT") ? (
            <Notice>当前继承上级，保存后启用专属安排。</Notice>
          ) : null}
          <Section
            title={`每天 ${points.length} 次打卡`}
            sub="上班和下班成对设置；中途签到不增加工时。"
          >
            <Field
              placeholder=""
              label="安排名称"
              value={name}
              onInput={(value) => {
                setName(value);
                touch();
              }}
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
                  onClick={() => {
                    setPoints(points.filter((row) => row.code !== point.code));
                    touch();
                  }}
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
                touch();
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
              onChange={(event) => {
                setStartsOn(event.detail.value);
                touch();
              }}
            >
              <ListItem primary="生效日期" secondary={startsOn} chip="选择" />
            </Picker>
            {endsOn === null ? (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setEndsOn(startsOn);
                  touch();
                }}
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
                  onChange={(event) => {
                    setEndsOn(event.detail.value);
                    touch();
                  }}
                >
                  <ListItem primary="截止日期" secondary={endsOn} />
                </Picker>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setEndsOn(null);
                    touch();
                  }}
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
                    if (busy) return;
                    setWorkdays(
                      workdays.includes(index + 1)
                        ? workdays.filter((day) => day !== index + 1)
                        : [...workdays, index + 1].sort(),
                    );
                    touch();
                  }}
                >
                  周{label}
                </View>
              ))}
            </View>
          </Section>
          {error ? <Notice tone="error">{error}</Notice> : null}
          {saved ? <Notice tone="success">{saved}</Notice> : null}
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
