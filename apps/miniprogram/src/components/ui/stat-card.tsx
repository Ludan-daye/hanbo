import { View } from "@tarojs/components";

export const StatCard = ({ label, value }: { readonly label: string; readonly value: string }): JSX.Element => (
  <View className="ui-statcard">
    <View className="ui-statcard__label">{label}</View>
    <View className="ui-statcard__value">{value}</View>
  </View>
);

export const StatCards = ({ items }: { readonly items: ReadonlyArray<{ label: string; value: string }> }): JSX.Element => (
  <View className="ui-statcards">
    {items.map((it) => (
      <StatCard key={it.label} label={it.label} value={it.value} />
    ))}
  </View>
);
