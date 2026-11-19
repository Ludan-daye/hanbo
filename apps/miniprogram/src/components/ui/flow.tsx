import { Image, Text, View } from "@tarojs/components";
import type { PropsWithChildren } from "react";

import { LineIcon, type LineIconName } from "./line-icon";
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

/**
 * 照片位：有照片就显示照片，没有就是一个带图标和一句话的占位。
 * add 为真时是虚线框的“添加”位；small 用在一排多张的地方（放进 PhotoRow）。
 */
export const Photo = ({
  src,
  label,
  icon,
  small,
  add,
  onClick,
}: {
  readonly src?: string | null;
  readonly label?: string;
  readonly icon?: LineIconName;
  readonly small?: boolean;
  readonly add?: boolean;
  readonly onClick?: () => void;
}): JSX.Element => (
  <View
    className={`ui-photo${small ? " ui-photo--small" : ""}${add ? " ui-photo--add" : ""}${onClick ? " ui-press" : ""}`}
    {...(onClick ? PRESS : {})}
    onClick={onClick}
  >
    {src ? (
      <Image className="ui-photo__image" src={src} mode="aspectFill" lazyLoad />
    ) : (
      <>
        <LineIcon name={icon ?? (add ? "plus" : "camera")} tone="muted" />
        {label ? <View className="ui-photo__label">{label}</View> : null}
      </>
    )}
  </View>
);

/** 一排照片位。 */
export const PhotoRow = ({ children }: PropsWithChildren): JSX.Element => (
  <View className="ui-photo-row">{children}</View>
);

/** 大号的码：邀请码、验证码这类要照着念或抄的数字。 */
export const Code = ({
  children,
}: {
  readonly children: string;
}): JSX.Element => <View className="ui-code num">{children}</View>;

/** 进度条：percent 是 0 到 100。 */
export const ProgressBar = ({
  percent,
}: {
  readonly percent: number;
}): JSX.Element => (
  <View className="ui-progress">
    <View
      className="ui-progress__bar"
      style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
    />
  </View>
);
