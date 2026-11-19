import { View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useEffect, useState } from "react";
import {
  workerRegistrationError,
  type WorkerRegistration,
} from "@construction/domain";
import {
  AppHeader,
  BottomBar,
  Button,
  Links,
  Notice,
  PageHeader,
  Row,
  Say,
  Screen,
  SectionTitle,
  Sheet,
  StateView,
  Steps,
} from "../../components/ui/index";
import { WorkEntryNotice } from "../../components/work-entry-notice";
import {
  fetchWorkerRegistration,
  saveWorkerRegistration,
} from "../../services/account";
import { useSession } from "../../store/session";
import { sessionEntryUrl } from "../../routing/session";
import { FRONTEND_DEMO } from "../../config/env";
import { errorMessage } from "../../services/error-messages";
import {
  readAddressDraft,
  readInsuranceDraft,
  readTelephoneDraft,
  registrationIssues,
  registrationIssuesForStep,
  registrationIssueStep,
  prepareWorkerRegistration,
  type AddressDraft,
  type InsuranceDraft,
  type TelephoneDraft,
  type RegistrationField,
  type RegistrationStep,
} from "../../services/worker-registration-form";
import { ONBOARDING_STEPS } from "../complete-profile/onboarding-steps";

import {
  groupStatus,
  REGISTRATION_GROUPS,
  stepProblems,
} from "./registration-view";
import {
  BankStep,
  ContactStep,
  HealthStep,
  IdentityStep,
  type RegistrationFormProps,
} from "./steps";
import "./index.scss";

/**
 * 用工登记：四类资料，一屏一类。
 * 入场时是第 3 到第 6 步，一步一步往下走，最后一步顺手核对前三类；
 * 以后从“我的”进来是一张列表，哪类要改点哪类。
 */
