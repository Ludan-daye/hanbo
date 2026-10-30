import { Picker, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useState } from "react";

import { ReportPerson } from "./report-person-detail";
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
  "scheduledDays" in row
    ? `应出勤 ${row.scheduledDays} 天 · 实出勤 ${row.actualAttendedDays} 天 · 出勤率 ${row.scheduledDays === 0 ? "不适用" : `${((row.actualAttendedDays / row.scheduledDays) * 100).toFixed(1)}%`} · 缺勤 ${row.absenceCount} 天 · 缺卡 ${row.missingPunchCount} 天 · 迟到 ${row.lateCount} 天 · 早退 ${row.earlyLeaveCount} 天 · 已批补卡 ${row.approvedMakeupCount} 次 · 异常 ${row.abnormalRecordCount} 次`
    : [
        row.isAbsent ? "缺勤" : "",
        row.isMissingPunch ? "缺卡" : "",
        row.isLate ? "迟到" : "",
        row.isEarlyLeave ? "早退" : "",
        `已批补卡 ${row.approvedMakeupCount} 次`,
        `异常 ${row.abnormalRecordCount} 次`,
      ]
        .filter(Boolean)
        .join(" · ");
export const ReportParticipants = ({
  report,
  teamId,
  onChanged,
}: {
  readonly report: DailyReport | RangeReport;
  readonly teamId: string | null;
  readonly onChanged: () => void;
}): JSX.Element => {
  const [search, setSearch] = useState<string>("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [team, setTeam] = useState<string>("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [openProject, setOpenProject] = useState<string | null>(
    new Set(report.participants.map((row) => row.projectId)).size === 1
      ? (report.participants[0]?.projectId ?? null)
      : null,
  );
  const [visibleCount, setVisibleCount] = useState<number>(30);
  const [error, setError] = useState<string | null>(null);
  const teams = [
    ...new Map(
      report.participants
        .filter((row) => row.teamId !== null)
        .map((row) => [
          row.teamId!,
          { id: row.teamId!, label: `${row.projectName} · ${row.teamName}` },
        ]),
    ).values(),
  ];
  const rows: readonly Row[] = report.participants.filter(
    (row) =>
      (filter === "ALL" || row.participantType === filter) &&
      (!team || row.teamId === team) &&
      `${row.displayName ?? ""} ${row.phone} ${displayProjectRole(row.projectRoleLabel)}`.includes(
        search.trim(),
      ),
  );
  const projects = [
    ...new Map(rows.map((row) => [row.projectId, row.projectName])).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1], "zh-CN"));
  const people = [
    ...new Set(rows.map((row) => `${row.projectId}:${row.memberId}`)),
  ];
  const copy = async (): Promise<void> => {
    setError(null);
    const text = [
      `考勤明细 ${report.startDate} 至 ${report.endDate}`,
      "项目\t姓名\t工种\t岗位\t班组\t工时(h)\t出勤情况\t当前项目评分\t评语\t评分人\t评分时间",
      ...rows.map((row) =>
        [
          row.projectName,
          row.displayName ?? row.phone,
          row.workType ?? "未填写",
          displayProjectRole(row.projectRoleLabel),
          row.teamName ?? "无班组",
          (row.workedMinutes / 60).toFixed(1),
          rowSummary(row),
          row.evaluation?.score ?? "未评分",
          row.evaluation?.comment ?? "",
          row.evaluation?.reviewerName ?? "",
          row.evaluation?.reviewedAt ?? "",
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
        按项目查看 · {projects.length} 个项目 · {people.length} 人次
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
        range={["全部班组", ...teams.map((item) => item.label)]}
        value={teams.findIndex((item) => item.id === team) + 1}
        onChange={(event) =>
          setTeam(teams[Number(event.detail.value) - 1]?.id ?? "")
        }
      >
        <ListItem
          primary="班组筛选"
          secondary={
            teams.find((item) => item.id === team)?.label ?? "全部班组"
          }
          chip="选择"
        />
      </Picker>
      <Subtitle>
        工地项目 → 人员 →
        每日记录与项目评分。筛选只影响下方列表，同人跨项目分别统计。
      </Subtitle>
      {rows.length === 0 ? <StateView title="没有符合条件的人员" /> : null}
      {projects.map(([projectId, projectName]) => {
        const projectRows = rows.filter((row) => row.projectId === projectId);
        const memberIds = [...new Set(projectRows.map((row) => row.memberId))];
        const hours =
          projectRows.reduce((sum, row) => sum + row.workedMinutes, 0) / 60;
        return (
          <View key={projectId} className="report-project">
            <ListItem
              primary={projectName}
              secondary={`${memberIds.length} 人 · 累计 ${hours.toFixed(1)}h`}
              chip={openProject === projectId ? "收起" : "查看人员"}
              onClick={() => {
                setOpenProject(openProject === projectId ? null : projectId);
                setOpenId(null);
                setVisibleCount(30);
              }}
            />
            {openProject === projectId ? (
              <View>
                {memberIds.slice(0, visibleCount).map((memberId) => {
                  const slices = projectRows.filter(
                    (row) => row.memberId === memberId,
                  );
                  const person = slices[0];
                  const key = `${projectId}:${memberId}`;
                  const totalMinutes = slices.reduce(
                    (sum, row) => sum + row.workedMinutes,
                    0,
                  );
                  return (
                    <View key={key} className="report-member">
                      <ListItem
                        primary={
                          person.displayName ??
                          `成员 · ${person.phone.slice(-4)}`
                        }
                        secondary={[
                          ...new Set([
                            person.workType ?? "工种未填写",
                            displayProjectRole(person.projectRoleLabel),
                          ]),
                          person.evaluation === null
                            ? "未评分"
                            : `${person.evaluation.score} 分`,
                        ].join(" · ")}
                        chip={`${(totalMinutes / 60).toFixed(1)}h · ${openId === key ? "收起" : "详情"}`}
                        onClick={() => setOpenId(openId === key ? null : key)}
                      />
                      {openId === key ? (
                        <View>
                          {slices.map((row) => (
                            <Notice key={row.teamId ?? "direct"}>
                              {row.teamName ?? "项目直属"} ·{" "}
                              {row.requiresAttendance
                                ? rowSummary(row)
                                : "免考勤成员，不计入应出勤。"}
                            </Notice>
                          ))}
                          <ReportPerson
                            key={`${key}:${report.startDate}:${report.endDate}:${team}`}
                            projectId={projectId}
                            memberId={memberId}
                            teamId={teamId ?? (team || null)}
                            from={report.startDate}
                            to={report.endDate}
                            onChanged={onChanged}
                          />
                        </View>
                      ) : null}
                    </View>
                  );
                })}
                {memberIds.length > visibleCount ? (
                  <Button
                    variant="outline"
                    onClick={() => setVisibleCount(visibleCount + 30)}
                  >
                    加载更多人员（剩余 {memberIds.length - visibleCount} 人）
                  </Button>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}
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
