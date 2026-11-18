import { Button, View } from "@tarojs/components";
import Taro from "@tarojs/taro";

import { useSession } from "../../store/session";
import { LineIcon } from "./line-icon";
import { PRESS } from "./press";

type NavKey = "home" | "workspace" | "projects" | "profile";
type NavItem = {
  readonly key: NavKey;
  readonly title: string;
  readonly icon: "home" | "grid" | "building" | "user";
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

/**
 * 底部导航在每个根页面都出现，所以先于各页面统一成新样子：
 * 不管页面改没改版，切换时导航都不变。appearance 仅为兼容旧调用保留。
 */
export const BottomNav = ({
  active,
}: {
  readonly active: NavKey;
  readonly appearance?: "worker" | "sign";
}): JSX.Element => {
  const { state } = useSession();
  const isWorker = state.me?.roles.highestRoleCode === "WORKER";
  const items: readonly NavItem[] = ITEMS.map((item) =>
    item.key === "workspace" && isWorker
      ? {
          key: "projects",
          title: "项目",
          icon: "building",
          url: "/pages/my-projects/index",
        }
      : item,
  );
  return (
    <View className="ui-bottom-nav sign-nav">
      {items.map((item) => (
        <Button
          key={item.key}
          className={`ui-bottom-nav__item ui-press ${active === item.key ? "ui-bottom-nav__item--active" : ""}`}
          {...PRESS}
          onClick={() => {
            if (active !== item.key) void Taro.reLaunch({ url: item.url });
          }}
        >
          <LineIcon
            name={item.icon}
            tone={active === item.key ? "ink" : "soft"}
          />
          <View>{item.title}</View>
        </Button>
      ))}
    </View>
  );
};
