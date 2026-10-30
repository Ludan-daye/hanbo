import { View, Textarea, Input, Picker } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useEffect, useState } from "react";
import {
  normalizeWorkerRegistration,
  workerRegistrationError,
  type WorkerRegistration,
} from "@construction/domain";
import {
  AppHeader,
  PageHeader,
  Button,
  ListItem,
  Notice,
  Screen,
  Section,
  Segmented,
  StateView,
  Subtitle,
  Title,
} from "../../components/ui/index";
import {
  fetchWorkerRegistration,
  saveWorkerRegistration,
} from "../../services/account";
import { useSession } from "../../store/session";
import { sessionEntryUrl } from "../../routing/session";
import { FRONTEND_DEMO } from "../../config/env";
import { chinaToday } from "../../services/time";
import { RegistrationRegionPicker } from "../../components/registration-region-picker";
import {
  cleanIdNumber,
  cleanCardNumber,
  cleanTelephone,
  groupCardNumber,
  readAddressDraft,
  writeAddressDraft,
  readInsuranceDraft,
  writeInsuranceDraft,
  readTelephoneDraft,
  writeTelephoneDraft,
  registrationIssues,
  type AddressDraft,
  type InsuranceDraft,
  type TelephoneDraft,
  type RegistrationField,
} from "../../services/worker-registration-form";
import "./index.scss";

type Choice = "YES" | "NO" | "";
const choiceValue = (value: boolean | null): Choice =>
  value === null ? "" : value ? "YES" : "NO";

const RegistrationInput = ({
  label,
  value,
  placeholder,
  maxLength,
  type,
  disabled,
  error,
  hint,
  onInput,
  onBlur,
}: {
  readonly label: string;
  readonly value: string;
  readonly placeholder: string;
  readonly maxLength: number;
  readonly type: "text" | "number" | "idcard";
  readonly disabled: boolean;
  readonly error: string | null;
  readonly hint: string;
  readonly onInput: (value: string) => void;
  readonly onBlur: () => void;
}): JSX.Element => (
  <View className="registration-field">
    {label ? <View className="ui-field-label">{label}</View> : null}
    <Input
      className={`ui-field registration-input ${error ? "registration-input--error" : ""}`}
      value={value}
      placeholder={placeholder}
      maxlength={maxLength}
      type={process.env.TARO_ENV === "weapp" ? type : "text"}
      disabled={disabled}
      onInput={(event) => onInput(event.detail.value)}
      onBlur={onBlur}
    />
    {error ? (
      <View className="registration-error">{error}</View>
    ) : hint ? (
      <View className="registration-hint">{hint}</View>
    ) : null}
  </View>
);

