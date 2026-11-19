import { View } from "@tarojs/components";
import { useEffect, useState } from "react";

import {
  Button,
  Notice,
  PageHeader,
  Row,
  Screen,
  SectionTitle,
  Sheet,
  SignLine,
} from "../../components/ui/index";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { useSessionGuard } from "../../hooks/use-session-guard";
import {
  PERMISSION_LEVELS,
  permissionLevel,
} from "../../routing/permissionLevels";
import { errorMessage } from "../../services/error-messages";
import { fetchMyProjects } from "../../services/me";
import type { MyProjectMembership } from "../../services/me.types";
import { useSession } from "../../store/session";

import {
  assignmentLine,
  LEVEL_SUMMARY,
  levelScopeLine,
  levelTitle,
  roleShortName,
} from "./levels-model";

import "./index.scss";

/** 权限与范围：先说我是哪一级、管到哪，再列五个等级，自己那一级标出来。 */
export default function PermissionLevels(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  const role = state.me?.roles.highestRoleCode ?? null;
  const { revision, refresh } = usePageRefresh();
  const [projects, setProjects] = useState<
    readonly MyProjectMembership[] | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (role !== "WORKER") return;
    let cancelled = false;
    setError(null);
    void fetchMyProjects().then(
      (rows) => {
        if (!cancelled) setProjects(rows);
      },
      (cause: unknown) => {
        if (!cancelled) setError(errorMessage(cause, "读取项目身份失败"));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [role, revision]);
  const level = role === null ? null : permissionLevel(role);
  const assignments = state.me?.roles.assignments ?? [];

  return (
    <Screen header={<PageHeader title="权限与范围" />}>
      {level === null ? (
        <>
          <SignLine title="还没有分配权限" sub="请联系管理员给你分配角色" />
          <Notice>分配好以后，这里会写清你是哪一级、能管到哪。</Notice>
        </>
      ) : (
        <>
          <SignLine
            title={levelTitle(level)}
            sub={levelScopeLine(level, assignments, projects)}
          />
          <Notice>可以：{level.functions}。</Notice>
        </>
      )}
      {error ? (
        <>
          <Notice tone="error">
            项目和班组的名字没读到
            <View className="ui-notice__sub">{error}</View>
          </Notice>
          <Button variant="outline" onClick={refresh}>
            重新读取
          </Button>
        </>
      ) : null}
      {assignments.length > 1 ? (
        <>
          <SectionTitle>我的范围</SectionTitle>
          <Sheet>
            {assignments.map((assignment) => (
              <Row
                key={`${assignment.roleCode}-${assignment.scope.scopeId}`}
                title={roleShortName(assignment.roleCode)}
                sub={assignmentLine(assignment, projects)}
              />
            ))}
          </Sheet>
        </>
      ) : null}
      <SectionTitle>五个等级</SectionTitle>
      <Sheet>
        {PERMISSION_LEVELS.map((item) => {
          const mine = item.roleCode === role;
          return (
            <View
              key={item.roleCode}
              className={`levels-row${mine ? " levels-row--mine" : ""}`}
            >
              <View className="levels-row__num num">{item.level}</View>
              <View className="levels-row__text">
                <View className="levels-row__name">
                  {roleShortName(item.roleCode)}
                </View>
                <View className="levels-row__sub">
                  {LEVEL_SUMMARY[item.roleCode]}
                </View>
              </View>
              {mine ? <View className="levels-row__mark">我的等级</View> : null}
            </View>
          );
        })}
      </Sheet>
      <Notice>
        <View>
          权限由管理员分配。上一级在自己的范围里，包含下面各级的权限。
        </View>
        <View>自己的补卡要由别人审批。打卡要求由项目设置。</View>
        <View>工种、评分和班组负责人的身份不改变权限。</View>
      </Notice>
    </Screen>
  );
}
