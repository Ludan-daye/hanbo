import { Picker, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useRef, useState } from "react";
import {
  defaultAttendancePoints,
  validateAttendancePoints,
  type ScheduledAttendancePoint,
} from "@construction/domain/attendance.js";
import {
  BottomBar,
  Button,
  FormInput,
  FormRow,
  Links,
  Notice,
  PageHeader,
  Row,
  Screen,
  SectionTitle,
  Sheet,
  SkeletonRows,
  StateView,
  Weekdays,
} from "../../components/ui/index";
import { WorkTime, workDateLabel } from "../../components/team-work-fields";
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
import { graceLabel, pointRule, POINT_KINDS } from "./plan-view";

import "./index.scss";

const tomorrow = (): string =>
  new Date(Date.parse(`${chinaToday()}T00:00:00Z`) + 86400_000)
    .toISOString()
    .slice(0, 10);
const DANGER = "#D7261E";

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
  const [saving, setSaving] = useState<boolean>(false);
  // 正在改哪一张卡：有值时显示这张卡的要求，页头返回键回到打卡安排。
  const [editingCode, setEditingCode] = useState<string | null>(null);
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
              (row) =>
                row.scopeType === "TEAM" && row.scopeId === requestedTeam,
            )
          : -1;
        if (teamIndex >= 0) setScopeIndex(teamIndex);
      },
      (cause: unknown) => {
        if (!cancelled) setLoadError(errorMessage(cause, "无法读取排班对象"));
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
    setEditingCode(null);
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
        if (!cancelled) setLoadError(errorMessage(cause, "无法读取排班"));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [scope, revision]);
  // 换了视图就回到顶上：同一个页面里切换，滚动位置不会自己复位。
  useEffect(() => {
    void Taro.pageScrollTo({ scrollTop: 0, duration: 0 });
  }, [editingCode]);
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
        title: "放弃没保存的修改",
        content: "换一个安排对象后，这里没保存的打卡安排就没有了。",
        confirmText: "放弃修改",
        confirmColor: DANGER,
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
      setError("最后两张卡挨得太近。先把时间调开，再添加。");
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
    setError(null);
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
      setError(
        "请填好名称、工作日和日期。最早明天生效，截止日期不能早于生效日期。",
      );
      return;
    }
    operation.current = true;
    setBusy(true);
    setSaving(true);
    try {
      setConfiguration(await savePlanConfiguration(scope, input()));
      setDirty(false);
      setSaved(
        `已保存。从 ${workDateLabel(startsOn)} 起每天 ${points.length} 张卡，只对你有权安排的人生效。`,
      );
      await Taro.showToast({ icon: "success", title: "已保存" });
    } catch (cause: unknown) {
      setError(errorMessage(cause, "保存失败，请重试"));
    } finally {
      operation.current = false;
      setBusy(false);
      setSaving(false);
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
        title: "恢复继承上级",
        content: `从 ${workDateLabel(startsOn)} 起跟着上级的安排走，以前的安排记录保留。`,
        confirmText: "恢复继承",
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
      setSaved(`已设置。从 ${workDateLabel(startsOn)} 起跟着上级的安排走。`);
    } catch (cause: unknown) {
      setError(errorMessage(cause, "操作失败，请重试"));
    } finally {
      operation.current = false;
      setBusy(false);
    }
  };

  const editingIndex: number =
    configuration === null
      ? -1
      : points.findIndex((point) => point.code === editingCode);
  const editing: ScheduledAttendancePoint | null =
    editingIndex >= 0 ? (points[editingIndex] ?? null) : null;
  if (editing !== null)
    return (
      <Screen
        header={
          <PageHeader
            title={`第 ${editingIndex + 1} 张卡`}
            onBack={() => setEditingCode(null)}
          />
        }
      >
        <Sheet gap>
          <FormInput
            label="名称"
            value={editing.label}
            placeholder="例如：上班"
            disabled={busy}
            onInput={(label) => updatePoint(editing.code, { label })}
          />
          <View className="schedules-pick">
            <Picker
              mode="selector"
              disabled={busy}
              range={POINT_KINDS.map((kind) => kind.label)}
              value={POINT_KINDS.findIndex(
                (kind) => kind.value === editing.kind,
              )}
              onChange={(event) => {
                const kind = POINT_KINDS[Number(event.detail.value)];
                if (kind) updatePoint(editing.code, { kind: kind.value });
              }}
            >
              <FormRow
                label="类型"
                value={
                  POINT_KINDS.find((kind) => kind.value === editing.kind)?.label
                }
                chevron
              />
            </Picker>
          </View>
          <View className="schedules-pick">
            <WorkTime
              label="打卡时间"
              value={editing.time}
              onChange={(time) => updatePoint(editing.code, { time })}
            />
          </View>
          <FormInput
            label={`${graceLabel(editing.kind)}（分钟）`}
            value={String(editing.graceMins)}
            type="number"
            disabled={busy}
            onInput={(value) =>
              updatePoint(editing.code, {
                graceMins: value === "" ? 0 : Number(value),
              })
            }
          />
        </Sheet>
        <Notice>
          上班和下班要成对，中途签到不算工时。改完回到打卡安排，点“保存”才生效。
        </Notice>
        <BottomBar primary="改好了" onPrimary={() => setEditingCode(null)}>
          {points.length > 2 ? (
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => {
                setPoints(points.filter((row) => row.code !== editing.code));
                touch();
                setEditingCode(null);
              }}
            >
              删除这张卡
            </Button>
          ) : null}
        </BottomBar>
      </Screen>
    );

  const inheriting: boolean =
    configuration !== null &&
    (configuration.inherit ||
      (configuration.id === null && scope?.scopeType !== "PROJECT"));
  return (
    <Screen header={<PageHeader title="打卡安排" />}>
      {scopes === null && !loadError ? <SkeletonRows rows={3} gap /> : null}
      {scopes?.length === 0 ? (
        <StateView
          kind="empty"
          title="没有可以安排的对象"
          sub="你自己的打卡要求由上级安排。"
        />
      ) : null}
      {scope ? (
        <>
          <Sheet gap>
            <Picker
              mode="selector"
              disabled={busy}
              range={(scopes ?? []).map((row) => row.label)}
              value={scopeIndex}
              onChange={(event) => {
                void switchScope(Number(event.detail.value));
              }}
            >
              <FormRow label="给谁排" chevron={(scopes?.length ?? 0) > 1}>
                <View className="schedules-value">{scope.label}</View>
              </FormRow>
            </Picker>
          </Sheet>
          <Notice>
            最早明天生效。个人的安排优先于班组的，班组的优先于项目的。
          </Notice>
        </>
      ) : null}
      {loadError ? (
        <StateView
          kind="error"
          title="打卡安排没读到"
          sub={loadError}
          onRetry={refresh}
        />
      ) : null}
      {scope && configuration === null && !loadError ? (
        <SkeletonRows rows={3} gap />
      ) : null}
      {configuration ? (
        <>
          {inheriting ? (
            <Notice>现在跟着上级的安排走。保存以后，这里用自己的安排。</Notice>
          ) : null}
          <SectionTitle
            action="添加"
            onAction={() => {
              if (!busy) addPoint();
            }}
          >
            {`每天 ${points.length} 张卡`}
          </SectionTitle>
          <Sheet>
            {points.map((point) => (
              <Row
                key={point.code}
                title={point.label}
                titleNum={point.time}
                sub={pointRule(point)}
                chevron
                onClick={busy ? undefined : () => setEditingCode(point.code)}
              />
            ))}
          </Sheet>
          <Links>
            <Button
              variant="text"
              disabled={busy}
              onClick={() => {
                setPoints(defaultAttendancePoints);
                setName("每日两次");
                touch();
              }}
            >
              {`恢复默认（${defaultAttendancePoints.map((point) => `${point.label} ${point.time}`).join("，")}）`}
            </Button>
          </Links>
          <Sheet gap>
            <FormInput
              label="安排名称"
              value={name}
              placeholder="例如：每日两次"
              disabled={busy}
              onInput={(value) => {
                setName(value);
                touch();
              }}
            />
            <View className="schedules-days">
              <View className="schedules-days__label">工作日</View>
              <Weekdays
                selected={workdays}
                disabled={busy}
                onToggle={(day) => {
                  setWorkdays(
                    workdays.includes(day)
                      ? workdays.filter((value) => value !== day)
                      : [...workdays, day].sort(),
                  );
                  touch();
                }}
              />
            </View>
            <View className="schedules-pick">
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
                <FormRow
                  label="生效日期"
                  value={workDateLabel(startsOn)}
                  chevron
                />
              </Picker>
            </View>
            <View className="schedules-pick">
              <Picker
                mode="date"
                disabled={busy}
                start={startsOn}
                value={endsOn ?? startsOn}
                onChange={(event) => {
                  setEndsOn(event.detail.value);
                  touch();
                }}
              >
                <FormRow
                  label="截止日期"
                  value={endsOn === null ? "长期有效" : workDateLabel(endsOn)}
                  chevron
                />
              </Picker>
            </View>
          </Sheet>
          {endsOn !== null ? (
            <Links>
              <Button
                variant="text"
                disabled={busy}
                onClick={() => {
                  setEndsOn(null);
                  touch();
                }}
              >
                改回长期有效
              </Button>
            </Links>
          ) : null}
          {error ? <Notice tone="error">{error}</Notice> : null}
          {saved ? <Notice tone="success">{saved}</Notice> : null}
          <BottomBar
            primary={saving ? "保存中…" : "保存"}
            busy={busy}
            onPrimary={() => {
              void save();
            }}
          >
            {scope?.scopeType !== "PROJECT" && configuration.id !== null ? (
              <Button
                variant="text"
                disabled={busy}
                onClick={() => {
                  void inherit();
                }}
              >
                恢复继承上级
              </Button>
            ) : null}
          </BottomBar>
        </>
      ) : null}
    </Screen>
  );
}
