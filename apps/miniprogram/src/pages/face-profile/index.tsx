import Taro, { useRouter } from "@tarojs/taro";
import { useEffect, useRef, useState } from "react";

import {
  AppHeader,
  Button,
  Links,
  Notice,
  PageHeader,
  Row,
  Screen,
  StateView,
  Steps,
} from "../../components/ui/index";
import {
  VideoFaceCapture,
  type VideoFaceFlow,
} from "../../components/video-face-capture/index";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { useSessionGuard } from "../../hooks/use-session-guard";
import { errorMessage } from "../../services/error-messages";
import {
  createLivenessTest,
  fetchLivenessTestResult,
  uploadLivenessTestVideo,
  type FaceLivenessTestResult,
  enrollMyFace,
  faceStatusLabel,
  fetchMyFace,
  type MyFace,
} from "../../services/face";
import { chinaToday } from "../../services/time";
import { useSession } from "../../store/session";
import { ONBOARDING_STEPS } from "../complete-profile/onboarding-steps";

import {
  chooseFaceEnrollmentPhoto,
  replacementNeedsConfirmation,
} from "./face-profile-input";
import { faceStage, faceTime, stampDay } from "./face-profile-view";
import {
  ApprovedView,
  CaptureView,
  PendingView,
  PreviewView,
  RetakeView,
  TestView,
} from "./views";
import "./index.scss";

const livenessTestFlow: VideoFaceFlow<FaceLivenessTestResult> = {
  createSession: createLivenessTest,
  fetchResult: fetchLivenessTestResult,
  uploadVideo: uploadLivenessTestVideo,
};

/**
 * 人脸底照。入场时是最后一步；以后从“我的”进来看状态、换底照、做活体测试。
 * 一个页面路径，按底照的状态显示不同的一屏：未录入、确认照片、审核中、已通过、未通过，另有活体测试。
 */
