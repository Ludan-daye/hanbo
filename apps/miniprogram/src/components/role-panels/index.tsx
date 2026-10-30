import { View } from "@tarojs/components";
import Taro from "@tarojs/taro";

import { AppIcon, StateView } from "../ui/index";
import { FEATURES } from "../../routing/features";
import type { PanelKey } from "../../routing/roleHome";
import type { WorkRoleScope } from "../../services/management.types";

const featureUrl = (url: string, scope: WorkRoleScope | undefined): string => {
  if (scope === undefined || scope.scopeType === "GLOBAL") return url;
  const query = scope.scopeType === "COMPANY" ? `companyId=${encodeURIComponent(scope.scopeId)}` : scope.scopeType === "PROJECT" ? `projectId=${encodeURIComponent(scope.scopeId)}` : `teamId=${encodeURIComponent(scope.scopeId)}&projectId=${encodeURIComponent(scope.projectId!)}`;
  return `${url}${url.includes("?") ? "&" : "?"}${query}`;
};

export const RolePanel = ({
  panel,
  limit,
  scope,
}: {
  readonly panel: PanelKey;
  readonly limit?: number;
  readonly scope?: WorkRoleScope;
}): JSX.Element => (
  <View className="feature-grid">
    {FEATURES[panel].slice(0, limit).map((feature) => (
      <View
        key={feature.url}
        className="feature-card"
        onClick={() => {
          void Taro.navigateTo({ url: featureUrl(feature.url, scope) });
        }}
      >
        <View
          className={`feature-card__icon feature-card__icon--${feature.icon}`}
        >
          <AppIcon name={feature.icon} />
        </View>
        <View className="feature-card__body">
          <View className="feature-card__title">{feature.title}</View>
          <View className="feature-card__sub">{feature.sub}</View>
        </View>
        <View className="feature-card__arrow">›</View>
      </View>
    ))}
    {panel === "none" ? (
      <StateView
        title="等待管理员分配角色"
        sub="身份已绑定，分配角色后即可使用对应的工作功能。"
      />
    ) : null}
  </View>
);
