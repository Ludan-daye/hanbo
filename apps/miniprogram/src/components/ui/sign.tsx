import { View } from "@tarojs/components";
import type { PropsWithChildren } from "react";

import { PRESS } from "./press";

/** 标牌：每屏唯一的橙色块，放这一屏最要紧的那件事。橙底上只写黑字。 */
export const Sign = ({ children }: PropsWithChildren): JSX.Element => (
  <View className="ui-sign">{children}</View>
);

export const SignTop = ({
  left,
  right,
}: {
  readonly left: string;
  readonly right?: string;
}): JSX.Element => (
  <View className="ui-sign__top">
    <View>{left}</View>
    {right ? <View>{right}</View> : null}
  </View>
);

/** 大数字加单位，例如“66 人到岗”。 */
export const SignCount = ({
  value,
  unit,
}: {
  readonly value: string;
  readonly unit: string;
}): JSX.Element => (
  <View className="ui-sign__count">
    <View className="ui-sign__count-num num">{value}</View>
    <View className="ui-sign__count-unit">{unit}</View>
  </View>
);

/** 哪张卡、什么时候打、现在几点。 */
export const SignClock = ({
  title,
  note,
  time,
}: {
  readonly title: string;
  readonly note?: string;
  readonly time: string;
}): JSX.Element => (
  <>
    <View className="ui-sign__head">
      <View className="ui-sign__head-title">{title}</View>
      {note ? <View className="ui-sign__head-note">{note}</View> : null}
    </View>
    <View className="ui-sign__clock num">{time}</View>
  </>
);

/** 一句结论加一行说明。 */
export const SignText = ({
  title,
  sub,
}: {
  readonly title: string;
  readonly sub?: string;
}): JSX.Element => (
  <>
    <View className="ui-sign__big">{title}</View>
    {sub ? <View className="ui-sign__sub">{sub}</View> : null}
  </>
);

/** 标牌里的黑色例外条，例如“缺卡 7 人”。 */
export const SignAlert = ({
  label,
  value,
  action,
  onClick,
}: {
  readonly label: string;
  readonly value: string;
  readonly action?: string;
  readonly onClick?: () => void;
}): JSX.Element => (
  <View
    className={`ui-sign__alert${onClick ? " ui-press" : ""}`}
    {...(onClick ? PRESS : {})}
    onClick={onClick}
  >
    <View className="ui-sign__alert-label">{label}</View>
    <View className="ui-sign__alert-value">{value}</View>
    {action ? <View className="ui-sign__alert-action">{action}</View> : null}
  </View>
);

/** 标牌里的主按钮。一屏只有一个黑色实心按钮，有它就不要再放别的。 */
export const SignButton = ({
  children,
  busy,
  disabled,
  onClick,
}: {
  readonly children: string;
  readonly busy?: boolean;
  readonly disabled?: boolean;
  readonly onClick?: () => void;
}): JSX.Element => {
  const off = busy === true || disabled === true;
  return (
    <View
      className={`ui-sign__go ui-press${children.length > 3 ? " ui-sign__go--long" : ""}${off ? " ui-sign__go--off" : ""}`}
      {...(off ? {} : PRESS)}
      onClick={off ? undefined : onClick}
    >
      {children}
    </View>
  );
};

export const SignNote = ({
  children,
}: {
  readonly children: string;
}): JSX.Element => <View className="ui-sign__note">{children}</View>;

/** 小标牌：内页顶上的一句结论，右边可以带一个大数字。 */
export const SignLine = ({
  title,
  sub,
  value,
}: {
  readonly title: string;
  readonly sub?: string;
  readonly value?: string;
}): JSX.Element => (
  <View className="ui-signline">
    <View className="ui-signline__text">
      <View className="ui-signline__title">{title}</View>
      {sub ? <View className="ui-signline__sub">{sub}</View> : null}
    </View>
    {value ? <View className="ui-signline__value num">{value}</View> : null}
  </View>
);
