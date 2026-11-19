import type { WorkerRegistration } from "@construction/domain";
import type { PropsWithChildren } from "react";

import { RegistrationRegionPicker } from "../../components/registration-region-picker";
import {
  Chips,
  FormInput,
  FormRow,
  Notice,
  Sheet,
} from "../../components/ui/index";
import { chinaToday } from "../../services/time";
import {
  cleanCardNumber,
  cleanIdNumber,
  cleanTelephone,
  type AddressDraft,
  type InsuranceDraft,
  type RegistrationField,
  type TelephoneDraft,
} from "../../services/worker-registration-form";

import { DateRow, Problems, RegArea, RegInput } from "./fields";
import {
  addressHint,
  cardHint,
  idNumberHint,
  insuranceHints,
  mobileHint,
} from "./registration-view";

/** 四步共用的一份表单：值、改值的办法、每个字段现在要不要报错。 */
export type RegistrationFormProps = {
  readonly value: WorkerRegistration;
  readonly address: AddressDraft;
  readonly insurance: InsuranceDraft;
  readonly telephone: TelephoneDraft;
  readonly busy: boolean;
  /** 入场时必须填完；以后从“我的”进来是修改，身份证号锁住。 */
  readonly required: boolean;
  readonly update: (changes: Partial<WorkerRegistration>) => void;
  readonly updateAddress: (changes: Partial<AddressDraft>) => void;
  readonly updateInsurance: (changes: Partial<InsuranceDraft>) => void;
  readonly updateTelephone: (changes: Partial<TelephoneDraft>) => void;
  /** 这个字段现在要报的错；没填错或还没轮到提示时是 null。 */
  readonly problem: (field: RegistrationField) => string | null;
  /** 记下这个字段被动过了：从这以后填错就提示。 */
  readonly touch: (field: RegistrationField) => void;
};

type Choice = "YES" | "NO";
const chosen = (value: boolean | null): readonly Choice[] =>
  value === null ? [] : [value ? "YES" : "NO"];
const PHONE_KINDS: ReadonlyArray<{
  readonly value: TelephoneDraft["kind"];
  readonly label: string;
}> = [
  { value: "MOBILE", label: "手机" },
  { value: "LANDLINE", label: "座机" },
];
const MEDICATION: ReadonlyArray<{ value: Choice; label: string }> = [
  { value: "NO", label: "无" },
  { value: "YES", label: "有" },
];
const INSURED: ReadonlyArray<{ value: Choice; label: string }> = [
  { value: "NO", label: "未购买" },
  { value: "YES", label: "已购买" },
];
const INSURANCE_NAMES: ReadonlyArray<{ value: string; label: string }> = [
  "人身意外险",
  "团体意外险",
  "雇主责任险",
].map((name) => ({ value: name, label: name }));

/** 身份与住址。 */
export const IdentityStep = (form: RegistrationFormProps): JSX.Element => {
  const { value, address, busy, required, problem, touch } = form;
  return (
    <>
      <Sheet gap>
        <RegInput
          label="身份证号"
          required
          value={value.idNumber}
          maxLength={30}
          type="idcard"
          placeholder="18 位身份证号"
          disabled={busy || !required}
          error={problem("idNumber") !== null}
          onInput={(idNumber) =>
            form.update({ idNumber: cleanIdNumber(idNumber) })
          }
          onBlur={() => touch("idNumber")}
        />
        <RegistrationRegionPicker
          required
          value={address.region}
          disabled={busy}
          invalid={problem("region") !== null}
          onChange={(region) => {
            form.updateAddress({ region });
            touch("region");
          }}
        />
        <RegArea
          label="详细地址"
          required
          value={address.detail}
          maxLength={200}
          disabled={busy}
          placeholder="街道、楼栋或门牌号"
          error={problem("residentialAddress") !== null}
          onInput={(detail) => form.updateAddress({ detail })}
          onBlur={() => touch("residentialAddress")}
        />
      </Sheet>
      <Problems
        fields={["idNumber", "region", "residentialAddress"]}
        problem={problem}
      />
      <Notice>
        {idNumberHint(value.idNumber, required)}
        {addressHint(value.residentialAddress, required)}
      </Notice>
    </>
  );
};

