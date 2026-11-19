import { View } from "@tarojs/components";

import { PRESS } from "../../../components/ui";

/** 带下划线的文字操作，放在一行的右边或底部操作条里。危险的操作用红字。 */
export const TextAction = ({
  children,
  danger,
  disabled,
  onClick,
}: {
  readonly children: string;
  readonly danger?: boolean;
  readonly disabled?: boolean;
  readonly onClick: () => void;
}): JSX.Element => (
  <View
    className={`team-work-action ui-press${danger ? " team-work-action--danger" : ""}${disabled ? " team-work-action--off" : ""}`}
    {...(disabled ? {} : PRESS)}
    onClick={disabled ? undefined : onClick}
  >
    {children}
  </View>
);
