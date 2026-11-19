import { View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import {
  useId,
  useLayoutEffect,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from "react";

import { PRESS } from "./press";

/** 只为兼容旧调用保留：页头只有一种样子。 */
export type HeaderAppearance = "worker" | "sign";

const headerStyle = (): { readonly paddingTop: string } => ({
  paddingTop:
    process.env.TARO_ENV === "weapp"
      ? `${Taro.getWindowInfo().statusBarHeight}px`
      : "0px",
});

const HeaderFrame = ({
  children,
  footer,
}: PropsWithChildren<{
  readonly footer?: ReactNode;
}>): JSX.Element => {
  // 页头固定在顶部，并让开右上角的胶囊按钮。
  const capsule =
    process.env.TARO_ENV === "weapp"
      ? Taro.getMenuButtonBoundingClientRect()
      : null;
  const statusHeight =
    process.env.TARO_ENV === "weapp"
      ? (Taro.getWindowInfo().statusBarHeight ?? 0)
      : 0;
  const headerId = `worker-header-${useId().replace(/:/g, "")}`;
  const [headerHeight, setHeaderHeight] = useState(
    statusHeight +
      Math.max(
        48,
        capsule ? (capsule.top - statusHeight) * 2 + capsule.height : 48,
      ),
  );
  useLayoutEffect(() => {
    let active = true;
    const measure = (): void => {
      Taro.nextTick(() => {
        if (!active) return;
        Taro.createSelectorQuery()
          .select(`#${headerId}`)
          .boundingClientRect((rect) => {
            if (active && rect && !Array.isArray(rect) && rect.height > 0)
              setHeaderHeight(rect.height);
          })
          .exec();
      });
    };
    measure();
    Taro.onWindowResize(measure);
    return () => {
      active = false;
      Taro.offWindowResize(measure);
    };
  }, [children, footer, headerId]);
  const header = (
    <View
      id={headerId}
      className="ui-header sign-header"
      style={headerStyle()}
    >
      <View
        className="ui-header__bar"
        style={
          capsule
            ? {
                minHeight: `${Math.max(44, (capsule.top - statusHeight) * 2 + capsule.height)}px`,
                paddingRight: `${Taro.getWindowInfo().windowWidth - capsule.left}px`,
              }
            : undefined
        }
      >
        {children}
        {process.env.TARO_ENV === "h5" ? (
          <View className="ui-capsule" aria-hidden>
            <View className="ui-capsule__dots">•••</View>
            <View className="ui-capsule__ring" />
          </View>
        ) : null}
      </View>
      {footer}
    </View>
  );
  // 页头是固定定位的，用一个同样高的空块把下面的内容顶开。
  return <View style={{ height: `${headerHeight}px` }}>{header}</View>;
};

const returnToPreviousPage = async (): Promise<void> => {
  if (Taro.getCurrentPages().length > 1) {
    await Taro.navigateBack();
  } else {
    await Taro.reLaunch({ url: "/pages/home/index" });
  }
};

export const PageHeader = ({
  title,
  footer,
  onBack,
}: {
  readonly title: string;
  readonly appearance?: HeaderAppearance;
  readonly footer?: ReactNode;
  /** 页面里有自己的“上一层”（比如同一个页面里的子视图）时，由它决定返回到哪。 */
  readonly onBack?: () => void;
}): JSX.Element => (
  <HeaderFrame footer={footer}>
    <View
      className="ui-header__back-hit ui-press"
      aria-label="返回"
      {...PRESS}
      onClick={() => {
        if (onBack) onBack();
        else void returnToPreviousPage();
      }}
    >
      <View className="ui-chevron ui-chevron--back" />
    </View>
    <View className="ui-header__title">{title}</View>
  </HeaderFrame>
);

export const AppHeader = ({
  title,
  onSwitch,
}: {
  readonly title: string;
  readonly appearance?: HeaderAppearance;
  /** 传了就在标题后显示小三角，点标题切换项目或班组。 */
  readonly onSwitch?: () => void;
}): JSX.Element => (
  <HeaderFrame>
    {onSwitch ? (
      <View className="ui-header__switch ui-press" {...PRESS} onClick={onSwitch}>
        <View className="ui-header__brand">{title}</View>
        <View className="ui-caret" />
      </View>
    ) : (
      <View className="ui-header__brand">{title}</View>
    )}
  </HeaderFrame>
);
