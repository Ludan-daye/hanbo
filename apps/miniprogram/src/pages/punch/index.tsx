import { Button as NativeButton, Image, View } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  AppIcon,
  Button,
  Notice,
  PageHeader,
  Screen,
  Segmented,
  StateView,
  Subtitle,
} from "../../components/ui/index";
import {
  VideoFaceCapture,
  type VideoFaceFlow,
} from "../../components/video-face-capture/index";
import {
  chooseAttendancePhoto,
  readAttendanceLocation,
} from "../../services/attendance-device";
import { FRONTEND_DEMO } from "../../config/env";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { useSessionGuard } from "../../hooks/use-session-guard";
import { displayProjectRole } from "../../routing/features";
import {
  completeFaceSession,
  createFaceSession,
  createVideoFaceSession,
  fetchMyFace,
  fetchVideoFaceResult,
  uploadFaceVideo,
  type CompletedFaceSession,
  type MyFace,
} from "../../services/face";
import {
  nativeFaceSdkAvailable,
  verifyWithNativeFaceSdk,
} from "../../services/face-sdk";
import {
  checkAttendanceGeofence,
  type AttendanceLocation,
  type GeofenceCheck,
} from "../../services/geofence";
import {
  fetchAttendanceToday,
  fetchMyProjects,
  submitAttendanceRecord,
} from "../../services/me";
import type {
  AttendancePointCode,
  AttendanceToday,
  MyProjectMembership,
  SubmitAttendanceRecordBody,
} from "../../services/me.types";
import { formatChinaHm } from "../../services/time";
import { useSession } from "../../store/session";
import { uploadImage } from "../../services/uploads";

import "./index.scss";

type Phase =
  | "IDLE"
  | "LOCATING"
  | "PHOTO"
  | "PREPARING"
  | "VERIFYING"
  | "SUBMITTING";
type DemoPosition = "INSIDE" | "OUTSIDE" | "DENIED";
type LocationCheck = GeofenceCheck & {
  readonly context: string;
  readonly checkedAt: number;
  readonly position: AttendanceLocation;
};
type PunchAttempt = {
  readonly projectId: string;
  readonly pointCode: AttendancePointCode;
  readonly attendanceDate: string;
  readonly sitePhoto: Awaited<ReturnType<typeof uploadImage>>;
};
type FaceProof = PunchAttempt & {
  readonly id: string;
  readonly expiresAt: string;
};
type PunchSuccess = {
  readonly label: string;
  readonly time: string;
  readonly abnormal: boolean;
  readonly alreadyRecorded: boolean;
};
type FaceEvidence = Pick<
  SubmitAttendanceRecordBody,
  "faceVerificationSessionId" | "selfieHash" | "selfieObjectKey"
>;
const locationLifetimeMs = 60_000;
const contextKey = (
  projectId: string | null,
  point: string | null,
  date: string | undefined,
): string => `${projectId}/${point}/${date}`;
const errorText = (reason: unknown): string => {
  if (reason instanceof Error) return reason.message;
  if (typeof reason === "object" && reason !== null && "errMsg" in reason)
    return String(reason.errMsg);
  return "操作未完成，请重试。";
};
const nextOpenPoint = (today: AttendanceToday): AttendancePointCode | null => {
  const points = today.points.filter((point) => point.record === null);
  const now = formatChinaHm(new Date().toISOString());
  const due = points.filter((point) => point.scheduledTime <= now);
  return (due[due.length - 1] ?? points[0])?.pointCode ?? null;
};
const requireOpenPoint = (
  today: AttendanceToday,
  point: AttendancePointCode,
): void => {
  if (!today.configured || !today.isWorkday)
    throw new Error("当前没有可打卡的安排，请联系管理员。");
  if (
    !today.points.some(
      (item) => item.pointCode === point && item.record === null,
    )
  )
    throw new Error("该时段已完成或不可打卡，请刷新今日安排。");
};

