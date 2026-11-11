import {
  AttendanceSafetyCard,
  type PunchSafetyReceipt,
} from "../../components/attendance-safety-card";
import { ApiError } from "../../services/apiClient";
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
  fetchTaskAttendanceToday,
  fetchMyProjects,
  submitAttendanceRecord,
} from "../../services/me";
import type {
  AttendancePointCode,
  MyProjectMembership,
  SubmitAttendanceRecordBody,
} from "../../services/me.types";
import { chinaToday, formatChinaHm } from "../../services/time";
import { fetchMyTasks } from "../../services/team-work";
import {
  canSelectPunchPoint,
  selectPunchPoint,
  taskPunchBlock,
  type PunchSchedule as AttendanceToday,
} from "./point-selection";
import { useSession } from "../../store/session";
import { uploadImage } from "../../services/uploads";
import {
  workerPunchFeedback,
  workerPunchStep,
  type WorkerPunchPhase,
} from "./worker-view";

import "./index.scss";

type Phase = WorkerPunchPhase;
type DemoPosition = "INSIDE" | "OUTSIDE" | "DENIED";
type LocationCheck = GeofenceCheck & {
  readonly context: string;
  readonly checkedAt: number;
  readonly position: AttendanceLocation;
};
type PunchAttempt = {
  readonly safetyConfirmationId: string;
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
  readonly attendanceDate: string;
  readonly scheduledTime: string | null;
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
const requireOpenPoint = (
  today: AttendanceToday,
  point: AttendancePointCode,
): void => {
  if (!today.configured || !today.isWorkday)
    throw new Error("当前没有可打卡的安排，请联系管理员。");
  const blocked = taskPunchBlock(today);
  if (blocked) throw new Error(blocked);
  if (!canSelectPunchPoint(today, point))
    throw new Error("该时段已完成或不可打卡，请刷新今日安排。");
};

export default function Punch(): JSX.Element {
  useSessionGuard();
  const { phase: sessionPhase, state: sessionState } = useSession();
  const workerAppearance = sessionState.me?.roles.highestRoleCode === "WORKER";
  const requestedProjectId = useRouter().params.projectId ?? null;
  const requestedTaskId = useRouter().params.taskId ?? null;
  const readToday = useCallback(
    async (id: string): Promise<AttendanceToday> => {
      if (requestedTaskId === null) return fetchAttendanceToday(id);
      const [data, tasks] = await Promise.all([
        fetchTaskAttendanceToday(id, requestedTaskId),
        fetchMyTasks(chinaToday()),
      ]);
      const task = tasks.find(
        (item) => item.id === requestedTaskId && item.projectId === id,
      );
      if (!task)
        throw new Error("未找到当前任务，请返回任务列表刷新，或联系班组长。");
      return {
        ...data,
        taskName: task.title,
        taskWindow: { startsAt: task.startsAt, endsAt: task.endsAt },
      };
    },
    [requestedTaskId],
  );
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
  const [safetyReceipt, setSafetyReceipt] = useState<PunchSafetyReceipt | null>(
    null,
  );
  const [safetyRevision, setSafetyRevision] = useState<number>(0);
  const [faceInfo, setFaceInfo] = useState<MyFace | null>(null);
  const [location, setLocation] = useState<LocationCheck | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [sitePhoto, setSitePhoto] = useState<{
    readonly path: string;
    readonly context: string;
  } | null>(null);
  const [phase, setPhase] = useState<Phase>("IDLE");
  const [error, setError] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [success, setSuccess] = useState<PunchSuccess | null>(null);
  const [attempt, setAttempt] = useState<PunchAttempt | null>(null);
  const [proof, setProof] = useState<FaceProof | null>(null);
  const [pendingNative, setPendingNative] = useState<FaceProof | null>(null);
  const [demoPosition, setDemoPosition] = useState<DemoPosition>("INSIDE");
  const [showPoints, setShowPoints] = useState<boolean>(false);
  const [currentDate, setCurrentDate] = useState<string>(chinaToday);
  const [expiredProofContext, setExpiredProofContext] = useState<string | null>(
    null,
  );
  const [deniedPermissions, setDeniedPermissions] = useState({
    location: false,
    camera: false,
  });
  const busy = useRef<boolean>(false);
  const loadSeq = useRef<number>(0);
  const context = useRef<string>("");
  context.current = contextKey(projectId, pointCode, today?.attendanceDate);
  const sitePhotoPath =
    sitePhoto?.context === context.current ? sitePhoto.path : null;
  const isBusy = phase !== "IDLE";
  const safetyReady =
    safetyReceipt !== null &&
    safetyReceipt.context === context.current &&
    Date.parse(safetyReceipt.expiresAt) > Date.now();
  const invalidateSafetyOnError = (reason: unknown): void => {
    if (
      reason instanceof ApiError &&
      typeof reason.responseBody === "object" &&
      reason.responseBody !== null &&
      "message" in reason.responseBody &&
      String(reason.responseBody.message).startsWith("SAFETY_")
    ) {
      setSafetyReceipt(null);
      setProof(null);
      setPendingNative(null);
      setAttempt(null);
      setSafetyRevision((value) => value + 1);
    }
  };
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
    proof.safetyConfirmationId === safetyReceipt?.id &&
    contextKey(proof.projectId, proof.pointCode, proof.attendanceDate) ===
      context.current &&
    new Date(proof.expiresAt).getTime() > Date.now();

  const resetEvidence = (): void => {
    setSafetyReceipt(null);
    setLocation(null);
    setLocationError(null);
    setSitePhoto(null);
    setProof(null);
    setPendingNative(null);
    setAttempt(null);
    setError(null);
    setExpiredProofContext(null);
  };
  Taro.useDidShow(() => {
    if (workerAppearance) setCurrentDate(chinaToday());
  });
  useEffect(() => {
    if (!workerAppearance) return;
    const remaining = 86_400_000 - ((Date.now() + 8 * 3_600_000) % 86_400_000);
    const timer = setTimeout(
      () => setCurrentDate(chinaToday()),
      remaining + 100,
    );
    return () => clearTimeout(timer);
  }, [workerAppearance, currentDate]);
  useEffect(() => {
    if (
      !workerAppearance ||
      today === null ||
      today.attendanceDate === currentDate
    )
      return;
    // An in-flight verification keeps its existing server checks; old local evidence
    // is never presented as usable for a new attendance date.
    setLocation(null);
    setSitePhoto(null);
    setProof(null);
    setPendingNative(null);
    setSuccess(null);
    setExpiredProofContext(null);
  }, [workerAppearance, currentDate, today?.attendanceDate]);
  useEffect(() => {
    // Avoid a redundant mount-time render before the page's data-loading effect.
    setDeniedPermissions((previous) =>
      previous.location || previous.camera
        ? { location: false, camera: false }
        : previous,
    );
    if (
      !workerAppearance ||
      FRONTEND_DEMO ||
      process.env.TARO_ENV !== "weapp" ||
      (error === null && locationError === null)
    )
      return;
    let cancelled = false;
    void Taro.getSetting()
      .then((settings) => {
        if (!cancelled)
          setDeniedPermissions({
            location: settings.authSetting["scope.userLocation"] === false,
            camera: settings.authSetting["scope.camera"] === false,
          });
      })
      .catch(() => {
        /* Without confirmed denial, offer retry rather than settings. */
      });
    return () => {
      cancelled = true;
    };
  }, [workerAppearance, error, locationError]);
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
      () => {
        setProof(null);
        if (workerAppearance)
          setExpiredProofContext(
            contextKey(proof.projectId, proof.pointCode, proof.attendanceDate),
          );
      },
      Math.max(0, new Date(proof.expiresAt).getTime() - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [proof, workerAppearance]);
  const loadToday = useCallback(
    async (pid: string): Promise<void> => {
      const sequence = ++loadSeq.current;
      setScheduleError(null);
      try {
        const data = await readToday(pid);
        if (sequence !== loadSeq.current) return;
        setToday(data);
        setPointCode((current) =>
          selectPunchPoint(
            data,
            current,
            formatChinaHm(new Date().toISOString()),
          ),
        );
      } catch (reason: unknown) {
        if (sequence === loadSeq.current) {
          invalidateSafetyOnError(reason);
          const message = errorText(reason);
          setScheduleError(message);
          setError(message);
        }
      }
    },
    [readToday],
  );
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
          setError("未加入该项目或已退场，请重新选择项目。");
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
        invalidateSafetyOnError(reason);
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
        requireOpenPoint(data, point);
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
          throw new Error("超出工地范围，请到场后重试。");
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
              ? "定位未授权，请在微信设置中开启。"
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
        invalidateSafetyOnError(reason);
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
      today.isWorkday &&
      !taskPunchBlock(today)
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
        throw new Error("项目或时段已变更，请重新拍照。");
      setSitePhoto({ path: photo, context: expectedContext });
      setProof(null);
      setPendingNative(null);
      setSuccess(null);
      setExpiredProofContext(null);
    } catch (reason: unknown) {
      if (!errorText(reason).toLowerCase().includes("cancel")) {
        invalidateSafetyOnError(reason);
        setError(errorText(reason));
      }
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
    const fresh = await readToday(current.projectId);
    if (
      fresh.attendanceDate !== current.attendanceDate ||
      context.current !==
        contextKey(current.projectId, current.pointCode, current.attendanceDate)
    )
      throw new Error("打卡安排已变更，请重新开始。");
    const selected = fresh.points.find(
      (point) => point.pointCode === current.pointCode,
    );
    if (selected?.record !== null && selected?.record !== undefined) {
      setSuccess({
        attendanceDate: fresh.attendanceDate,
        scheduledTime: selected.scheduledTime,
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
        safetyConfirmationId: current.safetyConfirmationId,
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
        attendanceDate: fresh.attendanceDate,
        scheduledTime: selected?.scheduledTime ?? null,
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
    setExpiredProofContext(null);
    setAttempt(null);
    setPendingNative(null);
    try {
      await savePunch(current, { faceVerificationSessionId: result.id });
    } catch (reason: unknown) {
      invalidateSafetyOnError(reason);
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
      const fresh = await readToday(projectId);
      if (fresh.attendanceDate !== today.attendanceDate)
        throw new Error("日期已变化，请刷新今日安排。");
      requireOpenPoint(fresh, pointCode);
      const position = await confirmLocation(projectId, pointCode, fresh);
      if (!safetyReady || safetyReceipt === null)
        throw new Error("请先阅读并确认本次安全交底。");
      const current: PunchAttempt = {
        safetyConfirmationId: safetyReceipt.id,
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
          pendingNative.safetyConfirmationId === current.safetyConfirmationId &&
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
            current.safetyConfirmationId,
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
      invalidateSafetyOnError(reason);
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
              const fresh = await readToday(attempt.projectId);
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
                attempt.safetyConfirmationId,
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
      invalidateSafetyOnError(reason);
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
                  : !safetyReady
                    ? "请先确认安全交底"
                    : !faceReady
                      ? "完善人脸档案"
                      : isDemoFace
                        ? "演示拍照并打卡"
                        : pendingNative !== null
                          ? "确认刷脸结果并打卡"
                          : "刷脸并打卡";
  // Keep derived view values in the same lexical scope as the loader's inputs.
  // Reusing minified names in a nested block can overwrite captured values after
  // WeChat's ES6 compilation, leaving the ready-session guard stuck in loading.
  const feedback = workerPunchFeedback({
    hasSchedule: today !== null,
    scheduleError,
    error,
  });
  const staleDate = today !== null && today.attendanceDate !== currentDate;
  const recordedResult =
    success?.attendanceDate === currentDate ? success : null;
  const step = workerPunchStep({
    phase,
    inside: Boolean(inside),
    hasPhoto: sitePhotoPath !== null,
    faceReady: Boolean(faceReady),
    safetyReady,
    validProof,
    locationDenied: deniedPermissions.location,
    cameraDenied: deniedPermissions.camera,
  });
  const proofExpired = expiredProofContext === context.current;
  const faceDescription =
    faceInfo?.profile?.status === "PENDING"
      ? "本人底照正在审核，通过后才能正式打卡。"
      : faceInfo?.profile?.status === "REJECTED"
        ? (faceInfo.profile.reviewReason ??
          "底照审核未通过，请重新提交本人照片。")
        : faceInfo?.mode === "UNCONFIGURED"
          ? "人脸核验暂不可用，请联系项目管理员。"
          : "请先录入本人底照并通过审核。";
  const safetyBlocked = step.action === "confirm-safety";
  const taskTitle =
    phase === "SUBMITTING"
      ? "正在保存打卡记录"
      : validProof
        ? "打卡尚未保存"
        : phase === "PREPARING"
          ? "正在准备人脸核验"
          : phase === "VERIFYING"
            ? "正在进行人脸核验"
            : phase === "PHOTO"
              ? "正在拍摄现场照片"
              : phase === "LOCATING"
                ? "正在确认位置"
                : proofExpired
                  ? "核验结果已过期"
                  : step.action === "location-settings"
                    ? "需要开启定位权限"
                    : step.action === "camera-settings"
                      ? "需要开启相机权限"
                      : step.stage === "location"
                        ? location?.isInside === false
                          ? "超出考勤范围"
                          : locationError?.includes("精度")
                            ? "定位精度不足"
                            : "请确认打卡位置"
                        : step.stage === "photo"
                          ? "位置已确认"
                          : !faceReady
                            ? faceInfo?.profile?.status === "PENDING"
                              ? "底照审核中"
                              : "请查看人脸档案"
                            : safetyBlocked
                              ? "请阅读安全交底"
                              : "现场照片已就绪";
  const taskDescription =
    phase === "SUBMITTING"
      ? isDemoFace
        ? "正在保存本机演示记录，请等待结果。"
        : "人脸核验已通过，请等待保存结果。"
      : validProof
        ? "核验仍有效，可直接重试提交。"
        : phase === "PREPARING" || phase === "VERIFYING"
          ? "请保持在工地范围内，按提示完成本人核验。"
          : proofExpired
            ? "重新定位、核验，保存后打卡成功。"
            : step.action === "location-settings"
              ? "定位核对工地范围。"
              : step.action === "camera-settings"
                ? "开启相机权限，拍摄现场。"
                : step.stage === "location"
                  ? "请到考勤范围内重新定位。"
                  : step.stage === "photo"
                    ? "定位通过，可拍摄现场。"
                    : !faceReady
                      ? faceDescription
                      : safetyBlocked
                        ? "阅读下方内容，确认理解后再进行人脸核验。"
                        : "按提示完成人脸核验，通过后自动保存打卡。";
  const workerPrimaryLabel = safetyBlocked
    ? "请先确认安全交底"
    : step.action === "wait"
      ? phase === "SUBMITTING"
        ? "保存中…"
        : phase === "VERIFYING"
          ? "核验中…"
          : primaryLabel
      : step.action === "retry-save"
        ? "重新提交打卡"
        : step.action === "location-settings" ||
            step.action === "camera-settings"
          ? "前往设置"
          : step.action === "locate"
            ? "重新定位"
            : step.action === "capture"
              ? error === null
                ? "拍摄现场照片"
                : "重新拍摄"
              : step.action === "face-profile"
                ? "查看人脸档案"
                : isDemoFace
                  ? "演示拍照并打卡"
                  : pendingNative !== null
                    ? "确认本次核验结果"
                    : "开始人脸核验";
  const openPermissionSettings = async (): Promise<void> => {
    try {
      const settings = await Taro.openSetting();
      setDeniedPermissions({
        location: settings.authSetting["scope.userLocation"] === false,
        camera: settings.authSetting["scope.camera"] === false,
      });
    } catch (cause: unknown) {
      setError(errorText(cause));
    }
  };
  const act = (): void => {
    if (
      isBusy ||
      staleDate ||
      projectId === null ||
      pointCode === null ||
      today === null
    )
      return;
    if (step.action === "retry-save") void retrySubmit();
    else if (
      step.action === "location-settings" ||
      step.action === "camera-settings"
    )
      void openPermissionSettings();
    else if (step.action === "locate") void locate(projectId, pointCode, today);
    else if (step.action === "capture") void pickSitePhoto();
    else if (step.action === "face-profile")
      void Taro.navigateTo({ url: "/pages/face-profile/index" });
    else if (step.action === "verify" && safetyReady) void startFacePunch();
  };
  const viewRecords = (): void => {
    if (projectId !== null)
      void Taro.navigateTo({
        url: `/pages/my-records/index?projectId=${encodeURIComponent(projectId)}`,
      });
  };
  const taskDate =
    recordedResult?.attendanceDate ?? today?.attendanceDate ?? currentDate;
  const taskLabel = recordedResult?.label ?? selected?.label;
  const taskTime = recordedResult?.scheduledTime ?? selected?.scheduledTime;
  if (workerAppearance) {
    return (
      <Screen
        appearance="worker"
        header={
          <PageHeader
            title="考勤打卡"
            appearance="worker"
            footer={
              activeProject ? (
                <View className="worker-punch__context">
                  <View className="worker-punch__project-row">
                    <View className="worker-punch__project">
                      {activeProject.projectName}
                    </View>
                    {projects !== null && projects.length > 1 ? (
                      <NativeButton
                        className="worker-punch__text-button"
                        disabled={isBusy}
                        onClick={() => {
                          void Taro.redirectTo({
                            url: "/pages/my-projects/index",
                          });
                        }}
                      >
                        切换项目
                      </NativeButton>
                    ) : null}
                  </View>
                  {requestedTaskId !== null && today?.taskName ? (
                    <View className="worker-punch__task-name">
                      任务：{today.taskName}
                    </View>
                  ) : null}
                  <View className="worker-punch__muted">
                    {activeProject.teamName ?? "项目直属"} ·{" "}
                    {displayProjectRole(activeProject.projectRoleLabel)}
                  </View>
                  <View className="worker-punch__date">{taskDate}</View>
                  {taskLabel ? (
                    <View className="worker-punch__task-label">
                      {taskLabel}
                      {taskTime ? ` · 应打卡 ${taskTime}` : ""}
                    </View>
                  ) : null}
                </View>
              ) : null
            }
          />
        }
      >
        <View className="worker-punch">
          {attempt !== null && videoFlow !== null ? (
            <VideoFaceCapture
              flow={videoFlow}
              referenceDescription={`${activeProject?.projectName ?? "当前项目"} · ${activeProject?.teamName ?? "项目直属"}。${today?.taskName ? `任务：${today.taskName}。` : ""}${attempt.attendanceDate} · ${selected?.label ?? attempt.pointCode} ${selected?.scheduledTime ?? ""}。完成本人核验后自动保存，请保持在工地范围内。`}
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
          {projects === null && error === null ? (
            <StateView
              title="正在读取项目…"
              sub="正在确认当前项目与今日安排。"
            />
          ) : null}
          {projects?.length === 0 ? (
            <StateView
              title="尚未加入项目"
              sub="请联系管理员分配工地和班组。"
            />
          ) : null}
          {projectId !== null && today === null && error === null ? (
            <StateView title="正在读取今日安排…" />
          ) : null}
          {error !== null && (projectId === null || today === null) ? (
            <View className="worker-punch__empty">
              <View className="worker-punch__title">暂时无法读取打卡安排</View>
              <View className="worker-punch__error" role="alert">
                {error}
              </View>
              <Button appearance="worker" onClick={refresh}>
                重新加载
              </Button>
              <NativeButton
                className="worker-punch__text-button"
                onClick={() => {
                  void Taro.redirectTo({ url: "/pages/my-projects/index" });
                }}
              >
                返回我的项目
              </NativeButton>
            </View>
          ) : null}
          {feedback.refreshWarning !== null ? (
            <View
              className="worker-punch__refresh-warning"
              role="alert"
              data-punch-refresh-error
            >
              <View className="worker-punch__refresh-title">
                今日安排刷新失败
              </View>
              <View className="worker-punch__muted">
                {feedback.refreshWarning}
              </View>
              <NativeButton
                className="worker-punch__text-button"
                disabled={isBusy}
                onClick={refresh}
              >
                重试刷新安排
              </NativeButton>
            </View>
          ) : null}
          {staleDate ? (
            <View className="worker-punch__task" data-punch-state="stale-date">
              <View className="worker-punch__status">
                <AppIcon name="clock" />
                <View className="worker-punch__title">日期已变化</View>
                <View className="worker-punch__muted">
                  请刷新安排，原定位、照片及核验已失效。
                </View>
              </View>
              <Button appearance="worker" disabled={isBusy} onClick={refresh}>
                刷新今日安排
              </Button>
            </View>
          ) : recordedResult !== null ? (
            <View
              className="worker-punch__result"
              data-punch-state={
                recordedResult.abnormal
                  ? "abnormal"
                  : recordedResult.alreadyRecorded
                    ? "confirmed"
                    : "success"
              }
            >
              <View
                className={`worker-punch__result-body${recordedResult.abnormal ? " worker-punch__result-body--abnormal" : ""}`}
              >
                <AppIcon name={recordedResult.abnormal ? "clock" : "check"} />
                <View className="worker-punch__title">
                  {recordedResult.alreadyRecorded
                    ? "已确认本时段记录"
                    : recordedResult.abnormal
                      ? "已记录异常打卡"
                      : "打卡成功"}
                </View>
                <View className="worker-punch__muted">实际打卡时间</View>
                <View className="worker-punch__time">
                  {recordedResult.time}
                </View>
                {recordedResult.abnormal ? (
                  <View className="worker-punch__error">
                    本条记录有异常，请查看本项目考勤。
                  </View>
                ) : null}
              </View>
              <Button appearance="worker" onClick={viewRecords}>
                查看本项目考勤
              </Button>
              {pointCode !== null ? (
                <NativeButton
                  className="worker-punch__text-button"
                  onClick={() => {
                    setSuccess(null);
                  }}
                >
                  继续今日打卡
                </NativeButton>
              ) : null}
              <NativeButton
                className="worker-punch__text-button"
                onClick={() => {
                  void Taro.reLaunch({ url: "/pages/home/index" });
                }}
              >
                返回首页
              </NativeButton>
            </View>
          ) : today?.configured && today.isWorkday && taskPunchBlock(today) ? (
            <View
              className="worker-punch__task"
              data-punch-state="task-time-blocked"
            >
              <View className="worker-punch__status">
                <AppIcon name="clock" />
                <View className="worker-punch__title">当前不能开工打卡</View>
                <View className="worker-punch__muted">
                  {taskPunchBlock(today)}
                </View>
              </View>
              <Button appearance="worker" disabled={isBusy} onClick={refresh}>
                刷新任务安排
              </Button>
              <NativeButton
                className="worker-punch__text-button"
                onClick={() => {
                  void Taro.redirectTo({ url: "/pages/my-tasks/index" });
                }}
              >
                返回我的任务
              </NativeButton>
            </View>
          ) : today !== null &&
            (!today.configured ||
              !today.isWorkday ||
              today.points.length === 0 ||
              pointCode === null) ? (
            <View
              className="worker-punch__task"
              data-punch-state="no-open-point"
            >
              <View className="worker-punch__status">
                <AppIcon
                  name={
                    pointCode === null &&
                    today.points.length > 0 &&
                    today.configured &&
                    today.isWorkday
                      ? "check"
                      : "calendar"
                  }
                />
                <View className="worker-punch__title">
                  {!today.configured
                    ? "尚未配置打卡安排"
                    : !today.isWorkday || today.points.length === 0
                      ? "今天无需打卡"
                      : "本项目今日已记录"}
                </View>
                <View className="worker-punch__muted">
                  {!today.configured
                    ? "请联系项目管理员确认安排。"
                    : today.points.some(
                          (point) => point.record?.status === "INVALID",
                        )
                      ? "存在异常记录，请在考勤中查看详情。"
                      : (today.shiftName ?? "以本人当前生效安排为准。")}
                </View>
              </View>
              {requestedTaskId === null && activeProject?.taskAttendanceOnly ? (
                <Button
                  appearance="worker"
                  onClick={() => {
                    void Taro.navigateTo({ url: "/pages/my-tasks/index" });
                  }}
                >
                  进入我的任务开工／完工
                </Button>
              ) : null}
              <Button appearance="worker" onClick={viewRecords}>
                查看本项目考勤
              </Button>
            </View>
          ) : today !== null && pointCode !== null ? (
            <>
              <View
                className="worker-punch__task"
                data-punch-state={step.stage}
              >
                <View className="worker-punch__steps">
                  {[
                    {
                      name: "位置",
                      done: Boolean(inside) || validProof,
                      active: step.stage === "location",
                    },
                    {
                      name: "照片",
                      done: sitePhotoPath !== null || validProof,
                      active: step.stage === "photo",
                    },
                    {
                      name: "交底",
                      done: safetyReady || validProof,
                      active: step.stage === "face" && !safetyReady,
                    },
                    {
                      name: "核验",
                      done: validProof,
                      active:
                        (step.stage === "face" && safetyReady) ||
                        step.stage === "saving",
                    },
                  ].map((item, index) => (
                    <View
                      key={item.name}
                      className={`worker-punch__step${item.active ? " worker-punch__step--active" : ""}${item.done ? " worker-punch__step--done" : ""}`}
                    >
                      {item.done ? (
                        <AppIcon name="check" />
                      ) : (
                        <View className="worker-punch__step-number">
                          {index + 1}
                        </View>
                      )}
                      <View>{item.name}</View>
                    </View>
                  ))}
                </View>
                {sitePhotoPath !== null &&
                step.stage === "face" &&
                !proofExpired ? (
                  <Image
                    className="worker-punch__photo"
                    src={sitePhotoPath}
                    mode="aspectFill"
                  />
                ) : null}
                <View
                  className={`worker-punch__status${sitePhotoPath !== null && step.stage === "face" && !proofExpired ? " worker-punch__status--compact" : ""}`}
                >
                  {isBusy ? (
                    <View className="ui-btn__spinner worker-punch__spinner" />
                  ) : sitePhotoPath === null ||
                    step.stage !== "face" ||
                    proofExpired ? (
                    <AppIcon
                      name={
                        proofExpired || step.stage === "saving"
                          ? "clock"
                          : step.stage === "location" || step.stage === "photo"
                            ? "pin"
                            : "shield"
                      }
                    />
                  ) : null}
                  <View className="worker-punch__title">{taskTitle}</View>
                  <View className="worker-punch__muted">{taskDescription}</View>
                </View>
                {step.stage === "location" ? (
                  <View className="worker-punch__detail">
                    {location !== null
                      ? `距中心 ${Math.round(location.distanceM)} 米 · 允许 ${today.geofence.radiusM} 米`
                      : `工地中心周边 ${today.geofence.radiusM} 米`}
                    {today.geofence.locationAccuracyLimitM !== null ? (
                      <View>
                        定位精度要求：误差不超过{" "}
                        {today.geofence.locationAccuracyLimitM} 米
                      </View>
                    ) : null}
                  </View>
                ) : null}
                {inside && step.stage !== "saving" ? (
                  <View className="worker-punch__completed">
                    <AppIcon name="check" />
                    <View>
                      位置已确认
                      <View className="worker-punch__muted">
                        {location !== null
                          ? `${taskDate} ${formatChinaHm(new Date(location.checkedAt).toISOString())}`
                          : ""}
                      </View>
                    </View>
                  </View>
                ) : null}
                {locationError !== null || feedback.actionError !== null ? (
                  <View className="worker-punch__error" role="alert">
                    {locationError ?? feedback.actionError}
                  </View>
                ) : null}
                {phase === "SUBMITTING" ? (
                  <View className="worker-punch__detail">
                    记录保存完成后才算打卡成功。
                  </View>
                ) : null}
              </View>
              <AttendanceSafetyCard
                appearance="worker"
                key={context.current}
                projectId={projectId!}
                pointCode={pointCode}
                context={context.current}
                revision={safetyRevision}
                disabled={isBusy || !inside || sitePhotoPath === null}
                receipt={safetyReady ? safetyReceipt : null}
                onConfirmed={setSafetyReceipt}
              />
              <View className="worker-punch__actions">
                {(!safetyBlocked || isBusy) && (
                  <Button
                    appearance="worker"
                    loading={isBusy}
                    disabled={isBusy || safetyBlocked}
                    onClick={act}
                  >
                    {workerPrimaryLabel}
                  </Button>
                )}
                {sitePhotoPath !== null && !validProof && !isBusy ? (
                  <NativeButton
                    className="worker-punch__text-button"
                    data-action="retake-photo"
                    disabled={!inside}
                    onClick={() => {
                      void pickSitePhoto();
                    }}
                  >
                    重新拍摄现场照片
                  </NativeButton>
                ) : null}
                {!isBusy && step.stage === "location" ? (
                  <NativeButton
                    className="worker-punch__text-button"
                    onClick={() => {
                      void Taro.navigateTo({
                        url: `/pages/my-project-detail/index?projectId=${encodeURIComponent(projectId!)}`,
                      });
                    }}
                  >
                    查看工地位置与联系人
                  </NativeButton>
                ) : null}
                <View className="worker-punch__footnote">
                  {step.stage === "photo"
                    ? "仅现场拍摄，照片不超过 5MB。"
                    : "提交前重新定位，请保持在范围内。"}
                </View>
              </View>
            </>
          ) : null}
          {today?.configured &&
          today.isWorkday &&
          today.points.length > 0 &&
          recordedResult === null ? (
            <View className="worker-punch__schedule">
              <NativeButton
                className="worker-punch__schedule-toggle"
                disabled={isBusy}
                aria-expanded={showPoints}
                onClick={() => setShowPoints((value) => !value)}
              >
                <View>
                  今日安排 · {today.points.length} 个时点
                  <View className="worker-punch__muted">
                    {today.shiftName ?? "本人今日生效安排"}
                  </View>
                </View>
                <View>{showPoints ? "收起" : "查看 / 切换"}</View>
              </NativeButton>
              {showPoints ? (
                <View className="worker-punch__point-list">
                  {today.points.map((point) => (
                    <NativeButton
                      key={point.pointCode}
                      data-point-code={point.pointCode}
                      className={`worker-punch__point${point.pointCode === pointCode ? " worker-punch__point--selected" : ""}`}
                      disabled={
                        isBusy ||
                        staleDate ||
                        !canSelectPunchPoint(today, point.pointCode) ||
                        taskPunchBlock(today) !== null
                      }
                      onClick={() => {
                        if (point.pointCode !== pointCode) resetEvidence();
                        setPointCode(point.pointCode);
                        setSuccess(null);
                        setShowPoints(false);
                      }}
                    >
                      <View className="worker-punch__point-main">
                        <View>{point.label}</View>
                        <View>{point.scheduledTime}</View>
                      </View>
                      <View className="worker-punch__point-meta">
                        <View>
                          {point.record !== null
                            ? `${point.record.status === "VALID" ? "已记录" : "异常记录"} · ${formatChinaHm(point.record.occurredAt)}`
                            : point.pointCode === pointCode
                              ? "当前时点"
                              : "待打卡"}
                        </View>
                        <View>宽限 {point.graceMins} 分钟</View>
                      </View>
                    </NativeButton>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}
          {FRONTEND_DEMO && today?.configured && today.isWorkday ? (
            <View className="worker-punch__demo">
              <View className="worker-punch__muted">
                演示定位 · 不读取真实 GPS
              </View>
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
        </View>
      </Screen>
    );
  }
  return (
    <Screen>
      {attempt !== null && videoFlow !== null ? (
        <VideoFaceCapture
          flow={videoFlow}
          referenceDescription="核验通过后自动打卡，请保持在工地范围内。"
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
      {requestedTaskId === null &&
        projects?.find((row) => row.projectId === projectId)
          ?.taskAttendanceOnly && (
          <Button
            onClick={() => {
              void Taro.navigateTo({ url: "/pages/my-tasks/index" });
            }}
          >
            进入我的任务开工／完工
          </Button>
        )}
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
                disabled={
                  isBusy ||
                  !canSelectPunchPoint(today, point.pointCode) ||
                  taskPunchBlock(today) !== null
                }
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
                <Subtitle>刷脸通过后自动保存</Subtitle>
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
              <AttendanceSafetyCard
                key={context.current}
                projectId={projectId!}
                pointCode={pointCode}
                context={context.current}
                revision={safetyRevision}
                disabled={isBusy || !inside || sitePhotoPath === null}
                receipt={safetyReady ? safetyReceipt : null}
                onConfirmed={setSafetyReceipt}
              />
              <View
                className={`punch-step ${validProof ? "punch-step--done" : ""} ${!inside || sitePhotoPath === null || !safetyReady ? "punch-step--locked" : ""}`}
              >
                <View className="punch-step__number">
                  {validProof ? "✓" : "4"}
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
                          : !safetyReady
                            ? "先确认本次安全交底"
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
                  disabled={
                    isBusy || (inside && sitePhotoPath !== null && !safetyReady)
                  }
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
                  提交前核对定位，范围外无法打卡
                </View>
              </View>
            </View>
          ) : (
            <Notice>今天的 {today.points.length} 次打卡已完成。</Notice>
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
