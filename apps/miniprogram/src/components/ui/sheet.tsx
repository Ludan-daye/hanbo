import { Text, View } from "@tarojs/components";
import type { PropsWithChildren } from "react";

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

/** 一排数字，最多三个；多了就不是“一眼看到”了。 */
export const Numbers = ({
  items,
  gap,
}: {
  readonly items: ReadonlyArray<NumberItem>;
  readonly gap?: boolean;
}): JSX.Element => (
  <View className={`ui-sheet ui-nums${gap ? " ui-sheet--gap" : ""}`}>
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

/** 白卡片：一段需要读的内容，或一条带操作的记录。 */
export const Card = ({
  children,
  gap,
}: PropsWithChildren<{ readonly gap?: boolean }>): JSX.Element => (
  <View className={`ui-card${gap ? " ui-card--gap" : ""}`}>{children}</View>
);
