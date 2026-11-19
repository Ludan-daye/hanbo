import { Button as TaroButton, View } from "@tarojs/components";
import type { PropsWithChildren, ReactNode } from "react";

import { FRONTEND_DEMO } from "../../config/env";
import { useSession } from "../../store/session";
import { PrivacyAuthorization } from "../privacy-authorization";

import type { HeaderAppearance } from "./page-header";
import { PRESS } from "./press";
import { SkeletonRows, SkeletonSign } from "./skeleton";
import { stateKindForTitle, type StateKind } from "./state-kind";

import "./ui.scss";
import "./kit.scss";

/**
 * 页面外壳：灰底、两侧留边、底部给导航或操作条留出位置。
 * 页头通过 header 传入（固定在顶部）。appearance 只为兼容旧调用保留，不再有区别。
 */
export const Screen = ({
  children,
  header,
}: PropsWithChildren<{
  readonly appearance?: HeaderAppearance;
  readonly header?: ReactNode;
}>): JSX.Element => {
  const { phase } = useSession();
  return (
    <View className="ui-screen ui-screen--sign">
      {phase === "loading" ? (
        <>
          <SkeletonSign />
          <SkeletonRows rows={3} gap />
        </>
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
  );
};
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
  /** 只为兼容旧调用保留，不再有区别。 */
  readonly appearance?: "worker";
  /** 黑框按钮默认按内容宽度，wide 让它占满一行。 */
  readonly wide?: boolean;
}>;

export const Button = ({
  children,
  onClick,
  variant,
  disabled,
  loading,
  wide,
}: ButtonProps): JSX.Element => (
  <TaroButton
    className={`ui-btn ui-press ui-btn--${variant ?? "primary"}${wide ? " ui-btn--wide" : ""}`}
    {...PRESS}
    onClick={onClick}
    disabled={disabled === true || loading === true ? true : undefined}
  >
    {loading === true ? <View className="ui-btn__spinner" /> : null}
    <View className="ui-btn__label">{children}</View>
  </TaroButton>
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
  const resolved = kind ?? stateKindForTitle(title);
  // 读取中不转圈：用骨架把版面站住，数据到了原位替换。
  if (resolved === "loading")
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
      {onRetry ? (
        <Button variant="outline" onClick={onRetry}>
          {retryLabel ?? "重新加载"}
        </Button>
      ) : null}
    </View>
  );
};

export { PageHeader, AppHeader } from "./page-header";
export { Segmented, type SegmentedOption } from "./segmented";
export { BottomNav } from "./bottom-nav";
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
  CardActions,
  CardMeta,
  CardTitle,
  Divider,
  EntryGrid,
  KV,
  Links,
  Numbers,
  Row,
  Say,
  SectionTitle,
  Sheet,
  Timeline,
  type EntryItem,
  type NumberItem,
  type TimelineItem,
} from "./sheet";
export { Status } from "./status";
export { statusKindFor, type StatusKind } from "./status-kind";
export {
  BottomBar,
  Code,
  Photo,
  PhotoRow,
  ProgressBar,
  Stamp,
  Steps,
} from "./flow";
export {
  Check,
  Chips,
  DateSwitch,
  FormArea,
  FormError,
  FormInput,
  FormRow,
  FormSwitch,
  SearchField,
  Weekdays,
} from "./form";
export { SkeletonRows, SkeletonSign } from "./skeleton";
