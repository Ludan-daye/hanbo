import { Picker, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useState } from "react";

import { Button, Field, ListItem, PageHeader, Screen, StateView } from "../../components/ui/index";
import { resolveAdminProjectId } from "../../routing/projectAdmin";
import { configureDefaultSchedule, configureDefaultShift } from "../../services/management";
import type { IsoWeekday } from "../../services/management.types";
import { useSession } from "../../store/session";

const pad = (n: number): string => String(n).padStart(2, "0");
const todayDate = (): string => {
  const d = new Date();
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

const WEEKDAY_LABELS: ReadonlyArray<{ value: IsoWeekday; label: string }> = [
  { value: 1, label: "一" },
  { value: 2, label: "二" },
  { value: 3, label: "三" },
  { value: 4, label: "四" },
  { value: 5, label: "五" },
  { value: 6, label: "六" },
  { value: 7, label: "日" }
];

export default function Schedules(): JSX.Element {
  const { state } = useSession();
  const projectId = resolveAdminProjectId(state.me);

  // shift
  const [shiftName, setShiftName] = useState<string>("默认班次");
  const [s1Start, setS1Start] = useState<string>("08:00");
  const [s1End, setS1End] = useState<string>("12:00");
  const [s2Start, setS2Start] = useState<string>("13:00");
  const [s2End, setS2End] = useState<string>("17:00");
  const [busyShift, setBusyShift] = useState(false);

  // schedule
  const [startsOn, setStartsOn] = useState<string>(todayDate());
  const [endsOn, setEndsOn] = useState<string | null>(null);
  const [workdays, setWorkdays] = useState<ReadonlyArray<IsoWeekday>>([1, 2, 3, 4, 5]);
  const [busySchedule, setBusySchedule] = useState(false);

  if (projectId === null) {
    return (
      <Screen>
        <PageHeader title="排班配置" />
        <StateView title="无项目" sub="当前账号没有项目管理员身份。" />
      </Screen>
    );
  }

  const saveShift = async (): Promise<void> => {
    if (busyShift) return;
    setBusyShift(true);
    try {
      await configureDefaultShift(projectId, {
        name: shiftName.trim() || "默认班次",
        segments: [
          { sequence: 1, startTime: s1Start, endTime: s1End, lateGraceMins: 0, earlyGraceMins: 0 },
          { sequence: 2, startTime: s2Start, endTime: s2End, lateGraceMins: 0, earlyGraceMins: 0 }
        ]
      });
      await Taro.showToast({ icon: "success", title: "班次已保存" });
    } catch {
      await Taro.showToast({ icon: "none", title: "保存失败" });
    } finally {
      setBusyShift(false);
    }
  };

  const saveSchedule = async (): Promise<void> => {
    if (busySchedule) return;
    if (workdays.length === 0) {
      await Taro.showToast({ icon: "none", title: "至少选一个工作日" });
      return;
    }
    setBusySchedule(true);
    try {
      await configureDefaultSchedule(projectId, { startsOn, endsOn, workdays });
      await Taro.showToast({ icon: "success", title: "排班已保存" });
    } catch {
      await Taro.showToast({ icon: "none", title: "保存失败" });
    } finally {
      setBusySchedule(false);
    }
  };

  const toggleWorkday = (d: IsoWeekday): void => {
    setWorkdays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b) as ReadonlyArray<IsoWeekday>));
  };

  return (
    <Screen>
      <PageHeader title="排班配置" />

      {/* Shift */}
      <View>
        <Field value={shiftName} placeholder="班次名称" onInput={setShiftName} />
        <Picker mode="time" value={s1Start} onChange={(e) => setS1Start(String((e.detail as { value: string }).value))}>
          <ListItem primary={`上午起 · ${s1Start}`} secondary="点选时间" />
        </Picker>
        <Picker mode="time" value={s1End} onChange={(e) => setS1End(String((e.detail as { value: string }).value))}>
          <ListItem primary={`上午止 · ${s1End}`} secondary="点选时间" />
        </Picker>
        <Picker mode="time" value={s2Start} onChange={(e) => setS2Start(String((e.detail as { value: string }).value))}>
          <ListItem primary={`下午起 · ${s2Start}`} secondary="点选时间" />
        </Picker>
        <Picker mode="time" value={s2End} onChange={(e) => setS2End(String((e.detail as { value: string }).value))}>
          <ListItem primary={`下午止 · ${s2End}`} secondary="点选时间" />
        </Picker>
        <Button onClick={() => { void saveShift(); }}>{busyShift ? "保存中…" : "保存班次"}</Button>
      </View>

      {/* Schedule */}
      <View>
        <Picker mode="date" value={startsOn} onChange={(e) => setStartsOn(String((e.detail as { value: string }).value))}>
          <ListItem primary={`起始日 · ${startsOn}`} secondary="点选日期" />
        </Picker>
        {endsOn === null ? (
          <Button variant="outline" onClick={() => { setEndsOn(todayDate()); }}>添加截止日</Button>
        ) : (
          <View>
            <Picker mode="date" value={endsOn} onChange={(e) => setEndsOn(String((e.detail as { value: string }).value))}>
              <ListItem primary={`截止日 · ${endsOn}`} secondary="点选日期" />
            </Picker>
            <Button variant="outline" onClick={() => { setEndsOn(null); }}>移除截止日</Button>
          </View>
        )}
        <View style={{ display: "flex", gap: "12rpx", flexWrap: "wrap", marginTop: "20rpx" }}>
          {WEEKDAY_LABELS.map((wd) => (
            <View
              key={wd.value}
              className={`ui-segmented__item ${workdays.includes(wd.value) ? "ui-segmented__item--active" : ""}`}
              style={{ minWidth: "80rpx" }}
              onClick={() => toggleWorkday(wd.value)}
            >
              周{wd.label}
            </View>
          ))}
        </View>
        <Button onClick={() => { void saveSchedule(); }}>{busySchedule ? "保存中…" : "保存排班"}</Button>
      </View>
    </Screen>
  );
}
