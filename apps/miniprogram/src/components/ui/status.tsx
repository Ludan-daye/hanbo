import { View } from "@tarojs/components";

import { statusKindFor, type StatusKind } from "./status-kind";

/** 状态：形状加颜色，不只靠颜色。不传 kind 时按文案推断。 */
export const Status = ({
  kind,
  children,
}: {
  readonly kind?: StatusKind;
  readonly children: string;
}): JSX.Element => {
  const resolved = kind ?? statusKindFor(children);
  return (
    <View className={`ui-status ui-status--${resolved}`}>
      {resolved === "idle" ? null : <View className="ui-status__mark" />}
      <View>{children}</View>
    </View>
  );
};
