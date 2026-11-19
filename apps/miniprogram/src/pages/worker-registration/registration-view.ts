import {
  cleanCardNumber,
  cleanIdNumber,
  cleanTelephone,
  groupCardNumber,
  readAddressDraft,
  readInsuranceDraft,
  registrationIssueStep,
  type InsuranceDraft,
  type RegistrationField,
  type RegistrationIssue,
  type RegistrationStep,
} from "../../services/worker-registration-form";
import {
  ONBOARDING_STEPS,
  REGISTRATION_FIRST_STEP,
} from "../complete-profile/onboarding-steps";

export type RegistrationGroup = {
  readonly step: RegistrationStep;
  /** 入场时步骤条上的名字。 */
  readonly title: string;
  /** 以后来改资料时列表上的名字：那时没有“核对”这回事。 */
  readonly short: string;
  /** 在入场七步里是第几步。 */
  readonly onboardingStep: number;
};

const STEPS: readonly RegistrationStep[] = [1, 2, 3, 4];

/** 用工登记的四类资料，一屏一类。 */
export const REGISTRATION_GROUPS: readonly RegistrationGroup[] = STEPS.map(
  (step) => {
    const onboardingStep = REGISTRATION_FIRST_STEP + step - 1;
    const title = ONBOARDING_STEPS[onboardingStep - 1];
    return {
      step,
      title,
      short: step === 4 ? "银行卡" : title,
      onboardingStep,
    };
  },
);

/** 身份证号下面那句话：入场时数位数；以后来改资料时身份证号是锁住的。 */
export const idNumberHint = (idNumber: string, required: boolean): string => {
  if (!required) return "身份证号改不了，要改请找管理员。";
  return idNumber
    ? `已输入 ${cleanIdNumber(idNumber).length} / 18 位。`
    : "身份证号可以直接粘贴，格式会自动整理。";
};

/** 地址下面那句话。以前整段填的老地址没有分省市区，提醒核对。 */
export const addressHint = (
  savedAddress: string,
  required: boolean,
): string => {
  if (savedAddress && readAddressDraft(savedAddress).region.length === 0)
    return required
      ? "原来填的地址还留着，请核对地区和详细地址。"
      : "原来填的地址还留着，要改就把地区和详细地址都核对一下。";
  return "详细地址不用再写省市区。";
};

/** 手机号下面那句话：把号码按 3-4-4 分开，方便对着念。 */
export const mobileHint = (mobile: string): string => {
  if (!mobile) return "手机号可以直接粘贴，空格和 +86 会自动去掉。";
  const digits = cleanTelephone(mobile);
  return `已输入 ${digits.length} / 11 位：${digits.replace(/^(\d{3})(\d{4})(\d{1,4})$/, "$1 $2 $3")}`;
};

/** 银行卡号下面那句话：四位一组，方便对着卡核对。 */
export const cardHint = (card: string): string =>
  card
    ? `已输入 ${cleanCardNumber(card).length} 位：${groupCardNumber(card)}`
    : "卡号可以直接粘贴，空格会自动去掉。";

/** 保险那几项下面的提醒：过期了，或者老资料没有分名称和日期。 */
export const insuranceHints = (input: {
  readonly insurance: InsuranceDraft;
  /** 读上来时保险那一栏原来的内容。 */
  readonly savedDetails: string;
  readonly required: boolean;
  readonly today: string;
}): readonly string[] => {
  const hints: string[] = [];
  if (input.insurance.endsOn && input.insurance.endsOn < input.today)
    hints.push("这份保险的保障期限已经过了，核对一下有没有续保。");
  if (input.savedDetails && !readInsuranceDraft(input.savedDetails).name)
    hints.push(
      input.required
        ? "原来填的保险说明还留着，请核对名称和保障日期。"
        : "原来填的保险说明还留着，要改就把名称和保障日期补齐。",
    );
  return hints;
};

/** 某一类资料填好了没有：有没过的校验就是“待核对”。 */
export const groupStatus = (
  issues: readonly RegistrationIssue[],
  step: RegistrationStep,
): { readonly kind: "ok" | "warn"; readonly text: string } =>
  issues.some((issue) => registrationIssueStep(issue.field) === step)
    ? { kind: "warn", text: "待核对" }
    : { kind: "ok", text: "已填写" };

/**
 * 这几个字段现在要报的错，去掉重复的，按字段顺序排。
 * problem 返回 null 表示这个字段现在不报错（没填错，或者还没轮到提示）。
 */
export const visibleProblems = (
  fields: readonly RegistrationField[],
  problem: (field: RegistrationField) => string | null,
): readonly string[] => {
  const messages: string[] = [];
  for (const field of fields) {
    const message = problem(field);
    if (message !== null && !messages.includes(message)) messages.push(message);
  }
  return messages;
};

/** 这一步里已经标在字段下面的错。页面底部的提示和它们重复时就不再说一遍。 */
export const stepProblems = (
  issues: readonly RegistrationIssue[],
  step: RegistrationStep,
  problem: (field: RegistrationField) => string | null,
): readonly string[] =>
  visibleProblems(
    issues
      .filter((issue) => registrationIssueStep(issue.field) === step)
      .map((issue) => issue.field),
    problem,
  );