export default function Punch(): JSX.Element {
  useSessionGuard();
  const { phase: sessionPhase } = useSession();
  const requestedProjectId = useRouter().params.projectId ?? null;
  const { revision, refresh } = usePageRefresh();
  const [projects, setProjects] = useState<
    readonly MyProjectMembership[] | null
  >(null);
  const projectId = projects?.some(
    (project) => project.projectId === requestedProjectId,
  )
    ? requestedProjectId
    : null;
  const [today, setToday] = useState<AttendanceToday | null>(null);
  const [pointCode, setPointCode] = useState<AttendancePointCode | null>(null);
  const [faceInfo, setFaceInfo] = useState<MyFace | null>(null);
  const [location, setLocation] = useState<LocationCheck | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [sitePhoto, setSitePhoto] = useState<{
    readonly path: string;
    readonly context: string;
  } | null>(null);
  const [phase, setPhase] = useState<Phase>("IDLE");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<PunchSuccess | null>(null);
  const [attempt, setAttempt] = useState<PunchAttempt | null>(null);
  const [proof, setProof] = useState<FaceProof | null>(null);
  const [pendingNative, setPendingNative] = useState<FaceProof | null>(null);
  const [demoPosition, setDemoPosition] = useState<DemoPosition>("INSIDE");
  const busy = useRef<boolean>(false);
  const loadSeq = useRef<number>(0);
  const context = useRef<string>("");
  context.current = contextKey(projectId, pointCode, today?.attendanceDate);
  const sitePhotoPath =
    sitePhoto?.context === context.current ? sitePhoto.path : null;
  const isBusy = phase !== "IDLE";
  const inside =
    location?.context === context.current &&
    location.isInside &&
    Date.now() - location.checkedAt < locationLifetimeMs;
  const isDemoFace = FRONTEND_DEMO && faceInfo?.mode === "DEVELOPMENT";
  const faceReady =
    isDemoFace ||
    (faceInfo?.profile?.status === "APPROVED" &&
      (faceInfo.mode === "VIDEO_ACTION" || faceInfo.mode === "WECHAT_NATIVE"));
  const validProof =
    proof !== null &&
    contextKey(proof.projectId, proof.pointCode, proof.attendanceDate) ===
      context.current &&
    new Date(proof.expiresAt).getTime() > Date.now();

  const resetEvidence = (): void => {
    setLocation(null);
    setLocationError(null);
    setSitePhoto(null);
    setProof(null);
    setPendingNative(null);
    setAttempt(null);
    setError(null);
  };
  useEffect(() => {
    if (location === null) return;
    const timer = setTimeout(
      () => setLocation(null),
      Math.max(0, location.checkedAt + locationLifetimeMs - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [location]);
  useEffect(() => {
    if (proof === null) return;
    const timer = setTimeout(
      () => setProof(null),
      Math.max(0, new Date(proof.expiresAt).getTime() - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [proof]);
  const loadToday = useCallback(async (pid: string): Promise<void> => {
    const sequence = ++loadSeq.current;
    try {
      const data = await fetchAttendanceToday(pid);
      if (sequence !== loadSeq.current) return;
      setToday(data);
      setPointCode((current) =>
        data.points.some(
          (point) => point.pointCode === current && point.record === null,
        )
          ? current
          : nextOpenPoint(data),
      );
    } catch (reason: unknown) {
      if (sequence === loadSeq.current) setError(errorText(reason));
    }
  }, []);
  useEffect(() => {
    if (sessionPhase !== "ready") return;
    if (requestedProjectId === null) {
      void Taro.redirectTo({ url: "/pages/my-projects/index" });
      return;
    }
    let cancelled = false;
    loadSeq.current += 1;
    if (projectId !== requestedProjectId) {
      setProjects(null);
      setToday(null);
      setPointCode(null);
      resetEvidence();
    }
    setError(null);
    void Promise.all([fetchMyProjects(), fetchMyFace()]).then(
      async ([rows, face]): Promise<void> => {
        if (cancelled) return;
        setProjects(rows);
        setFaceInfo(face);
        if (!rows.some((project) => project.projectId === requestedProjectId)) {
          setToday(null);
          setPointCode(null);
          resetEvidence();
          setError("你尚未加入该项目或已退出，请从“我的项目”选择工地。");
          return;
        }
        await loadToday(requestedProjectId);
      },
      (reason: unknown): void => {
        if (cancelled) return;
        setProjects(null);
        setToday(null);
        setPointCode(null);
        resetEvidence();
        setError(errorText(reason));
      },
    );
    return () => {
      cancelled = true;
      loadSeq.current += 1;
    };
  }, [requestedProjectId, revision, sessionPhase, loadToday]);

  const confirmLocation = useCallback(
    async (
      pid: string,
      point: AttendancePointCode,
      data: AttendanceToday,
    ): Promise<AttendanceLocation> => {
      const expected = contextKey(pid, point, data.attendanceDate);
      setLocation(null);
      setLocationError(null);
      try {
        let position: AttendanceLocation;
        if (FRONTEND_DEMO) {
          if (demoPosition === "DENIED")
            throw new Error("演示：定位未授权，请允许定位后重试。");
          position = {
            latitude:
              demoPosition === "OUTSIDE"
                ? String(Number(data.geofence.centerLatitude) + 1)
                : data.geofence.centerLatitude,
            longitude: data.geofence.centerLongitude,
            accuracyM: "10",
          };
        } else {
          position = await readAttendanceLocation();
        }
        if (context.current !== expected)
          throw new Error("项目或打卡时段已变化，请重新开始。");
        const check = checkAttendanceGeofence(data.geofence, position);
        if (!check.isInside) {
          setLocation({
            ...check,
            context: expected,
            checkedAt: Date.now(),
            position,
          });
          throw new Error("当前位置不在工地范围内，请到达现场后重试。");
        }
        const limit = data.geofence.locationAccuracyLimitM;
        if (
          limit !== null &&
          (position.accuracyM === null ||
            !Number.isFinite(Number(position.accuracyM)) ||
            Number(position.accuracyM) < 0 ||
            Number(position.accuracyM) > limit)
        )
          throw new Error(
            `定位精度不足，请到开阔位置重试。项目要求误差不超过 ${limit} 米。`,
          );
        setLocation({
          ...check,
          context: expected,
          checkedAt: Date.now(),
          position,
        });
        return position;
      } catch (reason: unknown) {
        const message = errorText(reason);
        if (context.current === expected)
          setLocationError(
            message.includes("auth") || message.includes("deny")
              ? "未获得定位权限，请在微信设置中允许使用位置后重试。"
              : message,
          );
        throw reason;
      }
    },
    [demoPosition],
  );
  const locate = useCallback(
    async (
      pid: string,
      point: AttendancePointCode,
      data: AttendanceToday,
    ): Promise<void> => {
      if (busy.current) return;
      busy.current = true;
      setPhase("LOCATING");
      setError(null);
      try {
        await confirmLocation(pid, point, data);
      } catch (reason: unknown) {
        setError(errorText(reason));
      } finally {
        busy.current = false;
        setPhase("IDLE");
      }
    },
    [confirmLocation],
  );
  useEffect(() => {
    if (
      projectId !== null &&
      pointCode !== null &&
      today?.configured &&
      today.isWorkday
    )
      void locate(projectId, pointCode, today);
  }, [projectId, pointCode, today?.attendanceDate, revision, locate]);

  const pickSitePhoto = async (): Promise<void> => {
    if (
      busy.current ||
      projectId === null ||
      pointCode === null ||
      today === null
    )
      return;
    const expectedContext = context.current;
    busy.current = true;
    setPhase("PHOTO");
    setError(null);
    try {
      await confirmLocation(projectId, pointCode, today);
      const photo = await chooseAttendancePhoto();
      if (context.current !== expectedContext)
        throw new Error("项目或时段已变化，请重新拍摄现场照片。");
      setSitePhoto({ path: photo, context: expectedContext });
      setProof(null);
      setPendingNative(null);
      setSuccess(null);
    } catch (reason: unknown) {
      if (!errorText(reason).toLowerCase().includes("cancel"))
        setError(errorText(reason));
    } finally {
      busy.current = false;
      setPhase("IDLE");
    }
  };

  const savePunch = async (
    current: PunchAttempt,
    evidence: FaceEvidence,
  ): Promise<void> => {
    setPhase("SUBMITTING");
    setError(null);
    const fresh = await fetchAttendanceToday(current.projectId);
    if (
      fresh.attendanceDate !== current.attendanceDate ||
      context.current !==
        contextKey(current.projectId, current.pointCode, current.attendanceDate)
    )
      throw new Error("日期、项目或时段已变化，请重新开始打卡。");
    const selected = fresh.points.find(
      (point) => point.pointCode === current.pointCode,
    );
    if (selected?.record !== null && selected?.record !== undefined) {
      setSuccess({
        label: selected.label,
        time: formatChinaHm(selected.record.occurredAt),
        abnormal: selected.record.status !== "VALID",
        alreadyRecorded: true,
      });
    } else {
      requireOpenPoint(fresh, current.pointCode);
      const position = await confirmLocation(
        current.projectId,
        current.pointCode,
        fresh,
      );
      const response = await submitAttendanceRecord(current.projectId, {
        attendanceDate: fresh.attendanceDate,
        pointCode: current.pointCode,
        occurredAt: new Date().toISOString(),
        latitude: position.latitude,
        longitude: position.longitude,
        locationAccuracyM: position.accuracyM,
        sitePhotoHash: current.sitePhoto.hash,
        sitePhotoObjectKey: current.sitePhoto.objectKey,
        ...evidence,
      });
      setSuccess({
        label: selected?.label ?? current.pointCode,
        time: formatChinaHm(response.record.occurredAt),
        abnormal: response.record.status !== "VALID",
        alreadyRecorded: false,
      });
    }
    resetEvidence();
    await loadToday(current.projectId);
  };
  const finishFace = async (
    current: PunchAttempt,
    result: CompletedFaceSession,
  ): Promise<void> => {
    if (result.status !== "VERIFIED") return;
    const verified: FaceProof = {
      ...current,
      id: result.id,
      expiresAt: result.expiresAt,
    };
    setProof(verified);
    setAttempt(null);
    setPendingNative(null);
    try {
      await savePunch(current, { faceVerificationSessionId: result.id });
    } catch (reason: unknown) {
      setError(errorText(reason));
    } finally {
      busy.current = false;
      setPhase("IDLE");
    }
  };
  const startFacePunch = async (): Promise<void> => {
    if (
      busy.current ||
      !faceReady ||
      !inside ||
      projectId === null ||
      pointCode === null ||
      today === null ||
      sitePhotoPath === null
    )
      return;
    busy.current = true;
    setPhase("PREPARING");
    setError(null);
    setSuccess(null);
    try {
      const fresh = await fetchAttendanceToday(projectId);
      if (fresh.attendanceDate !== today.attendanceDate)
        throw new Error("日期已变化，请刷新今日安排。");
      requireOpenPoint(fresh, pointCode);
      const position = await confirmLocation(projectId, pointCode, fresh);
      const current: PunchAttempt = {
        projectId,
        pointCode,
        attendanceDate: fresh.attendanceDate,
        sitePhoto: await uploadImage(sitePhotoPath),
      };
      if (isDemoFace) {
        const selfie = await uploadImage(await chooseAttendancePhoto());
        await savePunch(current, {
          selfieHash: selfie.hash,
          selfieObjectKey: selfie.objectKey,
        });
      } else if (faceInfo?.mode === "VIDEO_ACTION") {
        if (process.env.TARO_ENV !== "weapp")
          throw new Error("请在微信小程序中使用活体刷脸。");
        setAttempt(current);
        setPhase("VERIFYING");
        return;
      } else {
        if (!nativeFaceSdkAvailable())
          throw new Error("请使用支持人脸核验的微信小程序版本。");
        let issued: FaceProof;
        if (
          pendingNative !== null &&
          contextKey(
            pendingNative.projectId,
            pendingNative.pointCode,
            pendingNative.attendanceDate,
          ) === context.current &&
          new Date(pendingNative.expiresAt).getTime() > Date.now()
        ) {
          issued = { ...pendingNative, sitePhoto: current.sitePhoto };
        } else {
          const session = await createFaceSession(
            projectId,
            pointCode,
            position,
          );
          await verifyWithNativeFaceSdk(session.bizToken);
          issued = { ...current, id: session.id, expiresAt: session.expiresAt };
          setPendingNative(issued);
        }
        const result = await completeFaceSession(
          projectId,
          pointCode,
          issued.id,
        );
        if (result.status !== "VERIFIED") {
          setPendingNative(null);
          throw new Error("活体检测或本人比对未通过，请重新刷脸。");
        }
        await finishFace(current, result);
      }
    } catch (reason: unknown) {
      setError(errorText(reason));
    }
    busy.current = false;
    setPhase("IDLE");
  };
  const videoFlow = useMemo<VideoFaceFlow<CompletedFaceSession> | null>(
    () =>
      attempt === null
        ? null
        : {
            createSession: async () => {
              const fresh = await fetchAttendanceToday(attempt.projectId);
              if (fresh.attendanceDate !== attempt.attendanceDate)
                throw new Error("日期已变化，请重新开始打卡。");
              requireOpenPoint(fresh, attempt.pointCode);
              const position = await confirmLocation(
                attempt.projectId,
                attempt.pointCode,
                fresh,
              );
              return createVideoFaceSession(
                attempt.projectId,
                attempt.pointCode,
                position,
              );
            },
            fetchResult: (id) =>
              fetchVideoFaceResult(attempt.projectId, attempt.pointCode, id),
            uploadVideo: (id, path) =>
              uploadFaceVideo(attempt.projectId, attempt.pointCode, id, path),
          },
    [attempt, confirmLocation],
  );
  const retrySubmit = async (): Promise<void> => {
    if (busy.current || !validProof || proof === null) return;
    busy.current = true;
    try {
      await savePunch(proof, { faceVerificationSessionId: proof.id });
    } catch (reason: unknown) {
      setError(errorText(reason));
    } finally {
      busy.current = false;
      setPhase("IDLE");
    }
  };
  const activeProject = projects?.find(
    (project) => project.projectId === projectId,
  );
  const completed =
    today?.points.filter((point) => point.record !== null).length ?? 0;
  const selected = today?.points.find((point) => point.pointCode === pointCode);
  const locationTitle =
    phase === "LOCATING"
      ? "正在获取 GPS 位置"
      : inside
        ? "已进入工地范围"
        : location?.isInside === false
          ? "尚未进入工地范围"
          : "等待确认 GPS 位置";
  const primaryLabel =
    phase === "LOCATING"
      ? "正在定位…"
      : phase === "PHOTO"
        ? "正在拍摄…"
        : phase === "PREPARING"
          ? "正在准备刷脸…"
          : phase === "SUBMITTING"
            ? "正在保存打卡…"
            : validProof
              ? "重新提交打卡"
              : !inside
                ? "重新定位并继续"
                : sitePhotoPath === null
                  ? "拍摄现场照片"
                  : !faceReady
                    ? "完善人脸档案"
                    : isDemoFace
                      ? "演示拍照并打卡"
                      : pendingNative !== null
                        ? "确认刷脸结果并打卡"
                        : "刷脸并打卡";
  return (
    <Screen>
      {attempt !== null && videoFlow !== null ? (
        <VideoFaceCapture
          flow={videoFlow}
          referenceDescription="完成活体检测和本人比对后，自动提交本次打卡。请保持在工地范围内。"
          onCancel={() => {
            setAttempt(null);
            busy.current = false;
            setPhase("IDLE");
          }}
          onResult={(result) => {
            void finishFace(attempt, result);
          }}
        />
      ) : null}
      <PageHeader title="考勤打卡" />
      {activeProject ? (
        <View className="punch-project">
          <AppIcon name="building" />
          <View className="punch-project__body">
            <View className="punch-project__name">
              {activeProject.projectName}
            </View>
            <Subtitle>
              {activeProject.teamName ?? "未分配班组"} ·{" "}
              {displayProjectRole(activeProject.projectRoleLabel)}
            </Subtitle>
          </View>
          {projects !== null && projects.length > 1 ? (
            <NativeButton
              className="punch-switch"
              disabled={isBusy}
              onClick={() => {
                void Taro.redirectTo({ url: "/pages/my-projects/index" });
              }}
            >
              切换项目
            </NativeButton>
          ) : null}
        </View>
      ) : null}
      {projects === null && error === null ? (
        <StateView title="加载中…" />
      ) : null}
      {error !== null && projectId === null ? (
        <Button
          variant="outline"
          onClick={() => {
            void Taro.redirectTo({ url: "/pages/my-projects/index" });
          }}
        >
          返回我的项目
        </Button>
      ) : null}
      {projects?.length === 0 ? (
        <StateView title="尚未加入项目" sub="请联系管理员分配工地和班组。" />
      ) : null}
      {projectId !== null && today === null && error === null ? (
        <StateView title="加载今日安排…" />
      ) : null}
      {today !== null && !today.configured ? (
        <StateView title="尚未配置打卡安排" sub="请联系项目管理员。" />
      ) : null}
      {today?.configured && !today.isWorkday ? (
        <StateView title="今天无需打卡" sub={today.attendanceDate} />
      ) : null}
      {success !== null ? (
        <View className="punch-success">
          <AppIcon name="check" />
          <View className="punch-success__title">
            {success.alreadyRecorded
              ? "已确认本时段打卡记录"
              : success.abnormal
                ? "已记录异常打卡"
                : "打卡成功"}
          </View>
          <Subtitle>
            {success.label} · {success.time}
          </Subtitle>
          <Button
            variant="outline"
            onClick={() => {
              void Taro.navigateTo({
                url: `/pages/my-records/index?projectId=${encodeURIComponent(projectId!)}`,
              });
            }}
          >
            查看考勤记录
          </Button>
        </View>
      ) : null}
      {today?.configured && today.isWorkday ? (
        <>
          <View className="punch-date">
            <View>
              {today.attendanceDate}
              <Subtitle>{today.shiftName ?? "今日安排"}</Subtitle>
            </View>
            <View className="punch-count">
              {completed}
              <View>/ {today.points.length} 次</View>
            </View>
          </View>
          <View className="punch-points">
            {today.points.map((point) => (
              <NativeButton
                key={point.pointCode}
                disabled={isBusy || point.record !== null}
                className={`punch-point ${point.pointCode === pointCode ? "punch-point--selected" : ""} ${point.record !== null ? "punch-point--done" : ""}`}
                onClick={() => {
                  if (point.pointCode !== pointCode) resetEvidence();
                  setPointCode(point.pointCode);
                  setSuccess(null);
                }}
              >
                <View className="punch-point__top">
                  {point.label}
                  <View>
                    {point.record !== null
                      ? "已打卡"
                      : point.pointCode === pointCode
                        ? "当前"
                        : "待打卡"}
                  </View>
                </View>
                <View className="punch-point__time">{point.scheduledTime}</View>
                <View className="punch-point__sub">
                  {point.record !== null
                    ? `实打 ${formatChinaHm(point.record.occurredAt)}`
                    : `宽限 ${point.graceMins} 分钟`}
                </View>
              </NativeButton>
            ))}
          </View>
          {pointCode !== null ? (
            <View className="punch-flow">
              <View className="punch-flow__heading">
                {selected?.label ?? "本次打卡"}
                <Subtitle>按顺序完成，刷脸通过后自动保存</Subtitle>
              </View>
              <View
                className={`punch-step ${inside ? "punch-step--done" : ""}`}
              >
                <View className="punch-step__number">{inside ? "✓" : "1"}</View>
                <View className="punch-step__body">
                  <View className="punch-step__title">{locationTitle}</View>
                  <Subtitle>
                    {location !== null
                      ? `距中心 ${Math.round(location.distanceM)} 米 · 允许 ${today.geofence.radiusM} 米`
                      : `工地范围：以项目位置为中心 ${today.geofence.radiusM} 米`}
                  </Subtitle>
                  {locationError !== null ? (
                    <View className="punch-step__error">{locationError}</View>
                  ) : null}
                </View>
              </View>
              <View
                className={`punch-step ${sitePhotoPath !== null ? "punch-step--done" : ""} ${!inside ? "punch-step--locked" : ""}`}
              >
                <View className="punch-step__number">
                  {sitePhotoPath !== null ? "✓" : "2"}
                </View>
                <View className="punch-step__body">
                  <View className="punch-step__title">拍摄现场照片</View>
                  <Subtitle>
                    {sitePhotoPath !== null
                      ? "照片已就绪"
                      : "必填 · 记录本次工作现场"}
                  </Subtitle>
                </View>
                <NativeButton
                  className="punch-photo-button"
                  disabled={isBusy || !inside}
                  onClick={() => {
                    void pickSitePhoto();
                  }}
                >
                  {sitePhotoPath !== null ? (
                    <Image
                      className="punch-photo"
                      src={sitePhotoPath}
                      mode="aspectFill"
                    />
                  ) : (
                    <AppIcon name="camera" />
                  )}
                  <View>{sitePhotoPath !== null ? "重拍" : "拍摄"}</View>
                </NativeButton>
              </View>
              <View
                className={`punch-step ${validProof ? "punch-step--done" : ""} ${!inside || sitePhotoPath === null ? "punch-step--locked" : ""}`}
              >
                <View className="punch-step__number">
                  {validProof ? "✓" : "3"}
                </View>
                <View className="punch-step__body">
                  <View className="punch-step__title">活体刷脸打卡</View>
                  <Subtitle>
                    {validProof
                      ? "本人核验已通过，等待保存记录"
                      : !inside
                        ? "进入工地范围后开启"
                        : sitePhotoPath === null
                          ? "先拍好现场照片"
                          : faceReady
                            ? "按提示完成动作，与本人底照比对"
                            : "请先录入底照并等待管理员审核"}
                  </Subtitle>
                </View>
                <AppIcon name="shield" />
              </View>
              <View className="punch-action">
                <Button
                  loading={isBusy}
                  disabled={isBusy}
                  onClick={() => {
                    if (validProof) void retrySubmit();
                    else if (!inside) void locate(projectId!, pointCode, today);
                    else if (sitePhotoPath === null) void pickSitePhoto();
                    else if (!faceReady)
                      void Taro.navigateTo({
                        url: "/pages/face-profile/index",
                      });
                    else void startFacePunch();
                  }}
                >
                  {primaryLabel}
                </Button>
                <View className="punch-action__note">
                  提交前再次确认 GPS，离开范围不会生成打卡记录
                </View>
              </View>
            </View>
          ) : (
            <Notice>
              今天的 {today.points.length} 次打卡均已完成，辛苦了。
            </Notice>
          )}
          {FRONTEND_DEMO ? (
            <View className="punch-demo">
              <Subtitle>演示定位 · 不读取真实 GPS</Subtitle>
              <Segmented
                options={[
                  { value: "INSIDE", label: "范围内" },
                  { value: "OUTSIDE", label: "范围外" },
                  { value: "DENIED", label: "定位失败" },
                ]}
                value={demoPosition}
                onChange={(value) => {
                  if (busy.current) return;
                  resetEvidence();
                  setDemoPosition(value);
                }}
              />
            </View>
          ) : null}
        </>
      ) : null}
      {error !== null && locationError === null ? (
        <Notice>{error}</Notice>
      ) : null}
      {error !== null && (today === null || projects === null) ? (
        <Button variant="outline" onClick={refresh}>
          重新加载
        </Button>
      ) : null}
    </Screen>
  );
}
