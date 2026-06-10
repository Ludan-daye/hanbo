import { Button as TaroButton, Input, Text, View } from "@tarojs/components";
import type { PropsWithChildren } from "react";

import "./ui.scss";

export const Screen = ({ children }: PropsWithChildren): JSX.Element => <View className="ui-screen">{children}</View>;

export const Title = ({ children }: PropsWithChildren): JSX.Element => <View className="ui-title">{children}</View>;
export const Subtitle = ({ children }: PropsWithChildren): JSX.Element => <View className="ui-subtitle">{children}</View>;
export const Label = ({ children }: PropsWithChildren): JSX.Element => <View className="ui-label">{children}</View>;

export const Button = ({
  children,
  onClick,
  variant = "primary"
}: PropsWithChildren<{ onClick?: () => void; variant?: "primary" | "outline" }>): JSX.Element => (
  <TaroButton className={`ui-btn ui-btn--${variant}`} onClick={onClick}>
    {children}
  </TaroButton>
);

export const Tile = ({ title, sub, stub }: { title: string; sub: string; stub?: boolean }): JSX.Element => (
  <View className="ui-tile">
    <View className="ui-tile__title">{title}</View>
    <View className="ui-tile__sub">{sub}</View>
    {stub ? <Text className="ui-badge">敬请期待</Text> : null}
  </View>
);

export const Field = ({
  value,
  placeholder,
  onInput
}: {
  value: string;
  placeholder: string;
  onInput: (value: string) => void;
}): JSX.Element => (
  <Input
    className="ui-field"
    value={value}
    placeholder={placeholder}
    onInput={(e) => onInput((e.detail as { value: string }).value)}
  />
);

export const StateView = ({ title, sub }: { title: string; sub?: string }): JSX.Element => (
  <View className="ui-state">
    <View className="ui-title">{title}</View>
    {sub ? <View className="ui-subtitle">{sub}</View> : null}
  </View>
);

export { PageHeader } from "./page-header";
export { Segmented, type SegmentedOption } from "./segmented";
export { ListItem } from "./list-item";
export { StatCard, StatCards } from "./stat-card";
export { CopyButton } from "./copy-button";