/** 紧急联系人。 */
export const ContactStep = (form: RegistrationFormProps): JSX.Element => {
  const { value, telephone, busy, problem, touch } = form;
  const phoneBad = problem("emergencyContactPhone") !== null;
  return (
    <>
      <Sheet gap>
        <RegInput
          label="联系人姓名"
          required
          value={value.emergencyContactName}
          maxLength={30}
          type="text"
          placeholder="请输入姓名"
          disabled={busy}
          error={problem("emergencyContactName") !== null}
          onInput={(emergencyContactName) =>
            form.update({ emergencyContactName })
          }
          onBlur={() => touch("emergencyContactName")}
        />
        <FormRow label="电话类型">
          <Chips
            onSheet
            options={PHONE_KINDS}
            selected={[telephone.kind]}
            onToggle={(kind) => form.updateTelephone({ kind })}
          />
        </FormRow>
        {telephone.kind === "MOBILE" ? (
          <RegInput
            label="联系电话"
            required
            value={telephone.mobile}
            maxLength={20}
            type="number"
            placeholder="11 位手机号"
            disabled={busy}
            error={phoneBad}
            onInput={(mobile) =>
              form.updateTelephone({ mobile: cleanTelephone(mobile) })
            }
            onBlur={() => touch("emergencyContactPhone")}
          />
        ) : (
          <>
            <RegInput
              label="区号"
              required
              value={telephone.areaCode}
              maxLength={4}
              type="number"
              placeholder="例如 028"
              disabled={busy}
              error={phoneBad}
              onInput={(areaCode) =>
                form.updateTelephone({ areaCode: areaCode.trim() })
              }
              onBlur={() => touch("emergencyContactPhone")}
            />
            <RegInput
              label="电话号码"
              required
              value={telephone.number}
              maxLength={8}
              type="number"
              placeholder="7 到 8 位号码"
              disabled={busy}
              error={phoneBad}
              onInput={(number) =>
                form.updateTelephone({ number: number.trim() })
              }
              onBlur={() => touch("emergencyContactPhone")}
            />
          </>
        )}
      </Sheet>
      <Problems
        fields={["emergencyContactName", "emergencyContactPhone"]}
        problem={problem}
      />
      <Notice>
        {telephone.kind === "MOBILE"
          ? mobileHint(telephone.mobile)
          : "座机的区号和号码分开填。"}
      </Notice>
    </>
  );
};

