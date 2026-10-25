import { Picker, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useState } from "react";

import { displayProjectRole } from "../routing/features";
import type {
  DailyReport,
  DailyReportParticipant,
  RangeReport,
  RangeReportParticipant,
} from "../services/management.types";
import {
  Button,
  Field,
  ListItem,
  Notice,
  Segmented,
  StateView,
  Subtitle,
} from "./ui/index";

type Row = DailyReportParticipant | RangeReportParticipant;
type Filter = "ALL" | "WORKER" | "MANAGER";
const rowSummary = (row: Row): string =>
  "isAbsent" in row
    ? [
        row.isAbsent ? "缺勤" : "",
        row.isMissingPunch ? "缺卡" : "",
        row.isLate ? "迟到" : "",
        row.isEarlyLeave ? "早退" : "",
        `已批补卡 ${row.approvedMakeupCount} 次`,
        `异常 ${row.abnormalRecordCount} 次`,
      ]
        .filter(Boolean)
        .join(" · ")
    : `应出勤 ${row.scheduledDays} 天 · 实出勤 ${row.actualAttendedDays} 天 · 缺卡 ${row.missingPunchCount} 次 · 迟到 ${row.lateCount} 次 · 早退 ${row.earlyLeaveCount} 次 · 已批补卡 ${row.approvedMakeupCount} 次`;
export const ReportParticipants = ({
  report,
}: {
  readonly report: DailyReport | RangeReport;
}): JSX.Element => {
  const [search, setSearch] = useState<string>("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [team, setTeam] = useState<string>("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const teams = Array.from(
    new Set(
      report.participants
        .map((row) => row.teamName)
        .filter((name): name is string => name !== null),
    ),
  );
  const rows: readonly Row[] = report.participants.filter(
    (row) =>
      (filter === "ALL" || row.participantType === filter) &&
      (!team || row.teamName === team) &&
      `${row.displayName ?? ""} ${row.phone} ${displayProjectRole(row.projectRoleLabel)}`.includes(
        search.trim(),
      ),
  );
  const copy = async (): Promise<void> => {
    setError(null);
    const text = [
      `考勤明细 ${report.startDate} 至 ${report.endDate}`,
      "姓名\t岗位\t班组\t工时(h)\t出勤情况",
      ...rows.map((row) =>
        [
          row.displayName ?? row.phone,
          displayProjectRole(row.projectRoleLabel),
          row.teamName ?? "无班组",
          (row.workedMinutes / 60).toFixed(1),
          rowSummary(row),
        ].join("\t"),
      ),
    ].join("\n");
    try {
      await Taro.setClipboardData({ data: text });
    } catch (failure: unknown) {
      setError(
        failure instanceof Error
          ? failure.message
          : "复制失败，请检查剪贴板权限。",
      );
    }
  };
  return (
    <View>
      <View className="report-section-title">
        人员出勤明细 · {rows.length} 人
      </View>
      <Field
        value={search}
        placeholder="搜索姓名、手机号或岗位"
        onInput={setSearch}
      />
      <Segmented<Filter>
        options={[
          { value: "ALL", label: "全部人员" },
          { value: "WORKER", label: "工人" },
          { value: "MANAGER", label: "管理员" },
        ]}
        value={filter}
        onChange={setFilter}
      />
      <Picker
        mode="selector"
        range={["全部班组", ...teams]}
        value={teams.indexOf(team) + 1}
        onChange={(event) =>
          setTeam(teams[Number(event.detail.value) - 1] ?? "")
        }
      >
        <ListItem
          primary="班组筛选"
          secondary={team || "全部班组"}
          chip="选择"
        />
      </Picker>
      <Subtitle>筛选只影响下方明细；点击人员查看出勤情况。</Subtitle>
      {rows.length === 0 ? <StateView title="没有符合条件的人员" /> : null}
      {rows.map((row) => (
        <View key={row.memberId}>
          <ListItem
            primary={row.displayName ?? `成员 · ${row.phone.slice(-4)}`}
            secondary={`${displayProjectRole(row.projectRoleLabel)} · ${row.teamName ?? "无班组"}`}
            chip={`${(row.workedMinutes / 60).toFixed(1)}h`}
            onClick={() =>
              setOpenId(openId === row.memberId ? null : row.memberId)
            }
          />
          {openId === row.memberId ? (
            <Notice>
              {row.requiresAttendance
                ? rowSummary(row)
                : "免考勤成员，不计入应出勤。"}
            </Notice>
          ) : null}
        </View>
      ))}
      <Button
        variant="outline"
        disabled={rows.length === 0}
        onClick={() => {
          void copy();
        }}
      >
        复制当前明细
      </Button>
      {error ? <Notice>{error}</Notice> : null}
    </View>
  );
};
