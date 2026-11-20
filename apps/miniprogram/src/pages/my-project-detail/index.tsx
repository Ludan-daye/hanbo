import { Map, View } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useEffect, useState } from "react";
import type { MyProjectDetail, ProjectContact } from "@construction/domain";

import pin from "../../assets/icons/pin.png";
import {
  BottomBar,
  Button,
  Card,
  CardActions,
  CardMeta,
  CardTitle,
  KV,
  Notice,
  PageHeader,
  Row,
  Screen,
  SectionTitle,
  Sheet,
  SkeletonRows,
  StateView,
} from "../../components/ui/index";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { useSessionGuard } from "../../hooks/use-session-guard";
import { permissionLevel } from "../../routing/permissionLevels";
import { errorMessage, isUserCancel } from "../../services/error-messages";
import { fetchAttendanceToday, fetchMyProjectDetail } from "../../services/me";
import type { AttendanceToday } from "../../services/me.types";
import { projectPunchUrl } from "../../services/project-attendance";
import { projectMapBounds } from "../../services/project-location";
import { chinaToday, formatChinaDate } from "../../services/time";
import { pointStatus } from "../../services/worker-home-sign";
import {
  monthDayLabel,
  pointGrace,
  projectNextPoint,
  projectTodayNote,
  PROJECT_STATUS_LABEL,
} from "./today-view";

import "./index.scss";

/** 拨号、开地图没成功的原因，显示在出问题的那一段下面。 */
type ActionError = {
  readonly at: "contact" | "site";
  readonly text: string;
};

const go = (url: string): void => {
  void Taro.navigateTo({ url });
};

/** 联系人的一行：点一下拨号。号码写在副行，拨不出去时可以照着手动拨。 */
const ContactRow = ({
  role,
  contact,
  onCall,
}: {
  readonly role: string;
  readonly contact: ProjectContact | null;
  readonly onCall: (phone: string) => void;
}): JSX.Element => {
  const name = contact?.name ?? null;
  const phone = contact?.phone ?? null;
  if (name === null && phone === null)
    return <Row title={role} value="还没设置" mute />;
  return (
    <Row
      title={name ?? "没写姓名"}
      sub={phone === null ? role : `${role}，${phone}`}
      avatar={(name ?? role).slice(0, 1)}
      value={phone === null ? "没留电话" : undefined}
      mute={phone === null}
      onClick={phone === null ? undefined : () => onCall(phone)}
    >
      {phone === null ? null : (
        <View className="project-detail__call">拨打</View>
      )}
    </Row>
  );
};

