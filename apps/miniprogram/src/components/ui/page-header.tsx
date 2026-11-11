import { Button, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import {
  useId,
  useLayoutEffect,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from "react";

const headerStyle = (): { readonly paddingTop: string } => ({
  paddingTop:
    process.env.TARO_ENV === "weapp"
      ? `${Taro.getWindowInfo().statusBarHeight}px`
      : "0px",
});

const HeaderFrame = ({
  children,
  appearance,
  footer,
}: PropsWithChildren<{
  readonly appearance?: "worker";
  readonly footer?: ReactNode;
}>): JSX.Element => {
  const capsule =
    appearance === "worker" && process.env.TARO_ENV === "weapp"
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
    if (appearance !== "worker") return;
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
  }, [appearance, children, footer, headerId]);
  const header = (
    <View
      id={appearance === "worker" ? headerId : undefined}
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
      {footer}
    </View>
  );
  return appearance === "worker" ? (
    <View
      className="worker-header-space"
      style={{ height: `${headerHeight}px` }}
    >
      {header}
    </View>
  ) : (
    header
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
  footer,
}: {
  readonly title: string;
  readonly appearance?: "worker";
  readonly footer?: ReactNode;
}): JSX.Element => (
  <HeaderFrame appearance={appearance} footer={footer}>
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
