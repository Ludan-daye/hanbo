import { Picker, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";

import { ProjectGeofence } from "../../components/project-geofence";
import {
  BottomBar,
  EntryGrid,
  FormArea,
  FormInput,
  FormRow,
  Notice,
  PageHeader,
  Row,
  Screen,
  SectionTitle,
  Sheet,
  SignLine,
  SkeletonRows,
  SkeletonSign,
  StateView,
  type EntryItem,
  type LineIconName,
} from "../../components/ui/index";
import { useCachedRead } from "../../hooks/use-cached-read";
import { useLeaveGuard } from "../../hooks/use-leave-guard";
import { useManagedProjectId } from "../../hooks/use-management-scope";
import { useSessionGuard } from "../../hooks/use-session-guard";
import { FEATURES } from "../../routing/features";
import { errorMessage } from "../../services/error-messages";
import { fetchProjectOverview } from "../../services/management";
import type { ProjectOverview } from "../../services/management.types";
import { chinaToday } from "../../services/time";
import type {
  ManagedProject,
  ProjectStatus,
} from "../../services/management.types";
import { validateProjectLocation } from "../../services/project-location";
import { fetchProject, updateProject } from "../../services/workflows";
import { useSession } from "../../store/session";

import "./index.scss";

const STATUSES: ReadonlyArray<{
  readonly value: ProjectStatus;
  readonly label: string;
}> = [
  { value: "PREPARING", label: "筹备中" },
  { value: "ACTIVE", label: "进行中" },
  { value: "SUSPENDED", label: "已暂停" },
  { value: "COMPLETED", label: "已完工" },
];
const statusLabel = (status: ProjectStatus): string =>
  STATUSES.find((item) => item.value === status)?.label ?? "进行中";

/** “进入项目”里不放的入口：项目设置单独一行，个人的事在“我的”。 */
const NOT_IN_HUB: readonly string[] = [
  "/pages/project-detail/index",
  "/pages/my-projects/index",
  "/pages/my-records/index",
  "/pages/my-makeups/index",
];
const ENTRY_ICONS: Readonly<Record<string, LineIconName>> = {
  "/pages/team-makeups/index": "check",
  "/pages/safety-review/index": "shield",
  "/pages/face-review/index": "face",
  "/pages/project-worktime/index": "clock",
  "/pages/participants/index": "users",
  "/pages/reports/index": "chart",
  "/pages/invitation/index": "key",
  "/pages/project-management/index": "grid",
  "/pages/schedules/index": "calendar",
  "/pages/audit-log/index": "doc",
};

/** “2026年3月1日”。 */
const dayText = (value: string): string => {
  const [year, month, day] = value.split("-").map(Number);
  return year && month && day ? `${year}年${month}月${day}日` : value;
};

type DetailView = "hub" | "settings";

/** 逐个字段比较，字段顺序不同不算改动。 */
const sameProject = (a: ManagedProject, b: ManagedProject): boolean => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const left = a as unknown as Record<string, unknown>;
  const right = b as unknown as Record<string, unknown>;
  return [...keys].every(
    (key) =>
      JSON.stringify(left[key] ?? null) === JSON.stringify(right[key] ?? null),
  );
};

/**
 * 同一个页面两个视图：
 * 带 view=hub 进来是“进入项目”（八个入口加一行项目设置），否则直接是“项目设置”。
 */
