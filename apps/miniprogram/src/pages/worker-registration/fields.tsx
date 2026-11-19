import { Input, Picker, Text, Textarea, View } from "@tarojs/components";

import { FormError, FormRow } from "../../components/ui/index";
import type { RegistrationField } from "../../services/worker-registration-form";

import { visibleProblems } from "./registration-view";

// 这张表的规矩是“离开输入框才开始报错”，公共的 FormInput、FormArea 没有 onBlur，
// FormArea 也没有出错的红线，所以这里照它们的样子各写了一个带 onBlur 的。样式仍是公共组件那套。

/** 一行里直接输入，和 FormInput 一样，多一个 onBlur。放在 Sheet 里。 */
export const RegInput = ({
  label,
  required,
  value,
  placeholder,
  type,
  maxLength,
  disabled,
  error,
  onInput,
  onBlur,
}: {
  readonly label: string;
  readonly required?: boolean;
  readonly value: string;
  readonly placeholder: string;
  readonly type: "text" | "number" | "idcard";
  readonly maxLength: number;
  readonly disabled: boolean;
  readonly error: boolean;
  readonly onInput: (value: string) => void;
  readonly onBlur: () => void;
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
      maxlength={maxLength}
      // 身份证和数字键盘只在小程序里用；H5 演示版一律按普通文本输入（改版前就是这样）。
      type={process.env.TARO_ENV === "weapp" ? type : "text"}
      disabled={disabled}
      onInput={(event) => onInput(event.detail.value)}
      onBlur={onBlur}
    />
  </View>
);

/** 多行输入，和 FormArea 一样，多了 onBlur 和出错的红线。放在 Sheet 里。 */
export const RegArea = ({
  label,
  required,
  value,
  placeholder,
  maxLength,
  disabled,
  error,
  onInput,
  onBlur,
}: {
  readonly label: string;
  readonly required?: boolean;
  readonly value: string;
  readonly placeholder: string;
  readonly maxLength: number;
  readonly disabled: boolean;
  readonly error: boolean;
  readonly onInput: (value: string) => void;
  readonly onBlur?: () => void;
}): JSX.Element => (
  <View className={`ui-form-area${error ? " reg-area--bad" : ""}`}>
    <View className="ui-form-row__label">
      {label}
      {required ? <Text className="ui-form-row__req">*</Text> : null}
    </View>
    <Textarea
      className="ui-form-area__box"
      value={value}
      placeholder={placeholder}
      placeholderClass="ui-form-row__placeholder"
      maxlength={maxLength}
      disabled={disabled}
      autoHeight
      onInput={(event) => onInput(event.detail.value)}
      onBlur={onBlur}
    />
    <View className="ui-form-area__count">
      {value.length} / {maxLength}
    </View>
  </View>
);

const pressOnly = (): void => {};

/** 选日期的一行：点一下弹出日期选择。放在 Sheet 里。 */
export const DateRow = ({
  label,
  required,
  value,
  pickerValue,
  start,
  end,
  disabled,
  error,
  onChange,
}: {
  readonly label: string;
  readonly required?: boolean;
  /** 已经选的日期，没选是空字符串。 */
  readonly value: string;
  /** 没选时选择器先停在哪一天。 */
  readonly pickerValue: string;
  readonly start?: string;
  readonly end?: string;
  readonly disabled: boolean;
  readonly error: boolean;
  readonly onChange: (value: string) => void;
}): JSX.Element => (
  <Picker
    className="reg-pick"
    mode="date"
    value={pickerValue}
    start={start}
    end={end}
    disabled={disabled}
    onChange={(event) => onChange(event.detail.value)}
  >
    <FormRow
      label={label}
      required={required}
      value={value}
      placeholder="选择日期"
      chevron
      error={error}
      // 点击由外面的选择器接，这里只是让这一行按下时有反馈。
      onClick={disabled ? undefined : pressOnly}
    />
  </Picker>
);

/** 一块表单下面的出错原因：哪几个字段要报错，就各写一行。 */
export const Problems = ({
  fields,
  problem,
}: {
  readonly fields: readonly RegistrationField[];
  readonly problem: (field: RegistrationField) => string | null;
}): JSX.Element => (
  <>
    {visibleProblems(fields, problem).map((message) => (
      <FormError key={message}>{message}</FormError>
    ))}
  </>
);
