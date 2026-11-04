import { Button as NativeButton, Image, Picker, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  Button,
  ListItem,
  Notice,
  PageHeader,
  Screen,
  Section,
  StateView,
  Subtitle,
  AppIcon,
} from "../../components/ui";
import { FlowScreen } from "../../components/worker-flow";
import { useSession } from "../../store/session";
import "./index.scss";
import {
  VideoFaceCapture,
  type VideoFaceFlow,
} from "../../components/video-face-capture";
import { FRONTEND_DEMO } from "../../config/env";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { useSessionGuard } from "../../hooks/use-session-guard";
import {
  chooseAttendancePhoto,
  readAttendanceLocation,
} from "../../services/attendance-device";
import {
  createLivenessTest,
  faceStatusLabel,
  fetchLivenessTestResult,
  fetchMyFace,
  uploadLivenessTestVideo,
  type FaceLivenessTestResult,
  type MyFace,
} from "../../services/face";
import {
  checkAttendanceGeofence,
  type AttendanceLocation,
  type GeofenceCheck,
} from "../../services/geofence";
import { fetchAttendanceToday, fetchMyProjects } from "../../services/me";
import type {
  AttendanceTodayGeofence,
  MyProjectMembership,
} from "../../services/me.types";
import { uploadImage, type UploadResult } from "../../services/uploads";

type LocationResult = GeofenceCheck & {
  readonly position: AttendanceLocation;
  readonly geofence: AttendanceTodayGeofence;
  readonly accuracyPassed: boolean;
};
type Phase = "IDLE" | "LOCATING" | "PHOTO" | "PREPARING" | "VERIFYING";
const errorText = (reason: unknown): string => {
  if (reason instanceof Error) return reason.message;
  if (typeof reason === "object" && reason !== null && "errMsg" in reason)
    return String(reason.errMsg);
  return "测试未完成，请重试。";
};

