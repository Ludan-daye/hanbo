import { Picker, View } from "@tarojs/components";
import type { RegionPickerProps } from "./types";

export function RegistrationRegionPicker({
  value,
  disabled,
  invalid,
  onChange,
}: RegionPickerProps): JSX.Element {
  return (
    <Picker
      mode="region"
      value={[...value]}
      disabled={disabled}
      onChange={(event) => onChange(event.detail.value)}
    >
      <View
        className={`registration-select ${invalid ? "registration-input--error" : ""}`}
      >
        <View className={value.length ? "" : "registration-placeholder"}>
          {value.length ? value.join(" / ") : "请选择省 / 市 / 区"}
        </View>
        <View className="registration-chevron">›</View>
      </View>
    </Picker>
  );
}
