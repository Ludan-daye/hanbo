import { Picker, View } from "@tarojs/components";

import { Chips, FormRow } from "../ui";

import { dateLabel } from "./person-text";

import "./index.scss";

/** 点一下从几个选项里选一个：表单里的一行，放在 Sheet 里。 */
export const SelectRow = ({
  label,
  required,
  options,
  index,
  value,
  placeholder,
  disabled,
  error,
  onChange,
}: {
  readonly label: string;
  readonly required?: boolean;
  /** 选项的文字；第一项通常是“不选”。 */
  readonly options: ReadonlyArray<string>;
  /** 现在选的是第几项。 */
  readonly index: number;
  /** 行里显示的值；空着时显示 placeholder。 */
  readonly value: string;
  readonly placeholder?: string;
  readonly disabled?: boolean;
  readonly error?: boolean;
  readonly onChange: (index: number) => void;
}): JSX.Element => (
  <View className="pick-row">
    <Picker
      mode="selector"
      disabled={disabled}
      range={[...options]}
      value={Math.max(0, index)}
      onChange={(event) => onChange(Number(event.detail.value))}
    >
      <FormRow
        label={label}
        required={required}
        value={value}
        placeholder={placeholder}
        error={error}
        chevron
      />
    </Picker>
  </View>
);

/** 点一下选日期：表单里的一行，放在 Sheet 里。value 是 “2026-11-18”。 */
export const DateRow = ({
  label,
  value,
  start,
  end,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly start?: string;
  readonly end?: string;
  readonly onChange: (value: string) => void;
}): JSX.Element => (
  <View className="pick-row">
    <Picker
      mode="date"
      value={value}
      start={start}
      end={end}
      onChange={(event) => onChange(String(event.detail.value))}
    >
      <FormRow label={label} value={dateLabel(value)} chevron />
    </Picker>
  </View>
);

/** 表单行右侧直接点选的一组选项：单选还是多选由调用方决定。放在 Sheet 里。 */
export const ChipsRow = <T extends string>({
  label,
  required,
  error,
  options,
  selected,
  onToggle,
}: {
  readonly label: string;
  readonly required?: boolean;
  readonly error?: boolean;
  readonly options: ReadonlyArray<{
    readonly value: T;
    readonly label: string;
  }>;
  readonly selected: ReadonlyArray<T>;
  readonly onToggle: (value: T) => void;
}): JSX.Element => (
  <FormRow label={label} required={required} error={error}>
    <View className="row-chips">
      <Chips
        onSheet
        options={options}
        selected={selected}
        onToggle={onToggle}
      />
    </View>
  </FormRow>
);
