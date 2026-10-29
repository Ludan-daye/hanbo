import { View } from "@tarojs/components";

import {
  ListItem,
  Notice,
  PageHeader,
  Screen,
  Section,
} from "../../components/ui/index";
import { useSessionGuard } from "../../hooks/use-session-guard";
import {
  PERMISSION_LEVELS,
  permissionCategoryLabel,
  permissionLabel,
} from "../../routing/permissionLevels";
import { useSession } from "../../store/session";

export default function PermissionLevels(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  const role = state.me?.roles.highestRoleCode ?? null;
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
