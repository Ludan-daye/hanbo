import {
  Checkbox,
  CheckboxGroup,
  Image,
  Label,
  View,
} from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useEffect, useState } from "react";

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
} from "../../components/ui/index";
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
  const { phase, refreshMe, clear } = useSession();
  const onboarding: boolean =
    useRouter().params.onboarding === "1" ||
    phase === "face-enrollment-required";
  const { revision, refresh } = usePageRefresh();
  const [data, setData] = useState<MyFace | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [consented, setConsented] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<boolean>(false);
  const [testing, setTesting] = useState<boolean>(false);
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
    setError(null);
    try {
      const result = await Taro.chooseImage({
        count: 1,
        sizeType: ["compressed"],
        sourceType:
          process.env.TARO_ENV === "h5" ? ["album", "camera"] : ["camera"],
      });
      const file = result.tempFiles[0];
      const path = result.tempFilePaths[0];
      if (file === undefined || path === undefined)
        throw new Error("未读取到照片，请重新拍摄。");
      if (file.size > 2 * 1024 * 1024)
        throw new Error("底照不能超过 2MB，请压缩后重试。");
      setPhoto(path);
      setSaved(false);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : "拍摄未完成，请重试。",
      );
    }
  };
  const submit = async (): Promise<void> => {
    if (data === null || photo === null || !consented || busy) return;
    setBusy(true);
    setError(null);
    try {
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
