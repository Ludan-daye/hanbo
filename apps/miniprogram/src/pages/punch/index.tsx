import {
  AttendanceSafetyCard,
  type PunchSafetyReceipt,
} from "../../components/attendance-safety-card";
import { ApiError } from "../../services/apiClient";
import { View } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  Button,
  Notice,
  PageHeader,
  Screen,
  SkeletonRows,
  Steps,
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
  fetchOvertimeAttendanceToday,
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
import { cardName, pointStatus } from "../../services/worker-home-sign";
import {
  canSelectPunchPoint,
  selectPunchPoint,
  taskPunchBlock,
  type PunchSchedule as AttendanceToday,
} from "./point-selection";
import { errorMessage, isUserCancel } from "../../services/error-messages";
import { useSession } from "../../store/session";
import { uploadImage } from "../../services/uploads";
import { punchScreen, screenStep } from "./punch-stage";
import { LocateView, type DemoPosition } from "./views/locate";
import { MessageView, PointsView, ResultView } from "./views/outcome";
import { FaceView, PhotoView, SavingView } from "./views/steps";
import {
  workerPunchFeedback,
  workerPunchStep,
  type WorkerPunchPhase,
} from "./worker-view";

import "./index.scss";

type Phase = WorkerPunchPhase;
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
  readonly label: string;
  readonly time: string;
  readonly abnormal: boolean;
  readonly alreadyRecorded: boolean;
  /** 保存时距工地中心多远；这张卡早就有记录时不知道，为 null。 */
  readonly distanceM: number | null;
  /** 今天还没打的下一张卡，例如“下班 17:30”。 */
  readonly nextCard: string | null;
};
type FaceEvidence = Pick<
  SubmitAttendanceRecordBody,
  "faceVerificationSessionId" | "selfieHash" | "selfieObjectKey"
>;
const contextKey = (
  projectId: string | null,
  point: string | null,
  date: string | undefined,
): string => `${projectId}/${point}/${date}`;
const requireOpenPoint = (
  today: AttendanceToday,
  point: AttendancePointCode,
): void => {
  if (!today.configured || !today.isWorkday)
    throw new Error("当前没有可打卡的安排，请联系管理员。");
  const blocked = taskPunchBlock(today, Date.now());
  if (blocked) throw new Error(blocked);
  if (!canSelectPunchPoint(today, point))
    throw new Error("该时段已完成或不可打卡，请刷新今日安排。");
};
/** 这张卡打完之后，今天下一张该打的卡。 */
const nextCardAfter = (
  today: AttendanceToday,
  done: AttendancePointCode,
  now: string,
): string | null => {
  const after: AttendanceToday = {
    ...today,
    points: today.points.map((point) =>
      point.pointCode === done && point.record === null
        ? {
            ...point,
            record: { abnormalReason: null, occurredAt: now, status: "VALID" },
          }
        : point,
    ),
  };
  const code = selectPunchPoint(after, null, formatChinaHm(now));
  const next = after.points.find((point) => point.pointCode === code);
  return next ? `${next.label} ${next.scheduledTime}` : null;
};

