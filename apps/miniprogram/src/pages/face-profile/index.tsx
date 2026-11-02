import {
  Button as NativeButton,
  Checkbox,
  CheckboxGroup,
  Image,
  Label,
  View,
} from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useEffect, useRef, useState } from "react";

import {
  Button,
  AppHeader,
  Notice,
  PageHeader,
  Screen,
  Section,
  StateView,
  Subtitle,
  Title,
  AppIcon,
} from "../../components/ui/index";
import { FlowScreen } from "../../components/worker-flow";
import { chooseFaceEnrollmentPhoto, replacementNeedsConfirmation } from "./face-profile-input";
import { formatChinaDate, formatChinaHm } from "../../services/time";
import "./index.scss";
import { useSession } from "../../store/session";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { useSessionGuard } from "../../hooks/use-session-guard";
import {
  VideoFaceCapture,
  type VideoFaceFlow,
} from "../../components/video-face-capture/index";
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

const livenessTestFlow: VideoFaceFlow<FaceLivenessTestResult> = {
  createSession: createLivenessTest,
  fetchResult: fetchLivenessTestResult,
  uploadVideo: uploadLivenessTestVideo,
};

export default function FaceProfilePage(): JSX.Element {
  useSessionGuard();
  const { state, phase, refreshMe, clear } = useSession();
  const params = useRouter().params;
  const onboarding: boolean =
    params.onboarding === "1" ||
    phase === "face-enrollment-required";
  const { revision, refresh } = usePageRefresh();
  const [data, setData] = useState<MyFace | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [consented, setConsented] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);
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
        if (!cancelled)
          setError(
            reason instanceof Error ? reason.message : "读取人脸档案失败",
          );
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
    setError(null);
    try {
      const path = await chooseFaceEnrollmentPhoto();
      setPhoto(path);
      confirmedPhoto.current = null;
      setSaved(false);
    } catch (reason: unknown) {
      const message = reason instanceof Error ? reason.message : typeof reason === "object" && reason !== null && "errMsg" in reason ? String(reason.errMsg) : "拍摄未完成，请重试。";
      if (!/cancel/i.test(message)) setError(message);
    } finally {
      operationLock.current = false;
      setBusy(false);
    }
  };
  const submit = async (): Promise<void> => {
    if (data === null || photo === null || !consented || busy || operationLock.current) return;
    operationLock.current = true;
    setBusy(true);
    setError(null);
    try {
      if ((state.me?.roles.highestRoleCode === "WORKER" || onboarding) && replacementNeedsConfirmation(data.profile?.status, photo, confirmedPhoto.current)) {
        const answer = await Taro.showModal({
          title: "重新提交底照",
          content: "重新提交成功后，旧底照将停止使用。新底照需要管理员重新审核，通过后才能正式刷脸打卡。",
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
      setError(
        reason instanceof Error ? reason.message : "提交未完成，请重试。",
      );
    } finally {
      operationLock.current = false;
      setBusy(false);
    }
  };
  const enterHome = async (): Promise<void> => {
    if (busy || !enrollmentSubmitted) return;
    setBusy(true);
    setError(null);
    try {
      await refreshMe();
      await Taro.reLaunch({ url: "/pages/home/index" });
    } catch (cause: unknown) {
      setError(
        cause instanceof Error ? cause.message : "读取登记结果失败，请重试。",
      );
    } finally {
      setBusy(false);
    }
  };
  const signOut = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await clear();
      await Taro.reLaunch({ url: "/pages/login/index" });
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "退出失败，请重试。");
    } finally {
      setBusy(false);
    }
  };
  const workerAppearance = state.me?.roles.highestRoleCode === "WORKER" || onboarding;
  if (workerAppearance) {
    const status = data?.profile?.status;
    const canTest = data?.mode === "VIDEO_ACTION" && !onboarding;
    const testReady = canTest && process.env.TARO_ENV === "weapp" && enrollmentSubmitted;
    const statusTitle = photo !== null ? "照片预览" : status === "PENDING" ? "底照审核中" : status === "APPROVED" ? "底照已审核" : status === "REJECTED" ? "底照未通过审核" : data?.profile ? faceStatusLabel(status ?? "") : "录入本人正脸";
    return (
      <FlowScreen title="人脸档案" enabled root={onboarding}>
        <View className="worker-face-profile">
          {testing ? <VideoFaceCapture flow={livenessTestFlow} referenceDescription="与当前登记底照比对。本次仅测试，不生成考勤记录。" onCancel={() => setTesting(false)} onResult={(result) => { setTestResult(result); setTesting(false); setTestDetailsOpen(false); }} /> : null}
          {error ? <View className="worker-face-profile__error" role="alert">{error}</View> : null}
          {data === null ? <StateView title={error ? "人脸档案读取失败" : "加载中…"} onRetry={error ? refresh : undefined} /> : <>
            <View className="worker-face-profile__heading">{statusTitle}</View>
            <View className="worker-face-profile__muted">
              {photo !== null ? "请确认照片清晰、真实、完整。" : status === "PENDING" ? "已提交，审核通过后才能正式打卡。" : status === "APPROVED" ? "底照已审核，用于本人的考勤身份核验。" : status === "REJECTED" ? "请查看原因，重新拍摄清晰正脸。" : "用于考勤身份核验，微信头像不会作为底照。"}
            </View>
            <View className="worker-face-profile__focus">
              {photo !== null ? <>
                <Image className="worker-face-profile__photo" src={photo} mode="aspectFit" />
                <NativeButton className="worker-face-profile__text-button worker-face-profile__retake" disabled={busy} onClick={() => { void choose(); }}>重新拍摄</NativeButton>
              </> : data.profile === null ? <View className="worker-face-profile__capture">
                <AppIcon name="user" />
                <View>拍摄清晰正脸，最大2MB</View>
                <View className="worker-face-profile__muted">请在光线充足的环境下拍摄，确保面部完整、清晰可见。</View>
              </View> : <>
                <View className="worker-face-profile__status"><AppIcon name={status === "APPROVED" ? "shield" : status === "REJECTED" ? "user" : "clock"} /><View>{faceStatusLabel(status ?? "")}</View></View>
                <View className="worker-face-profile__meta"><View>提交时间</View><View>{formatChinaDate(data.profile.createdAt)} {formatChinaHm(data.profile.createdAt)}</View></View>
                {data.profile.reviewedAt ? <View className="worker-face-profile__meta"><View>审核时间</View><View>{formatChinaDate(data.profile.reviewedAt)} {formatChinaHm(data.profile.reviewedAt)}</View></View> : null}
                {data.profile.reviewReason ? <View className="worker-face-profile__error">审核意见：{data.profile.reviewReason}</View> : null}
                <View className="worker-face-profile__muted">{status === "PENDING" ? "审核时间以管理员处理为准，可在此查看状态。" : "登记底照由管理员核对，用于与打卡时采集的人脸比对。"}</View>
              </>}
            </View>
            {data.mode === "UNCONFIGURED" ? <Notice>活体核验暂未启用。可以先提交底照审核，服务开通后再刷脸打卡。</Notice> : null}
            {saved && status !== "APPROVED" ? <View className="worker-face-profile__muted">底照已提交，请等待管理员审核。</View> : null}
            <View className="worker-face-profile__consent">
              {photo !== null || data.profile === null ? <CheckboxGroup onChange={(event) => setConsented(event.detail.value.includes("agree"))}>
                <Label className="worker-face-profile__consent-label"><Checkbox value="agree" checked={consented} disabled={busy} />我已阅读并同意采集与使用说明</Label>
              </CheckboxGroup> : null}
              <NativeButton className="worker-face-profile__text-button" onClick={() => setConsentOpen(!consentOpen)}>{consentOpen ? "收起采集说明" : "查看采集说明"}</NativeButton>
              {consentOpen ? <View className="worker-face-profile__muted">{data.consentText}</View> : null}
              {photo !== null && data.profile !== null ? <View className="worker-face-profile__muted">新照片尚未提交。重新提交成功后，旧底照停止使用，需要重新审核。</View> : null}
            </View>
            <View className="worker-face-profile__primary">
              {photo !== null ? <Button appearance="worker" loading={busy} disabled={!consented || busy} onClick={() => { void submit(); }}>{data.profile ? "重新提交审核" : "提交审核"}</Button>
                : enrollmentSubmitted ? <Button appearance="worker" loading={busy} onClick={() => { void enterHome(); }}>{onboarding ? "完成，进入首页" : "返回首页"}</Button>
                : <Button appearance="worker" loading={busy} onClick={() => { void choose(); }}>{data.profile ? "重新拍摄底照" : "拍摄底照"}</Button>}
            </View>
            {data.profile && photo === null && !onboarding ? <View className="worker-face-profile__secondary-actions">
              <NativeButton className="worker-face-profile__text-button" disabled={busy} onClick={refresh}>刷新审核状态</NativeButton>
              <NativeButton className="worker-face-profile__text-button" disabled={busy} onClick={() => { void choose(); }}>更换底照</NativeButton>
            </View> : null}
            {photo !== null && data.profile !== null ? <NativeButton className="worker-face-profile__text-button" disabled={busy} onClick={() => { setPhoto(null); setConsented(false); confirmedPhoto.current = null; }}>取消本次更换</NativeButton> : null}
            {canTest ? <View className="worker-face-profile__test">
              <NativeButton className="worker-face-profile__test-toggle" disabled={busy || testing} onClick={() => setTestOpen(!testOpen)}><View>活体测试（不计考勤）</View><View className="worker-face-profile__muted">{testOpen ? "收起" : "展开"}</View></NativeButton>
              {testOpen ? <>
                <View className="worker-face-profile__muted">无需排班或定位。使用已上传的本人底照，按提示录制约8秒视频进行活体与本人比对，不生成考勤记录。</View>
                {status === "PENDING" ? <View className="worker-face-profile__muted">待审核底照可测试，不代表可以正式打卡。</View> : null}
                {!enrollmentSubmitted ? <View className="worker-face-profile__muted">请先提交本人底照；仅待审核或已通过底照可测试。</View> : null}
                {process.env.TARO_ENV !== "weapp" ? <Notice>请用微信小程序手机预览测试摄像头录像。</Notice> : null}
                <Button appearance="worker" variant="outline" disabled={busy || !testReady} onClick={() => { setTestResult(null); setTesting(true); }}>开始活体人脸测试</Button>
                {testResult ? <>
                  <View className="worker-face-profile__test-result">{testResult.status === "VERIFIED" ? "测试通过，未生成考勤记录" : "测试未通过，请按动作顺序重新测试"}</View>
                  <NativeButton className="worker-face-profile__text-button" onClick={() => setTestDetailsOpen(!testDetailsOpen)}>{testDetailsOpen ? "收起结果详情" : "查看结果详情"}</NativeButton>
                  {testDetailsOpen ? <View className="worker-face-profile__muted">
                    {testResult.score !== null ? <View>人脸相似度：{testResult.score.toFixed(2)}</View> : null}
                    {testResult.failureCode !== null ? <View>云端结果：{testResult.failureCode}</View> : null}
                    {testResult.requestId !== null ? <View>云端请求编号：{testResult.requestId}</View> : null}
                  </View> : null}
                </> : null}
              </> : null}
            </View> : params.test === "1" && !onboarding ? <Notice>当前未启用视频动作活体测试，测试条件不满足。请联系管理员确认服务配置。</Notice> : null}
          </>}
          {onboarding ? <NativeButton className="worker-face-profile__text-button worker-face-profile__sign-out" disabled={busy} onClick={() => { void signOut(); }}>退出登录</NativeButton> : null}
        </View>
      </FlowScreen>
    );
  }
  return (
    <Screen>
      {testing ? (
        <VideoFaceCapture
          flow={livenessTestFlow}
          referenceDescription="与当前登记底照比对，无需身份证照片。本次仅测试，不生成考勤记录。"
          onCancel={() => setTesting(false)}
          onResult={(result) => {
            setTestResult(result);
            setTesting(false);
          }}
        />
      ) : null}
      {onboarding ? (
        <AppHeader title="录入本人正脸" />
      ) : (
        <PageHeader title="人脸档案" />
      )}
      {onboarding ? (
        <>
          <Title>
            {enrollmentSubmitted ? "底照已录入" : "最后一步，录入本人正脸"}
          </Title>
          <Subtitle>
            {enrollmentSubmitted
              ? "资料和底照均已提交，可以进入首页查看项目。审核通过后才能刷脸打卡。"
              : "用工资料已保存。请拍摄本人清晰正脸，作为以后打卡的人脸比对底照；微信头像不会用作底照。"}
          </Subtitle>
        </>
      ) : null}
      {error !== null ? <Notice>{error}</Notice> : null}
      {data === null ? (
        <StateView title="读取人脸档案" onRetry={refresh} />
      ) : (
        <>
          {data.mode === "UNCONFIGURED" ? (
            <Notice>
              活体核验暂未启用。你可以先提交底照审核，服务开通后再进行刷脸打卡。
            </Notice>
          ) : null}
          <Section
            title="我的核验底照"
            sub={
              data.profile === null
                ? "尚未录入"
                : faceStatusLabel(data.profile.status)
            }
          >
            <Subtitle>
              底照由管理员核对后生效，用于与每次打卡时采集的人脸进行比对。
            </Subtitle>
            {data.profile?.reviewReason ? (
              <Notice>{data.profile.reviewReason}</Notice>
            ) : null}
            {saved ? <Notice>底照已提交，请等待管理员审核。</Notice> : null}
          </Section>
          {data.mode === "VIDEO_ACTION" && !onboarding ? (
            <Section
              title="活体与本人比对测试"
              sub="无需排班或定位，可直接验证云端功能"
            >
              <Subtitle>
                使用已上传的本人底照，按提示录制约 8
                秒动作视频，发送至腾讯云完成活体检测及人脸比对。本次测试不计入考勤。
              </Subtitle>
              {testResult !== null ? (
                <View>
                  <Notice>
                    {testResult.status === "VERIFIED"
                      ? "核验通过：活体检测和本人比对均通过。"
                      : "核验未通过，请按动作顺序重新测试。"}
                  </Notice>
                  {testResult.score !== null ? (
                    <Subtitle>
                      人脸相似度：{testResult.score.toFixed(2)}
                    </Subtitle>
                  ) : null}
                  {testResult.failureCode !== null ? (
                    <Subtitle>云端结果：{testResult.failureCode}</Subtitle>
                  ) : null}
                  {testResult.requestId !== null ? (
                    <Subtitle>云端请求编号：{testResult.requestId}</Subtitle>
                  ) : null}
                </View>
              ) : null}
              {process.env.TARO_ENV !== "weapp" ? (
                <Notice>请用微信小程序手机预览测试摄像头录像。</Notice>
              ) : null}
              <Button
                disabled={
                  busy ||
                  data.profile === null ||
                  !["PENDING", "APPROVED"].includes(data.profile.status) ||
                  process.env.TARO_ENV !== "weapp"
                }
                onClick={() => {
                  setTestResult(null);
                  setTesting(true);
                }}
              >
                开始活体人脸测试
              </Button>
              {data.profile === null ? (
                <Subtitle>请先拍摄并提交下方的本人底照。</Subtitle>
              ) : null}
            </Section>
          ) : null}
          {!onboarding || !enrollmentSubmitted ? (
            <>
              <Section
                title="录入本人正脸"
                sub="正对镜头、光线均匀，保证只有本人一张脸"
              >
                {photo !== null ? (
                  <Image
                    src={photo}
                    mode="aspectFit"
                    style={{
                      width: "100%",
                      height: "240px",
                      borderRadius: "16px",
                    }}
                  />
                ) : (
                  <View className="face-capture-placeholder">
                    请拍摄清晰的本人照片
                  </View>
                )}
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    void choose();
                  }}
                >
                  {photo === null ? "拍摄底照" : "重新拍摄"}
                </Button>
                {data.profile !== null ? (
                  <Notice>
                    重新提交后，旧底照停止使用，需要管理员重新审核后才能刷脸打卡。
                  </Notice>
                ) : null}
              </Section>
              <Section title="采集与使用说明">
                <Subtitle>{data.consentText}</Subtitle>
                <CheckboxGroup
                  onChange={(event) =>
                    setConsented(event.detail.value.includes("agree"))
                  }
                >
                  <Label className="face-consent">
                    <Checkbox
                      value="agree"
                      checked={consented}
                      disabled={busy}
                    />
                    我已阅读并同意上述说明
                  </Label>
                </CheckboxGroup>
              </Section>
              <Button
                loading={busy}
                disabled={photo === null || !consented || busy}
                onClick={() => {
                  void submit();
                }}
              >
                提交管理员审核
              </Button>
            </>
          ) : null}
          {onboarding && enrollmentSubmitted ? (
            <Button
              loading={busy}
              onClick={() => {
                void enterHome();
              }}
            >
              完成，进入首页
            </Button>
          ) : null}
        </>
      )}
      {onboarding ? (
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
