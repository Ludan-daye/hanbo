import { View } from "@tarojs/components";
import Taro from "@tarojs/taro";

export const PageHeader = ({ title }: { title: string }): JSX.Element => (
  <View className="ui-header">
    <View className="ui-header__back" onClick={() => { void Taro.navigateBack(); }}>‹</View>
    <View className="ui-header__title">{title}</View>
  </View>
);
