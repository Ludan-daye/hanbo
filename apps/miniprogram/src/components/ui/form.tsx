import { Input, Switch, Text, Textarea, View } from "@tarojs/components";
import type { PropsWithChildren, ReactNode } from "react";

import { LineIcon } from "./line-icon";
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

/**
 * 日期切换：前一段、后一段，点中间选日期。
 * label 可以直接是文字，也可以是包着文字的 Picker（点中间弹出选择）。
 */
export const DateSwitch = ({
  label,
  onPrev,
  onNext,
  onPick,
}: {
  readonly label: ReactNode;
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

/** 表单行里直接输入：左边名称，右边靠右的输入框。放在 Sheet 里。 */
export const FormInput = ({
  label,
  required,
  value,
  placeholder,
  type,
  maxLength,
  password,
  disabled,
  error,
  onInput,
}: {
  readonly label: string;
  readonly required?: boolean;
  readonly value: string;
  readonly placeholder?: string;
  readonly type?: "text" | "number" | "digit" | "idcard";
  readonly maxLength?: number;
  readonly password?: boolean;
  readonly disabled?: boolean;
  readonly error?: boolean;
  readonly onInput: (value: string) => void;
}): JSX.Element => (
  <View className={`ui-form-row${error ? " ui-form-row--bad" : ""}`}>
    <View className="ui-form-row__label">
      {label}
      {required ? <Text className="ui-form-row__req">*</Text> : null}
    </View>
    <Input
      className="ui-form-row__input"
      value={value}
      placeholder={placeholder}
      placeholderClass="ui-form-row__placeholder"
      type={type ?? "text"}
      password={password}
      disabled={disabled}
      maxlength={maxLength ?? 140}
      onInput={(event) => onInput(event.detail.value)}
    />
  </View>
);

/** 多行输入：名称在上，输入框在下，右下角是字数。放在 Sheet 里。 */
export const FormArea = ({
  label,
  required,
  value,
  placeholder,
  maxLength,
  disabled,
  onInput,
  children,
}: PropsWithChildren<{
  readonly label: string;
  readonly required?: boolean;
  readonly value: string;
  readonly placeholder?: string;
  readonly maxLength?: number;
  readonly disabled?: boolean;
  readonly onInput: (value: string) => void;
}>): JSX.Element => (
  <View className="ui-form-area">
    <View className="ui-form-row__label">
      {label}
      {required ? <Text className="ui-form-row__req">*</Text> : null}
    </View>
    <Textarea
      className="ui-form-area__box"
      value={value}
      placeholder={placeholder}
      placeholderClass="ui-form-row__placeholder"
      disabled={disabled}
      maxlength={maxLength ?? 200}
      autoHeight
      onInput={(event) => onInput(event.detail.value)}
    />
    {maxLength ? (
      <View className="ui-form-area__count">
        {value.length} / {maxLength}
      </View>
    ) : null}
    {children}
  </View>
);

/** 开关行：左边名称和一句说明，右边开关。放在 Sheet 里。 */
export const FormSwitch = ({
  label,
  sub,
  checked,
  disabled,
  onChange,
}: {
  readonly label: string;
  readonly sub?: string;
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly onChange: (checked: boolean) => void;
}): JSX.Element => (
  <View className={`ui-form-row${sub ? " ui-form-row--tall" : ""}`}>
    <View className="ui-form-row__text">
      <View className="ui-form-row__label">{label}</View>
      {sub ? <View className="ui-form-row__sub">{sub}</View> : null}
    </View>
    <Switch
      checked={checked}
      disabled={disabled}
      color="#000000"
      onChange={(event) => onChange(event.detail.value)}
    />
  </View>
);

/** 搜索框。 */
export const SearchField = ({
  value,
  placeholder,
  onInput,
}: {
  readonly value: string;
  readonly placeholder: string;
  readonly onInput: (value: string) => void;
}): JSX.Element => (
  <View className="ui-search">
    <LineIcon name="search" tone="muted" />
    <Input
      className="ui-search__input"
      value={value}
      placeholder={placeholder}
      placeholderClass="ui-form-row__placeholder"
      confirmType="search"
      onInput={(event) => onInput(event.detail.value)}
    />
  </View>
);

/** 一组可点的小标签：单选或多选由调用方决定，选中的是黑底白字。 */
export const Chips = <T extends string>({
  options,
  selected,
  onToggle,
  onSheet,
}: {
  readonly options: ReadonlyArray<{ readonly value: T; readonly label: string }>;
  readonly selected: ReadonlyArray<T>;
  readonly onToggle: (value: T) => void;
  /** 放在白条里时用灰底；直接放在页面灰底上时用白底。 */
  readonly onSheet?: boolean;
}): JSX.Element => (
  <View className={`ui-chips${onSheet ? " ui-chips--on-sheet" : ""}`}>
    {options.map((option) => (
      <View
        key={option.value}
        className={`ui-chips__item ui-press${selected.includes(option.value) ? " ui-chips__item--on" : ""}`}
        {...PRESS}
        onClick={() => onToggle(option.value)}
      >
        {option.label}
      </View>
    ))}
  </View>
);

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"] as const;

/** 星期选择：周一到周日，值是 1 到 7。 */
export const Weekdays = ({
  selected,
  disabled,
  onToggle,
}: {
  readonly selected: ReadonlyArray<number>;
  readonly disabled?: boolean;
  readonly onToggle: (day: number) => void;
}): JSX.Element => (
  <View className="ui-weekdays">
    {WEEKDAYS.map((name, index) => (
      <View
        key={name}
        className={`ui-weekdays__item${selected.includes(index + 1) ? " ui-weekdays__item--on" : ""}`}
        onClick={disabled ? undefined : () => onToggle(index + 1)}
      >
        {name}
      </View>
    ))}
  </View>
);

/** 勾选框：方的用于多选，圆的用于单选。只负责显示，点击由所在的行处理。 */
export const Check = ({
  checked,
  round,
}: {
  readonly checked: boolean;
  readonly round?: boolean;
}): JSX.Element => (
  <View
    className={`ui-check${checked ? " ui-check--on" : ""}${round ? " ui-check--round" : ""}`}
  >
    {checked ? <View className="ui-check__tick" /> : null}
  </View>
);
