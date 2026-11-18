import { Text, View } from "@tarojs/components";
import type { PropsWithChildren } from "react";

import { PRESS } from "./press";

/** 步骤条：第几步、共几步、这一步叫什么。 */
export const Steps = ({
  current,
  total,
  label,
}: {
  readonly current: number;
  readonly total: number;
  readonly label: string;
}): JSX.Element => (
  <View className="ui-steps">
    <View className="ui-steps__bars">
      {Array.from({ length: total }, (_, index) => (
        <View
          key={index}
          className={`ui-steps__bar${index < current ? " ui-steps__bar--on" : ""}`}
        />
      ))}
    </View>
    <View className="ui-steps__text">
      第 {current} 步，共 {total} 步：
      <Text className="ui-steps__label">{label}</Text>
    </View>
  </View>
);

/** 红章：办完了就盖章。play 为真时播放一次落章。 */
export const Stamp = ({
  text,
  sub,
  size,
  play,
}: {
  readonly text: string;
  readonly sub?: string;
  readonly size?: "sm" | "lg";
  readonly play?: boolean;
}): JSX.Element => (
  <View
    className={`ui-stamp${size === "lg" ? " ui-stamp--lg" : ""}${play ? " m-stamp" : ""}`}
  >
    <View>{text}</View>
    {sub ? <View className="ui-stamp__sub num">{sub}</View> : null}
  </View>
);

/**
 * 底部操作条：固定在底部，主操作是这一屏唯一的黑色实心按钮，children 放次要操作。
 * 提交中把 busy 设为真并把文案换成“…中”：按钮变灰，不能再点。
 */
export const BottomBar = ({
  primary,
  busy,
  disabled,
  onPrimary,
  children,
}: PropsWithChildren<{
  readonly primary?: string;
  readonly busy?: boolean;
  readonly disabled?: boolean;
  readonly onPrimary?: () => void;
}>): JSX.Element => {
  const off = busy === true || disabled === true;
  return (
    <View className="ui-bar">
      {children}
      {primary ? (
        <View
          className={`ui-bar__primary ui-press${off ? " ui-bar__primary--off" : ""}`}
          {...(off ? {} : PRESS)}
          onClick={off ? undefined : onPrimary}
        >
          {primary}
        </View>
      ) : null}
    </View>
  );
};
