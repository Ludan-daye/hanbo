/** 状态用形状加颜色表示：绿方块正常，黄三角等人处理，红圆点异常，其余不带标记。 */
export type StatusKind = "ok" | "warn" | "bad" | "idle";

const BAD = /缺卡|迟到|早退|缺勤|驳回|异常|未通过|过期|作废|严重|重大|失败/;
const WARN = /待|审核中|暂停|筹备/;
const OK = /正常|通过|完成|加入|确认|已打卡|到岗|在场|进行中|生效|已记录/;

/**
 * 按状态文案推断。异常优先于待处理，待处理优先于正常：
 * “未通过”含有“通过”，“待完成”含有“完成”，都不能显示成正常。
 */
export const statusKindFor = (label: string): StatusKind =>
  BAD.test(label)
    ? "bad"
    : WARN.test(label)
      ? "warn"
      : OK.test(label)
        ? "ok"
        : "idle";
