import { Picker, View } from "@tarojs/components";
import { useEffect, useState } from "react";

import { ListItem, PageHeader, Screen, StateView } from "../../components/ui/index";
import { fetchMyAttendanceRecords } from "../../services/me";
import { formatChinaHm } from "../../services/time";
import type { AttendanceRecord } from "../../services/me.types";

const POINT_LABEL: Record<AttendanceRecord["pointCode"], string> = {
  SEGMENT_1_END: "上午下班",
  SEGMENT_1_START: "上午上班",
  SEGMENT_2_END: "下午下班",
  SEGMENT_2_START: "下午上班"
};

const pad = (n: number): string => String(n).padStart(2, "0");
const fmt = (d: Date): string => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const todayDate = (): string => fmt(new Date());
const minusDays = (n: number): string => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return fmt(d);
};

export default function MyRecords(): JSX.Element {
  const [from, setFrom] = useState<string>(minusDays(6));
  const [to, setTo] = useState<string>(todayDate());
  const [items, setItems] = useState<ReadonlyArray<AttendanceRecord> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setError(null);
    void (async () => {
      try {
        const rows = await fetchMyAttendanceRecords(from, to);
        if (!cancelled) {
          setItems(rows);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "REQUEST_FAILED");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [from, to]);

  return (
    <Screen>
      <PageHeader title="我的考勤" />
      <View style={{ marginTop: "20rpx" }}>
        <Picker mode="date" value={from} onChange={(e) => setFrom(String((e.detail as { value: string }).value))}>
          <ListItem primary={`起始 · ${from}`} secondary="点选其它日期" />
        </Picker>
        <Picker mode="date" value={to} onChange={(e) => setTo(String((e.detail as { value: string }).value))}>
          <ListItem primary={`截止 · ${to}`} secondary="点选其它日期" />
        </Picker>
      </View>
      {items === null && error === null ? <StateView title="加载中…" /> : null}
      {error !== null ? <StateView title="加载失败" sub={error} /> : null}
      {items !== null && items.length === 0 ? <StateView title="该时段无考勤记录" /> : null}
      <View>
        {(items ?? []).map((r) => (
          <ListItem
            key={r.id}
            primary={`${POINT_LABEL[r.pointCode]} · ${r.attendanceDate}`}
            secondary={r.abnormalReason !== null ? `异常:${r.abnormalReason}` : `于 ${formatChinaHm(r.occurredAt)} 打卡`}
            chip={r.status === "VALID" ? "正常" : "异常"}
          />
        ))}
      </View>
    </Screen>
  );
}