export default function FaceProfilePage(): JSX.Element {
  useSessionGuard();
  const { state, phase, refreshMe, clear } = useSession();
  const params = useRouter().params;
  const onboarding: boolean =
    params.onboarding === "1" || phase === "face-enrollment-required";
  const { revision, refresh } = usePageRefresh();
  const [data, setData] = useState<MyFace | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [consented, setConsented] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);
  // 正在做哪件事，只用来把按钮上的字换成“…中”。
  const [doing, setDoing] = useState<
    "shoot" | "submit" | "home" | "out" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<boolean>(false);
  const [testing, setTesting] = useState<boolean>(false);
  const [consentOpen, setConsentOpen] = useState<boolean>(false);
  const [testOpen, setTestOpen] = useState<boolean>(params.test === "1");
  const [testDetailsOpen, setTestDetailsOpen] = useState<boolean>(false);
  const confirmedPhoto = useRef<string | null>(null);
  const operationLock = useRef<boolean>(false);
  const [testResult, setTestResult] = useState<FaceLivenessTestResult | null>(
    null,
  );
  const enrollmentSubmitted: boolean =
    data?.profile !== null &&
    data?.profile !== undefined &&
    ["PENDING", "APPROVED"].includes(data.profile.status);
  useEffect(() => {
    let cancelled = false;
    void fetchMyFace().then(
      (result) => {
        if (!cancelled) {
          setData(result);
          setError(null);
        }
      },
      (reason: unknown) => {
        if (!cancelled) setError(errorMessage(reason, "读取人脸档案失败"));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [revision]);
  const choose = async (): Promise<void> => {
    if (busy || operationLock.current) return;
    operationLock.current = true;
    setBusy(true);
    setDoing("shoot");
    setError(null);
    try {
      const path = await chooseFaceEnrollmentPhoto();
      setPhoto(path);
      confirmedPhoto.current = null;
      setSaved(false);
    } catch (reason: unknown) {
      const message =
        reason instanceof Error
          ? reason.message
          : typeof reason === "object" && reason !== null && "errMsg" in reason
            ? String(reason.errMsg)
            : "拍摄未完成，请重试。";
      if (!/cancel/i.test(message)) setError(message);
    } finally {
      operationLock.current = false;
      setBusy(false);
      setDoing(null);
    }
  };
  const submit = async (): Promise<void> => {
    if (
      data === null ||
      photo === null ||
      !consented ||
      busy ||
      operationLock.current
    )
      return;
    operationLock.current = true;
    setBusy(true);
    setDoing("submit");
    setError(null);
    try {
      if (
        (state.me?.roles.highestRoleCode === "WORKER" || onboarding) &&
        replacementNeedsConfirmation(
          data.profile?.status,
          photo,
          confirmedPhoto.current,
        )
      ) {
        const answer = await Taro.showModal({
          title: "重新提交底照",
          content: "重新提交后旧底照失效，新照审核通过后可打卡。",
          confirmText: "重新提交",
          cancelText: "再核对",
        });
        if (!answer.confirm) return;
        confirmedPhoto.current = photo;
      }
      const profile = await enrollMyFace(photo, data.consentVersion);
      setData({ ...data, profile });
      setPhoto(null);
      setConsented(false);
      setSaved(true);
      setTestResult(null);
      await refreshMe();
    } catch (reason: unknown) {
      setError(errorMessage(reason, "提交未完成，请重试。"));
    } finally {
      operationLock.current = false;
      setBusy(false);
      setDoing(null);
    }
  };
  const enterHome = async (): Promise<void> => {
    if (busy || !enrollmentSubmitted) return;
    setBusy(true);
    setDoing("home");
    setError(null);
    try {
      await refreshMe();
      await Taro.reLaunch({ url: "/pages/home/index" });
    } catch (cause: unknown) {
      setError(errorMessage(cause, "读取登记结果失败，请重试。"));
    } finally {
      setBusy(false);
      setDoing(null);
    }
  };
  const signOut = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setDoing("out");
    setError(null);
    try {
      await clear();
      await Taro.reLaunch({ url: "/pages/login/index" });
    } catch (cause: unknown) {
      setError(errorMessage(cause, "退出失败，请重试。"));
    } finally {
      setBusy(false);
      setDoing(null);
    }
  };
  /** 刚拍的这张不要了，回到拍之前的那一屏。 */
  const cancelPhoto = (): void => {
    if (busy) return;
    setPhoto(null);
    confirmedPhoto.current = null;
    // 换底照时，同意是看过新照片之后勾的，不换了就一起撤掉；
    // 第一次录入的同意是拍之前勾的，留着。
    if (data?.profile) setConsented(false);
  };

  const profile = data?.profile ?? null;
  const stage = faceStage(profile?.status);
  const canTest: boolean = data?.mode === "VIDEO_ACTION" && !onboarding;
  const onPhone: boolean = process.env.TARO_ENV === "weapp";
  const testReady: boolean = canTest && onPhone && enrollmentSubmitted;
  const showTest: boolean = data !== null && testOpen && canTest;
  // 从“我的”直接点“活体测试”进来的，按返回就回“我的”；从这一页点进去的，回这一页。
  const openedForTest: boolean = params.test === "1";
  const today = chinaToday();

  const header = showTest ? (
    <PageHeader
      title="活体测试"
      onBack={openedForTest ? undefined : () => setTestOpen(false)}
    />
  ) : data !== null && photo !== null ? (
    <PageHeader title="确认底照" onBack={cancelPhoto} />
  ) : onboarding ? (
    <AppHeader title={enrollmentSubmitted ? "人脸底照" : "入场登记"} />
  ) : (
    <PageHeader title="人脸底照" />
  );
  const steps =
    onboarding && profile === null ? (
      <Steps
        current={ONBOARDING_STEPS.length}
        total={ONBOARDING_STEPS.length}
        label={ONBOARDING_STEPS[ONBOARDING_STEPS.length - 1]}
      />
    ) : null;
  const signOutLink = onboarding ? (
    <Links>
      <Button
        variant="text"
        disabled={busy}
        onClick={() => {
          void signOut();
        }}
      >
        {doing === "out" ? "退出中…" : "退出登录"}
      </Button>
    </Links>
  ) : null;
  const problem = error ? <Notice tone="error">{error}</Notice> : null;
  // 接在每一屏内容后面的：提示、出错原因、入场时的“退出登录”。
  const tail = (
    <>
      {data?.mode === "UNCONFIGURED" ? (
        <Notice>
          {enrollmentSubmitted
            ? "活体服务还没启用。"
            : "活体服务还没启用，可以先交底照。"}
        </Notice>
      ) : null}
      {params.test === "1" && !onboarding && !canTest ? (
        <Notice>视频活体没启用，请联系管理员。</Notice>
      ) : null}
      {problem}
      {signOutLink}
    </>
  );
  const testRow =
    canTest && enrollmentSubmitted ? (
      <Row
        title="活体测试"
        value="不计考勤"
        mute
        chevron
        onClick={() => setTestOpen(true)}
      />
    ) : null;
  const consent = {
    consented,
    consentOpen,
    consentText: data?.consentText ?? "",
    busy,
    onConsent: (): void => setConsented(!consented),
    onConsentText: (): void => setConsentOpen(!consentOpen),
  };
  const shoot = (): void => {
    void choose();
  };
  const home = (): void => {
    void enterHome();
  };

  return (
    <Screen header={header}>
      {testing ? (
        <VideoFaceCapture
          flow={livenessTestFlow}
          referenceDescription="与本人底照比对，不计考勤。"
          onCancel={() => setTesting(false)}
          onResult={(result) => {
            setTestResult(result);
            setTesting(false);
            setTestDetailsOpen(false);
          }}
        />
      ) : null}
      {data === null ? (
        <>
          <StateView
            title={error ? "人脸档案没读到" : "正在读取人脸档案"}
            kind={error ? "error" : "loading"}
            sub={error ?? undefined}
            onRetry={error ? refresh : undefined}
          />
          {signOutLink}
        </>
      ) : showTest ? (
        <TestView
          ready={testReady}
          submitted={enrollmentSubmitted}
          pendingReview={stage === "pending"}
          onPhone={onPhone}
          busy={busy || testing}
          result={testResult}
          detailsOpen={testDetailsOpen}
          onDetails={() => setTestDetailsOpen(!testDetailsOpen)}
          onStart={() => {
            setTestResult(null);
            setTesting(true);
          }}
        >
          {problem}
        </TestView>
      ) : photo !== null ? (
        <PreviewView
          {...consent}
          steps={steps}
          photo={photo}
          replacing={profile !== null}
          submitting={doing === "submit"}
          onSubmit={() => {
            void submit();
          }}
          onRetake={shoot}
        >
          {tail}
        </PreviewView>
      ) : profile === null ? (
        <CaptureView
          {...consent}
          steps={steps}
          shooting={doing === "shoot"}
          onShoot={shoot}
        >
          {tail}
        </CaptureView>
      ) : stage === "pending" ? (
        <PendingView
          submittedAt={faceTime(profile.createdAt, today)}
          justSaved={saved}
          onboarding={onboarding}
          busy={busy}
          entering={doing === "home"}
          testRow={testRow}
          onHome={home}
          onReplace={shoot}
          onRefresh={refresh}
        >
          {tail}
        </PendingView>
      ) : stage === "approved" ? (
        <ApprovedView
          stampDay={stampDay(profile.reviewedAt)}
          submittedAt={faceTime(profile.createdAt, today)}
          reviewedAt={
            profile.reviewedAt ? faceTime(profile.reviewedAt, today) : null
          }
          reason={profile.reviewReason}
          onboarding={onboarding}
          busy={busy}
          entering={doing === "home"}
          testRow={testRow}
          onHome={home}
          onReplace={shoot}
          onRefresh={refresh}
        >
          {tail}
        </ApprovedView>
      ) : (
        <RetakeView
          rejected={stage === "rejected"}
          statusText={faceStatusLabel(profile.status)}
          reason={profile.reviewReason}
          submittedAt={faceTime(profile.createdAt, today)}
          onboarding={onboarding}
          busy={busy}
          shooting={doing === "shoot"}
          onShoot={shoot}
          onRefresh={refresh}
        >
          {tail}
        </RetakeView>
      )}
    </Screen>
  );
}
