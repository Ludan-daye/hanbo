import { Button, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import type { PropsWithChildren } from "react";

const headerStyle = (): { readonly paddingTop: string } => ({
  paddingTop:
    process.env.TARO_ENV === "weapp"
      ? `${Taro.getWindowInfo().statusBarHeight}px`
      : "0px",
});

const HeaderFrame = ({ children }: PropsWithChildren): JSX.Element => (
  <View className="ui-header" style={headerStyle()}>
    <View className="ui-header__bar">
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

const returnToPreviousPage = async (): Promise<void> => {
  if (Taro.getCurrentPages().length > 1) {
    await Taro.navigateBack();
  } else {
    await Taro.reLaunch({ url: "/pages/home/index" });
  }
};

export const PageHeader = ({
  title,
}: {
  readonly title: string;
}): JSX.Element => (
  <HeaderFrame>
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
}: {
  readonly title: string;
}): JSX.Element => (
  <HeaderFrame>
    <View className="ui-header__brand">{title}</View>
  </HeaderFrame>
);
