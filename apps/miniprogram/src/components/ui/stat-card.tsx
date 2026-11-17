import { View } from "@tarojs/components";

export type StatItem = {
  readonly label: string;
  readonly value: string;
  readonly onClick?: () => void;
  readonly tone?: "danger" | "success";
};

export const StatCard = ({ label, value, onClick, tone }: StatItem): JSX.Element => (
  <View
    className={`ui-statcard${onClick ? " ui-statcard--action" : ""}${tone ? ` ui-statcard--${tone}` : ""}`}
    onClick={onClick}
  >
    <View className="ui-statcard__label">{label}</View>
    <View className="ui-statcard__value">{value}</View>
  </View>
);

export const StatCards = ({ items }: { readonly items: ReadonlyArray<StatItem> }): JSX.Element => (
  <View className="ui-statcards">
    {items.map((it) => (
      <StatCard key={it.label} {...it} />
    ))}
  </View>
);
