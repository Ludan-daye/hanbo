import { readWorkEntry, type WorkEntry } from "../../services/work-entry";

/**
 * 入场七步在步骤条上的名字：姓名手机号、绑定档案、用工登记四步、人脸底照。
 * 入场的几个页面都从这里取，步骤条上的数字才对得上。
 */
export const ONBOARDING_STEPS = [
  "姓名和手机号",
  "绑定档案",
  "身份与住址",
  "紧急联系人",
  "健康与保险",
  "银行卡与核对",
  "人脸底照",
] as const;

/** 用工登记的第一步在整个入场里是第几步。 */
export const REGISTRATION_FIRST_STEP = 3;

/**
 * 一共几步。从“我是管理人员”进来的没有选用工方式，绑定完就进首页，只有前两步；
 * 选了长期或临时用工的要走完七步。
 */
export const onboardingTotal = (entry: WorkEntry | null): number =>
  entry === null ? 2 : ONBOARDING_STEPS.length;

/** 本机记的用工方式读不出来时按七步算，不让步骤条把页面带崩。 */
export const readOnboardingTotal = (): number => {
  try {
    return onboardingTotal(readWorkEntry());
  } catch {
    return ONBOARDING_STEPS.length;
  }
};
