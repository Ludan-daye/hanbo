import { View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";

import {
  ListItem,
  Notice,
  PageHeader,
  Screen,
  Section,
  StateView,
} from "../../components/ui/index";
import { useSessionGuard } from "../../hooks/use-session-guard";
import {
  PERMISSION_LEVELS,
  permissionCategoryLabel,
  permissionLabel,
} from "../../routing/permissionLevels";
import { useSession } from "../../store/session";
import { FlowScreen } from "../../components/worker-flow";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { fetchMyProjects } from "../../services/me";
import type { MyProjectMembership } from "../../services/me.types";
import { displayProjectRole } from "../../routing/features";
import { myProjectDetailUrl } from "../../services/project-attendance";

import "./index.scss";

export default function PermissionLevels(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  const role = state.me?.roles.highestRoleCode ?? null;
  const { revision, refresh } = usePageRefresh();
  const [projects, setProjects] = useState<readonly MyProjectMembership[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (role !== "WORKER") return;
    let cancelled = false;
    setError(null);
    void fetchMyProjects().then((rows) => {
      if (!cancelled) setProjects(rows);
    }, (cause: unknown) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : "读取项目身份失败");
    });
    return () => { cancelled = true; };
  }, [role, revision]);
  if (role === "WORKER") {
    const level = PERMISSION_LEVELS.find((item) => item.roleCode === role)!;
    return (
      <FlowScreen title="权限与范围">
        <View className="worker-permissions">
          <View className="worker-permissions__summary">
            <View className="worker-permissions__muted">当前身份</View>
            <View className="worker-permissions__name">{level.name}</View>
            <View className="worker-permissions__muted">{level.label} · {level.scope}</View>
          </View>
          <View className="worker-permissions__section">
            <View className="worker-permissions__heading">我的授权范围</View>
            {state.me?.roles.assignments.map((assignment) => {
              const project = projects?.find((item) =>
                assignment.scope.scopeType === "TEAM"
                  ? item.teamId === assignment.scope.scopeId
                  : item.projectId === assignment.scope.scopeId,
              );
              const scope = ({ GLOBAL: "全平台范围", COMPANY: "所属公司范围", PROJECT: "所属项目范围", TEAM: "所属班组范围" } as Readonly<Record<string, string>>)[assignment.scope.scopeType] ?? assignment.scope.scopeType;
              return <View className="worker-permissions__scope" key={`${assignment.roleCode}-${assignment.scope.scopeId}`}>
                <View>{permissionLabel(assignment.roleCode)}</View>
                <View className="worker-permissions__muted">{scope}{project ? ` · ${project.projectName}${assignment.scope.scopeType === "TEAM" && project.teamName ? ` · ${project.teamName}` : ""}` : ""}</View>
              </View>;
            })}
            {state.me?.roles.assignments.length === 0 ? <View className="worker-permissions__muted">暂无授权范围，请联系管理员核对。</View> : null}
          </View>
          <View className="worker-permissions__section">
            <View className="worker-permissions__heading">全部项目身份</View>
            {projects === null && error === null ? <StateView title="加载中…" /> : null}
            {error ? <StateView title="项目身份读取失败" sub={error} onRetry={refresh} /> : null}
            {projects?.map((project) => <ListItem key={project.projectId} primary={project.projectName} secondary={`${displayProjectRole(project.projectRoleLabel)} · ${project.teamName ?? "未分配班组"}`} onClick={() => { void Taro.navigateTo({ url: myProjectDetailUrl(project.projectId) }); }} />)}
            {projects?.length === 0 ? <View className="worker-permissions__muted">暂无项目成员身份。角色和班组由管理员分配。</View> : null}
          </View>
          <View className="worker-permissions__section">
            <View className="worker-permissions__heading">我可以使用的功能</View>
            <View>{level.functions}</View>
            {level.planned ? <View className="worker-permissions__muted">规划中：{level.planned}</View> : null}
          </View>
          <View className="worker-permissions__section">
            <View className="worker-permissions__heading">五级权限说明</View>
            <View className="worker-permissions__muted">工人权限：一至二级 · 管理人员权限：三至五级</View>
            {PERMISSION_LEVELS.map((item) => <View className="worker-permissions__level" key={item.roleCode}>
              <View className="worker-permissions__number">{item.level}</View>
              <View className="worker-permissions__level-body">
                <View className="worker-permissions__level-title">{item.name}{item.roleCode === role ? " · 当前" : ""}</View>
                <View className="worker-permissions__muted">{item.label} · {permissionCategoryLabel(item.category)}</View>
                <View className="worker-permissions__muted">范围：{item.scope}</View>
                <View className="worker-permissions__functions">{item.functions}</View>
                {item.planned !== null ? <View className="worker-permissions__muted">规划中：{item.planned}</View> : null}
              </View>
            </View>)}
          </View>
          <View className="worker-permissions__notice">权限由管理员分配，高等级在授权范围内继承下级权限。任何人不能审批自己的补卡。是否需要打卡由项目配置；工种、评分或被指定为负责人不会自动提升账号权限。</View>
        </View>
      </FlowScreen>
    );
  }
  return (
    <Screen>
      <PageHeader title="权限等级与功能" />
      <ListItem primary="当前权限" secondary={permissionLabel(role)} />
      <Section
        title="从一级到五级"
        sub="工人权限：一至二级 · 管理人员权限：三至五级"
      >
        {PERMISSION_LEVELS.map((level) => (
          <View key={level.roleCode} className="permission-level">
            <ListItem
              primary={level.label}
              secondary={`${permissionCategoryLabel(level.category)} · ${level.name}`}
              chip={level.roleCode === role ? "当前" : undefined}
            />
            <View className="ui-subtitle">范围：{level.scope}</View>
            <View className="permission-level__functions">
              {level.functions}
            </View>
            {level.planned !== null ? (
              <View className="ui-subtitle">规划中：{level.planned}</View>
            ) : null}
          </View>
        ))}
      </Section>
      <Notice>
        等级由管理员分配，高等级在授权范围内继承下级权限。任何人不能审批自己的补卡。是否需要打卡由项目配置。
      </Notice>
    </Screen>
  );
}
