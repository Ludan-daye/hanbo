import { View } from "@tarojs/components";

export const ListItem = ({
  primary,
  secondary,
  chip,
  onClick
}: {
  readonly primary: string;
  readonly secondary?: string;
  readonly chip?: string;
  readonly onClick?: () => void;
}): JSX.Element => (
  <View className="ui-listitem" onClick={onClick}>
    <View className="ui-listitem__body">
      <View className="ui-listitem__primary">{primary}</View>
      {secondary ? <View className="ui-listitem__secondary">{secondary}</View> : null}
    </View>
    {chip ? <View className="ui-listitem__chip">{chip}</View> : null}
  </View>
);
