import type { WorkerRegistration } from "@construction/domain";

import type { StatusKind } from "../../components/ui/status-kind";
import type { MemberRegistration } from "../../services/registration-review";
import { dateLabel } from "../../components/member-role-editor/person-text";
import { formatChinaDate } from "../../services/time";
import { groupCardNumber } from "../../services/worker-registration-form";

// 用工资料核实页要算的东西，不碰界面，方便单测。

/** 核实状态写成什么、用哪种形状：没填是灰的，待核实黄三角，已核实绿方块，需更正红圆点。 */
export const verificationLabel = (
  value: Pick<MemberRegistration, "registration" | "verification">,
): { readonly kind: StatusKind; readonly text: string } => {
  if (value.registration === null) return { kind: "idle", text: "还没填" };
  switch (value.verification.status) {
    case "VERIFIED":
      return { kind: "ok", text: "已核实" };
    case "NEEDS_UPDATE":
      return { kind: "bad", text: "需更正" };
    default:
      return { kind: "warn", text: "待核实" };
  }
};

/** 头上那行的说明：什么时候填的，谁什么时候核实的。 */
export const registrationSub = (value: MemberRegistration): string => {
  if (value.submittedAt === null) return "工人填好用工登记后才能核实";
  const day = (iso: string): string => dateLabel(formatChinaDate(iso));
  const submitted = `${day(value.submittedAt)}提交`;
  const { verifiedAt, verifiedByName, status } = value.verification;
  if (status === "PENDING" || verifiedAt === null) return submitted;
  return `${submitted}，${verifiedByName ?? "管理员"}${day(verifiedAt)}标记`;
};

export type RegistrationLine = { readonly label: string; readonly value: string };
export type RegistrationGroupLines = {
  readonly title: string;
  readonly lines: readonly RegistrationLine[];
};

const yesNo = (flag: boolean | null, details: string): string =>
  flag === null ? "没有填" : flag ? `有，${details}` : "没有";

/** 用工登记按四类分开写，原文照写（决定 2：项目管理员看原文，不打码）。 */
export const registrationGroups = (
  value: WorkerRegistration,
): readonly RegistrationGroupLines[] => [
  {
    title: "身份和住址",
    lines: [
      { label: "身份证号", value: value.idNumber },
      { label: "居住地址", value: value.residentialAddress },
    ],
  },
  {
    title: "紧急联系人",
    lines: [
      { label: "姓名", value: value.emergencyContactName },
      { label: "电话", value: value.emergencyContactPhone },
    ],
  },
  {
    title: "健康和保险",
    lines: [
      {
        label: "长期服药",
        value: yesNo(value.hasLongTermMedication, value.medicationDetails),
      },
      {
        label: "人身保险",
        value: yesNo(value.hasPersonalInsurance, value.insuranceDetails),
      },
    ],
  },
  {
    title: "工资卡",
    lines: [{ label: "银行卡号", value: groupCardNumber(value.payrollBankCard) }],
  },
];

/** 底部按钮：没核实过时“核对无误”是主操作；已核实只留“改为需更正”；需更正时只留“核对无误”。 */
export const verificationActions = (
  value: Pick<MemberRegistration, "registration" | "verification">,
): {
  readonly primary: "VERIFIED" | "NEEDS_UPDATE" | null;
  readonly secondary: "NEEDS_UPDATE" | null;
} => {
  if (value.registration === null) return { primary: null, secondary: null };
  if (value.verification.status === "VERIFIED")
    return { primary: null, secondary: "NEEDS_UPDATE" };
  if (value.verification.status === "NEEDS_UPDATE")
    return { primary: "VERIFIED", secondary: null };
  return { primary: "VERIFIED", secondary: "NEEDS_UPDATE" };
};
