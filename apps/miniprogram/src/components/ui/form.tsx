import { Text, View } from "@tarojs/components";
import type { PropsWithChildren } from "react";

import { PRESS } from "./press";

/** 表单行：左边名称，右边值；放在 Sheet 里。children 放输入控件。 */
export const FormRow = ({
  label,
  required,
  value,
  placeholder,
  chevron,
  error,
  onClick,
  children,
}: PropsWithChildren<{
  readonly label: string;
  readonly required?: boolean;
  readonly value?: string;
  readonly placeholder?: string;
  readonly chevron?: boolean;
  readonly error?: boolean;
  readonly onClick?: () => void;
}>): JSX.Element => (
  <View
    className={`ui-form-row${error ? " ui-form-row--bad" : ""}${onClick ? " ui-press" : ""}`}
    {...(onClick ? PRESS : {})}
    onClick={onClick}
  >
    <View className="ui-form-row__label">
      {label}
      {required ? <Text className="ui-form-row__req">*</Text> : null}
    </View>
    <View
      className={`ui-form-row__value${!children && !value ? " ui-form-row__value--ph" : ""}`}
    >
      {children ?? (value || placeholder)}
      {chevron ? <View className="ui-chevron" /> : null}
    </View>
  </View>
);

export const FormError = ({
  children,
}: {
  readonly children: string;
}): JSX.Element => (
  <View className="ui-form-error" role="alert">
    {children}
  </View>
);

/** 日期切换：前一天、后一天，点中间选日期。 */
export const DateSwitch = ({
  label,
  onPrev,
  onNext,
  onPick,
}: {
  readonly label: string;
  readonly onPrev: () => void;
  readonly onNext: () => void;
  readonly onPick?: () => void;
}): JSX.Element => (
  <View className="ui-dsw">
    <View className="ui-dsw__arrow ui-press" {...PRESS} onClick={onPrev}>
      <View className="ui-chevron ui-chevron--left" />
    </View>
    <View className="ui-dsw__label" onClick={onPick}>
      {label}
    </View>
    <View className="ui-dsw__arrow ui-press" {...PRESS} onClick={onNext}>
      <View className="ui-chevron" />
    </View>
  </View>
);
