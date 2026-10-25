import { View } from "@tarojs/components";
import Taro from "@tarojs/taro";

import { AppIcon, StateView } from "../ui/index";
import { FEATURES } from "../../routing/features";
import type { PanelKey } from "../../routing/roleHome";

export const RolePanel = ({
  panel,
}: {
  readonly panel: PanelKey;
}): JSX.Element => (
  <View className="feature-grid">
    {FEATURES[panel].map((feature) => (
      <View
        key={feature.url}
        className="feature-card"
        onClick={() => {
          void Taro.navigateTo({ url: feature.url });
        }}
      >
        <View
          className={`feature-card__icon feature-card__icon--${feature.icon}`}
        >
          <AppIcon name={feature.icon} />
        </View>
        <View className="feature-card__title">{feature.title}</View>
        <View className="feature-card__sub">{feature.sub}</View>
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
