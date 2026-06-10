import { View } from "@tarojs/components";

export type SegmentedOption<T extends string> = { readonly value: T; readonly label: string };

export const Segmented = <T extends string>({
  options,
  value,
  onChange
}: {
  readonly options: ReadonlyArray<SegmentedOption<T>>;
  readonly value: T;
  readonly onChange: (next: T) => void;
}): JSX.Element => (
  <View className="ui-segmented">
    {options.map((o) => (
      <View
        key={o.value}
        className={`ui-segmented__item ${o.value === value ? "ui-segmented__item--active" : ""}`}
        onClick={() => onChange(o.value)}
      >
        {o.label}
      </View>
    ))}
  </View>
);
