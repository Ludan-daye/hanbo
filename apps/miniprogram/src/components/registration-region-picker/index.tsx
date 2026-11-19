import { Picker } from "@tarojs/components";

import { RegionRow } from "./row";
import type { RegionPickerProps } from "./types";

/** 所在地区：一行表单行，点一下弹出省市区选择。放在 Sheet 里。 */
export function RegistrationRegionPicker({
  value,
  disabled,
  invalid,
  onChange,
  label,
  required,
}: RegionPickerProps): JSX.Element {
  return (
    <Picker
      className="region-picker"
      mode="region"
      value={[...value]}
      disabled={disabled}
      onChange={(event) => onChange(event.detail.value)}
    >
      <RegionRow
        value={value}
        disabled={disabled}
        invalid={invalid}
        label={label}
        required={required}
      />
    </Picker>
  );
}
