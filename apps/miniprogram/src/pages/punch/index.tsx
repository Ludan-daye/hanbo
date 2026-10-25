import { Button as NativeButton, Image, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useCallback, useEffect, useRef, useState } from "react";
import { displayProjectRole } from "../../routing/features";
import { useSessionGuard } from "../../hooks/use-session-guard";

import {
  AppIcon,
  Button,
  Field,
  ListItem,
  Notice,
  PageHeader,
  Screen,
  Section,
  StateView,
  Subtitle,
} from "../../components/ui/index";
import { FRONTEND_DEMO } from "../../config/env";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import {
  fetchAttendanceToday,
  fetchMyProjects,
  submitAttendanceRecord,
} from "../../services/me";
import { formatChinaHm } from "../../services/time";
import { uploadImage } from "../../services/uploads";
import {
  completeFaceSession,
  createFaceSession,
  createVideoFaceSession,
  fetchVideoFaceResult,
  uploadFaceVideo,
  fetchMyFace,
  type MyFace,
} from "../../services/face";
import {
  nativeFaceSdkAvailable,
  verifyWithNativeFaceSdk,
} from "../../services/face-sdk";
import type {
  AttendancePointCode,
  AttendanceToday,
  MyProjectMembership,
} from "../../services/me.types";

import { VideoFaceCapture } from "../../components/video-face-capture/index";

import "./index.scss";

const POINT_LABEL: Readonly<Record<AttendancePointCode, string>> = {
  SEGMENT_1_END: "上午下班",
  SEGMENT_1_START: "上午上班",
  SEGMENT_2_END: "下午下班",
  SEGMENT_2_START: "下午上班",
};
const REASON_LABEL: Readonly<Record<string, string>> = {
  FACE_NOT_PASSED: "人脸核验未通过",
  OUTSIDE_GEOFENCE: "超出考勤范围",
};
const reasonText = (reason: string | null): string =>
  reason === null ? "正常" : (REASON_LABEL[reason] ?? reason);
