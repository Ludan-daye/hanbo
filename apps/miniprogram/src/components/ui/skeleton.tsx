import { View } from "@tarojs/components";

/** 读取中的占位：先把版面站住，数据到了原位替换。 */
export const SkeletonSign = ({
  tall,
}: {
  readonly tall?: boolean;
}): JSX.Element => (
  <View className={`ui-sk-sign sk${tall ? " ui-sk-sign--tall" : ""}`} />
);

export const SkeletonRows = ({
  rows,
  gap,
}: {
  readonly rows: number;
  readonly gap?: boolean;
}): JSX.Element => (
  <View className={`ui-sheet${gap ? " ui-sheet--gap" : ""}`}>
    {Array.from({ length: rows }, (_, index) => (
      <View key={index} className="ui-sk-row">
        <View className={`ui-sk-bar sk ui-sk-bar--${index % 3}`} />
      </View>
    ))}
  </View>
);
