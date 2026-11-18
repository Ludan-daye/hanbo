import { Button as TaroButton, Input, View } from "@tarojs/components";
import {
  createContext,
  useContext,
  type PropsWithChildren,
  type ReactNode,
} from "react";

import { FRONTEND_DEMO } from "../../config/env";
import { useSession } from "../../store/session";
import { PrivacyAuthorization } from "../privacy-authorization";

import type { HeaderAppearance } from "./page-header";
import { PRESS } from "./press";
import { SkeletonRows, SkeletonSign } from "./skeleton";
import { stateKindForTitle, type StateKind } from "./state-kind";

import "./ui.scss";
import "./worker.scss";
import "./kit.scss";

/** 当前页面是不是改版后的样子；公共组件据此决定读取中显示骨架还是转圈。 */
const SignScreen = createContext<boolean>(false);

export const Screen = ({
  children,
  appearance,
  header,
}: PropsWithChildren<{
  /** "sign" 是改版后的样子（灰底、标牌、白条）；"worker" 是还没改版的工人页面。 */
  readonly appearance?: HeaderAppearance;
  readonly header?: ReactNode;
}>): JSX.Element => {
  const { phase } = useSession();
  const sign = appearance === "sign";
  return (
    <SignScreen.Provider value={sign}>
      <View
        className={`ui-screen${appearance === "worker" ? " worker-ui" : ""}${sign ? " ui-screen--sign" : ""}`}
      >
        {phase === "loading" ? (
          sign ? (
            <>
              <SkeletonSign />
              <SkeletonRows rows={3} gap />
            </>
          ) : (
            <View className="session-loading">
              <View className="ui-btn__spinner" />
              <View>正在连接工作现场…</View>
            </View>
          )
        ) : (
          <>
            {header}
            {FRONTEND_DEMO ? (
              <View className="demo-mode-strip">
                本机演示，定位和人脸都是模拟的
              </View>
            ) : null}
            {children}
          </>
        )}
        <PrivacyAuthorization />
      </View>
    </SignScreen.Provider>
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
export const Notice = ({
  children,
  tone,
}: PropsWithChildren<{
  readonly tone?: "info" | "warning" | "error" | "success";
}>): JSX.Element => (
  <View
    className={`ui-notice${tone && tone !== "info" ? ` ui-notice--${tone}` : ""}`}
    role={tone === "error" ? "alert" : undefined}
  >
    {children}
  </View>
);

type ButtonProps = PropsWithChildren<{
  readonly onClick?: () => void;
  /** 三级：primary 黑色实心（一屏只放一个）、outline 黑框、text 下划线文字；danger 是红框。 */
  readonly variant?: "primary" | "outline" | "danger" | "text";
  readonly disabled?: boolean;
  /** 提交中：按钮变灰、不能再点。文案由调用方换成“…中”。 */
  readonly loading?: boolean;
  readonly appearance?: "worker";
  /** 改版页面里黑框按钮默认按内容宽度，wide 让它占满一行。 */
  readonly wide?: boolean;
}>;

export const Button = ({
  children,
  onClick,
  variant,
  disabled,
  loading,
  appearance,
  wide,
}: ButtonProps): JSX.Element => (
  <TaroButton
    className={`ui-btn ui-press ui-btn--${variant ?? "primary"}${appearance === "worker" ? " worker-button" : ""}${wide ? " ui-btn--wide" : ""}`}
    {...PRESS}
    onClick={onClick}
    disabled={disabled === true || loading === true ? true : undefined}
  >
    {loading === true ? <View className="ui-btn__spinner" /> : null}
    <View className="ui-btn__label">{children}</View>
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
  readonly disabled?: boolean;
  readonly value: string;
  readonly placeholder: string;
  readonly onInput: (value: string) => void;
  readonly label?: string;
  readonly type?: "text" | "number" | "digit";
  readonly maxLength?: number;
};

export const Field = ({
  disabled,
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
      disabled={disabled}
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
  kind,
  retryLabel,
}: {
  readonly title: string;
  readonly sub?: string;
  readonly onRetry?: () => void;
  /** 不传时按标题文案推断：含“失败/错误/未完成”等视为出错（优先），含“加载/读取/正在”视为加载中。 */
  readonly kind?: StateKind;
  readonly retryLabel?: string;
}): JSX.Element => {
  const sign = useContext(SignScreen);
  const resolved = kind ?? stateKindForTitle(title);
  // 改版页面里读取中不转圈：用骨架把版面站住，数据到了原位替换。
  if (sign && resolved === "loading")
    return (
      <View aria-label={title}>
        <SkeletonRows rows={3} gap />
      </View>
    );
  return (
    <View className={`ui-state ui-state--${resolved}`}>
      <View className="ui-state__symbol">{resolved === "error" ? "!" : "·"}</View>
      <View className="ui-state__title">{title}</View>
      {sub ? <View className="ui-subtitle">{sub}</View> : null}
      {onRetry && resolved !== "loading" ? (
        <Button variant="outline" onClick={onRetry}>
          {retryLabel ?? "重新加载"}
        </Button>
      ) : null}
    </View>
  );
};

export { PageHeader, AppHeader } from "./page-header";
export { Segmented, type SegmentedOption } from "./segmented";
export { ListItem } from "./list-item";
export { StatCard, StatCards } from "./stat-card";
export { CopyButton } from "./copy-button";
export { BottomNav } from "./bottom-nav";
export { AppIcon, type IconName } from "./icon";
export { LineIcon, type LineIconName } from "./line-icon";
export { PRESS } from "./press";
export {
  Sign,
  SignAlert,
  SignButton,
  SignClock,
  SignCount,
  SignLine,
  SignNote,
  SignText,
  SignTop,
} from "./sign";
export {
  Card,
  Numbers,
  Row,
  Say,
  SectionTitle,
  Sheet,
  type NumberItem,
} from "./sheet";
export { Status } from "./status";
export { statusKindFor, type StatusKind } from "./status-kind";
export { BottomBar, Stamp, Steps } from "./flow";
export { DateSwitch, FormError, FormRow } from "./form";
export { SkeletonRows, SkeletonSign } from "./skeleton";
