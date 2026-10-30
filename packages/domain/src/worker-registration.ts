export type WorkerRegistration = {
  readonly idNumber: string;
  readonly residentialAddress: string;
  readonly emergencyContactName: string;
  readonly emergencyContactPhone: string;
  readonly hasLongTermMedication: boolean | null;
  readonly medicationDetails: string;
  readonly hasPersonalInsurance: boolean | null;
  readonly insuranceDetails: string;
  readonly payrollBankCard: string;
};

export type WorkerRegistrationStatus =
  | "NOT_APPLICABLE"
  | "REQUIRED"
  | "COMPLETE";

export const emptyWorkerRegistration = (): WorkerRegistration => ({
  idNumber: "",
  residentialAddress: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  hasLongTermMedication: null,
  medicationDetails: "",
  hasPersonalInsurance: null,
  insuranceDetails: "",
  payrollBankCard: "",
});

export const normalizeWorkerRegistration = (
  value: WorkerRegistration,
): WorkerRegistration => ({
  idNumber: value.idNumber.trim().toUpperCase(),
  residentialAddress: value.residentialAddress.trim(),
  emergencyContactName: value.emergencyContactName.trim(),
  emergencyContactPhone: value.emergencyContactPhone.trim(),
  hasLongTermMedication: value.hasLongTermMedication,
  medicationDetails:
    value.hasLongTermMedication === true ? value.medicationDetails.trim() : "",
  hasPersonalInsurance: value.hasPersonalInsurance,
  insuranceDetails:
    value.hasPersonalInsurance === true ? value.insuranceDetails.trim() : "",
  payrollBankCard: value.payrollBankCard.replace(/\s/g, ""),
});

export const validIdNumber = (id: string): boolean => {
  if (!/^[1-9]\d{16}[\dX]$/.test(id)) return false;
  const birthDate: string = `${id.slice(6, 10)}-${id.slice(10, 12)}-${id.slice(12, 14)}`;
  const parsed: Date = new Date(`${birthDate}T00:00:00Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== birthDate
  )
    return false;
  const weights: readonly number[] = [
    7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2,
  ];
  const sum: number = weights.reduce(
    (total, weight, index) => total + Number(id[index]) * weight,
    0,
  );
  return "10X98765432"[sum % 11] === id[17];
};

/** Validate declarations, without claiming identity or bank ownership verification. */
export const workerRegistrationError = (
  value: WorkerRegistration,
): string | null => {
  if (!validIdNumber(value.idNumber)) return "请填写有效的 18 位本人身份证号。";
  if (!value.residentialAddress || value.residentialAddress.length > 200)
    return "请填写居住地址，最多 200 个字。";
  if (!value.emergencyContactName || value.emergencyContactName.length > 30)
    return "请填写紧急联系人姓名，最多 30 个字。";
  if (!/^(?:1[3-9]\d{9}|0\d{2,3}-?\d{7,8})$/.test(value.emergencyContactPhone))
    return "请填写紧急联系人的手机号或带区号的固定电话。";
  if (value.hasLongTermMedication === null)
    return "请选择是否有需要长期服药的疾病。";
  if (
    value.hasLongTermMedication &&
    (!value.medicationDetails || value.medicationDetails.length > 500)
  )
    return "请填写长期服药疾病及用药情况，最多 500 个字。";
  if (value.hasPersonalInsurance === null) return "请选择是否已购买人身保险。";
  if (
    value.hasPersonalInsurance &&
    (!value.insuranceDetails || value.insuranceDetails.length > 500)
  )
    return "请填写保险名称和保障期限等情况，最多 500 个字。";
  if (!/^\d{16,19}$/.test(value.payrollBankCard))
    return "请填写 16 至 19 位银行卡号。";
  return null;
};
