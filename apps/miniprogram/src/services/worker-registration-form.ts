import { validIdNumber, type WorkerRegistration } from "@construction/domain";

export type AddressDraft = {
  readonly region: readonly string[];
  readonly detail: string;
};
export type InsuranceDraft = {
  readonly name: string;
  readonly company: string;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly notes: string;
};
export type TelephoneDraft = {
  readonly kind: "MOBILE" | "LANDLINE";
  readonly mobile: string;
  readonly areaCode: string;
  readonly number: string;
};
export type RegistrationField =
  | keyof WorkerRegistration
  | "region"
  | "insuranceName"
  | "insuranceStartsOn"
  | "insuranceEndsOn";
export type RegistrationIssue = {
  readonly field: RegistrationField;
  readonly message: string;
};

export const cleanIdNumber = (value: string): string =>
  value.replace(/[\s\u3000]/g, "").toUpperCase();
export const cleanCardNumber = (value: string): string =>
  value.replace(/\s/g, "");
export const cleanTelephone = (value: string): string =>
  value.replace(/\s/g, "").replace(/^(?:\+86|0086)/, "");
export const groupCardNumber = (value: string): string =>
  cleanCardNumber(value).replace(/(.{4})(?=.)/g, "$1 ");

/** Recognize only our own address format; keep all legacy text for review. */
export const readAddressDraft = (value: string): AddressDraft => {
  const match: RegExpMatchArray | null = value.match(
    /^地区：([^\n]+)\n详细地址：([\s\S]*)$/,
  );
  return match === null
    ? { region: [], detail: value }
    : { region: match[1].split(" / "), detail: match[2] };
};
export const writeAddressDraft = (value: AddressDraft): string =>
  value.region.length === 0
    ? value.detail.trim()
    : `地区：${value.region.join(" / ")}\n详细地址：${value.detail.trim()}`;

export const readInsuranceDraft = (value: string): InsuranceDraft => {
  const match: RegExpMatchArray | null = value.match(
    /^保险名称：([^\n]*)\n保险公司：([^\n]*)\n保障期限：(\d{4}-\d{2}-\d{2}) 至 (\d{4}-\d{2}-\d{2})\n补充说明：([\s\S]*)$/,
  );
  return match === null
    ? { name: "", company: "", startsOn: "", endsOn: "", notes: value }
    : {
        name: match[1],
        company: match[2],
        startsOn: match[3],
        endsOn: match[4],
        notes: match[5],
      };
};
export const writeInsuranceDraft = (value: InsuranceDraft): string =>
  `保险名称：${value.name.trim()}\n保险公司：${value.company.trim()}\n保障期限：${value.startsOn} 至 ${value.endsOn}\n补充说明：${value.notes.trim()}`;

export const readTelephoneDraft = (raw: string): TelephoneDraft => {
  const value: string = cleanTelephone(raw);
  if (!value.startsWith("0"))
    return { kind: "MOBILE", mobile: value, areaCode: "", number: "" };
  const length: number = /^0(?:10|2\d)/.test(value) ? 3 : 4;
  const pieces: string[] = value.split("-");
  return {
    kind: "LANDLINE",
    mobile: "",
    areaCode: pieces.length === 2 ? pieces[0] : value.slice(0, length),
    number: pieces.length === 2 ? pieces[1] : value.slice(length),
  };
};
export const writeTelephoneDraft = (value: TelephoneDraft): string =>
  value.kind === "MOBILE"
    ? cleanTelephone(value.mobile)
    : `${value.areaCode.trim()}-${value.number.trim()}`;

export const registrationIssues = (
  value: WorkerRegistration,
  address: AddressDraft,
  insurance: InsuranceDraft,
): readonly RegistrationIssue[] => {
  const issues: readonly (RegistrationIssue | null)[] = [
    validIdNumber(value.idNumber)
      ? null
      : {
          field: "idNumber",
          message: "身份证号应为 18 位，请检查号码及末尾校验位。",
        },
    address.region.length >= 2
      ? null
      : { field: "region", message: "请选择居住地址所在的省市区。" },
    address.detail.trim() && value.residentialAddress.length <= 200
      ? null
      : {
          field: "residentialAddress",
          message: "请填写街道、楼栋或门牌号，完整地址不超过 200 字。",
        },
    value.emergencyContactName.trim()
      ? null
      : { field: "emergencyContactName", message: "请填写紧急联系人姓名。" },
    /^(?:1[3-9]\d{9}|0\d{2,3}-?\d{7,8})$/.test(value.emergencyContactPhone)
      ? null
      : {
          field: "emergencyContactPhone",
          message: "手机号需为 11 位；座机请填写区号和 7～8 位号码。",
        },
    value.hasLongTermMedication !== null
      ? null
      : {
          field: "hasLongTermMedication",
          message: "请选择是否有需要长期服药的疾病。",
        },
    !value.hasLongTermMedication || value.medicationDetails.trim()
      ? null
      : { field: "medicationDetails", message: "请补充疾病和用药情况。" },
    value.hasPersonalInsurance !== null
      ? null
      : { field: "hasPersonalInsurance", message: "请选择保险购买情况。" },
    !value.hasPersonalInsurance || insurance.name.trim()
      ? null
      : { field: "insuranceName", message: "请选择或填写保险名称。" },
    !value.hasPersonalInsurance || insurance.startsOn
      ? null
      : { field: "insuranceStartsOn", message: "请选择保障开始日期。" },
    !value.hasPersonalInsurance ||
    (insurance.endsOn && insurance.endsOn >= insurance.startsOn)
      ? null
      : {
          field: "insuranceEndsOn",
          message: "请选择保障结束日期，不能早于开始日期。",
        },
    !value.hasPersonalInsurance || value.insuranceDetails.length <= 500
      ? null
      : {
          field: "insuranceDetails",
          message: "保险信息较长，请精简补充说明。",
        },
    /^\d{16,19}$/.test(value.payrollBankCard)
      ? null
      : { field: "payrollBankCard", message: "银行卡号需为 16～19 位数字。" },
  ];
  return issues.filter((issue): issue is RegistrationIssue => issue !== null);
};