export default function ProjectDetail(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  const projectId = useManagedProjectId(state.me);
  const fromHub = Taro.useRouter().params.view === "hub";
  const [view, setView] = useState<DetailView>(fromHub ? "hub" : "settings");
  const [revision, setRevision] = useState<number>(0);
  const refresh = (): void => setRevision((current) => current + 1);
  // project 是正在改的；saved 是服务器上的，“进入项目”只显示保存过的。
  const [project, setProject] = useState<ManagedProject | null>(null);
  const [saved, setSaved] = useState<ManagedProject | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  // “进入项目”的补卡、违规、底照入口右上角写待办数，和项目首页同一份概览缓存。
  const today = chinaToday();
  const overview = useCachedRead<ProjectOverview>(
    view === "hub" && projectId && state.me
      ? `${state.me.user.id}:project-overview:${projectId}:${today}`
      : null,
    () => fetchProjectOverview(projectId ?? "", today),
    revision,
  );
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void fetchProject(projectId).then(
      (data) => {
        if (!cancelled) {
          setProject(data);
          setSaved(data);
          setError(null);
        }
      },
      (failure: unknown) => {
        if (!cancelled) setError(errorMessage(failure, "读取项目失败"));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [projectId, revision]);
  const save = async (): Promise<void> => {
    if (!project || busy) return;
    if (!project.name.trim()) {
      setFormError("请填写项目名称。");
      return;
    }
    try {
      validateProjectLocation(project);
    } catch (cause: unknown) {
      setFormError(errorMessage(cause, "请在地图上重新选择工地范围。"));
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const next = await updateProject(project);
      setProject(next);
      setSaved(next);
      await Taro.showToast({ title: "项目设置已保存", icon: "success" });
    } catch (failure: unknown) {
      setFormError(errorMessage(failure, "保存项目失败"));
    } finally {
      setBusy(false);
    }
  };
  const dirty =
    project !== null && saved !== null && !sameProject(project, saved);
  useLeaveGuard(
    view === "settings" && dirty ? "项目设置还没保存，离开后改动不保留。" : null,
  );
  // 从“项目设置”退回“进入项目”：没保存的改动不留，有改动先问一下。
  const backToHub = async (): Promise<void> => {
    if (busy) return;
    if (dirty) {
      const answer = await Taro.showModal({
        title: "放弃修改？",
        content: "项目设置还没保存，返回后改动不保留。",
        confirmText: "放弃修改",
        cancelText: "继续编辑",
      }).catch(() => ({ confirm: false }));
      if (!answer.confirm) return;
    }
    setProject(saved);
    setFormError(null);
    setView("hub");
  };

  const header =
    view === "hub" ? (
      <PageHeader title={saved?.name ?? "进入项目"} />
    ) : (
      <PageHeader
        title="项目设置"
        onBack={
          fromHub
            ? () => {
                void backToHub();
              }
            : undefined
        }
      />
    );

  if (!projectId)
    return (
      <Screen header={header}>
        <StateView
          kind="empty"
          title="还没有选项目"
          sub="请从公司项目里点“进入项目”。"
        />
      </Screen>
    );
  if (project === null || saved === null)
    return (
      <Screen header={header}>
        {error ? (
          <StateView
            kind="error"
            title="项目没读到"
            sub={error}
            onRetry={refresh}
          />
        ) : view === "hub" ? (
          <View aria-label="正在读取项目">
            <SkeletonSign />
            <SkeletonRows rows={2} gap />
          </View>
        ) : (
          <View aria-label="正在读取项目">
            <SkeletonRows rows={5} gap />
          </View>
        )}
      </Screen>
    );

  if (view === "hub") {
    const todos = overview.data?.todos;
    const badges: Readonly<Record<string, number>> =
      todos === undefined
        ? {}
        : {
            "/pages/team-makeups/index": todos.makeupPending,
            "/pages/safety-review/index":
              todos.violationPending + todos.appealPending,
            "/pages/face-review/index": todos.facePending,
          };
    const entries: ReadonlyArray<EntryItem> = FEATURES.projectAdmin
      .filter((feature) => !NOT_IN_HUB.includes(feature.url))
      .map((feature) => ({
        icon: ENTRY_ICONS[feature.url] ?? "doc",
        label: feature.title,
        ...(badges[feature.url] ? { badge: badges[feature.url] } : {}),
        onClick: () => {
          void Taro.navigateTo({
            url: `${feature.url}?projectId=${saved.id}`,
          });
        },
      }));
    return (
      <Screen header={header}>
        <SignLine title={statusLabel(saved.status)} sub={saved.address} />
        <EntryGrid items={entries} cols={4} gap />
        <Sheet gap>
          <Row
            title="项目设置"
            value="资料和考勤范围"
            mute
            chevron
            icon="gear"
            onClick={() => setView("settings")}
          />
        </Sheet>
      </Screen>
    );
  }

  const canChangeStatus = (state.me?.roles.assignments ?? []).some(
    (assignment) =>
      assignment.roleCode === "SYSTEM_ADMIN" ||
      (assignment.roleCode === "COMPANY_ADMIN" &&
        assignment.scope.scopeId === project.companyId),
  );
  const statusIndex = Math.max(
    0,
    STATUSES.findIndex((item) => item.value === project.status),
  );
  return (
    <Screen header={header}>
      <Sheet gap>
        <FormInput
          label="项目名称"
          required
          value={project.name}
          placeholder="请填写"
          error={formError !== null && !project.name.trim()}
          disabled={busy}
          onInput={(name) => setProject({ ...project, name })}
        />
        <FormInput
          label="项目编号"
          value={project.code ?? ""}
          placeholder="同一公司内不能重复"
          disabled={busy}
          onInput={(code) =>
            setProject({ ...project, code: code.trim() || null })
          }
        />
        {canChangeStatus ? (
          <View className="project-detail__pick">
            <Picker
              mode="selector"
              range={STATUSES.map((item) => item.label)}
              value={statusIndex}
              disabled={busy}
              onChange={(event) => {
                const next = STATUSES[Number(event.detail.value)];
                if (next) setProject({ ...project, status: next.value });
              }}
            >
              <FormRow label="状态" value={STATUSES[statusIndex].label} chevron />
            </Picker>
          </View>
        ) : (
          // Q5：项目暂停、完工由公司管理员办理，项目管理员这里只看。
          <View className="project-detail__pick">
            <FormRow label="状态" value={`${STATUSES[statusIndex].label}（由公司管理员修改）`} />
          </View>
        )}
        <View className="project-detail__pick">
          <Picker
            mode="date"
            value={project.plannedStartDate}
            disabled={busy}
            onChange={(event) =>
              setProject({ ...project, plannedStartDate: event.detail.value })
            }
          >
            <FormRow
              label="计划开工"
              value={dayText(project.plannedStartDate)}
              chevron
            />
          </Picker>
        </View>
        <View className="project-detail__pick">
          <Picker
            mode="date"
            value={project.plannedEndDate ?? project.plannedStartDate}
            start={project.plannedStartDate}
            disabled={busy}
            onChange={(event) =>
              setProject({ ...project, plannedEndDate: event.detail.value })
            }
          >
            <FormRow
              label="计划完工"
              value={
                project.plannedEndDate
                  ? dayText(project.plannedEndDate)
                  : undefined
              }
              placeholder="还没定"
              chevron
            />
          </Picker>
        </View>
        <FormInput
          label="联系人"
          value={project.contactName ?? ""}
          placeholder="现场联系人"
          disabled={busy}
          onInput={(contactName) =>
            setProject({
              ...project,
              contactName: contactName.trim() || null,
            })
          }
        />
        <FormInput
          label="联系电话"
          type="number"
          maxLength={11}
          value={project.contactPhone ?? ""}
          placeholder="11 位手机号"
          disabled={busy}
          onInput={(contactPhone) =>
            setProject({ ...project, contactPhone: contactPhone || null })
          }
        />
      </Sheet>

      <SectionTitle>考勤范围</SectionTitle>
      <ProjectGeofence
        value={project}
        disabled={busy}
        onChange={(location) =>
          setProject((current) =>
            current === null ? null : { ...current, ...location },
          )
        }
      />
      <Sheet gap>
        <FormInput
          label="项目地址"
          required
          value={project.address}
          placeholder="详细地址"
          disabled={busy}
          onInput={(address) => setProject({ ...project, address })}
        />
        <FormArea
          label="备注"
          value={project.remark ?? ""}
          placeholder="项目的补充说明"
          maxLength={1000}
          disabled={busy}
          onInput={(remark) =>
            setProject({ ...project, remark: remark || null })
          }
        />
      </Sheet>
      <Notice>改了考勤范围，之后的打卡都按新范围算。保存前请核对位置。</Notice>
      {formError ? <Notice tone="error">{formError}</Notice> : null}
      <BottomBar
        primary={busy ? "保存中…" : "保存"}
        busy={busy}
        onPrimary={() => {
          void save();
        }}
      />
    </Screen>
  );
}