export default function WorkerRegistrationPage(): JSX.Element {
  const { state, phase, refreshMe, clear } = useSession();
  const [value, setValue] = useState<WorkerRegistration | null>(null);
  const [savedRegistration, setSavedRegistration] =
    useState<WorkerRegistration | null>(null);
  const [step, setStep] = useState<RegistrationStep | null>(1);
  const [returnToReview, setReturnToReview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const [signingOut, setSigningOut] = useState<boolean>(false);
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
          setSavedRegistration(result);
          setStep(required ? 1 : null);
          setReturnToReview(false);
          setAddress(readAddressDraft(result.residentialAddress));
          setInsurance(readInsuranceDraft(result.insuranceDetails));
          setTelephone(readTelephoneDraft(result.emergencyContactPhone));
          setTouched([]);
          setShowErrors(false);
        }
      },
      (cause: unknown) => {
        if (!cancelled)
          setError(errorMessage(cause, "用工资料读取失败，请重试。"));
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
  const editOptions =
    !required && savedRegistration !== null ? { saved: savedRegistration } : {};
  const prepared: WorkerRegistration | null =
    value === null
      ? null
      : prepareWorkerRegistration(
          value,
          address,
          insurance,
          telephone,
          editOptions,
        );
  const issues =
    prepared === null
      ? []
      : registrationIssues(prepared, address, insurance, editOptions);
  const fieldError = (field: RegistrationField): string | null =>
    showErrors || touched.includes(field)
      ? (issues.find((issue) => issue.field === field)?.message ?? null)
      : null;
  const changeStep = (next: RegistrationStep | null): void => {
    if (busy) return;
    setStep(next);
    setError(null);
    setShowErrors(false);
    void Taro.pageScrollTo({ scrollTop: 0, duration: 0 });
  };
  const nextStep = (): void => {
    if (busy || prepared === null || step === null) return;
    const currentIssues = registrationIssuesForStep(
      prepared,
      address,
      insurance,
      step,
      editOptions,
    );
    if (currentIssues.length > 0) {
      setTouched((current) => [
        ...new Set([...current, ...currentIssues.map((issue) => issue.field)]),
      ]);
      setError(currentIssues[0].message);
      void Taro.pageScrollTo({ scrollTop: 0, duration: 0 });
      return;
    }
    changeStep(
      returnToReview ? 4 : (Math.min(step + 1, 4) as RegistrationStep),
    );
    setReturnToReview(false);
  };
  const save = async (): Promise<void> => {
    if (busy || prepared === null) return;
    setShowErrors(true);
    const invalid: string | null =
      issues[0]?.message ?? workerRegistrationError(prepared);
    if (invalid !== null) {
      // 哪一类没填对，就翻到哪一类去改。
      if (issues[0]) {
        const invalidStep = registrationIssueStep(issues[0].field);
        setStep(invalidStep);
        setReturnToReview(required && invalidStep !== 4);
        void Taro.pageScrollTo({ scrollTop: 0, duration: 0 });
      }
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
      setError(errorMessage(cause, "用工资料保存失败，请重试。"));
    } finally {
      setBusy(false);
    }
  };
  const signOut = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setSigningOut(true);
    try {
      await clear();
      await Taro.reLaunch({ url: "/pages/login/index" });
    } catch (cause: unknown) {
      setError(errorMessage(cause, "退出失败，请重试。"));
    } finally {
      setBusy(false);
      setSigningOut(false);
    }
  };
  /** 上一步；改完要回核对页时回核对页；以后来改资料时回到列表。 */
  const back = (): void => {
    if (busy) return;
    if (!required) changeStep(null);
    else if (step !== null)
      changeStep(returnToReview ? 4 : ((step - 1) as RegistrationStep));
    setReturnToReview(false);
  };

  const group = step === null ? null : REGISTRATION_GROUPS[step - 1];
  const canGoBack: boolean = step !== 1 || !required || returnToReview;
  const header =
    value === null || group === null ? (
      required ? (
        <AppHeader title="入场登记" />
      ) : (
        <PageHeader title="用工登记" />
      )
    ) : required ? (
      canGoBack ? (
        <PageHeader title="入场登记" onBack={back} />
      ) : (
        <AppHeader title="入场登记" />
      )
    ) : (
      <PageHeader title={group.short} onBack={back} />
    );
  // 已经标在字段下面的原因，页面底部不再说一遍。
  const notice: string | null =
    error !== null &&
    (step === null || !stepProblems(issues, step, fieldError).includes(error))
      ? error
      : null;
  const form: RegistrationFormProps | null =
    value === null
      ? null
      : {
          value,
          address,
          insurance,
          telephone,
          busy,
          required,
          update,
          updateAddress,
          updateInsurance,
          updateTelephone,
          problem: fieldError,
          touch: markTouched,
        };
  const saving: boolean = busy && !signingOut;

  return (
    <Screen header={header}>
      {form === null ? (
        <StateView
          title={error === null ? "正在读取用工登记" : "用工登记没读到"}
          kind={error === null ? "loading" : "error"}
          sub={error ?? undefined}
          onRetry={() => setRevision((current) => current + 1)}
        />
      ) : step === null || group === null ? (
        <>
          <Say
            title="我的用工登记"
            sub="哪一类要改，就点哪一类。身份证号改不了，要改请找管理员。"
          />
          <Sheet gap>
            {REGISTRATION_GROUPS.map((entry) => (
              <Row
                key={entry.step}
                title={entry.short}
                status={groupStatus(issues, entry.step)}
                chevron
                onClick={() => changeStep(entry.step)}
              />
            ))}
          </Sheet>
          <Notice>资料用于用工登记、紧急联络、健康安全和工资发放。</Notice>
          {FRONTEND_DEMO ? (
            <Notice>演示版，只填编出来的资料，别填真实的证件和卡号。</Notice>
          ) : null}
          {notice ? <Notice tone="error">{notice}</Notice> : null}
        </>
      ) : (
        <>
          {required ? (
            <Steps
              current={group.onboardingStep}
              total={ONBOARDING_STEPS.length}
              label={group.title}
            />
          ) : null}
          {required ? <WorkEntryNotice /> : null}
          {FRONTEND_DEMO ? (
            <Notice>演示版，只填编出来的资料，别填真实的证件和卡号。</Notice>
          ) : null}
          {/* 换一步时内容从右边滑入。底部操作条是固定定位的，不能放进带动画的容器里。 */}
          <View key={step} className="m-step">
            {step === 1 ? (
              <IdentityStep {...form} />
            ) : step === 2 ? (
              <ContactStep {...form} />
            ) : step === 3 ? (
              <HealthStep {...form} />
            ) : (
              <BankStep {...form}>
                {required ? (
                  <>
                    <SectionTitle>核对已填的资料</SectionTitle>
                    <Sheet>
                      {REGISTRATION_GROUPS.filter(
                        (entry) => entry.step !== 4,
                      ).map((entry) => (
                        <Row
                          key={entry.step}
                          title={entry.title}
                          status={groupStatus(issues, entry.step)}
                          onClick={
                            busy
                              ? undefined
                              : () => {
                                  changeStep(entry.step);
                                  setReturnToReview(true);
                                }
                          }
                        >
                          <View className="reg-edit">修改</View>
                        </Row>
                      ))}
                    </Sheet>
                  </>
                ) : null}
              </BankStep>
            )}
          </View>
          {notice ? <Notice tone="error">{notice}</Notice> : null}
          {required && step !== 4 ? (
            <BottomBar
              primary={returnToReview ? "改好了，回去核对" : "下一步"}
              busy={busy}
              onPrimary={nextStep}
            >
              {canGoBack ? (
                <Button variant="outline" disabled={busy} onClick={back}>
                  {returnToReview ? "返回核对" : "上一步"}
                </Button>
              ) : null}
            </BottomBar>
          ) : (
            <BottomBar
              primary={
                saving ? "保存中…" : required ? "保存，去拍底照" : "保存修改"
              }
              busy={busy}
              onPrimary={() => {
                void save();
              }}
            >
              {required ? (
                <Button variant="outline" disabled={busy} onClick={back}>
                  上一步
                </Button>
              ) : null}
            </BottomBar>
          )}
        </>
      )}
      {required ? (
        <Links>
          <Button
            variant="text"
            disabled={busy}
            onClick={() => {
              void signOut();
            }}
          >
            {signingOut ? "退出中…" : "退出登录"}
          </Button>
        </Links>
      ) : null}
    </Screen>
  );
}
