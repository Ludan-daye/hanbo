import { View } from "@tarojs/components";

import { FormRow } from "../ui/index";

import type { RegionPickerProps } from "./types";
import "./index.scss";

const pressOnly = (): void => {};

/** 选地区的那一行：小程序和 H5 的选择器不一样，行的样子是同一个。放在各自的 Picker 里。 */
export const RegionRow = ({
  value,
  disabled,
  invalid,
  label,
  required,
}: Omit<RegionPickerProps, "onChange">): JSX.Element => (
  <FormRow
    label={label ?? "所在地区"}
    required={required}
    chevron
    error={invalid}
    // 点击由外面的选择器接，这里只是让这一行按下时有反馈。
    onClick={disabled ? undefined : pressOnly}
  >
    <View
      className={`region-picker__text${value.length ? "" : " region-picker__text--ph"}`}
    >
      {value.length ? value.join(" ") : "请选择省、市、区"}
    </View>
  </FormRow>
);
