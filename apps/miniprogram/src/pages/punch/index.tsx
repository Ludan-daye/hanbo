import { Image, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button, Field, ListItem, PageHeader, Screen, StateView, Subtitle } from "../../components/ui/index";
import { fetchAttendanceToday, fetchMyProjects, submitAttendanceRecord } from "../../services/me";
import { formatChinaHm } from "../../services/time";
import { uploadImage } from "../../services/uploads";
import type { AttendancePointCode, AttendanceToday, MyProjectMembership } from "../../services/me.types";

const POINT_LABEL: Record<AttendancePointCode, string> = {
  SEGMENT_1_END: "上午下班",
  SEGMENT_1_START: "上午上班",
  SEGMENT_2_END: "下午下班",
  SEGMENT_2_START: "下午上班"
};

const REASON_LABEL: Record<string, string> = {
  FACE_NOT_PASSED: "人脸未通过",
  OUTSIDE_GEOFENCE: "超出围栏"
};

const toRadians = (value: number): number => (value * Math.PI) / 180;

const distanceMeters = (fromLat: number, fromLng: number, toLat: number, toLng: number): number => {
  const earthRadiusM = 6371000;
  const latDelta = toRadians(toLat - fromLat);
  const lngDelta = toRadians(toLng - fromLng);
  const haversine =
    Math.sin(latDelta / 2) ** 2 + Math.cos(toRadians(fromLat)) * Math.cos(toRadians(toLat)) * Math.sin(lngDelta / 2) ** 2;
  return 2 * earthRadiusM * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

const reasonText = (reason: string | null): string => {
  if (reason === null) return "正常";
  return REASON_LABEL[reason] ?? reason;
};

export default function Punch(): JSX.Element {
  const [projects, setProjects] = useState<ReadonlyArray<MyProjectMembership> | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [today, setToday] = useState<AttendanceToday | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<AttendancePointCode | null>(null);
  const [latitude, setLatitude] = useState<string>("");
  const [longitude, setLongitude] = useState<string>("");
  const [accuracy, setAccuracy] = useState<string | null>(null);
  const [selfiePath, setSelfiePath] = useState<string | null>(null);
  const [sitePhotoPath, setSitePhotoPath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadSeq = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await fetchMyProjects();
        if (!cancelled) {
          setProjects(rows);
          if (rows.length > 0) {
            setProjectId(rows[0].projectId);
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "REQUEST_FAILED");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const position = await Taro.getLocation({ type: "gcj02" });
        setLatitude(position.latitude.toFixed(7));
        setLongitude(position.longitude.toFixed(7));
        setAccuracy(position.accuracy === undefined ? null : String(position.accuracy));
      } catch {
        // H5 on non-HTTPS origins blocks geolocation — the manual fields below are the fallback.
      }
    })();
  }, []);

  const loadToday = useCallback(async (pid: string): Promise<void> => {
    const seq = ++loadSeq.current;
    setToday(null);
    setSelectedPoint(null);
    setError(null);
    try {
      const data = await fetchAttendanceToday(pid);
      if (seq !== loadSeq.current) return;
      setToday(data);
      const firstOpen = data.points.find((p) => p.record === null);
      setSelectedPoint(firstOpen === undefined ? null : firstOpen.pointCode);
    } catch (e) {
      if (seq !== loadSeq.current) return;
      setError(e instanceof Error ? e.message : "REQUEST_FAILED");
    }
  }, []);

  useEffect(() => {
    if (projectId !== null) {
      void loadToday(projectId);
    }
  }, [projectId, loadToday]);

  const pickImage = async (target: "selfie" | "site"): Promise<void> => {
    try {
      const res = await Taro.chooseImage({ count: 1, sizeType: ["compressed"], sourceType: ["album", "camera"] });
      const path = res.tempFilePaths[0];
      if (path === undefined) return;
      if (target === "selfie") {
        setSelfiePath(path);
      } else {
        setSitePhotoPath(path);
      }
    } catch {
      // user cancelled the picker
    }
  };

  const fillProjectCenter = (): void => {
    if (today === null) return;
    setLatitude(today.geofence.centerLatitude);
    setLongitude(today.geofence.centerLongitude);
  };

  const distanceHint = (): string | null => {
    if (today === null || latitude.trim().length === 0 || longitude.trim().length === 0) return null;
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const d = distanceMeters(Number(today.geofence.centerLatitude), Number(today.geofence.centerLongitude), lat, lng);
    return `距工地中心 ${Math.round(d)}m · ${d <= today.geofence.radiusM ? "围栏内" : "围栏外"}`;
  };

  const canSubmit =
    !busy &&
    selectedPoint !== null &&
    latitude.trim().length > 0 &&
    longitude.trim().length > 0 &&
    selfiePath !== null &&
    sitePhotoPath !== null;

  const submit = async (): Promise<void> => {
    if (projectId === null || today === null || selectedPoint === null || selfiePath === null || sitePhotoPath === null || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const fresh = await fetchAttendanceToday(projectId);
      setToday(fresh);
      const selfie = await uploadImage(selfiePath);
      const sitePhoto = await uploadImage(sitePhotoPath);
      const response = await submitAttendanceRecord(projectId, {
        attendanceDate: fresh.attendanceDate,
        latitude: latitude.trim(),
        locationAccuracyM: accuracy,
        longitude: longitude.trim(),
        occurredAt: new Date().toISOString(),
        pointCode: selectedPoint,
        selfieHash: selfie.hash,
        selfieObjectKey: selfie.objectKey,
        sitePhotoHash: sitePhoto.hash,
        sitePhotoObjectKey: sitePhoto.objectKey
      });
      const reason = response.record.abnormalReason;
      await Taro.showToast({
        icon: reason === null ? "success" : "none",
        title: reason === null ? "打卡成功·正常" : `打卡成功·异常(${reasonText(reason)})`
      });
      setSelfiePath(null);
      setSitePhotoPath(null);
      await loadToday(projectId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "REQUEST_FAILED");
      await Taro.showToast({ icon: "none", title: "打卡失败" });
    } finally {
      setBusy(false);
    }
  };

  const pointChip = (pointCode: AttendancePointCode): string | undefined => {
    if (today === null) return undefined;
    const point = today.points.find((p) => p.pointCode === pointCode);
    if (point === undefined) return undefined;
    if (point.record !== null) {
      return point.record.status === "VALID" ? "正常" : "异常";
    }
    return pointCode === selectedPoint ? "已选" : undefined;
  };

  return (
    <Screen>
      <PageHeader title="打卡" />
      {projects === null && error === null ? <StateView title="加载中…" /> : null}
      {projects !== null && projects.length === 0 ? (
        <StateView title="尚未加入任何项目" sub="请等待管理员把你加入项目。" />
      ) : null}
      {projects !== null && projects.length > 1 ? (
        <View>
          {projects.map((p) => (
            <ListItem
              key={p.projectId}
              primary={p.projectName}
              secondary={`${p.projectRoleLabel} · ${p.teamName ?? "无班组"}`}
              chip={p.projectId === projectId ? "已选" : undefined}
              onClick={() => {
                if (busy) return;
                setProjectId(p.projectId);
              }}
            />
          ))}
        </View>
      ) : null}
      {projectId !== null && today === null && error === null ? <StateView title="加载今日排班…" /> : null}
      {today !== null && !today.configured ? (
        <StateView title="项目未配置排班" sub="请联系项目管理员配置默认班次与作息。" />
      ) : null}
      {today !== null && today.configured && !today.isWorkday ? (
        <StateView title="今天休息" sub={`${today.attendanceDate} 不是工作日。`} />
      ) : null}
      {today !== null && today.configured && today.isWorkday ? (
        <View>
          <Subtitle>
            {today.attendanceDate} · {today.shiftName ?? ""}
          </Subtitle>
          {today.points.map((point) => (
            <ListItem
              key={point.pointCode}
              primary={`${POINT_LABEL[point.pointCode]} · ${point.scheduledTime}`}
              secondary={
                point.record !== null
                  ? `已打 ${formatChinaHm(point.record.occurredAt)} · ${reasonText(point.record.abnormalReason)}`
                  : `宽限 ${point.graceMins} 分钟`
              }
              chip={pointChip(point.pointCode)}
              onClick={
                point.record === null
                  ? () => {
                      setSelectedPoint(point.pointCode);
                    }
                  : undefined
              }
            />
          ))}
          <Field value={latitude} placeholder="纬度(定位失败时手动输入)" onInput={setLatitude} />
          <Field value={longitude} placeholder="经度(定位失败时手动输入)" onInput={setLongitude} />
          <Button variant="outline" onClick={fillProjectCenter}>
            填入项目中心
          </Button>
          {distanceHint() !== null ? <Subtitle>{distanceHint()}</Subtitle> : null}
          <Button variant="outline" onClick={() => void pickImage("selfie")}>
            {selfiePath === null ? "拍自拍照" : "重拍自拍照"}
          </Button>
          {selfiePath !== null ? <Image src={selfiePath} style={{ height: "160rpx", width: "160rpx" }} /> : null}
          <Button variant="outline" onClick={() => void pickImage("site")}>
            {sitePhotoPath === null ? "拍现场照" : "重拍现场照"}
          </Button>
          {sitePhotoPath !== null ? <Image src={sitePhotoPath} style={{ height: "160rpx", width: "160rpx" }} /> : null}
          <Button
            onClick={() => {
              if (canSubmit) {
                void submit();
              }
            }}
          >
            {busy ? "提交中…" : selectedPoint === null ? "今日已全部打卡" : `打卡 · ${POINT_LABEL[selectedPoint]}`}
          </Button>
        </View>
      ) : null}
      {error !== null ? <StateView title="错误" sub={error} /> : null}
    </Screen>
  );
}