export default function WorkerRegistrationPage(): JSX.Element {
  const { state, phase, refreshMe, clear } = useSession();
  const [value, setValue] = useState<WorkerRegistration | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const [saved, setSaved] = useState<boolean>(false);
  const [revision, setRevision] = useState<number>(0);
  const [address, setAddress] = useState<AddressDraft>(() =>
    readAddressDraft(""),
  );
  const [insurance, setInsurance] = useState<InsuranceDraft>(() =>
    readInsuranceDraft(""),
  );
  const [telephone, setTelephone] = useState<TelephoneDraft>(() =>
    readTelephoneDraft(""),
  );
  const [touched, setTouched] = useState<readonly RegistrationField[]>([]);
  const [showErrors, setShowErrors] = useState<boolean>(false);
  const required: boolean =
    state.accountProfile?.workerRegistration === "REQUIRED";
  const userId: string | undefined = state.me?.user.id;
  const guard = (): void => {
    if (phase === "loading" || busy) return;
    if (saved) {
      const url: string | null = sessionEntryUrl(phase);
      if (url !== null) void Taro.reLaunch({ url });
      return;
    }
    if (
      phase === "ready" ||
      phase === "norole" ||
      phase === "worker-registration-required"
    )
      return;
    const url: string | null = sessionEntryUrl(phase);
    if (url !== null) void Taro.reLaunch({ url });
  };
  useDidShow(guard);
  useEffect(guard, [phase, saved, busy]);
  useEffect(() => {
    if (
      userId === undefined ||
      !["ready", "norole", "worker-registration-required"].includes(phase)
    )
      return;
    let cancelled = false;
    setValue(null);
    setError(null);
    void fetchWorkerRegistration().then(
      (result) => {
        if (!cancelled) {
          setValue(result);
          setAddress(readAddressDraft(result.residentialAddress));
          setInsurance(readInsuranceDraft(result.insuranceDetails));
          setTelephone(readTelephoneDraft(result.emergencyContactPhone));
          setTouched([]);
          setShowErrors(false);
        }
      },
      (cause: unknown) => {
        if (!cancelled)
          setError(
            cause instanceof Error
              ? cause.message
              : "用工资料读取失败，请重试。",
          );
      },
    );
    return () => {
      cancelled = true;
    };
  }, [userId, revision, phase]);

  const update = (changes: Partial<WorkerRegistration>): void => {
    if (busy) return;
    setValue((current) =>
      current === null ? null : { ...current, ...changes },
    );
    setError(null);
  };
  const markTouched = (field: RegistrationField): void =>
    setTouched((current) =>
      current.includes(field) ? current : [...current, field],
    );
  const updateAddress = (changes: Partial<AddressDraft>): void => {
    if (!busy) {
      setAddress((current) => ({ ...current, ...changes }));
      setError(null);
    }
  };
  const updateInsurance = (changes: Partial<InsuranceDraft>): void => {
    if (!busy) {
      setInsurance((current) => ({ ...current, ...changes }));
      setError(null);
    }
  };
  const updateTelephone = (changes: Partial<TelephoneDraft>): void => {
    if (!busy) {
      setTelephone((current) => ({ ...current, ...changes }));
      setError(null);
    }
  };
  const prepared: WorkerRegistration | null =
    value === null
      ? null
      : normalizeWorkerRegistration({
          ...value,
          idNumber: cleanIdNumber(value.idNumber),
          payrollBankCard: cleanCardNumber(value.payrollBankCard),
          residentialAddress: writeAddressDraft(address),
          emergencyContactPhone: writeTelephoneDraft(telephone),
          insuranceDetails: writeInsuranceDraft(insurance),
        });
  const issues =
    prepared === null ? [] : registrationIssues(prepared, address, insurance);
  const fieldError = (field: RegistrationField): string | null =>
    showErrors || touched.includes(field)
      ? (issues.find((issue) => issue.field === field)?.message ?? null)
      : null;
  const save = async (): Promise<void> => {
    if (busy || prepared === null) return;
    setShowErrors(true);
    const invalid: string | null =
      issues[0]?.message ?? workerRegistrationError(prepared);
    if (invalid !== null) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await saveWorkerRegistration(prepared);
      await refreshMe();
      setSaved(true);
    } catch (cause: unknown) {
      setError(
        cause instanceof Error ? cause.message : "用工资料保存失败，请重试。",
      );
    } finally {
      setBusy(false);
    }
  };
  const signOut = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      await clear();
      await Taro.reLaunch({ url: "/pages/login/index" });
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "退出失败，请重试。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      {required ? (
        <AppHeader title="完善用工资料" />
      ) : (
        <PageHeader title="用工登记资料" />
      )}
      <Title>{required ? "入场前，完善本人资料" : "我的用工资料"}</Title>
      <Subtitle>除标注“选填”外，其余资料均需填写。{required ? "保存后继续录入本人正脸，用于打卡时的人脸比对。" : ""}</Subtitle>
      {FRONTEND_DEMO ? <Notice>本机演示，请只填写虚构测试资料。</Notice> : null}
      {state.accountProfile ? (
        <ListItem
          primary={state.accountProfile.realName ?? "本人资料"}
          secondary={state.accountProfile.phoneMasked ?? ""}
        />
      ) : null}
      {value === null ? (
        <StateView
          title={error === null ? "资料加载中…" : "资料读取失败"}
          sub={error ?? undefined}
          onRetry={() => setRevision((current) => current + 1)}
        />
      ) : (
        <>
          <Section title="身份与住址">
            <RegistrationInput
              label="身份证号"
              value={value.idNumber}
              maxLength={30}
              type="idcard"
              placeholder="请输入 18 位身份证号"
              disabled={busy || !required}
              error={fieldError("idNumber")}
              hint={
                required
                  ? value.idNumber
                    ? `已输入 ${cleanIdNumber(value.idNumber).length} / 18 位`
                    : "支持直接粘贴，末位 x 自动转为 X"
                  : "需更正身份证信息时，请联系管理员核实"
              }
              onInput={(idNumber) =>
                update({ idNumber: cleanIdNumber(idNumber) })
              }
              onBlur={() => markTouched("idNumber")}
            />
            <View className="registration-field">
              <View className="ui-field-label">所在地区</View>
              <RegistrationRegionPicker
                value={address.region}
                disabled={busy}
                invalid={fieldError("region") !== null}
                onChange={(region) => {
                  updateAddress({ region });
                  markTouched("region");
                }}
              />
              {fieldError("region") ? (
                <View className="registration-error">
                  {fieldError("region")}
                </View>
              ) : null}
            </View>
            <RegistrationInput
              label="详细地址"
              value={address.detail}
              maxLength={200}
              type="text"
              placeholder="街道、小区、楼栋或门牌号"
              disabled={busy}
              error={fieldError("residentialAddress")}
              hint={
                value.residentialAddress &&
                readAddressDraft(value.residentialAddress).region.length === 0
                  ? "原有地址已保留，请选地区后核对详细地址"
                  : "填现居住地址，无需重复填写省市区"
              }
              onInput={(detail) => updateAddress({ detail })}
              onBlur={() => markTouched("residentialAddress")}
            />
          </Section>
          <Section title="紧急联系人">
            <RegistrationInput
              label="联系人姓名"
              value={value.emergencyContactName}
              maxLength={30}
              type="text"
              placeholder="请输入联系人姓名"
              disabled={busy}
              error={fieldError("emergencyContactName")}
              hint=""
              onInput={(emergencyContactName) =>
                update({ emergencyContactName })
              }
              onBlur={() => markTouched("emergencyContactName")}
            />
            <View className="registration-field">
              <View className="ui-field-label">联系电话</View>
              <Segmented<TelephoneDraft["kind"]>
                value={telephone.kind}
                options={[
                  { value: "MOBILE", label: "手机" },
                  { value: "LANDLINE", label: "座机" },
                ]}
                onChange={(kind) => updateTelephone({ kind })}
              />
              {telephone.kind === "MOBILE" ? (
                <RegistrationInput
                  label=""
                  value={telephone.mobile}
                  maxLength={20}
                  type="number"
                  placeholder="11 位手机号码"
                  disabled={busy}
                  error={fieldError("emergencyContactPhone")}
                  hint={
                    telephone.mobile
                      ? cleanTelephone(telephone.mobile).replace(
                          /^(\d{3})(\d{4})(\d{1,4})$/,
                          "$1 $2 $3",
                        )
                      : "可直接粘贴，自动去除空格和 +86"
                  }
                  onInput={(mobile) =>
                    updateTelephone({ mobile: cleanTelephone(mobile) })
                  }
                  onBlur={() => markTouched("emergencyContactPhone")}
                />
              ) : (
                <>
                  <View className="registration-phone-row">
                    <RegistrationInput
                      label="区号"
                      value={telephone.areaCode}
                      maxLength={4}
                      type="number"
                      placeholder="如 028"
                      disabled={busy}
                      error={null}
                      hint=""
                      onInput={(areaCode) =>
                        updateTelephone({ areaCode: areaCode.trim() })
                      }
                      onBlur={() => markTouched("emergencyContactPhone")}
                    />
                    <RegistrationInput
                      label="电话号码"
                      value={telephone.number}
                      maxLength={8}
                      type="number"
                      placeholder="7～8 位号码"
                      disabled={busy}
                      error={null}
                      hint=""
                      onInput={(number) =>
                        updateTelephone({ number: number.trim() })
                      }
                      onBlur={() => markTouched("emergencyContactPhone")}
                    />
                  </View>
                  {fieldError("emergencyContactPhone") ? (
                    <View className="registration-error">
                      {fieldError("emergencyContactPhone")}
                    </View>
                  ) : null}
                </>
              )}
            </View>
          </Section>
          <Section title="健康情况" sub="是否有需要长期服药的疾病？">
            <Segmented<Choice>
              value={choiceValue(value.hasLongTermMedication)}
              options={[
                { value: "NO", label: "无" },
                { value: "YES", label: "有" },
              ]}
              onChange={(selected) => {
                update({ hasLongTermMedication: selected === "YES" });
                markTouched("hasLongTermMedication");
              }}
            />
            {fieldError("hasLongTermMedication") ? (
              <View className="registration-error">
                {fieldError("hasLongTermMedication")}
              </View>
            ) : null}
            {value.hasLongTermMedication ? (
              <>
                <Textarea
                  className="registration-textarea"
                  placeholder="填写疾病名称和长期用药情况"
                  value={value.medicationDetails}
                  maxlength={500}
                  disabled={busy}
                  autoHeight
                  onInput={(event) =>
                    update({ medicationDetails: event.detail.value })
                  }
                  onBlur={() => markTouched("medicationDetails")}
                />
                {fieldError("medicationDetails") ? (
                  <View className="registration-error">
                    {fieldError("medicationDetails")}
                  </View>
                ) : null}
              </>
            ) : null}
          </Section>
          <Section title="保险情况" sub="是否已购买人身保险？">
            <Segmented<Choice>
              value={choiceValue(value.hasPersonalInsurance)}
              options={[
                { value: "NO", label: "未购买" },
                { value: "YES", label: "已购买" },
              ]}
              onChange={(selected) => {
                update({ hasPersonalInsurance: selected === "YES" });
                markTouched("hasPersonalInsurance");
              }}
            />
            {fieldError("hasPersonalInsurance") ? (
              <View className="registration-error">
                {fieldError("hasPersonalInsurance")}
              </View>
            ) : null}
            {value.hasPersonalInsurance ? (
              <View className="registration-insurance-fields">
                <RegistrationInput
                  label="保险名称"
                  value={insurance.name}
                  maxLength={80}
                  type="text"
                  placeholder="填写名称，或点选下方常见险种"
                  disabled={busy}
                  error={fieldError("insuranceName")}
                  hint=""
                  onInput={(name) => updateInsurance({ name })}
                  onBlur={() => markTouched("insuranceName")}
                />
                <View className="registration-suggestions">
                  {["人身意外险", "团体意外险", "雇主责任险"].map((name) => (
                    <View
                      key={name}
                      className={`registration-suggestion ${insurance.name === name ? "registration-suggestion--active" : ""}`}
                      onClick={() => {
                        updateInsurance({ name });
                        markTouched("insuranceName");
                      }}
                    >
                      {name}
                    </View>
                  ))}
                </View>
                <RegistrationInput
                  label="保险公司（选填）"
                  value={insurance.company}
                  maxLength={60}
                  type="text"
                  placeholder="如：中国人寿、中国平安"
                  disabled={busy}
                  error={null}
                  hint=""
                  onInput={(company) => updateInsurance({ company })}
                  onBlur={() => {}}
                />
                <View className="ui-field-label">保障期限</View>
                <View className="registration-date-row">
                  <Picker
                    mode="date"
                    value={insurance.startsOn || chinaToday()}
                    end={insurance.endsOn || undefined}
                    disabled={busy}
                    onChange={(event) => {
                      updateInsurance({ startsOn: event.detail.value });
                      markTouched("insuranceStartsOn");
                    }}
                  >
                    <View
                      className={`registration-select ${fieldError("insuranceStartsOn") ? "registration-input--error" : ""}`}
                    >
                      <View
                        className={
                          insurance.startsOn ? "" : "registration-placeholder"
                        }
                      >
                        {insurance.startsOn || "开始日期"}
                      </View>
                      <View className="registration-chevron">›</View>
                    </View>
                  </Picker>
                  <View className="registration-date-divider">至</View>
                  <Picker
                    mode="date"
                    value={
                      insurance.endsOn || insurance.startsOn || chinaToday()
                    }
                    start={insurance.startsOn || undefined}
                    disabled={busy}
                    onChange={(event) => {
                      updateInsurance({ endsOn: event.detail.value });
                      markTouched("insuranceEndsOn");
                    }}
                  >
                    <View
                      className={`registration-select ${fieldError("insuranceEndsOn") ? "registration-input--error" : ""}`}
                    >
                      <View
                        className={
                          insurance.endsOn ? "" : "registration-placeholder"
                        }
                      >
                        {insurance.endsOn || "结束日期"}
                      </View>
                      <View className="registration-chevron">›</View>
                    </View>
                  </Picker>
                </View>
                {fieldError("insuranceStartsOn") ||
                fieldError("insuranceEndsOn") ? (
                  <View className="registration-error">
                    {fieldError("insuranceStartsOn") ??
                      fieldError("insuranceEndsOn")}
                  </View>
                ) : null}
                {insurance.endsOn && insurance.endsOn < chinaToday() ? (
                  <View className="registration-hint">
                    该保障期限已结束，请核对续保情况。
                  </View>
                ) : null}
                {value.insuranceDetails &&
                !readInsuranceDraft(value.insuranceDetails).name ? (
                  <View className="registration-hint">
                    原有保险说明已保留在下方，请核对名称与保障日期。
                  </View>
                ) : null}
                <View className="registration-field">
                  <View className="ui-field-label">补充说明（选填）</View>
                  <Textarea
                    className="registration-textarea"
                    placeholder="保单号或其他需要说明的信息"
                    value={insurance.notes}
                    maxlength={500}
                    disabled={busy}
                    autoHeight
                    onInput={(event) =>
                      updateInsurance({ notes: event.detail.value })
                    }
                  />
                  {fieldError("insuranceDetails") ? (
                    <View className="registration-error">
                      {fieldError("insuranceDetails")}
                    </View>
                  ) : null}
                </View>
              </View>
            ) : null}
          </Section>
          <Section title="银行卡信息">
            <RegistrationInput
              label=""
              value={value.payrollBankCard}
              maxLength={30}
              type="number"
              placeholder=""
              disabled={busy}
              error={fieldError("payrollBankCard")}
              hint={
                value.payrollBankCard
                  ? `已输入 ${cleanCardNumber(value.payrollBankCard).length} 位`
                  : "可直接粘贴，自动去除空格"
              }
              onInput={(payrollBankCard) =>
                update({ payrollBankCard: cleanCardNumber(payrollBankCard) })
              }
              onBlur={() => markTouched("payrollBankCard")}
            />
            {value.payrollBankCard ? (
              <View className="registration-card-preview">
                {groupCardNumber(value.payrollBankCard)}
              </View>
            ) : null}
          </Section>
          <View className="registration-note">
            资料用于用工登记、紧急联络、健康安全及工资发放。填写内容为本人申报，不代表已完成实名认证、保险核验或银行卡认证。
          </View>
          {error ? <Notice>{error}</Notice> : null}
          <Button
            loading={busy}
            onClick={() => {
              void save();
            }}
          >
            {required ? "保存并录入人脸" : "保存修改"}
          </Button>
        </>
      )}
      {required ? (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => {
            void signOut();
          }}
        >
          退出登录
        </Button>
      ) : null}
    </Screen>
  );
}
