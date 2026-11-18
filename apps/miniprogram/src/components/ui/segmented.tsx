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
}): JSX.Element => {
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  return (
    <View className="ui-segmented">
      {/* 选中块：改版页面里它在各项下面滑动，旧样式里不显示。 */}
      <View className="ui-segmented__track">
        <View
          className="ui-segmented__thumb"
          style={{
            width: `${100 / Math.max(1, options.length)}%`,
            transform: `translateX(${index * 100}%)`,
          }}
        />
      </View>
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
};
