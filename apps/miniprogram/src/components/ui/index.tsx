import { Button as TaroButton, Input, View } from "@tarojs/components";
import type { PropsWithChildren } from "react";

import { FRONTEND_DEMO } from "../../config/env";
import { useSession } from "../../store/session";
import { PrivacyAuthorization } from "../privacy-authorization";

import "./ui.scss";

export const Screen = ({ children }: PropsWithChildren): JSX.Element => {
  const { phase } = useSession();
  return (
    <View className="ui-screen">
      {phase === "loading" ? (
        <View className="session-loading">
          <View className="ui-btn__spinner" />
          <View>正在连接工作现场…</View>
        </View>
      ) : (
        <>
          {FRONTEND_DEMO ? <View className="demo-mode-strip">前端演示 · 数据仅保存在本机 · 人脸与定位可模拟</View> : null}
          {children}
        </>
      )}
      <PrivacyAuthorization />
    </View>
  );
};
export const Title = ({ children }: PropsWithChildren): JSX.Element => (
  <View className="ui-title">{children}</View>
);
export const Subtitle = ({ children }: PropsWithChildren): JSX.Element => (
  <View className="ui-subtitle">{children}</View>
);
export const Label = ({ children }: PropsWithChildren): JSX.Element => (
  <View className="ui-label">{children}</View>
);
export const Section = ({
  title,
  sub,
  children,
}: PropsWithChildren<{
  readonly title: string;
  readonly sub?: string;
}>): JSX.Element => (
  <View className="ui-section">
    <View className="ui-section__heading">{title}</View>
    {sub ? <Subtitle>{sub}</Subtitle> : null}
    {children}
  </View>
);
export const Notice = ({ children }: PropsWithChildren): JSX.Element => (
  <View className="ui-notice">{children}</View>
);

type ButtonProps = PropsWithChildren<{
  readonly onClick?: () => void;
  readonly variant?: "primary" | "outline" | "danger";
  readonly disabled?: boolean;
  readonly loading?: boolean;
}>;

export const Button = ({
  children,
  onClick,
  variant,
  disabled,
  loading,
}: ButtonProps): JSX.Element => (
  <TaroButton
    className={`ui-btn ui-btn--${variant ?? "primary"}`}
    onClick={onClick}
    disabled={disabled === true || loading === true ? true : undefined}
  >
    {loading === true ? <View className="ui-btn__spinner" /> : null}
    <View>{children}</View>
  </TaroButton>
);

export const Tile = ({
  title,
  sub,
  stub,
  onClick,
}: {
  readonly title: string;
  readonly sub: string;
  readonly stub?: boolean;
  readonly onClick?: () => void;
}): JSX.Element => (
  <View className="ui-tile" onClick={onClick}>
    <View className="ui-tile__title">{title}</View>
    <View className="ui-tile__sub">{sub}</View>
    {stub ? <View className="ui-badge">暂未开放</View> : null}
  </View>
);

type FieldProps = {
  readonly value: string;
  readonly placeholder: string;
  readonly onInput: (value: string) => void;
  readonly label?: string;
  readonly type?: "text" | "number" | "digit";
  readonly maxLength?: number;
};

export const Field = ({
  value,
  placeholder,
  onInput,
  label,
  type,
  maxLength,
}: FieldProps): JSX.Element => (
  <View className="ui-field-wrap">
    {label ? <View className="ui-field-label">{label}</View> : null}
    <Input
      className="ui-field"
      value={value}
      placeholder={placeholder}
      type={type ?? "text"}
      maxlength={maxLength ?? 140}
      onInput={(e) => onInput(e.detail.value)}
    />
  </View>
);

export const StateView = ({
  title,
  sub,
  onRetry,
}: {
  readonly title: string;
  readonly sub?: string;
  readonly onRetry?: () => void;
}): JSX.Element => (
  <View
    className={`ui-state ${title.includes("加载中") || title.includes("加载今日") ? "ui-state--loading" : ""}`}
  >
    <View className="ui-state__symbol">
      {title.includes("失败") || title === "错误" || title === "出错"
        ? "!"
        : "·"}
    </View>
    <View className="ui-state__title">{title}</View>
    {sub ? <View className="ui-subtitle">{sub}</View> : null}
    {onRetry ? (
      <Button variant="outline" onClick={onRetry}>
        重新加载
      </Button>
    ) : null}
  </View>
);

export { PageHeader, AppHeader } from "./page-header";
export { Segmented, type SegmentedOption } from "./segmented";
export { ListItem } from "./list-item";
export { StatCard, StatCards } from "./stat-card";
export { CopyButton } from "./copy-button";
export { BottomNav } from "./bottom-nav";
export { AppIcon, type IconName } from "./icon";