export default function MyProjectDetailPage(): JSX.Element {
  useSessionGuard();
  const projectId: string | undefined = useRouter().params.projectId;
  const { revision, refresh } = usePageRefresh();
  const [project, setProject] = useState<MyProjectDetail | null>(null);
  const [today, setToday] = useState<AttendanceToday | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<ActionError | null>(null);
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
          setScheduleError("日期已经变了，重新读取今天的安排。");
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
      if (!isUserCancel(cause))
        setActionError({ at: "contact", text: errorMessage(cause) });
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
      setActionError({ at: "site", text: errorMessage(cause) });
    }
  };
  const canPunch: boolean =
    project?.status === "ACTIVE" &&
    project.requiresAttendance &&
    today !== null &&
    today.attendanceDate === date &&
    today.configured &&
    today.isWorkday &&
    today.points.some((point) => point.record === null);
  const header = <PageHeader title={project?.projectName ?? "项目详情"} />;
  if (!projectId)
    return (
      <Screen header={header}>
        <StateView
          kind="empty"
          title="还没选项目"
          sub="从“我的项目”里点一个项目进来。"
          retryLabel="去我的项目"
          onRetry={() => {
            void Taro.redirectTo({ url: "/pages/my-projects/index" });
          }}
        />
      </Screen>
    );
  if (error)
    return (
      <Screen header={header}>
        <StateView
          kind="error"
          title="项目详情没读到"
          sub={error}
          onRetry={refresh}
        />
      </Screen>
    );
  if (project === null)
    return (
      <Screen header={header}>
        <StateView title="正在读取项目详情…" />
      </Screen>
    );

  const note = today === null ? null : projectTodayNote(project, today);
  const nowIso = new Date().toISOString();
  const next =
    today !== null && canPunch ? projectNextPoint(today, nowIso) : null;
  // 已过点没打的卡也算待打卡；安排不是今天的就不按时间判断。
  const pointNow =
    today !== null && today.attendanceDate === formatChinaDate(nowIso)
      ? nowIso
      : undefined;
  const contacts: ReadonlyArray<{
    readonly key: string;
    readonly role: string;
    readonly contact: ProjectContact | null;
  }> = [
    ...(project.team
      ? [{ key: "leader", role: "班组长", contact: project.team.leader }]
      : []),
    ...(project.managers.length > 0
      ? project.managers.map((contact, index) => ({
          key: `manager-${index}`,
          role: "项目负责人",
          contact,
        }))
      : [{ key: "manager", role: "项目负责人", contact: null }]),
    ...(project.contact
      ? [{ key: "site", role: "现场联系人", contact: project.contact }]
      : []),
  ];
  const records = (
    <Button
      variant="outline"
      wide={!canPunch && project.taskAttendanceOnly !== true}
      onClick={() =>
        go(
          `/pages/my-records/index?projectId=${encodeURIComponent(project.projectId)}`,
        )
      }
    >
      本项目考勤
    </Button>
  );
  return (
    <Screen header={header}>
      <SectionTitle>{`今天 ${monthDayLabel(date)}`}</SectionTitle>
      {scheduleError ? (
        <>
          <Notice tone="error">
            今天的安排没读到
            <View className="ui-notice__sub">{scheduleError}</View>
          </Notice>
          <Button variant="outline" onClick={refresh}>
            重新读取
          </Button>
        </>
      ) : today === null ? (
        <SkeletonRows rows={2} />
      ) : (
        <>
          {note !== null ? (
            <Card>
              <CardTitle>{note.title}</CardTitle>
              <CardMeta>{note.sub}</CardMeta>
            </Card>
          ) : null}
          {today.points.length > 0 ? (
            <>
              <Sheet gap={note !== null}>
                {today.points.map((point) => (
                  <Row
                    key={point.pointCode}
                    title={point.label}
                    titleNum={point.scheduledTime}
                    sub={pointGrace(point)}
                    status={
                      point.record !== null || canPunch
                        ? pointStatus(point, next, false, pointNow)
                        : undefined
                    }
                  />
                ))}
              </Sheet>
              <Notice>
                {today.shiftName ? `${today.shiftName}。` : ""}
                打卡要求由班组长或项目管理员设置。
              </Notice>
            </>
          ) : null}
        </>
      )}

      <SectionTitle>联系人</SectionTitle>
      <Sheet>
        {contacts.map((item) => (
          <ContactRow
            key={item.key}
            role={item.role}
            contact={item.contact}
            onCall={(phone) => {
              void callContact(phone);
            }}
          />
        ))}
      </Sheet>
      {actionError?.at === "contact" ? (
        <Notice tone="error">{actionError.text}</Notice>
      ) : null}

      <SectionTitle>我在这个项目</SectionTitle>
      <Card>
        <KV label="公司" value={project.companyName} />
        <KV label="项目状态" value={PROJECT_STATUS_LABEL[project.status]} />
        <KV label="班组" value={project.team?.name ?? "项目直属，没分班组"} />
        <KV label="工种" value={project.workType ?? "没登记"} />
        <KV
          label="职级"
          value={project.roles
            .map(
              (role) =>
                `${permissionLevel(role.roleCode).name}${role.teamName ? `（${role.teamName}）` : ""}`,
            )
            .join("、")}
        />
        <KV label="入场日期" value={formatChinaDate(project.enteredAt)} />
      </Card>
      {project.requiresAttendance ? (
        <Notice>
          打卡分四步：定位、现场照片、安全交底、人脸核验，底照要先审核通过。工时按有效打卡计算，分正常、加班和未分类，不作工资依据。
        </Notice>
      ) : null}

      <SectionTitle>工地</SectionTitle>
      {process.env.TARO_ENV === "weapp" ? (
        <Map
          id="worker-project-map"
          className="project-detail__map"
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
              // 地图是原生组件，读不到样式变量：这里就是标牌的橙色（--hi）。
              color: "#FF6A13",
              fillColor: "#FF6A1329",
              strokeWidth: 2,
            },
          ]}
          onError={() =>
            setActionError({ at: "site", text: "地图没加载出来，请检查网络。" })
          }
        />
      ) : null}
      <Card gap={process.env.TARO_ENV === "weapp"}>
        <KV label="地址" value={project.address} />
        <KV
          label="考勤范围"
          value={`工地中心周边 ${project.geofenceRadiusM} 米`}
        />
        <KV
          label="定位精度"
          value={
            project.locationAccuracyLimitM === null
              ? "没有上限"
              : `${project.locationAccuracyLimitM} 米以内`
          }
        />
        {process.env.TARO_ENV === "weapp" ? (
          <CardActions>
            <Button
              variant="outline"
              onClick={() => {
                void showLocation();
              }}
            >
              打开工地地图
            </Button>
          </CardActions>
        ) : null}
      </Card>
      {process.env.TARO_ENV === "weapp" ? null : (
        <Notice>工地地图在微信小程序里看。</Notice>
      )}
      {actionError?.at === "site" ? (
        <Notice tone="error">{actionError.text}</Notice>
      ) : null}

      {canPunch ? (
        <BottomBar
          primary="去打卡"
          onPrimary={() => go(projectPunchUrl(project.projectId))}
        >
          {records}
        </BottomBar>
      ) : project.taskAttendanceOnly === true ? (
        <BottomBar
          primary="我的任务"
          onPrimary={() => go("/pages/my-tasks/index")}
        >
          {records}
        </BottomBar>
      ) : (
        <BottomBar>{records}</BottomBar>
      )}
    </Screen>
  );
}
