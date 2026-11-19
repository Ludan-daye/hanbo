import { Text, View } from "@tarojs/components";
import type { PropsWithChildren, ReactNode } from "react";

import { LineIcon, type LineIconName } from "./line-icon";
import { PRESS } from "./press";
import { Status } from "./status";
import type { StatusKind } from "./status-kind";

/** 白条：灰底上放次要内容的容器，里面一行一件事。 */
export const Sheet = ({
  children,
  gap,
}: PropsWithChildren<{ readonly gap?: boolean }>): JSX.Element => (
  <View className={`ui-sheet${gap ? " ui-sheet--gap" : ""}`}>{children}</View>
);

export const Row = ({
  title,
  titleNum,
  sub,
  value,
  mute,
  status,
  chevron,
  hazard,
  avatar,
  icon,
  onClick,
  children,
}: PropsWithChildren<{
  readonly title: string;
  /** 跟在标题后面的数字，例如“上班 08:00”里的时间。 */
  readonly titleNum?: string;
  readonly sub?: string;
  readonly value?: string;
  readonly mute?: boolean;
  readonly status?: { readonly kind?: StatusKind; readonly text: string };
  readonly chevron?: boolean;
  /** 警戒条：等你处理的事。 */
  readonly hazard?: boolean;
  readonly avatar?: string;
  readonly icon?: LineIconName;
  readonly onClick?: () => void;
}>): JSX.Element => (
  <View
    className={`ui-row${hazard ? " ui-row--hazard" : ""}${sub || avatar ? " ui-row--tall" : ""}${onClick ? " ui-press" : ""}`}
    {...(onClick ? PRESS : {})}
    onClick={onClick}
  >
    <View className="ui-row__left">
      {icon ? (
        <View className="ui-row__icon">
          <LineIcon name={icon} />
        </View>
      ) : avatar ? (
        <View className="ui-row__avatar">{avatar}</View>
      ) : null}
      <View className="ui-row__text">
        <View className="ui-row__title">
          {title}
          {titleNum ? <Text className="ui-row__num num">{titleNum}</Text> : null}
        </View>
        {sub ? <View className="ui-row__sub">{sub}</View> : null}
      </View>
    </View>
    <View className={`ui-row__right${mute ? " ui-row__right--mute" : ""}`}>
      {value ? <View>{value}</View> : null}
      {status ? <Status kind={status.kind}>{status.text}</Status> : null}
      {children}
      {chevron ? <View className="ui-chevron" /> : null}
    </View>
  </View>
);

export const SectionTitle = ({
  children,
  action,
  onAction,
}: {
  readonly children: string;
  readonly action?: string;
  readonly onAction?: () => void;
}): JSX.Element => (
  <View className="ui-h">
    <View>{children}</View>
    {action ? (
      <View className="ui-h__action ui-press" {...PRESS} onClick={onAction}>
        {action}
      </View>
    ) : null}
  </View>
);

export type NumberItem = {
  readonly value: string;
  readonly unit?: string;
  readonly label: string;
  readonly tone?: "bad";
  readonly onClick?: () => void;
};

/** 一排数字。默认最多三个：多了就不是“一眼看到”了。 */
export const Numbers = ({
  items,
  gap,
  wrap,
}: {
  readonly items: ReadonlyArray<NumberItem>;
  readonly gap?: boolean;
  /** 多于三个时折成每行三个（“全部统计”那种展开后的视图）。 */
  readonly wrap?: boolean;
}): JSX.Element => (
  <View
    className={`ui-sheet ui-nums${wrap ? " ui-nums--wrap" : ""}${gap ? " ui-sheet--gap" : ""}`}
  >
    {items.map((item) => (
      <View
        key={item.label}
        className={`ui-nums__item${item.tone ? ` ui-nums__item--${item.tone}` : ""}${item.onClick ? " ui-press" : ""}`}
        {...(item.onClick ? PRESS : {})}
        onClick={item.onClick}
      >
        <View className="ui-nums__value num">
          {item.value}
          {item.unit ? (
            <Text className="ui-nums__unit">{item.unit}</Text>
          ) : null}
        </View>
        <View className="ui-nums__label">{item.label}</View>
      </View>
    ))}
  </View>
);

/** 页面里的一句结论，用在流程的每一步顶上。 */
export const Say = ({
  title,
  sub,
  center,
}: {
  readonly title: string;
  readonly sub?: string;
  readonly center?: boolean;
}): JSX.Element => (
  <View className={`ui-say${center ? " ui-say--center" : ""}`}>
    <View className="ui-say__title">{title}</View>
    {sub ? <View className="ui-say__sub">{sub}</View> : null}
  </View>
);

