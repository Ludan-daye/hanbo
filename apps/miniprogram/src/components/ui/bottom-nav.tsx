import { Button, View } from "@tarojs/components";
import Taro from "@tarojs/taro";

import { AppIcon, type IconName } from "./icon";

type NavKey = "home" | "workspace" | "profile";
type NavItem = {
  readonly key: NavKey;
  readonly title: string;
  readonly icon: IconName;
  readonly url: string;
};
const ITEMS: readonly NavItem[] = [
  { key: "home", title: "首页", icon: "home", url: "/pages/home/index" },
  {
    key: "workspace",
    title: "工作台",
    icon: "grid",
    url: "/pages/workspace/index",
  },
  { key: "profile", title: "我的", icon: "user", url: "/pages/profile/index" },
];

export const BottomNav = ({
  active,
}: {
  readonly active: NavKey;
}): JSX.Element => (
  <View className="ui-bottom-nav">
    {ITEMS.map((item) => (
      <Button
        key={item.key}
        className={`ui-bottom-nav__item ${active === item.key ? "ui-bottom-nav__item--active" : ""}`}
        onClick={() => {
          if (active !== item.key) void Taro.reLaunch({ url: item.url });
        }}
      >
        <AppIcon name={item.icon} />
        <View>{item.title}</View>
      </Button>
    ))}
  </View>
);
