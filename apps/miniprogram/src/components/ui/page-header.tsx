import { Button, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import type { PropsWithChildren } from "react";

const headerStyle = (): { readonly paddingTop: string } => ({
  paddingTop:
    process.env.TARO_ENV === "weapp"
      ? `${Taro.getWindowInfo().statusBarHeight}px`
      : "0px",
});

const HeaderFrame = ({
  children,
  appearance,
}: PropsWithChildren<{ readonly appearance?: "worker" }>): JSX.Element => {
  const capsule =
    appearance === "worker" && process.env.TARO_ENV === "weapp"
      ? Taro.getMenuButtonBoundingClientRect()
      : null;
  const statusHeight =
    process.env.TARO_ENV === "weapp"
      ? (Taro.getWindowInfo().statusBarHeight ?? 0)
      : 0;
  return (
    <View
      className={`ui-header${appearance === "worker" ? " worker-header" : ""}`}
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
    </View>
  );
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
  appearance,
}: {
  readonly title: string;
  readonly appearance?: "worker";
}): JSX.Element => (
  <HeaderFrame appearance={appearance}>
    <Button
      className="ui-header__back"
      aria-label="返回"
      onClick={() => {
        void returnToPreviousPage();
      }}
    >
      ‹
    </Button>
    <View className="ui-header__title">{title}</View>
  </HeaderFrame>
);

export const AppHeader = ({
  title,
  appearance,
}: {
  readonly title: string;
  readonly appearance?: "worker";
}): JSX.Element => (
  <HeaderFrame appearance={appearance}>
    <View className="ui-header__brand">{title}</View>
  </HeaderFrame>
);
