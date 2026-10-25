import { Picker, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { useSessionGuard } from "../../hooks/use-session-guard";

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
import { useManagedProjectId } from "../../hooks/use-management-scope";
import {
  fetchParticipants,
  fetchProjectTeams,
} from "../../services/management";
import {
  fetchScopedConfiguration,
  removeScopedConfiguration,
  saveScopedSchedule,
  saveScopedShift,
  type ScheduleScope,
} from "../../services/schedule-scopes";
import type { IsoWeekday, ShiftSegment } from "../../services/management.types";
import { chinaToday } from "../../services/time";
import { useSession } from "../../store/session";

const WEEKDAY_LABELS: ReadonlyArray<{ value: IsoWeekday; label: string }> = [
  { value: 1, label: "一" },
  { value: 2, label: "二" },
  { value: 3, label: "三" },
  { value: 4, label: "四" },
  { value: 5, label: "五" },
  { value: 6, label: "六" },
  { value: 7, label: "日" },
];

export default function Schedules(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  const { revision, refresh } = usePageRefresh();
  const projectId = useManagedProjectId(state.me);

  const [scopes, setScopes] = useState<readonly ScheduleScope[]>([]);
  const [scopeIndex, setScopeIndex] = useState<number>(0);
  const target = scopes[scopeIndex] ?? null;
  const [lateGrace, setLateGrace] = useState<string>("0");
  const [earlyGrace, setEarlyGrace] = useState<string>("0");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [configured, setConfigured] = useState<boolean>(false);
  const [shiftSaved, setShiftSaved] = useState<boolean>(false);
  const [loadedSegments, setLoadedSegments] = useState<
    readonly ShiftSegment[] | null
  >(null);

  // shift
  const [shiftName, setShiftName] = useState<string>("默认班次");
  const [s1Start, setS1Start] = useState<string>("08:00");
  const [s1End, setS1End] = useState<string>("12:00");
  const [s2Start, setS2Start] = useState<string>("13:00");
  const [s2End, setS2End] = useState<string>("17:00");
  const [busyShift, setBusyShift] = useState(false);

  // schedule
  const [startsOn, setStartsOn] = useState<string>(chinaToday());
  const [endsOn, setEndsOn] = useState<string | null>(null);
  const [workdays, setWorkdays] = useState<ReadonlyArray<IsoWeekday>>([
    1, 2, 3, 4, 5,
  ]);
  const [busySchedule, setBusySchedule] = useState(false);

  useEffect(() => {
    if (projectId === null) return;
    let cancelled = false;
    void Promise.all([
      fetchProjectTeams(projectId),
      fetchParticipants(projectId),
    ]).then(
      ([teams, people]) => {
        if (!cancelled)
          setScopes([
            { scopeType: "PROJECT", scopeId: projectId, label: "项目默认排班" },
            ...teams.map((row) => ({
              scopeType: "TEAM" as const,
              scopeId: row.id,
              label: `班组 · ${row.name}`,
            })),
            ...people
              .filter((row) => row.status === "ACTIVE")
              .map((row) => ({
                scopeType: "MEMBER" as const,
                scopeId: row.memberId,
                label: `个人 · ${row.displayName ?? row.phone}`,
              })),
          ]);
      },
      (failure: unknown) => {
        if (!cancelled) {
          setLoadError(
            failure instanceof Error ? failure.message : "无法读取排班对象",
          );
          setLoading(false);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (projectId === null || target === null) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setSaved(null);
    setError(null);
    setConfigured(false);
    setShiftSaved(false);
    setShiftName("默认班次");
    setS1Start("08:00");
    setS1End("12:00");
    setS2Start("13:30");
    setS2End("17:30");
    setLoadedSegments(null);
    setLateGrace("0");
    setEarlyGrace("0");
    setStartsOn(chinaToday());
    setEndsOn(null);
    setWorkdays([1, 2, 3, 4, 5]);
    void fetchScopedConfiguration(projectId, target).then(
      (configuration) => {
        if (cancelled) return;
        if (configuration.shift !== null) {
          const [first, second] = configuration.shift.segments;
          setShiftName(configuration.shift.name);
          setS1Start(first.startTime);
          setS1End(first.endTime);
          setS2Start(second.startTime);
          setS2End(second.endTime);
          setLoadedSegments(configuration.shift.segments);
          setLateGrace(String(first.lateGraceMins));
          setEarlyGrace(String(second.earlyGraceMins));
          setConfigured(true);
        }
        if (configuration.schedule !== null) {
          setStartsOn(configuration.schedule.startsOn);
          setEndsOn(configuration.schedule.endsOn);
          setWorkdays(configuration.schedule.workdays);
        }
        setLoading(false);
      },
      (cause) => {
        if (!cancelled) {
          setLoadError(
            cause instanceof Error
              ? cause.message
              : "无法读取当前排班，请重新打开页面。",
          );
          setLoading(false);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [projectId, target, revision]);

  if (projectId === null) {
    return (
      <Screen>
        <PageHeader title="排班配置" />
        <StateView title="无项目" sub="当前账号没有项目管理员身份。" />
      </Screen>
    );
  }

  const saveShift = async (): Promise<void> => {
    if (busyShift || loading || target === null) return;
    if (
      shiftName.trim().length === 0 ||
      !(s1Start < s1End && s1End <= s2Start && s2Start < s2End)
    ) {
      setError(
        "请填写班次名称，并确保上午和下午的时间段按先后排列、互不重叠。",
      );
      return;
    }
    if (
      ![lateGrace, earlyGrace].every(
        (value) => /^\d+$/.test(value) && Number(value) <= 120,
      )
    ) {
      setError("宽限分钟须为 0 到 120 的整数。");
      return;
    }
    setError(null);
    setSaved(null);
    setBusyShift(true);
    try {
      await saveScopedShift(projectId, target, {
        name: shiftName.trim(),
        segments: [
          {
            sequence: 1,
            startTime: s1Start,
            endTime: s1End,
            lateGraceMins: Number(lateGrace),
            earlyGraceMins: loadedSegments?.[0]?.earlyGraceMins ?? 0,
          },
          {
            sequence: 2,
            startTime: s2Start,
            endTime: s2End,
            lateGraceMins: loadedSegments?.[1]?.lateGraceMins ?? 0,
            earlyGraceMins: Number(earlyGrace),
          },
        ],
      });
      setConfigured(true);
      setShiftSaved(true);
      setSaved("班次已保存，请继续保存工作日期，将新班次应用到排班。");
      await Taro.showToast({ icon: "success", title: "班次已保存" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存未完成，请重试。");
    } finally {
      setBusyShift(false);
    }
  };

  const saveSchedule = async (): Promise<void> => {
    if (busySchedule || loading || !configured || target === null) return;
    if (workdays.length === 0) {
      await Taro.showToast({ icon: "none", title: "至少选一个工作日" });
      return;
    }
    if (endsOn !== null && endsOn < startsOn) {
      setError("排班截止日不能早于起始日。");
      return;
    }
    setError(null);
    setSaved(null);
    setBusySchedule(true);
    try {
      await saveScopedSchedule(projectId, target, {
        startsOn,
        endsOn,
        workdays,
      });
      setShiftSaved(false);
      setSaved("排班已保存，在生效日期内按所选工作日执行考勤。");
      await Taro.showToast({ icon: "success", title: "排班已保存" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存未完成，请重试。");
    } finally {
      setBusySchedule(false);
    }
  };

  const removeOverride = async (): Promise<void> => {
    if (!target || target.scopeType === "PROJECT" || busySchedule || busyShift)
      return;
    const result = await Taro.showModal({
      title: "移除专属排班",
      content: "移除后，将按上级班组或项目默认排班执行。",
      confirmText: "确认移除",
    });
    if (!result.confirm) return;
    setBusySchedule(true);
    setError(null);
    try {
      await removeScopedConfiguration(projectId, target);
      refresh();
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : "移除排班失败");
    } finally {
      setBusySchedule(false);
    }
  };

  const toggleWorkday = (d: IsoWeekday): void => {
    setWorkdays((prev) =>
      prev.includes(d)
        ? prev.filter((x) => x !== d)
        : ([...prev, d].sort((a, b) => a - b) as ReadonlyArray<IsoWeekday>),
    );
  };

  return (
    <Screen>
      <PageHeader title="排班配置" />

      <Notice>
        先选择排班对象，再保存班次与工作日期。个人专属排班优先于班组，班组优先于项目默认。
      </Notice>
      {target ? (
        <Picker
          mode="selector"
          disabled={busyShift || busySchedule}
          range={scopes.map((scope) => scope.label)}
          value={scopeIndex}
          onChange={(event) => setScopeIndex(Number(event.detail.value))}
        >
          <ListItem
            primary="当前排班对象"
            secondary={target.label}
            chip="切换"
          />
        </Picker>
      ) : null}
      {target?.scopeType !== "PROJECT" && !configured && !loading ? (
        <Notice>
          尚未设置专属排班，当前按上级排班执行。完成保存后启用此专属配置。
        </Notice>
      ) : null}
      {loading ? <StateView title="加载中…" /> : null}
      {loadError ? (
        <StateView title="读取排班失败" sub={loadError} onRetry={refresh} />
      ) : null}
      {error ? <Notice>{error}</Notice> : null}
      {saved ? <Notice>{saved}</Notice> : null}
      {!loading && loadError === null ? (
        <View>
          <Section title="01  每日班次" sub="请按照真实作息配置两个工作时段">
            <View className="form-card">
              <Field
                value={shiftName}
                label="班次名称"
                placeholder="例如：标准两段班"
                onInput={setShiftName}
              />
              <Picker
                mode="time"
                value={s1Start}
                onChange={(e) =>
                  setS1Start(String((e.detail as { value: string }).value))
                }
              >
                <ListItem
                  primary={`上午起 · ${s1Start}`}
                  secondary="点选时间"
                />
              </Picker>
              <Picker
                mode="time"
                value={s1End}
                onChange={(e) =>
                  setS1End(String((e.detail as { value: string }).value))
                }
              >
                <ListItem primary={`上午止 · ${s1End}`} secondary="点选时间" />
              </Picker>
              <Picker
                mode="time"
                value={s2Start}
                onChange={(e) =>
                  setS2Start(String((e.detail as { value: string }).value))
                }
              >
                <ListItem
                  primary={`下午起 · ${s2Start}`}
                  secondary="点选时间"
                />
              </Picker>
              <Picker
                mode="time"
                value={s2End}
                onChange={(e) =>
                  setS2End(String((e.detail as { value: string }).value))
                }
              >
                <ListItem primary={`下午止 · ${s2End}`} secondary="点选时间" />
              </Picker>
              <Field
                label="上午迟到宽限 / 分钟"
                value={lateGrace}
                type="number"
                placeholder="0 到 120"
                onInput={setLateGrace}
              />
              <Field
                label="下午早退宽限 / 分钟"
                value={earlyGrace}
                type="number"
                placeholder="0 到 120"
                onInput={setEarlyGrace}
              />
              <Button
                loading={busyShift}
                disabled={busySchedule || loading}
                onClick={() => {
                  void saveShift();
                }}
              >
                {busyShift ? "保存中…" : "保存班次"}
              </Button>
            </View>
          </Section>
          <Section title="02  工作日期">
            {shiftSaved ? (
              <Notice>新班次待应用，请保存本节配置完成更新。</Notice>
            ) : null}
            <View className="form-card">
              <Picker
                mode="date"
                value={startsOn}
                onChange={(e) =>
                  setStartsOn(String((e.detail as { value: string }).value))
                }
              >
                <ListItem
                  primary={`起始日 · ${startsOn}`}
                  secondary="点选日期"
                />
              </Picker>
              {endsOn === null ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setEndsOn(chinaToday());
                  }}
                >
                  添加截止日
                </Button>
              ) : (
                <View>
                  <Picker
                    mode="date"
                    value={endsOn}
                    onChange={(e) =>
                      setEndsOn(String((e.detail as { value: string }).value))
                    }
                  >
                    <ListItem
                      primary={`截止日 · ${endsOn}`}
                      secondary="点选日期"
                    />
                  </Picker>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEndsOn(null);
                    }}
                  >
                    移除截止日
                  </Button>
                </View>
              )}
              <View className="weekday-grid">
                {WEEKDAY_LABELS.map((wd) => (
                  <View
                    key={wd.value}
                    className={`ui-segmented__item ${workdays.includes(wd.value) ? "ui-segmented__item--active" : ""}`}
                    onClick={() => toggleWorkday(wd.value)}
                  >
                    周{wd.label}
                  </View>
                ))}
              </View>
              <Button
                loading={busySchedule}
                disabled={busyShift || loading || !configured}
                onClick={() => {
                  void saveSchedule();
                }}
              >
                {busySchedule ? "保存中…" : "保存排班"}
              </Button>
            </View>
          </Section>
          {target?.scopeType !== "PROJECT" && configured ? (
            <Button
              variant="outline"
              disabled={busyShift || busySchedule}
              onClick={() => {
                void removeOverride();
              }}
            >
              移除专属排班
            </Button>
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}