export default function PunchTest(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  const { revision, refresh } = usePageRefresh();
  const [projects, setProjects] = useState<
    readonly MyProjectMembership[] | null
  >(null);
  const [projectId, setProjectId] = useState<string>("");
  const [face, setFace] = useState<MyFace | null>(null);
  const [location, setLocation] = useState<LocationResult | null>(null);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [upload, setUpload] = useState<UploadResult | null>(null);
  const [faceResult, setFaceResult] = useState<FaceLivenessTestResult | null>(
    null,
  );
  const [finished, setFinished] = useState<boolean>(false);
  const [phase, setPhase] = useState<Phase>("IDLE");
  const [error, setError] = useState<string | null>(null);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState<boolean>(false);
  const lock = useRef<boolean>(false);
  const phoneAvailable = process.env.TARO_ENV === "weapp" && !FRONTEND_DEMO;
  const inside = location?.isInside === true && location.accuracyPassed;
  const faceReady =
    face?.mode === "VIDEO_ACTION" &&
    face.profile !== null &&
    ["PENDING", "APPROVED"].includes(face.profile.status);
  const busy = phase !== "IDLE";

  useEffect(() => {
    let cancelled = false;
    void Promise.all([fetchMyProjects(), fetchMyFace()])
      .then(([rows, info]) => {
        if (cancelled) return;
        setProjects(rows);
        setFace(info);
        setProjectId((current) =>
          rows.some((row) => row.projectId === current)
            ? current
            : (rows[0]?.projectId ?? ""),
        );
        setError(null);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(errorText(reason));
      });
    return () => {
      cancelled = true;
    };
  }, [revision]);

  const confirmLocation = useCallback(async (): Promise<void> => {
    if (!projectId) throw new Error("请先选择本人参与的项目。");
    setLocation(null);
    const today = await fetchAttendanceToday(projectId);
    const position = await readAttendanceLocation();
    const check = checkAttendanceGeofence(today.geofence, position);
    const limit = today.geofence.locationAccuracyLimitM;
    const accuracy =
      position.accuracyM === null ? null : Number(position.accuracyM);
    const accuracyPassed =
      limit === null ||
      (accuracy !== null &&
        Number.isFinite(accuracy) &&
        accuracy >= 0 &&
        accuracy <= limit);
    setLocation({
      ...check,
      position,
      geofence: today.geofence,
      accuracyPassed,
    });
    if (!check.isInside)
      throw new Error(
        `不在项目范围内：距中心 ${Math.round(check.distanceM)} 米，允许 ${today.geofence.radiusM} 米。请到达范围内后继续。`,
      );
    if (!accuracyPassed)
      throw new Error(
        `定位精度不足，项目要求误差不超过 ${limit} 米。请到开阔处重试。`,
      );
  }, [projectId]);

  const locate = async (): Promise<void> => {
    if (lock.current) return;
    lock.current = true;
    setPhase("LOCATING");
    setError(null);
    setFinished(false);
    setPhotoPath(null);
    setUpload(null);
    setFaceResult(null);
    try {
      await confirmLocation();
    } catch (reason: unknown) {
      setError(errorText(reason));
    } finally {
      lock.current = false;
      setPhase("IDLE");
    }
  };
  const takePhoto = async (): Promise<void> => {
    if (lock.current || !inside) return;
    lock.current = true;
    setPhase("PHOTO");
    setError(null);
    setFinished(false);
    setFaceResult(null);
    setPhotoPath(null);
    setUpload(null);
    try {
      await confirmLocation();
      const path = await chooseAttendancePhoto();
      setPhotoPath(path);
      setUpload(await uploadImage(path));
    } catch (reason: unknown) {
      setError(errorText(reason));
    } finally {
      lock.current = false;
      setPhase("IDLE");
    }
  };
  const startFace = async (): Promise<void> => {
    if (lock.current || upload === null || !faceReady) return;
    lock.current = true;
    setPhase("PREPARING");
    setError(null);
    setFinished(false);
    setFaceResult(null);
    try {
      await confirmLocation();
      setPhase("VERIFYING");
    } catch (reason: unknown) {
      setError(errorText(reason));
      lock.current = false;
      setPhase("IDLE");
    }
  };
  const flow = useMemo<VideoFaceFlow<FaceLivenessTestResult>>(
    () => ({
      createSession: async () => {
        await confirmLocation();
        return createLivenessTest();
      },
      fetchResult: fetchLivenessTestResult,
      uploadVideo: uploadLivenessTestVideo,
    }),
    [confirmLocation],
  );
  const finishFace = async (result: FaceLivenessTestResult): Promise<void> => {
    setFaceResult(result);
    setPhase("PREPARING");
    try {
      if (result.status !== "VERIFIED")
        throw new Error("活体或本人比对未通过，请按动作顺序重新测试。");
      await confirmLocation();
      setFinished(true);
    } catch (reason: unknown) {
      setError(errorText(reason));
    } finally {
      lock.current = false;
      setPhase("IDLE");
    }
  };

  if (state.me?.roles.highestRoleCode === "WORKER") {
    const selectedProject = projects?.find((row) => row.projectId === projectId);
    const primaryText = phase === "LOCATING" ? "正在定位…" : phase === "PHOTO" ? "正在拍照上传…" : phase === "PREPARING" ? "正在准备核验…" : phase === "VERIFYING" ? "核验中…" : finished ? "重新测试" : !inside ? location ? "重新定位" : "开始定位" : upload === null ? "拍照并上传" : !faceReady ? "查看人脸档案" : "开始活体核验";
    const runCurrentStep = (): void => {
      if (busy || !phoneAvailable) return;
      if (finished || !inside) void locate();
      else if (upload === null) void takePhoto();
      else if (!faceReady) void Taro.navigateTo({ url: "/pages/face-profile/index" });
      else void startFace();
    };
    return (
      <FlowScreen title="打卡流程测试">
        <View className="worker-punch-test">
          <View className="worker-punch-test__notice">
            <View className="worker-punch-test__notice-title"><AppIcon name="shield" /><View>测试不计考勤</View></View>
            <View className="worker-punch-test__muted">测试定位、拍照及人脸核验。不需排班，不计考勤。</View>
          </View>
          {!phoneAvailable ? <View className="worker-punch-test__environment">{FRONTEND_DEMO ? "当前为模拟演示。真实核验需微信小程序手机预览。" : "请在微信小程序手机预览中测试摄像头与定位。"}</View> : null}
          {error ? <View className="worker-punch-test__error" role="alert">{error}</View> : null}
          {projects === null ? <StateView title={error ? "测试条件读取失败" : "加载中…"} onRetry={error ? refresh : undefined} /> : projects.length === 0 ? <StateView title="尚未加入项目" sub="请管理员将本人加入项目后，再测试范围和打卡设备。" /> : <>
            <Picker mode="selector" disabled={busy} range={projects.map((row) => row.projectName)} value={Math.max(0, projects.findIndex((row) => row.projectId === projectId))} onChange={(event) => {
              if (lock.current) return;
              const selected = projects[Number(event.detail.value)];
              if (!selected) return;
              setProjectId(selected.projectId); setLocation(null); setPhotoPath(null); setUpload(null); setFaceResult(null); setFinished(false); setError(null); setDiagnosticsOpen(false);
            }}>
              <View className="worker-punch-test__project">
                <View className="worker-punch-test__muted">测试项目</View>
                <View className="worker-punch-test__project-row"><View>{selectedProject?.projectName ?? "请选择项目"}</View><View className="worker-punch-test__muted">切换</View></View>
                <View className="worker-punch-test__muted">{selectedProject?.teamName ?? "未分配班组"}</View>
              </View>
            </Picker>
            {finished ? <View className="worker-punch-test__complete"><AppIcon name="check" /><View>流程测试完成</View></View> : null}
            <View className="worker-punch-test__steps">
              <View className="worker-punch-test__step">
                <View className="worker-punch-test__number">{inside ? <AppIcon name="check" /> : "1"}</View>
                <View className="worker-punch-test__step-body">
                  <View className="worker-punch-test__step-title">定位{inside ? "通过" : ""}</View>
                  <View className="worker-punch-test__muted">{phase === "LOCATING" ? "正在获取位置" : location === null ? "待定位" : inside ? `在项目范围内 · 距中心${Math.round(location.distanceM)}米` : "定位未通过，请根据提示重试"}</View>
                  {location ? <View className="worker-punch-test__muted">允许半径：{location.geofence.radiusM}米；{location.accuracyPassed ? "定位精度符合要求" : "定位精度不足"}</View> : null}
                  {location && !finished ? <NativeButton className="worker-punch-test__text-button" disabled={busy || !phoneAvailable} onClick={() => { void locate(); }}>重新定位并开始</NativeButton> : null}
                </View>
              </View>
              <View className="worker-punch-test__step">
                <View className="worker-punch-test__number">{upload ? <AppIcon name="check" /> : "2"}</View>
                <View className="worker-punch-test__step-body">
                  <View className="worker-punch-test__step-title">现场照片{upload ? "已上传" : ""}</View>
                  <View className="worker-punch-test__muted">{phase === "PHOTO" ? "正在拍摄并上传" : upload ? `已上传${Math.round(upload.sizeBytes / 1024)}KB` : "范围内拍照，上传测试服务器。"}</View>
                  {photoPath ? <Image className="worker-punch-test__photo" src={photoPath} mode="aspectFit" /> : null}
                  {photoPath && !finished ? <NativeButton className="worker-punch-test__text-button" disabled={busy || !inside || !phoneAvailable} onClick={() => { void takePhoto(); }}>重新拍照并上传</NativeButton> : null}
                </View>
              </View>
              <View className="worker-punch-test__step">
                <View className="worker-punch-test__number">{faceResult?.status === "VERIFIED" ? <AppIcon name="check" /> : "3"}</View>
                <View className="worker-punch-test__step-body">
                  <View className="worker-punch-test__step-title">活体核验{faceResult ? faceResult.status === "VERIFIED" ? "通过" : "未通过" : ""}</View>
                  <View className="worker-punch-test__muted">按提示录制动作视频，发送云端与本人登记底照比对。</View>
                  {face?.profile?.status === "PENDING" ? <View className="worker-punch-test__muted">待审核底照可测试，正式打卡仍须审核通过。</View> : null}
                  {!faceReady ? <NativeButton className="worker-punch-test__face-link" disabled={busy} onClick={() => { void Taro.navigateTo({ url: "/pages/face-profile/index" }); }}>
                    <View>查看人脸档案</View><View className="worker-punch-test__muted">{face?.profile ? faceStatusLabel(face.profile.status) : "尚未录入底照"}</View>
                  </NativeButton> : null}
                  {face !== null && face.mode !== "VIDEO_ACTION" ? <View className="worker-punch-test__muted">视频活体未启用，请联系管理员。</View> : null}
                </View>
              </View>
            </View>
            {(location !== null || faceResult !== null) ? <View className="worker-punch-test__diagnostics">
              <NativeButton className="worker-punch-test__details-toggle" onClick={() => setDiagnosticsOpen(!diagnosticsOpen)}><View>定位与云端结果详情</View><View className="worker-punch-test__muted">{diagnosticsOpen ? "收起" : "展开"}</View></NativeButton>
              {diagnosticsOpen ? <View className="worker-punch-test__muted">
                {location ? <><View>纬度 {location.position.latitude} · 经度 {location.position.longitude}</View><View>定位精度：{location.position.accuracyM === null ? "未知" : `${location.position.accuracyM}米`}</View></> : null}
                {faceResult?.score !== null && faceResult?.score !== undefined ? <View>人脸相似度：{faceResult.score.toFixed(2)}</View> : null}
                {faceResult?.failureCode ? <View>失败原因：{faceResult.failureCode}</View> : null}
                {faceResult?.requestId ? <View>核验编号：{faceResult.requestId}</View> : null}
              </View> : null}
            </View> : null}
            <View className="worker-punch-test__primary"><Button appearance="worker" disabled={busy || !phoneAvailable} loading={busy} onClick={runCurrentStep}>{primaryText}</Button></View>
            {finished ? <><View className="worker-punch-test__muted">定位、拍照及核验通过，不计考勤。</View><NativeButton className="worker-punch-test__text-button worker-punch-test__back" onClick={() => { void Taro.reLaunch({ url: "/pages/profile/index" }); }}>返回我的</NativeButton></> : null}
          </>}
          {phase === "VERIFYING" ? <VideoFaceCapture flow={flow} referenceDescription="仅测试，不计考勤。请保持在项目范围内。" onCancel={() => { lock.current = false; setPhase("IDLE"); }} onResult={(result) => { void finishFace(result); }} /> : null}
        </View>
      </FlowScreen>
    );
  }

  return (
    <Screen>
      <PageHeader title="打卡流程测试" />
      <Notice>
        测试定位、拍照及腾讯云人脸核验，不计考勤。
      </Notice>
      {!phoneAvailable ? (
        <Notice>
          真实核验仅支持微信小程序手机预览。
        </Notice>
      ) : null}
      {error ? <Notice>{error}</Notice> : null}
      {projects === null ? (
        <StateView title="读取测试条件" onRetry={refresh} />
      ) : projects.length === 0 ? (
        <StateView
          title="尚未加入项目"
          sub="请管理员将本人加入项目后，测试项目范围和打卡设备。"
        />
      ) : (
        <>
          <Picker
            mode="selector"
            disabled={busy}
            range={projects.map((row) => row.projectName)}
            value={projects.findIndex((row) => row.projectId === projectId)}
            onChange={(event) => {
              if (lock.current) return;
              setProjectId(projects[Number(event.detail.value)]!.projectId);
              setLocation(null);
              setPhotoPath(null);
              setUpload(null);
              setFaceResult(null);
              setFinished(false);
              setError(null);
            }}
          >
            <ListItem
              primary="测试项目"
              secondary={
                projects.find((row) => row.projectId === projectId)?.projectName
              }
              chip="切换"
            />
          </Picker>
          <Section
            title="1 · GPS 定位"
            sub={
              location === null
                ? "等待定位"
                : inside
                  ? "定位通过 · 在范围内"
                  : "定位未通过"
            }
          >
            {location ? (
              <>
                <Subtitle>
                  距中心 {Math.round(location.distanceM)} 米 · 允许{" "}
                  {location.geofence.radiusM} 米
                </Subtitle>
                <Subtitle>
                  纬度 {location.position.latitude} · 经度{" "}
                  {location.position.longitude}
                </Subtitle>
                <Subtitle>
                  定位精度{" "}
                  {location.position.accuracyM === null
                    ? "未知"
                    : `${location.position.accuracyM} 米`}
                </Subtitle>
              </>
            ) : (
              <Subtitle>按所选项目范围核验定位。</Subtitle>
            )}
            <Button
              disabled={busy || !phoneAvailable}
              loading={phase === "LOCATING"}
              onClick={() => {
                void locate();
              }}
            >
              {location === null ? "开始定位测试" : "重新定位并开始"}
            </Button>
          </Section>
          <Section
            title="2 · 现场拍照"
            sub={upload ? "拍摄及上传通过" : "等待拍照上传"}
          >
            {photoPath ? (
              <Image
                src={photoPath}
                mode="aspectFit"
                style={{ width: "100%", height: "180px", borderRadius: "12px" }}
              />
            ) : null}
            <Subtitle>
              {upload
                ? `已上传 ${Math.round(upload.sizeBytes / 1024)} KB`
                : "范围内拍照，上传测试服务器。"}
            </Subtitle>
            <Button
              variant="outline"
              disabled={busy || !inside || !phoneAvailable}
              loading={phase === "PHOTO"}
              onClick={() => {
                void takePhoto();
              }}
            >
              {photoPath ? "重新拍照并上传" : "拍照并上传"}
            </Button>
          </Section>
          <Section
            title="3 · 活体人脸识别"
            sub={
              faceResult
                ? faceResult.status === "VERIFIED"
                  ? "活体与本人比对通过"
                  : "核验未通过"
                : "等待人脸核验"
            }
          >
            <Subtitle>
              录像提交腾讯云，与本人底照比对。
            </Subtitle>
            {!faceReady ? (
              <ListItem
                primary="先准备本人底照"
                secondary={
                  face?.profile
                    ? faceStatusLabel(face.profile.status)
                    : "尚未录入底照"
                }
                chip="人脸档案"
                onClick={() => {
                  void Taro.navigateTo({ url: "/pages/face-profile/index" });
                }}
              />
            ) : null}
            {face?.mode !== "VIDEO_ACTION" && face !== null ? (
              <Notice>视频活体未启用，请联系管理员。</Notice>
            ) : null}
            {face?.profile?.status === "PENDING" ? (
              <Subtitle>
                待审核底照仅限测试，正式打卡须审核通过。
              </Subtitle>
            ) : null}
            {faceResult?.score !== null && faceResult?.score !== undefined ? (
              <Subtitle>人脸相似度：{faceResult.score.toFixed(2)}</Subtitle>
            ) : null}
            {faceResult?.failureCode ? (
              <Subtitle>失败原因：{faceResult.failureCode}</Subtitle>
            ) : null}
            {faceResult?.requestId ? (
              <Subtitle>核验编号：{faceResult.requestId}</Subtitle>
            ) : null}
            <Button
              disabled={
                busy ||
                !inside ||
                upload === null ||
                !faceReady ||
                !phoneAvailable
              }
              loading={phase === "PREPARING"}
              onClick={() => {
                void startFace();
              }}
            >
              开始活体人脸测试
            </Button>
          </Section>
          {finished ? (
            <Notice>
              定位、照片上传及人脸核验通过，未生成考勤记录。
            </Notice>
          ) : null}
        </>
      )}
      {phase === "VERIFYING" ? (
        <VideoFaceCapture
          flow={flow}
          referenceDescription="仅测试，不计考勤。请保持在项目范围内。"
          onCancel={() => {
            lock.current = false;
            setPhase("IDLE");
          }}
          onResult={(result) => {
            void finishFace(result);
          }}
        />
      ) : null}
    </Screen>
  );
}
