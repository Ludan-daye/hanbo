import { View } from "@tarojs/components";

export const ListItem = ({
  primary,
  secondary,
  chip,
  onClick,
}: {
  readonly primary: string;
  readonly secondary?: string;
  readonly chip?: string;
  readonly onClick?: () => void;
}): JSX.Element => (
  <View
    className={`ui-listitem ${onClick ? "ui-listitem--action" : ""}`}
    onClick={onClick}
  >
    <View className="ui-listitem__body">
      <View className="ui-listitem__primary">{primary}</View>
      {secondary ? (
        <View className="ui-listitem__secondary">{secondary}</View>
      ) : null}
    </View>
    {chip ? (
      <View
        className={`ui-listitem__chip ${["正常", "已通过", "进行中", "已接受", "已完成"].includes(chip) ? "ui-listitem__chip--success" : ["异常", "已驳回", "已过期", "已撤销"].includes(chip) ? "ui-listitem__chip--danger" : ""}`}
      >
        {chip}
      </View>
    ) : null}
    {onClick && !chip ? <View className="ui-listitem__arrow">›</View> : null}
  </View>
);