/** 健康与保险。选了“有”“已购买”才出现后面那几项。 */
export const HealthStep = (form: RegistrationFormProps): JSX.Element => {
  const { value, insurance, busy, required, problem, touch } = form;
  const today = chinaToday();
  return (
    <>
      <Sheet gap>
        <FormRow
          label="长期用药疾病"
          required
          error={problem("hasLongTermMedication") !== null}
        >
          <Chips
            onSheet
            options={MEDICATION}
            selected={chosen(value.hasLongTermMedication)}
            onToggle={(selected) => {
              form.update({ hasLongTermMedication: selected === "YES" });
              touch("hasLongTermMedication");
            }}
          />
        </FormRow>
        {value.hasLongTermMedication ? (
          <RegArea
            label="疾病和用药情况"
            required
            value={value.medicationDetails}
            maxLength={500}
            disabled={busy}
            placeholder="是什么病，长期吃什么药"
            error={problem("medicationDetails") !== null}
            onInput={(medicationDetails) => form.update({ medicationDetails })}
            onBlur={() => touch("medicationDetails")}
          />
        ) : null}
      </Sheet>
      <Problems
        fields={["hasLongTermMedication", "medicationDetails"]}
        problem={problem}
      />
      <Sheet gap>
        <FormRow
          label="人身保险"
          required
          error={problem("hasPersonalInsurance") !== null}
        >
          <Chips
            onSheet
            options={INSURED}
            selected={chosen(value.hasPersonalInsurance)}
            onToggle={(selected) => {
              form.update({ hasPersonalInsurance: selected === "YES" });
              touch("hasPersonalInsurance");
            }}
          />
        </FormRow>
        {value.hasPersonalInsurance ? (
          <>
            <RegInput
              label="保险名称"
              required
              value={insurance.name}
              maxLength={80}
              type="text"
              placeholder="填写，或在下面点选"
              disabled={busy}
              error={problem("insuranceName") !== null}
              onInput={(name) => form.updateInsurance({ name })}
              onBlur={() => touch("insuranceName")}
            />
            <FormInput
              label="保险公司"
              value={insurance.company}
              maxLength={60}
              placeholder="选填，例如中国人寿"
              disabled={busy}
              onInput={(company) => form.updateInsurance({ company })}
            />
            <DateRow
              label="保障开始"
              required
              value={insurance.startsOn}
              pickerValue={insurance.startsOn || today}
              end={insurance.endsOn || undefined}
              disabled={busy}
              error={problem("insuranceStartsOn") !== null}
              onChange={(startsOn) => {
                form.updateInsurance({ startsOn });
                touch("insuranceStartsOn");
              }}
            />
            <DateRow
              label="保障结束"
              required
              value={insurance.endsOn}
              pickerValue={insurance.endsOn || insurance.startsOn || today}
              start={insurance.startsOn || undefined}
              disabled={busy}
              error={problem("insuranceEndsOn") !== null}
              onChange={(endsOn) => {
                form.updateInsurance({ endsOn });
                touch("insuranceEndsOn");
              }}
            />
          </>
        ) : null}
      </Sheet>
      <Problems
        fields={[
          "hasPersonalInsurance",
          "insuranceName",
          "insuranceStartsOn",
          "insuranceEndsOn",
        ]}
        problem={problem}
      />
      {value.hasPersonalInsurance ? (
        <>
          <Chips
            options={INSURANCE_NAMES}
            selected={[insurance.name]}
            onToggle={(name) => {
              form.updateInsurance({ name });
              touch("insuranceName");
            }}
          />
          <Sheet gap>
            <RegArea
              label="补充说明"
              value={insurance.notes}
              maxLength={500}
              disabled={busy}
              placeholder="选填，保单号或别的要说明的"
              error={problem("insuranceDetails") !== null}
              onInput={(notes) => form.updateInsurance({ notes })}
            />
          </Sheet>
          <Problems fields={["insuranceDetails"]} problem={problem} />
          {insuranceHints({
            insurance,
            savedDetails: value.insuranceDetails,
            required,
            today,
          }).map((hint) => (
            <Notice key={hint}>{hint}</Notice>
          ))}
        </>
      ) : null}
    </>
  );
};

/** 银行卡。入场时 children 里是“核对已填的资料”那一块。 */
export const BankStep = ({
  children,
  ...form
}: PropsWithChildren<RegistrationFormProps>): JSX.Element => {
  const { value, busy, problem, touch } = form;
  return (
    <>
      <Sheet gap>
        <RegInput
          label="银行卡号"
          required
          value={value.payrollBankCard}
          maxLength={30}
          type="number"
          placeholder="本人银行卡号"
          disabled={busy}
          error={problem("payrollBankCard") !== null}
          onInput={(payrollBankCard) =>
            form.update({ payrollBankCard: cleanCardNumber(payrollBankCard) })
          }
          onBlur={() => touch("payrollBankCard")}
        />
      </Sheet>
      <Problems fields={["payrollBankCard"]} problem={problem} />
      <Notice>{cardHint(value.payrollBankCard)}</Notice>
      {children}
      <Notice>
        资料用于用工登记、紧急联络、健康安全和工资发放。本人申报不等于实名认证、保险核验或银行卡认证。
      </Notice>
    </>
  );
};
