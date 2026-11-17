import { View } from "@tarojs/components";

export type ChipTone = "neutral" | "success" | "danger" | "warning";

const SUCCESS_CHIPS = ["正常", "已通过", "进行中", "已接受", "已完成", "已加入", "已确认", "核验通过", "补卡已生效", "已生效", "在场"];
const DANGER_CHIPS = ["异常", "已驳回", "已过期", "已撤销", "缺卡", "迟到", "早退", "已退场", "已停用", "已作废", "已取消"];
const WARNING_CHIPS = ["待审核", "待审批", "待处理", "待确认", "待核实", "已暂停", "未分类"];

const chipTone = (chip: string): ChipTone =>
  SUCCESS_CHIPS.includes(chip)
    ? "success"
    : DANGER_CHIPS.includes(chip)
      ? "danger"
      : WARNING_CHIPS.includes(chip)
        ? "warning"
        : "neutral";

export const ListItem = ({
  primary,
  secondary,
  chip,
  tone,
  onClick,
}: {
  readonly primary: string;
  readonly secondary?: string;
  readonly chip?: string;
  /** 不传时按常见状态文案推断。 */
  readonly tone?: ChipTone;
  readonly onClick?: () => void;
}): JSX.Element => {
  const resolved = chip ? (tone ?? chipTone(chip)) : "neutral";
  return (
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
          className={`ui-listitem__chip${resolved !== "neutral" ? ` ui-listitem__chip--${resolved}` : ""}`}
        >
          {chip}
        </View>
      ) : null}
      {onClick && !chip ? <View className="ui-listitem__arrow">›</View> : null}
    </View>
  );
};
