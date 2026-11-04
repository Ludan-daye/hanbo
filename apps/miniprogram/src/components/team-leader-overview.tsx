import { Picker, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";

import {
  Field,
  ListItem,
  Section,
  StateView,
  StatCards,
  Subtitle,
} from "./ui/index";
import { RolePanel } from "./role-panels/index";
import {
  fetchMyRoleScopes,
  fetchTeamDailyReport,
  fetchTeamParticipants,
} from "../services/management";
import type {
  DailyReport,
  DailyReportParticipant,
  ProjectParticipant,
  WorkRoleScope,
} from "../services/management.types";
import { fetchPendingMakeups } from "../services/makeups";
import { chinaToday } from "../services/time";
import { useSession } from "../store/session";

type TeamOverview = {
  readonly teamId: string;
  readonly date: string;
  readonly report: DailyReport;
  readonly workers: readonly ProjectParticipant[];
  readonly pendingCount: number;
};

export const TeamLeaderOverview = ({
  revision,
  onRefresh,
}: {
  readonly revision: number;
  readonly onRefresh: () => void;
}): JSX.Element => {
  const { state } = useSession();
  const [teams, setTeams] = useState<readonly WorkRoleScope[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scopeError, setScopeError] = useState<string | null>(null);
  const [overview, setOverview] = useState<TeamOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<string>("");
  const date: string = chinaToday();
  const selected: WorkRoleScope | null =
    teams?.find((team) => team.scopeId === selectedId) ?? null;

  useEffect(() => {
    let cancelled: boolean = false;
    setScopeError(null);
    void fetchMyRoleScopes().then(
      (scopes) => {
        if (cancelled) return;
        const available: readonly WorkRoleScope[] = scopes.filter(
          (scope) =>
            scope.roleCode === "TEAM_LEADER" && scope.scopeType === "TEAM",
        );
        setTeams(available);
        setSelectedId((current) =>
          available.some((team) => team.scopeId === current)
            ? current
            : (available[0]?.scopeId ?? null),
        );
      },
      (cause: unknown) => {
        if (!cancelled)
          setScopeError(
            cause instanceof Error
              ? cause.message
              : "读取所管班组失败，请重试。",
          );
      },
    );
    return () => {
      cancelled = true;
    };
  }, [revision, state.me]);

  useEffect(() => {
    if (selected === null) return;
    let cancelled: boolean = false;
    setOverview(null);
    setError(null);
    void Promise.all([
      fetchTeamDailyReport(selected.scopeId, date),
      fetchTeamParticipants(selected.scopeId),
      fetchPendingMakeups(selected.scopeId),
    ]).then(
      ([report, members, pending]) => {
        if (!cancelled)
          setOverview({
            teamId: selected.scopeId,
            date,
            report,
            workers: members.filter(
              (member) =>
                member.status === "ACTIVE" &&
                member.participantType === "WORKER",
            ),
            pendingCount: pending.length,
          });
      },
      (cause: unknown) => {
        if (!cancelled)
          setError(
            cause instanceof Error
              ? cause.message
              : "读取班组工作信息失败，请重试。",
          );
      },
    );
    return () => {
      cancelled = true;
    };
  }, [selected, date, revision]);

  if (scopeError)
    return (
      <StateView
        title="班组范围读取失败"
        sub={scopeError}
        onRetry={onRefresh}
      />
    );
  if (teams === null) return <StateView title="正在读取所管班组…" />;
  if (selected === null)
    return (
      <StateView
        title="暂未分配班组"
        sub="请联系项目管理员分配班组。"
      />
    );

  const data: TeamOverview | null =
    overview?.teamId === selected.scopeId && overview.date === date
      ? overview
      : null;
  const keyword: string = search.trim();
  const workers: readonly ProjectParticipant[] = (data?.workers ?? []).filter(
    (worker) =>
      keyword.length === 0 ||
      worker.displayName?.includes(keyword) ||
      worker.phone.includes(keyword),
  );
  const attendanceUrl: string = `/pages/team-attendance/index?teamId=${encodeURIComponent(selected.scopeId)}`;

  return (
    <>
      <Section title="我的班组">
        <Picker
          mode="selector"
          range={teams.map((team) => team.scopeName)}
          value={teams.findIndex((team) => team.scopeId === selected.scopeId)}
          onChange={(event) => {
            const next: WorkRoleScope | undefined =
              teams[Number(event.detail.value)];
            if (next === undefined) return;
            setSelectedId(next.scopeId);
            setSearch("");
          }}
        >
          <ListItem
            primary={selected.scopeName}
            secondary={date}
            chip={teams.length > 1 ? "切换班组" : "当前班组"}
          />
        </Picker>
      </Section>
      {error ? (
        <StateView title="班组概览加载失败" sub={error} onRetry={onRefresh} />
      ) : data === null ? (
        <StateView title="正在同步今日考勤…" />
      ) : (
        <>
          <Section title="今日考勤">
            <StatCards
              items={[
                { label: "本班工人", value: String(data.workers.length) },
                {
                  label: "今日已出勤",
                  value: String(data.report.totals.actualAttendedDays),
                },
                {
                  label: "缺卡人次",
                  value: String(data.report.totals.missingPunchCount),
                },
              ]}
            />
            <ListItem
              primary="查看班组考勤"
              secondary={`迟到 ${data.report.totals.lateCount} · 早退 ${data.report.totals.earlyLeaveCount} · 已记录 ${(data.report.totals.workedMinutes / 60).toFixed(1)} 小时`}
              chip="日报／月报"
              onClick={() => {
                void Taro.navigateTo({ url: attendanceUrl });
              }}
            />
            <Subtitle>
              按应勤成员统计，未到时点不计缺卡。
            </Subtitle>
            <ListItem
              primary={`本班待审批 · ${data.pendingCount} 条`}
              chip="去处理"
              onClick={() => {
                void Taro.navigateTo({ url: "/pages/team-makeups/index" });
              }}
            />
          </Section>
          <Section title="本班工人" sub={`在场 ${data.workers.length} 人`}>
            <Field
              value={search}
              placeholder="搜索姓名或手机号"
              onInput={setSearch}
            />
            {workers.length === 0 ? (
              <StateView
                title={keyword ? "没有找到这位工人" : "本班暂无在场工人"}
                sub="人员调整由项目管理员办理。"
              />
            ) : (
              workers.map((worker) => {
                const day: DailyReportParticipant | undefined =
                  data.report.participants.find(
                    (person) => person.memberId === worker.memberId,
                  );
                const phone: string =
                  worker.phone.length === 11
                    ? `${worker.phone.slice(0, 3)}****${worker.phone.slice(-4)}`
                    : worker.phone;
                const abnormalities: readonly string[] =
                  day === undefined
                    ? []
                    : [
                        day.isAbsent ? "缺勤" : "",
                        day.isMissingPunch ? "缺卡" : "",
                        day.isLate ? "迟到" : "",
                        day.isEarlyLeave ? "早退" : "",
                      ].filter(Boolean);
                return (
                  <ListItem
                    key={worker.memberId}
                    primary={worker.displayName ?? "姓名待补录"}
                    secondary={`${day?.workType ?? "工种待补录"} · ${phone}`}
                    chip={
                      !worker.requiresAttendance
                        ? "无需考勤"
                        : abnormalities.length > 0
                          ? abnormalities.join(" / ")
                          : day === undefined
                            ? "无今日记录"
                            : `已计 ${(day.workedMinutes / 60).toFixed(1)} 小时`
                    }
                  />
                );
              })
            )}
          </Section>
        </>
      )}
      <Section title="班组工作">
        <View className="home-shortcuts">
          <RolePanel panel="teamLeader" limit={6} scope={selected} />
        </View>
      </Section>
      <Section title="个人功能">
        <View className="home-shortcuts">
          <RolePanel panel="worker" />
        </View>
      </Section>
    </>
  );
};