const errorText = (reason: unknown): string => {
  if (reason instanceof Error) return reason.message;
  if (
    typeof reason === "object" &&
    reason !== null &&
    "errMsg" in reason &&
    typeof reason.errMsg === "string"
  )
    return reason.errMsg;
  return "操作未完成，请重试";
};
const toRadians = (value: number): number => (value * Math.PI) / 180;
const distanceMeters = (
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
): number => {
  const lat = toRadians(toLat - fromLat);
  const lng = toRadians(toLng - fromLng);
  const value =
    Math.sin(lat / 2) ** 2 +
    Math.cos(toRadians(fromLat)) *
      Math.cos(toRadians(toLat)) *
      Math.sin(lng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
};
const nextOpenPoint = (today: AttendanceToday): AttendancePointCode | null => {
  const points = today.points.filter((point) => point.record === null);
  const currentTime = formatChinaHm(new Date().toISOString());
  const due = points.filter((point) => point.scheduledTime <= currentTime);
  return (due[due.length - 1] ?? points[0])?.pointCode ?? null;
};
type PunchSuccess = {
  readonly label: string;
  readonly time: string;
  readonly reason: string | null;
};
type PunchFaceProof = {
  readonly id: string;
  readonly projectId: string;
  readonly pointCode: AttendancePointCode;
  readonly attendanceDate: string;
  readonly expiresAt: string;
};

export default function Punch(): JSX.Element {
  useSessionGuard();
  const { revision, refresh } = usePageRefresh();
  const [projects, setProjects] = useState<
    readonly MyProjectMembership[] | null
  >(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [today, setToday] = useState<AttendanceToday | null>(null);
  const [selectedPoint, setSelectedPoint] =
    useState<AttendancePointCode | null>(null);
  const [latitude, setLatitude] = useState<string>("");
  const [longitude, setLongitude] = useState<string>("");
  const [accuracy, setAccuracy] = useState<string | null>(null);
  const [selfiePath, setSelfiePath] = useState<string | null>(null);
  const [sitePhotoPath, setSitePhotoPath] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const [locating, setLocating] = useState<boolean>(false);
  const [demoOpen, setDemoOpen] = useState<boolean>(FRONTEND_DEMO && process.env.TARO_ENV === "h5");
  const [locationError, setLocationError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<PunchSuccess | null>(null);
  const [faceInfo, setFaceInfo] = useState<MyFace | null>(null);
  const [faceProof, setFaceProof] = useState<PunchFaceProof | null>(null);
  const [pendingFaceSession, setPendingFaceSession] = useState<PunchFaceProof | null>(null);
  const [videoCaptureActive, setVideoCaptureActive] = useState<boolean>(false);
  const [verifying, setVerifying] = useState<boolean>(false);
  useEffect(() => {
    if (faceProof === null) return;
    const timer = setTimeout(
      () => {
        setFaceProof(null);
      },
      Math.max(0, new Date(faceProof.expiresAt).getTime() - Date.now()),
    );
    return () => {
      clearTimeout(timer);
    };
  }, [faceProof]);
  useEffect(() => {
    if (pendingFaceSession === null) return;
    const timer = setTimeout(
      () => setPendingFaceSession(null),
      Math.max(0, new Date(pendingFaceSession.expiresAt).getTime() - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [pendingFaceSession]);
  const loadSeq = useRef<number>(0);
  useEffect(() => {
    let cancelled = false;
    void fetchMyFace().then(
      (result) => {
        if (!cancelled) setFaceInfo(result);
      },
      (reason: unknown) => {
        if (!cancelled) setError(errorText(reason));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [revision]);
  useEffect(() => {
    let cancelled = false;
    setError(null);
    void fetchMyProjects().then(
      (rows) => {
        if (!cancelled) {
          setProjects(rows);
          setProjectId((current) =>
            current !== null && rows.some((row) => row.projectId === current)
              ? current
              : (rows[0]?.projectId ?? null),
          );
        }
      },
      (reason) => {
        if (!cancelled) setError(errorText(reason));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [revision]);
  const loadToday = useCallback(async (pid: string): Promise<void> => {
    const seq = ++loadSeq.current;
    setToday(null);
    setError(null);
    try {
      const data = await fetchAttendanceToday(pid);
      if (seq !== loadSeq.current) return;
      setToday(data);
      setSelectedPoint((current) =>
        data.points.some(
          (point) => point.pointCode === current && point.record === null,
        )
          ? current
          : nextOpenPoint(data),
      );
    } catch (reason) {
      if (seq === loadSeq.current) setError(errorText(reason));
    }
  }, []);
  useEffect(() => {
    if (projectId !== null) void loadToday(projectId);
  }, [projectId, revision, loadToday]);
  const locate = async (): Promise<void> => {
    if (locating || busy) return;
    setLocating(true);
    setLocationError(null);
    setLatitude("");
    setLongitude("");
    setAccuracy(null);
    try {
      const position = await Taro.getLocation({ type: "gcj02" });
      setLatitude(position.latitude.toFixed(7));
      setLongitude(position.longitude.toFixed(7));
      setAccuracy(
        position.accuracy === undefined ? null : String(position.accuracy),
      );
    } catch (reason) {
      setLocationError(
        `定位未完成，请检查定位权限后重试。(${errorText(reason)})`,
      );
    } finally {
      setLocating(false);
    }
  };
  const choosePhoto = async (): Promise<string | null> => {
    const result = await Taro.chooseImage({
      count: 1,
      sizeType: ["compressed"],
      sourceType:
        process.env.TARO_ENV === "h5" ? ["album", "camera"] : ["camera"],
    });
    const file = result.tempFiles[0];
    if (file !== undefined && file.size > 5 * 1024 * 1024)
      throw new Error("图片不能超过 5MB，请重新拍摄或选择较小的图片。");
    return result.tempFilePaths[0] ?? null;
  };
  const pickSelfie = async (): Promise<void> => {
    if (busy) return;
    try {
      const path = await choosePhoto();
      if (path !== null) setSelfiePath(path);
    } catch (reason) {
      if (!errorText(reason).toLowerCase().includes("cancel"))
        setError(errorText(reason));
    }
  };
  const pickSitePhoto = async (): Promise<void> => {
    if (busy) return;
    try {
      const path = await choosePhoto();
      if (path !== null) setSitePhotoPath(path);
    } catch (reason) {
      if (!errorText(reason).toLowerCase().includes("cancel"))
        setError(errorText(reason));
    }
  };
  const verifyFace = async (): Promise<void> => {
    if (
      busy ||
      verifying ||
      projectId === null ||
      selectedPoint === null ||
      today === null
    )
      return;
    setError(null);
    setFaceProof(null);
    setVerifying(true);
    if (faceInfo?.mode === "VIDEO_ACTION") { setVideoCaptureActive(true); return; }
    try {
      if (!nativeFaceSdkAvailable())
        throw new Error(
          process.env.TARO_ENV === "h5"
            ? "请在微信小程序内完成人脸核验，浏览器不支持此功能。"
            : "当前版本暂不支持人脸核验，请联系管理员。",
        );
      let attempt: PunchFaceProof;
      if (
        pendingFaceSession !== null &&
        pendingFaceSession.projectId === projectId &&
        pendingFaceSession.pointCode === selectedPoint &&
        pendingFaceSession.attendanceDate === today.attendanceDate &&
        new Date(pendingFaceSession.expiresAt).getTime() > Date.now()
      ) {
        attempt = pendingFaceSession;
      } else {
        const session = await createFaceSession(projectId, selectedPoint);
        await verifyWithNativeFaceSdk(session.bizToken);
        attempt = {
          id: session.id,
          projectId,
          pointCode: selectedPoint,
          attendanceDate: today.attendanceDate,
          expiresAt: session.expiresAt,
        };
        setPendingFaceSession(attempt);
      }
      const result = await completeFaceSession(
        projectId,
        selectedPoint,
        attempt.id,
      );
      if (result.status !== "VERIFIED") {
        setPendingFaceSession(null);
        throw new Error("活体检测或本人比对未通过，请调整光线后重新核验。");
      }
      setPendingFaceSession(null);
      setFaceProof({
        id: result.id,
        projectId,
        pointCode: selectedPoint,
        attendanceDate: today.attendanceDate,
        expiresAt: result.expiresAt,
      });
    } catch (reason: unknown) {
      setError(errorText(reason));
    } finally {
      setVerifying(false);
    }
  };
  const hasFaceProof =
    faceProof !== null &&
    faceProof.projectId === projectId &&
    faceProof.pointCode === selectedPoint &&
    faceProof.attendanceDate === today?.attendanceDate &&
    new Date(faceProof.expiresAt).getTime() > Date.now();
  const hasPendingFaceResult =
    pendingFaceSession !== null &&
    pendingFaceSession.projectId === projectId &&
    pendingFaceSession.pointCode === selectedPoint &&
    pendingFaceSession.attendanceDate === today?.attendanceDate &&
    new Date(pendingFaceSession.expiresAt).getTime() > Date.now();
  const isDemoFace = FRONTEND_DEMO && faceInfo?.mode === "DEVELOPMENT";
  const hasLocation =
    latitude.trim() !== "" &&
    longitude.trim() !== "" &&
    Number.isFinite(Number(latitude)) &&
    Number.isFinite(Number(longitude)) &&
    Math.abs(Number(latitude)) <= 90 &&
    Math.abs(Number(longitude)) <= 180;
  const distance =
    today !== null && hasLocation
      ? distanceMeters(
          Number(today.geofence.centerLatitude),
          Number(today.geofence.centerLongitude),
          Number(latitude),
          Number(longitude),
        )
      : null;
  const inside =
    today !== null && distance !== null && distance <= today.geofence.radiusM;
  const canSubmit =
    !busy &&
    !verifying &&
    !locating &&
    selectedPoint !== null &&
    hasLocation &&
    (isDemoFace
      ? selfiePath !== null
      : (faceInfo?.mode === "WECHAT_NATIVE" || faceInfo?.mode === "VIDEO_ACTION") && hasFaceProof) &&
    sitePhotoPath !== null;
  const submit = async (): Promise<void> => {
    if (
      !canSubmit ||
      projectId === null ||
      today === null ||
      selectedPoint === null ||
      sitePhotoPath === null
    )
      return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const fresh = await fetchAttendanceToday(projectId);
      if (fresh.attendanceDate !== today.attendanceDate) {
        setSelfiePath(null);
        setSitePhotoPath(null);
        await loadToday(projectId);
        throw new Error("日期已变化，今日排班已更新，请重新拍照打卡。");
      }
      if (
        fresh.points.some(
          (point) => point.pointCode === selectedPoint && point.record !== null,
        )
      ) {
        await loadToday(projectId);
        throw new Error("这个考勤点已经完成，请选择其他待打卡时段。");
      }
      const sitePhoto = await uploadImage(sitePhotoPath);
      const selfie =
        isDemoFace && selfiePath !== null
          ? await uploadImage(selfiePath)
          : null;
      const response = await submitAttendanceRecord(projectId, {
        attendanceDate: fresh.attendanceDate,
        latitude: latitude.trim(),
        longitude: longitude.trim(),
        locationAccuracyM: accuracy,
        occurredAt: new Date().toISOString(),
        pointCode: selectedPoint,
        ...(selfie !== null
          ? { selfieHash: selfie.hash, selfieObjectKey: selfie.objectKey }
          : { faceVerificationSessionId: faceProof!.id }),
        sitePhotoHash: sitePhoto.hash,
        sitePhotoObjectKey: sitePhoto.objectKey,
      });
      setSuccess({
        label: POINT_LABEL[selectedPoint],
        time: formatChinaHm(response.record.occurredAt),
        reason: response.record.abnormalReason,
      });
      setSelfiePath(null);
      setFaceProof(null);
      setSitePhotoPath(null);
      await loadToday(projectId);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  };
  const activeProject = projects?.find(
    (project) => project.projectId === projectId,
  );
  const completed =
    today?.points.filter((point) => point.record !== null).length ?? 0;
  return (
    <Screen>
      {videoCaptureActive && projectId !== null && selectedPoint !== null && today !== null ? (
        <VideoFaceCapture flow={{
          createSession: () => createVideoFaceSession(projectId,selectedPoint),
          fetchResult: (id) => fetchVideoFaceResult(projectId,selectedPoint,id),
          uploadVideo: (id,path) => uploadFaceVideo(projectId,selectedPoint,id,path),
        }} referenceDescription="与审核过的员工登记照比对，无需身份证照片。"
          onCancel={() => { setVideoCaptureActive(false); setVerifying(false); }}
          onResult={(result) => {
            if (result.status !== "VERIFIED") return;
            setFaceProof({ id: result.id, projectId, pointCode: selectedPoint, attendanceDate: today.attendanceDate, expiresAt: result.expiresAt });
            setVideoCaptureActive(false); setVerifying(false);
          }} />
      ) : null}
      <PageHeader title="考勤打卡" />
      {projects === null && error === null ? (
        <StateView title="加载中…" />
      ) : null}
      {projects?.length === 0 ? (
        <StateView
          title="还没有加入项目"
          sub="请联系管理员分配项目和班组后再打卡。"
        />
      ) : null}
      {activeProject ? (
        <View className="punch-project">
          <View className="punch-project__icon">
            <AppIcon name="building" />
          </View>
          <View>
            <View className="punch-project__name">
              {activeProject.projectName}
            </View>
            <Subtitle>
              {activeProject.teamName ?? "未分配班组"} ·{" "}
              {displayProjectRole(activeProject.projectRoleLabel)}
            </Subtitle>
          </View>
        </View>
      ) : null}
      {projects && projects.length > 1 ? (
        <View>
          {projects.map((project) => (
            <ListItem
              key={project.projectId}
              primary={project.projectName}
              chip={project.projectId === projectId ? "当前项目" : "切换"}
              onClick={() => {
                if (!busy && !verifying) {
                  setProjectId(project.projectId);
                  setSelfiePath(null);
                  setSitePhotoPath(null);
                  setLatitude("");
                  setLongitude("");
                  setAccuracy(null);
                  setSuccess(null);
                }
              }}
            />
          ))}
        </View>
      ) : null}
      {projectId !== null && today === null && error === null ? (
        <StateView title="加载今日排班…" />
      ) : null}
      {today && !today.configured ? (
        <StateView
          title="项目尚未配置排班"
          sub="请联系项目管理员设置班次与工作日期。"
        />
      ) : null}
      {today?.configured && !today.isWorkday ? (
        <StateView title="今天休息，好好充电" sub={today.attendanceDate} />
      ) : null}
      {success ? (
        <View className="punch-success">
          <AppIcon name="check" />
          <View className="punch-success__title">
            {success.reason === null ? "打卡成功" : "已记录异常打卡"}
          </View>
          <Subtitle>
            {success.label} · {success.time} · {reasonText(success.reason)}
          </Subtitle>
          <Button
            variant="outline"
            onClick={() => {
              void Taro.navigateTo({ url: "/pages/my-records/index" });
            }}
          >
            查看我的考勤
          </Button>
        </View>
      ) : null}
      {today?.configured && today.isWorkday ? (
        <View>
          <View className="punch-date">
            <View>
              {today.attendanceDate}
              <Subtitle>{today.shiftName ?? "今日排班"}</Subtitle>
            </View>
            <View className="punch-count">
              <View>{completed}</View> / 4 已完成
            </View>
          </View>
          <View className="punch-points">
            {today.points.map((point) => (
              <NativeButton
                key={point.pointCode}
                disabled={busy || verifying || point.record !== null ? true : undefined}
                className={`punch-point ${point.pointCode === selectedPoint ? "punch-point--selected" : ""} ${point.record ? "punch-point--done" : ""}`}
                onClick={() => {
                  setSelectedPoint(point.pointCode);
                  setSuccess(null);
                }}
              >
                <View className="punch-point__top">
                  {POINT_LABEL[point.pointCode]}
                  <View>
                    {point.record
                      ? point.record.status === "VALID"
                        ? "正常"
                        : "异常"
                      : point.pointCode === selectedPoint
                        ? "当前"
                        : "待打卡"}
                  </View>
                </View>
                <View className="punch-point__time">{point.scheduledTime}</View>
                <View className="punch-point__sub">
                  {point.record
                    ? `已打 ${formatChinaHm(point.record.occurredAt)}`
                    : `宽限 ${point.graceMins} 分钟`}
                </View>
              </NativeButton>
            ))}
          </View>
          {selectedPoint !== null ? (
            <View>
              <Section title="01  确认考勤位置">
                <View className="punch-location">
                  <View className="punch-location__map">
                    <View className="punch-location__circle">
                      <AppIcon name="pin" />
                    </View>
                  </View>
                  <View className="punch-location__body">
                    <View className="punch-location__title">
                      {distance === null
                        ? "等待获取当前位置"
                        : inside
                          ? "已在考勤范围内"
                          : "当前位置在考勤范围外"}
                    </View>
                    <Subtitle>
                      {distance === null
                        ? `项目考勤范围 ${today.geofence.radiusM} 米`
                        : `距工地中心 ${Math.round(distance)} 米 · 范围 ${today.geofence.radiusM} 米`}
                    </Subtitle>
                    {accuracy !== null ? (
                      <Subtitle>定位精度约 {Math.round(Number(accuracy))} 米</Subtitle>
                    ) : null}
                    <Button
                      variant="outline"
                      loading={locating}
                      disabled={busy ? true : undefined}
                      onClick={() => {
                        void locate();
                      }}
                    >
                      {hasLocation ? "重新定位" : "获取当前位置"}
                    </Button>
                  </View>
                </View>
                {locationError ? <Notice>{locationError}</Notice> : null}
                {distance !== null && !inside ? (
                  <Notice>
                    超出考勤范围也可提交，系统会标记为异常记录，请确认当前位置。
                  </Notice>
                ) : null}
              </Section>
              <Section
                title={
                  isDemoFace ? "02  拍摄打卡照片" : "02  本人核验与现场照片"
                }
                sub={
                  isDemoFace
                    ? "当前为开发模拟，请拍摄本人和现场照片"
                    : "完成人脸核验，并拍摄真实工作现场"
                }
              >
                {!isDemoFace && faceInfo !== null && faceInfo.mode !== "WECHAT_NATIVE" && faceInfo.mode !== "VIDEO_ACTION" ? (
                  <Notice>活体核验暂未启用，请联系管理员开通后再打卡。</Notice>
                ) : null}
                {!isDemoFace && faceInfo?.profile?.status !== "APPROVED" ? (
                  <Notice>
                    请先在“我的 → 人脸档案”录入底照，等待管理员审核。
                  </Notice>
                ) : null}
                {!isDemoFace ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      void Taro.navigateTo({
                        url: "/pages/face-profile/index",
                      });
                    }}
                  >
                    查看人脸档案
                  </Button>
                ) : null}
                <View className="punch-photos">
                  {isDemoFace ? (
                    <NativeButton
                      className="punch-photo-card"
                      disabled={busy ? true : undefined}
                      onClick={() => {
                        void pickSelfie();
                      }}
                    >
                      {selfiePath ? (
                        <Image
                          className="punch-photo"
                          src={selfiePath}
                          mode="aspectFill"
                        />
                      ) : (
                        <View className="punch-photo-card__empty">
                          <AppIcon name="user" />
                        </View>
                      )}
                      <View>
                        {selfiePath ? "重新拍摄本人照片" : "拍摄本人照片"}
                      </View>
                      <View className="punch-photo-card__sub">
                        {selfiePath ? "已就绪 · 点击更换" : "正脸清晰无遮挡"}
                      </View>
                    </NativeButton>
                  ) : (
                    <NativeButton
                      className="punch-photo-card"
                      disabled={
                        busy ||
                        verifying ||
                        (faceInfo?.mode !== "WECHAT_NATIVE" && faceInfo?.mode !== "VIDEO_ACTION") ||
                        faceInfo?.profile?.status !== "APPROVED" ||
                        (faceInfo?.mode === "VIDEO_ACTION" ? process.env.TARO_ENV !== "weapp" : !nativeFaceSdkAvailable())
                          ? true
                          : undefined
                      }
                      onClick={() => {
                        void verifyFace();
                      }}
                    >
                      <View className="punch-photo-card__empty">
                        <AppIcon name="shield" />
                      </View>
                      <View>
                        {verifying
                          ? "正在核验…"
                          : hasFaceProof
                            ? "本人核验已完成"
                            : hasPendingFaceResult
                              ? "重试确认核验结果"
                              : "开始活体人脸核验"}
                      </View>
                      <View className="punch-photo-card__sub">
                        {hasFaceProof
                          ? "仅用于本次打卡"
                          : hasPendingFaceResult
                            ? "采集已完成，点击继续查询本次结果"
                            : faceInfo?.mode !== "WECHAT_NATIVE" && faceInfo?.mode !== "VIDEO_ACTION"
                            ? "服务尚未开通"
                            : faceInfo?.mode === "VIDEO_ACTION"
                              ? process.env.TARO_ENV === "weapp" ? "按提示录制动作视频" : "请在微信小程序中核验"
                              : !nativeFaceSdkAvailable()
                              ? "请使用已开通服务的微信小程序"
                              : "正对镜头，按提示完成核验"}
                      </View>
                    </NativeButton>
                  )}
                  <NativeButton
                    className="punch-photo-card"
                    disabled={busy ? true : undefined}
                    onClick={() => {
                      void pickSitePhoto();
                    }}
                  >
                    {sitePhotoPath ? (
                      <Image
                        className="punch-photo"
                        src={sitePhotoPath}
                        mode="aspectFill"
                      />
                    ) : (
                      <View className="punch-photo-card__empty">
                        <AppIcon name="camera" />
                      </View>
                    )}
                    <View>
                      {sitePhotoPath ? "重新拍摄现场照片" : "拍摄现场照片"}
                    </View>
                    <View className="punch-photo-card__sub">
                      {sitePhotoPath ? "已就绪 · 点击更换" : "记录真实工作场景"}
                    </View>
                  </NativeButton>
                </View>
              </Section>
              {(FRONTEND_DEMO || process.env.TARO_ENV === "h5") && isDemoFace ? (
                <View className="punch-demo">
                  <View
                    className="punch-demo__toggle"
                    onClick={() => {
                      if (!busy) setDemoOpen(!demoOpen);
                    }}
                  >
                    演示坐标工具 <View>{demoOpen ? "收起 −" : "展开 +"}</View>
                  </View>
                  {demoOpen ? (
                    <View>
                      <Subtitle>
                        手动坐标仅用于演示。真实定位请点击“获取当前位置”；人脸核验仍为开发模拟。
                      </Subtitle>
                      <Field
                        value={latitude}
                        placeholder="演示纬度"
                        onInput={(value) => {
                          setLatitude(value);
                          setAccuracy(null);
                        }}
                      />
                      <Field
                        value={longitude}
                        placeholder="演示经度"
                        onInput={(value) => {
                          setLongitude(value);
                          setAccuracy(null);
                        }}
                      />
                      <Button
                        variant="outline"
                        disabled={busy ? true : undefined}
                        onClick={() => {
                          setLatitude(today.geofence.centerLatitude);
                          setLongitude(today.geofence.centerLongitude);
                          setAccuracy(null);
                          setLocationError(null);
                        }}
                      >
                        使用演示工地坐标
                      </Button>
                    </View>
                  ) : null}
                </View>
              ) : null}
              <View className="punch-submit">
                <View className="punch-submit__hint">
                  {canSubmit
                    ? "信息已齐全，可以提交打卡"
                    : !hasLocation
                      ? "请先获取当前位置"
                      : isDemoFace
                        ? "请完成本人照片和现场照片"
                        : "请完成人脸核验和现场照片"}
                </View>
                <Button
                  loading={busy}
                  disabled={!canSubmit}
                  onClick={() => {
                    void submit();
                  }}
                >
                  {busy ? "正在提交…" : `确认${POINT_LABEL[selectedPoint]}打卡`}
                </Button>
              </View>
            </View>
          ) : (
            <Notice>今天的四个考勤点都已完成，辛苦了！</Notice>
          )}
        </View>
      ) : null}
      {error ? (
        <StateView title="操作未完成" sub={error} onRetry={refresh} />
      ) : null}
    </Screen>
  );
}
