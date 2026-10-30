import { Map, View } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useEffect, useState } from "react";
import type { MyProjectDetail, ProjectContact } from "@construction/domain";

import {
  Button,
  ListItem,
  Notice,
  PageHeader,
  Screen,
  Section,
  StateView,
  Subtitle,
} from "../../components/ui/index";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { useSessionGuard } from "../../hooks/use-session-guard";
import { permissionLevel } from "../../routing/permissionLevels";
import { fetchAttendanceToday, fetchMyProjectDetail } from "../../services/me";
import type { AttendanceToday } from "../../services/me.types";
import { projectPunchUrl } from "../../services/project-attendance";
import { projectMapBounds } from "../../services/project-location";
import {
  chinaToday,
  formatChinaDate,
  formatChinaHm,
} from "../../services/time";
import { workerProjectStatus } from "../../services/worker-home";
import pin from "../../assets/icons/pin.png";
import "./index.scss";

const statusLabel: Readonly<Record<MyProjectDetail["status"], string>> = {
  PREPARING: "筹备中",
  ACTIVE: "进行中",
  SUSPENDED: "已暂停",
  COMPLETED: "已完工",
};
const errorMessage = (cause: unknown): string => {
  if (cause instanceof Error) return cause.message;
  if (typeof cause === "object" && cause !== null && "errMsg" in cause)
    return String(cause.errMsg);
  return "操作未完成，请重试。";
};