export default function Punch(): JSX.Element {
  useSessionGuard();
  const { phase: sessionPhase } = useSession();
  const requestedProjectId = useRouter().params.projectId ?? null;
  const requestedTaskId = useRouter().params.taskId ?? null;
  const overtimeMode = useRouter().params.mode === "overtime";
  const readToday = useCallback(
    async (id: string): Promise<AttendanceToday> => {
      if (overtimeMode) return fetchOvertimeAttendanceToday(id);
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
    [requestedTaskId, overtimeMode],
  );
  // 拍照、刷脸都会让页面隐藏再显示；刚读过、期间也没提交过东西时不重读。
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
  const autoFace = useRef<boolean>(false);
  // 引用必须稳定：安全交底卡片在回调变化时会清空回执并重新读取交底。
  const confirmSafety = useCallback(
    (receipt: PunchSafetyReceipt | null): void => {
      autoFace.current = receipt !== null;
      setSafetyReceipt(receipt);
    },
    [],
  );
  const [faceInfo, setFaceInfo] = useState<MyFace | null>(null);
  const [location, setLocation] = useState<LocationCheck | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [sitePhoto, setSitePhoto] = useState<{
    readonly path: string;
    readonly context: string;
  } | null>(null);
  // 工人看过刚拍的照片并点了“下一步”；重拍后要重新看过。
  const [photoReviewed, setPhotoReviewed] = useState<boolean>(false);
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
  // 定位只在本次尝试内作为“已进入范围”的界面依据；刷脸与保存前服务端会再次核验位置，
  // 因此不随时间自动失效，避免工人阅读交底超过一分钟后被打回第一步。
  const inside = location?.context === context.current && location.isInside;
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
    setPhotoReviewed(false);
    setProof(null);
    setPendingNative(null);
    setAttempt(null);
    setError(null);
    setExpiredProofContext(null);
  };
  Taro.useDidShow(() => {
    setCurrentDate(chinaToday());
  });
  useEffect(() => {
    const remaining = 86_400_000 - ((Date.now() + 8 * 3_600_000) % 86_400_000);
    const timer = setTimeout(
      () => setCurrentDate(chinaToday()),
      remaining + 100,
    );
    return () => clearTimeout(timer);
  }, [currentDate]);
  useEffect(() => {
    if (today === null || today.attendanceDate === currentDate) return;
    // An in-flight verification keeps its existing server checks; old local evidence
    // is never presented as usable for a new attendance date.
    setLocation(null);
    setSitePhoto(null);
    setPhotoReviewed(false);
    setProof(null);
    setPendingNative(null);
    setSuccess(null);
    setExpiredProofContext(null);
  }, [currentDate, today?.attendanceDate]);
  useEffect(() => {
    // Avoid a redundant mount-time render before the page's data-loading effect.
    setDeniedPermissions((previous) =>
      previous.location || previous.camera
        ? { location: false, camera: false }
        : previous,
    );
    if (
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
  }, [error, locationError]);
  useEffect(() => {
    if (proof === null) return;
    const timer = setTimeout(
      () => {
        setProof(null);
        setExpiredProofContext(
          contextKey(proof.projectId, proof.pointCode, proof.attendanceDate),
        );
      },
      Math.max(0, new Date(proof.expiresAt).getTime() - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [proof]);
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
          const message = errorMessage(reason);
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
        setError(errorMessage(reason));
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
        if (context.current === expected)
          setLocationError(errorMessage(reason, "定位未完成，请重试。"));
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
        setError(errorMessage(reason));
      } finally {
        busy.current = false;
        setPhase("IDLE");
      }
    },
    [confirmLocation],
  );
  useEffect(() => {
    // 底照没通过时打不了卡，就不去定位，免得白弹一次定位授权。
    if (
      projectId !== null &&
      pointCode !== null &&
      faceReady &&
      today?.configured &&
      today.isWorkday &&
      !taskPunchBlock(today, Date.now())
    )
      void locate(projectId, pointCode, today);
  }, [
    projectId,
    pointCode,
    today?.attendanceDate,
    revision,
    locate,
    faceReady,
  ]);

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
      setPhotoReviewed(false);
      setProof(null);
      setPendingNative(null);
      setSuccess(null);
      setExpiredProofContext(null);
    } catch (reason: unknown) {
      if (!isUserCancel(reason)) {
        invalidateSafetyOnError(reason);
        setError(errorMessage(reason));
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
    const now = new Date().toISOString();
    const nextCard = nextCardAfter(fresh, current.pointCode, now);
    if (selected?.record !== null && selected?.record !== undefined) {
      setSuccess({
        attendanceDate: fresh.attendanceDate,
        label: selected.label,
        time: formatChinaHm(selected.record.occurredAt),
        abnormal: selected.record.status !== "VALID",
        alreadyRecorded: true,
        distanceM: null,
        nextCard,
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
        occurredAt: now,
        latitude: position.latitude,
        longitude: position.longitude,
        locationAccuracyM: position.accuracyM,
        sitePhotoHash: current.sitePhoto.hash,
        sitePhotoObjectKey: current.sitePhoto.objectKey,
        ...evidence,
      });
      setSuccess({
        attendanceDate: fresh.attendanceDate,
        label: selected?.label ?? current.pointCode,
        time: formatChinaHm(response.record.occurredAt),
        abnormal: response.record.status !== "VALID",
        alreadyRecorded: false,
        distanceM: checkAttendanceGeofence(fresh.geofence, position).distanceM,
        nextCard,
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
      setError(errorMessage(reason));
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
      if (!isUserCancel(reason)) {
        invalidateSafetyOnError(reason);
        setError(errorMessage(reason));
      }
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
      setError(errorMessage(reason));
    } finally {
      busy.current = false;
      setPhase("IDLE");
    }
  };
  const activeProject = projects?.find(
    (project) => project.projectId === projectId,
  );
  const selected = today?.points.find((point) => point.pointCode === pointCode);
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
  const taskBlock =
    today?.configured && today.isWorkday
      ? taskPunchBlock(today, Date.now())
      : null;
  const noOpenPoint =
    today !== null &&
    (!today.configured ||
      !today.isWorkday ||
      today.points.length === 0 ||
      pointCode === null);
  const faceBlocked = faceInfo !== null && !faceReady;
  const blocked = taskBlock !== null || noOpenPoint || faceBlocked;
  const screen = punchScreen({
    failed: error !== null && (projectId === null || today === null),
    loaded: projectId !== null && today !== null,
    stale: staleDate,
    hasResult: recordedResult !== null,
    blocked,
    showPoints,
    hasPhoto: sitePhotoPath !== null,
    photoReviewed,
    step,
  });
  const stepInfo = screenStep(screen);
  const pointRows = (today?.points ?? []).map((point) => ({
    ...point,
    status: pointStatus(point, selected ?? null, false),
  }));
  const openPermissionSettings = async (): Promise<void> => {
    try {
      const settings = await Taro.openSetting();
      setDeniedPermissions({
        location: settings.authSetting["scope.userLocation"] === false,
        camera: settings.authSetting["scope.camera"] === false,
      });
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    }
  };
  useEffect(() => {
    // 确认安全交底后直接进入刷脸，省去再点一次“开始人脸核验”。
    if (!autoFace.current || safetyReceipt === null) return;
    autoFace.current = false;
    if (step.action === "verify" && safetyReady && !isBusy)
      void startFacePunch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safetyReceipt]);
  const goHome = (): void => {
    void Taro.reLaunch({ url: "/pages/home/index" });
  };
  const viewRecords = (): void => {
    if (requestedProjectId !== null)
      void Taro.navigateTo({
        url: `/pages/my-records/index?projectId=${encodeURIComponent(requestedProjectId)}&range=TODAY`,
      });
  };
  const toMyTasks = (): void => {
    void Taro.redirectTo({ url: "/pages/my-tasks/index" });
  };
  const place = activeProject
    ? `${activeProject.projectName}，${activeProject.teamName ?? "项目直属"}`
    : "";
  const title =
    screen === "points"
      ? "今天的卡"
      : recordedResult !== null
        ? cardName({ label: recordedResult.label })
        : selected
          ? cardName(selected)
          : "打卡";

  /** 现在打不了卡时，说清原因，给一个去处。 */
  const renderBlocked = (): JSX.Element => {
    const records = { label: "今天的记录", onClick: viewRecords };
    if (taskBlock !== null)
      return (
        <MessageView
          title="现在还不能开工打卡"
          sub={taskBlock}
          primary={{ label: "重新读取", onClick: refresh }}
          secondary={{ label: "我的任务", onClick: toMyTasks }}
        />
      );
    if (requestedTaskId === null && activeProject?.taskAttendanceOnly)
      return (
        <MessageView
          title="按任务开工、完工"
          sub="这个项目按任务记工，到“我的任务”里打卡。"
          primary={{ label: "去我的任务", onClick: toMyTasks }}
          secondary={records}
        />
      );
    if (today !== null && !today.configured)
      return (
        <MessageView
          title="今天还没排班"
          sub="请联系班组长或项目管理员设置打卡安排。"
          primary={{ label: "回首页", onClick: goHome }}
          secondary={records}
        />
      );
    if (today !== null && (!today.isWorkday || today.points.length === 0))
      return (
        <MessageView
          title="今天不用打卡"
          sub={
            today.shiftName ? `${today.shiftName}，今天休息。` : "今天休息。"
          }
          primary={{ label: "回首页", onClick: goHome }}
          secondary={records}
        />
      );
    if (today !== null && pointCode === null)
      return (
        <MessageView
          title="今天的卡都打了"
          sub={
            today.points.some((point) => point.record?.status === "INVALID")
              ? "有异常记录，到今天的记录里看原因。"
              : undefined
          }
          points={pointRows}
          primary={{ label: "回首页", onClick: goHome }}
          secondary={records}
        />
      );
    const status = faceInfo?.profile?.status;
    return (
      <MessageView
        title={
          faceInfo?.mode === "UNCONFIGURED"
            ? "人脸核验暂时用不了"
            : status === "PENDING"
              ? "底照还在审核"
              : status === "REJECTED"
                ? "底照没通过，要重新提交"
                : status === "APPROVED"
                  ? "人脸核验暂时用不了"
                  : "还没有录底照"
        }
        sub={
          faceInfo?.mode === "UNCONFIGURED" || status === "APPROVED"
            ? "请联系项目管理员确认核验服务。"
            : status === "PENDING"
              ? "审核通过后才能打卡。"
              : status === "REJECTED"
                ? (faceInfo?.profile?.reviewReason ??
                  "按审核意见重新拍一张本人正脸。")
                : "录入本人底照并通过审核后才能打卡。"
        }
        primary={{
          label: "查看底照",
          onClick: () => {
            void Taro.navigateTo({ url: "/pages/face-profile/index" });
          },
        }}
      />
    );
  };

  return (
    <Screen
      appearance="sign"
      header={
        <PageHeader
          appearance="sign"
          title={title}
          onBack={screen === "points" ? () => setShowPoints(false) : undefined}
        />
      }
    >
      {attempt !== null && videoFlow !== null ? (
        <VideoFaceCapture
          flow={videoFlow}
          referenceDescription={`${place}。${today?.taskName ? `任务：${today.taskName}。` : ""}${selected ? `${cardName(selected)} ${selected.scheduledTime}。` : ""}核验通过后自动保存，请留在考勤范围内。`}
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
      {stepInfo !== null ? (
        <Steps current={stepInfo.current} total={4} label={stepInfo.label} />
      ) : null}
      {stepInfo !== null && feedback.refreshWarning !== null ? (
        <View data-punch-refresh-error>
          <Notice tone="warning">
            今天的安排没刷新成功
            <View className="ui-notice__sub">{feedback.refreshWarning}</View>
          </Notice>
          <Button variant="text" disabled={isBusy} onClick={refresh}>
            再试一次
          </Button>
        </View>
      ) : null}
      {screen === "loading" ? <SkeletonRows rows={3} gap /> : null}
      {screen === "unavailable" ? (
        <MessageView
          title="打卡安排没读到"
          problem={error}
          primary={{ label: "重新读取", onClick: refresh }}
          secondary={{
            label: "我的项目",
            onClick: () => {
              void Taro.redirectTo({ url: "/pages/my-projects/index" });
            },
          }}
        />
      ) : null}
      {screen === "stale" ? (
        <MessageView
          title="日期已经变了"
          sub="原来的定位、照片和核验都作废了，重新读取今天的安排。"
          primary={{ label: "重新读取", onClick: refresh }}
        />
      ) : null}
      {screen === "result" && recordedResult !== null ? (
        <View
          data-punch-state={recordedResult.abnormal ? "abnormal" : "success"}
        >
          <ResultView
            card={cardName({ label: recordedResult.label })}
            time={recordedResult.time}
            abnormal={recordedResult.abnormal}
            alreadyRecorded={recordedResult.alreadyRecorded}
            place={place}
            distanceM={recordedResult.distanceM}
            demo={isDemoFace}
            nextCard={pointCode === null ? null : recordedResult.nextCard}
            onHome={goHome}
            onRecords={viewRecords}
            onContinue={() => setSuccess(null)}
          />
        </View>
      ) : null}
      {screen === "blocked" ? renderBlocked() : null}
      {screen === "points" && today !== null ? (
        <PointsView
          shiftName={today.shiftName}
          points={pointRows}
          selectedCode={pointCode}
          canSelect={(code) =>
            !isBusy &&
            canSelectPunchPoint(today, code) &&
            taskPunchBlock(today, Date.now()) === null
          }
          overtime={
            requestedTaskId === null &&
            activeProject?.taskAttendanceOnly !== true
              ? { active: overtimeMode }
              : null
          }
          onSelect={(code) => {
            if (code !== pointCode) resetEvidence();
            setPointCode(code);
            setSuccess(null);
            setShowPoints(false);
          }}
          onOvertime={() => {
            void Taro.redirectTo({
              url: `/pages/punch/index?projectId=${projectId}${overtimeMode ? "" : "&mode=overtime"}`,
            });
          }}
          onOvertimeMakeup={() => {
            void Taro.navigateTo({
              url: `/pages/submit-makeup/index?projectId=${projectId}&mode=overtime`,
            });
          }}
        />
      ) : null}
      {screen === "locate" && today !== null && selected ? (
        <View data-punch-state="location">
          <LocateView
            locating={phase === "LOCATING"}
            taking={phase === "PHOTO"}
            location={location?.context === context.current ? location : null}
            problem={inside ? null : (locationError ?? feedback.actionError)}
            photoProblem={feedback.actionError}
            locationDenied={deniedPermissions.location}
            cameraDenied={deniedPermissions.camera}
            projectName={activeProject?.projectName ?? "工地"}
            geofence={today.geofence}
            card={`${selected.label} ${selected.scheduledTime}`}
            taskName={requestedTaskId !== null ? today.taskName : undefined}
            demo={
              FRONTEND_DEMO
                ? {
                    value: demoPosition,
                    onChange: (value) => {
                      if (busy.current) return;
                      resetEvidence();
                      setDemoPosition(value);
                    },
                  }
                : undefined
            }
            onLocate={() => {
              if (projectId !== null && pointCode !== null)
                void locate(projectId, pointCode, today);
            }}
            onPhoto={() => {
              void pickSitePhoto();
            }}
            onSettings={() => {
              void openPermissionSettings();
            }}
            onPoints={() => setShowPoints(true)}
            onSite={() => {
              void Taro.navigateTo({
                url: `/pages/my-project-detail/index?projectId=${encodeURIComponent(projectId!)}`,
              });
            }}
          />
        </View>
      ) : null}
      {screen === "photo" && sitePhotoPath !== null ? (
        <View data-punch-state="photo">
          <PhotoView
            path={sitePhotoPath}
            taking={phase === "PHOTO"}
            problem={feedback.actionError}
            onNext={() => setPhotoReviewed(true)}
            onRetake={() => {
              void pickSitePhoto();
            }}
          />
        </View>
      ) : null}
      {screen === "face" ? (
        <View data-punch-state="face">
          <FaceView
            phase={
              phase === "PREPARING"
                ? "preparing"
                : phase === "VERIFYING"
                  ? "verifying"
                  : "ready"
            }
            demo={isDemoFace}
            resume={pendingNative !== null}
            expired={proofExpired}
            problem={feedback.actionError}
            onStart={() => {
              void startFacePunch();
            }}
            onRetake={() => {
              void pickSitePhoto();
            }}
          />
        </View>
      ) : null}
      {screen === "saving" ? (
        <View data-punch-state="saving">
          <SavingView
            state={
              phase === "SUBMITTING"
                ? "saving"
                : step.action === "location-settings"
                  ? "settings"
                  : "retry"
            }
            demo={isDemoFace}
            problem={feedback.actionError}
            onRetry={() => {
              void retrySubmit();
            }}
            onSettings={() => {
              void openPermissionSettings();
            }}
          />
        </View>
      ) : null}
      {/* 交底从进页面起就挂着读取，轮到第 3 步才显示。 */}
      {projectId !== null &&
      today !== null &&
      pointCode !== null &&
      !staleDate &&
      recordedResult === null &&
      !blocked ? (
        <AttendanceSafetyCard
          key={context.current}
          projectId={projectId}
          pointCode={pointCode}
          context={context.current}
          revision={safetyRevision}
          active={screen === "safety"}
          disabled={isBusy || !inside || sitePhotoPath === null}
          receipt={safetyReady ? safetyReceipt : null}
          onConfirmed={confirmSafety}
        />
      ) : null}
    </Screen>
  );
}