/**
 * 白卡片：一段需要读的内容，或一条带操作的记录。
 * stamped：右上角盖了红章（把 Stamp 放进 children），给章留出位置。
 */
export const Card = ({
  children,
  gap,
  stamped,
  onClick,
}: PropsWithChildren<{
  readonly gap?: boolean;
  readonly stamped?: boolean;
  readonly onClick?: () => void;
}>): JSX.Element => (
  <View
    className={`ui-card${gap ? " ui-card--gap" : ""}${stamped ? " ui-card--stamped" : ""}${onClick ? " ui-press" : ""}`}
    {...(onClick ? PRESS : {})}
    onClick={onClick}
  >
    {children}
  </View>
);

/** 卡片标题：左边名称，右边一个状态或一个数字。 */
export const CardTitle = ({
  children,
  status,
  value,
  tone,
}: {
  readonly children: string;
  readonly status?: { readonly kind?: StatusKind; readonly text: string };
  /** 右边的数字，例如扣分“−5”。 */
  readonly value?: string;
  readonly tone?: "bad";
}): JSX.Element => (
  <View className="ui-card__title">
    <View className="ui-card__title-text">{children}</View>
    {status ? <Status kind={status.kind}>{status.text}</Status> : null}
    {value ? (
      <View
        className={`ui-card__title-value num${tone ? ` ui-card__title-value--${tone}` : ""}`}
      >
        {value}
      </View>
    ) : null}
  </View>
);

/** 卡片里的灰色说明行。 */
export const CardMeta = ({ children }: PropsWithChildren): JSX.Element => (
  <View className="ui-card__meta">{children}</View>
);

/** 卡片底部的操作：最多一个黑色实心按钮，其余用黑框或文字按钮。 */
export const CardActions = ({ children }: PropsWithChildren): JSX.Element => (
  <View className="ui-card__actions">{children}</View>
);

export const Divider = (): JSX.Element => <View className="ui-divider" />;

/** 一行“名称：值”，用在卡片里。 */
export const KV = ({
  label,
  value,
  children,
}: PropsWithChildren<{
  readonly label: string;
  readonly value?: string;
}>): JSX.Element => (
  <View className="ui-kv">
    <View className="ui-kv__label">{label}</View>
    <View className="ui-kv__value">{children ?? value}</View>
  </View>
);

export type EntryItem = {
  readonly icon: LineIconName;
  readonly label: string;
  readonly onClick: () => void;
  /** 右上角的待办数。 */
  readonly badge?: number;
};

/** 入口宫格：工作台和首页上的功能入口，三列或四列。 */
export const EntryGrid = ({
  items,
  cols,
  gap,
}: {
  readonly items: ReadonlyArray<EntryItem>;
  readonly cols?: 3 | 4;
  readonly gap?: boolean;
}): JSX.Element => (
  <View
    className={`ui-sheet ui-grid${cols === 4 ? " ui-grid--4" : ""}${gap ? " ui-sheet--gap" : ""}`}
  >
    {items.map((item) => (
      <View
        key={item.label}
        className="ui-grid__item ui-press"
        {...PRESS}
        onClick={item.onClick}
      >
        <LineIcon name={item.icon} />
        <View className="ui-grid__label">{item.label}</View>
        {item.badge ? (
          <View className="ui-grid__badge num">
            {item.badge > 99 ? "99+" : item.badge}
          </View>
        ) : null}
      </View>
    ))}
  </View>
);

export type TimelineItem = {
  readonly key: string;
  /** done 已完成（黑点），now 进行中（橙点），todo 还没到（空心）。 */
  readonly state: "done" | "now" | "todo";
  readonly title: string;
  readonly sub?: string;
  readonly right?: ReactNode;
};

/** 时间线：一天里的几个时点，或一件事的几个环节。放在 Sheet 或 Card 里。 */
export const Timeline = ({
  items,
}: {
  readonly items: ReadonlyArray<TimelineItem>;
}): JSX.Element => (
  <View className="ui-tl">
    {items.map((item) => (
      <View key={item.key} className={`ui-tl__item ui-tl__item--${item.state}`}>
        <View className="ui-tl__text">
          <View>{item.title}</View>
          {item.sub ? <View className="ui-tl__sub">{item.sub}</View> : null}
        </View>
        {item.right}
      </View>
    ))}
  </View>
);

/** 页面底部并排的几个文字按钮，例如“权限与范围”“退出登录”。 */
export const Links = ({ children }: PropsWithChildren): JSX.Element => (
  <View className="ui-links">{children}</View>
);