export default function MyProjectDetailPage(): JSX.Element {
  useSessionGuard();
  const projectId: string | undefined = useRouter().params.projectId;
  const { revision, refresh } = usePageRefresh();
  const [project, setProject] = useState<MyProjectDetail | null>(null);
  const [today, setToday] = useState<AttendanceToday | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const date: string = chinaToday();
  useEffect(() => {
    if (!projectId) return;
    let cancelled: boolean = false;
    setProject(null);
    setToday(null);
    setError(null);
    setScheduleError(null);
    setActionError(null);
    void fetchMyProjectDetail(projectId).then(
      (data) => {
        if (!cancelled) setProject(data);
      },
      (cause: unknown) => {
        if (!cancelled) setError(errorMessage(cause));
      },
    );
    void fetchAttendanceToday(projectId).then(
      (data) => {
        if (cancelled) return;
        if (data.attendanceDate !== chinaToday())
          setScheduleError("日期已变化，请刷新今日安排。");
        else setToday(data);
      },
      (cause: unknown) => {
        if (!cancelled) setScheduleError(errorMessage(cause));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [projectId, revision, date]);
  const callContact = async (phone: string): Promise<void> => {
    setActionError(null);
    try {
      await Taro.makePhoneCall({ phoneNumber: phone });
    } catch (cause: unknown) {
      setActionError(errorMessage(cause));
    }
  };
  const showLocation = async (): Promise<void> => {
    if (!project) return;
    setActionError(null);
    try {
      await Taro.openLocation({
        latitude: Number(project.centerLatitude),
        longitude: Number(project.centerLongitude),
        name: project.projectName,
        address: project.address,
        scale: 16,
      });
    } catch (cause: unknown) {
      setActionError(errorMessage(cause));
    }
  };
  const contactRow = (
    label: string,
    contact: ProjectContact | null,
    key: string,
  ): JSX.Element => (
    <ListItem
      key={key}
      primary={`${label} · ${contact?.name ?? "未设置"}`}
      secondary={contact?.phone ?? "暂无联系电话"}
      chip={contact?.phone ? "拨打" : undefined}
      onClick={
        contact?.phone
          ? () => {
              void callContact(contact.phone!);
            }
          : undefined
      }
    />
  );
  const canPunch: boolean =
    project?.status === "ACTIVE" &&
    project.requiresAttendance &&
    today !== null &&
    today.attendanceDate === date &&
    today.configured &&
    today.isWorkday &&
    today.points.some((point) => point.record === null);
  return (
    <Screen>
      <PageHeader title="项目详情" />
      {!projectId ? (
        <StateView title="请从我的项目选择工地" />
      ) : error ? (
        <StateView title="无法读取项目详情" sub={error} onRetry={refresh} />
      ) : project === null ? (
        <StateView title="正在读取项目详情…" />
      ) : (
        <>
          <View className="worker-project-hero">
            <View className="worker-project-company">
              {project.companyName}
            </View>
            <View className="worker-project-title">{project.projectName}</View>
            <View className="worker-project-tags">
              <View>{statusLabel[project.status]}</View>
              <View>{project.team?.name ?? "项目直属"}</View>
              <View>{project.workType ?? "工种未登记"}</View>
            </View>
          </View>
          <View className="worker-project-actions">
            <Button
              disabled={!canPunch}
              onClick={() => {
                if (canPunch)
                  void Taro.navigateTo({
                    url: projectPunchUrl(project.projectId),
                  });
              }}
            >
              进入项目打卡
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                void Taro.navigateTo({
                  url: `/pages/my-records/index?projectId=${encodeURIComponent(project.projectId)}`,
                });
              }}
            >
              本项目考勤
            </Button>
          </View>
          <Section title="今日安排" sub={date}>
            {scheduleError ? (
              <StateView
                title="打卡安排读取失败"
                sub={scheduleError}
                onRetry={refresh}
              />
            ) : today === null ? (
              <Subtitle>正在读取安排…</Subtitle>
            ) : (
              <>
                <View className="worker-project-schedule-heading">
                  {!project.requiresAttendance
                    ? "本项目无需考勤"
                    : project.status !== "ACTIVE"
                      ? "项目当前未开放打卡"
                      : workerProjectStatus(today, new Date().toISOString())}
                </View>
                <Subtitle>{today.shiftName ?? "尚未配置打卡安排"}</Subtitle>
                {today.points.map((point) => (
                  <View className="worker-project-point" key={point.pointCode}>
                    <View className="worker-project-point-time">
                      {point.scheduledTime}
                    </View>
                    <View className="worker-project-point-main">
                      <View>{point.label}</View>
                      <View className="worker-project-muted">
                        {point.kind === "START"
                          ? "迟到宽限"
                          : point.kind === "END"
                            ? "早退宽限"
                            : "时间宽限"}{" "}
                        {point.graceMins} 分钟
                      </View>
                    </View>
                    <View
                      className={
                        point.record?.status === "INVALID"
                          ? "worker-project-danger"
                          : "worker-project-muted"
                      }
                    >
                      {point.record
                        ? `${point.record.status === "VALID" ? "已打" : "异常"} ${formatChinaHm(point.record.occurredAt)}`
                        : "待打卡"}
                    </View>
                  </View>
                ))}
                <View className="worker-project-muted worker-project-footnote">
                  按本人今日生效安排执行；时间和次数由上级设置。
                </View>
              </>
            )}
          </Section>
          <Section title="工地位置">
            <View className="worker-project-address">{project.address}</View>
            <View className="worker-project-radius">
              允许打卡范围：工地中心周边{" "}
              <View>{project.geofenceRadiusM} 米</View>
            </View>
            {process.env.TARO_ENV === "weapp" ? (
              <>
                <Map
                  id="worker-project-map"
                  className="worker-project-map"
                  latitude={Number(project.centerLatitude)}
                  longitude={Number(project.centerLongitude)}
                  includePoints={projectMapBounds(project)}
                  scale={16}
                  showScale
                  enableRotate={false}
                  markers={[
                    {
                      id: 1,
                      latitude: Number(project.centerLatitude),
                      longitude: Number(project.centerLongitude),
                      iconPath: pin,
                      width: 28,
                      height: 28,
                      title: project.projectName,
                    },
                  ]}
                  circles={[
                    {
                      latitude: Number(project.centerLatitude),
                      longitude: Number(project.centerLongitude),
                      radius: project.geofenceRadiusM,
                      color: "#1462CC",
                      fillColor: "#1462CC20",
                      strokeWidth: 2,
                    },
                  ]}
                  onError={() =>
                    setActionError("地图加载失败，请检查网络后重试。")
                  }
                />
                <Button
                  variant="outline"
                  onClick={() => {
                    void showLocation();
                  }}
                >
                  打开工地地图
                </Button>
              </>
            ) : (
              <View className="worker-project-map-note">
                在微信小程序中可查看地图上的圆形范围，并打开工地位置。
              </View>
            )}
            <Subtitle>
              打卡时自动获取当前位置，范围内才可继续拍照和刷脸。
              {project.locationAccuracyLimitM === null
                ? ""
                : `定位精度须在 ${project.locationAccuracyLimitM} 米以内。`}
            </Subtitle>
          </Section>
          <Section title="我在项目中">
            <ListItem
              primary="本人职级"
              secondary={project.roles
                .map(
                  (role) =>
                    `${permissionLevel(role.roleCode).name}${role.teamName ? `（${role.teamName}）` : ""}`,
                )
                .join("、")}
            />
            <ListItem primary="工种" secondary={project.workType ?? "未登记"} />
            <ListItem
              primary="所属班组"
              secondary={project.team?.name ?? "项目直属 · 未分配班组"}
            />
            <ListItem
              primary="入场日期"
              secondary={formatChinaDate(project.enteredAt)}
            />
          </Section>
          <Section title="联系负责人">
            {project.team
              ? contactRow("班组长", project.team.leader, "leader")
              : null}
            {project.managers.length ? (
              project.managers.map((contact, index) =>
                contactRow("项目负责人", contact, `manager-${index}`),
              )
            ) : (
              <ListItem
                primary="项目负责人"
                secondary="暂未设置，请联系现场联系人"
              />
            )}
            {project.contact
              ? contactRow("现场联系人", project.contact, "site")
              : null}
          </Section>
          <Section title="打卡要求">
            <ListItem
              primary="定位 → 现场照片 → 活体人脸核验"
              secondary="请先录入本人底照并通过审核，每次提交后确认打卡结果。"
            />
            <ListItem
              primary="计工说明"
              secondary="目前记录出勤和实际工时，正常工日、零星工时、加班工时尚未分开核算。"
            />
          </Section>
          {actionError ? <Notice>{actionError}</Notice> : null}
        </>
      )}
    </Screen>
  );
}
