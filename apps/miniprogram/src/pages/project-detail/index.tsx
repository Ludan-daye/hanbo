import { Picker, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";

import {
  Button,
  Field,
  ListItem,
  Notice,
  PageHeader,
  Screen,
  Section,
  Segmented,
  StateView,
} from "../../components/ui/index";
import { useManagedProjectId } from "../../hooks/use-management-scope";
import { useSession } from "../../store/session";
import { useSessionGuard } from "../../hooks/use-session-guard";
import { ProjectGeofence } from "../../components/project-geofence";
import { validateProjectLocation } from "../../services/project-location";
import { FEATURES } from "../../routing/features";
import type { ManagedProject } from "../../services/management.types";
import { fetchProject, updateProject } from "../../services/workflows";

export default function ProjectDetail(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  const projectId = useManagedProjectId(state.me);
  const [revision, setRevision] = useState<number>(0);
  const refresh = (): void => setRevision((current) => current + 1);
  const [project, setProject] = useState<ManagedProject | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void fetchProject(projectId).then(
      (data) => {
        if (!cancelled) {
          setProject(data);
          setError(null);
        }
      },
      (failure: unknown) => {
        if (!cancelled)
          setError(failure instanceof Error ? failure.message : "读取项目失败");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [projectId, revision]);
  const save = async (): Promise<void> => {
    if (!project || busy) return;
    if (!project.name.trim()) {
      setError("请填写项目名称。");
      return;
    }
    try {
      validateProjectLocation(project);
    } catch (cause: unknown) {
      setError(
        cause instanceof Error ? cause.message : "请在地图上重新选择工地范围。",
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setProject(await updateProject(project));
      await Taro.showToast({ title: "项目设置已保存", icon: "success" });
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : "保存项目失败");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen>
      <PageHeader title="项目工作台" />
      {error ? (
        <StateView title="项目操作未完成" sub={error} onRetry={refresh} />
      ) : null}
      {projectId && !project && !error ? <StateView title="加载中…" /> : null}
      {!projectId ? (
        <StateView
          title="请先选择要管理的项目"
          sub="从公司项目列表进入项目工作台。"
        />
      ) : null}
      {project ? (
        <>
          <View className="context-card">
            <View className="ui-title">{project.name}</View>
            <View className="ui-subtitle">{project.address}</View>
          </View>
          <Section title="项目应用" sub="所有操作均针对当前项目">
            {FEATURES.projectAdmin
              .filter(
                (feature) =>
                  ![
                    "/pages/project-detail/index",
                    "/pages/my-projects/index",
                    "/pages/my-records/index",
                    "/pages/my-makeups/index",
                  ].includes(feature.url),
              )
              .map((feature) => (
                <ListItem
                  key={feature.url}
                  primary={feature.title}
                  secondary={feature.sub}
                  onClick={() => {
                    void Taro.navigateTo({
                      url: `${feature.url}?projectId=${project.id}`,
                    });
                  }}
                />
              ))}
          </Section>
          <Section title="项目设置">
            <Field
              label="项目编号"
              value={project.code ?? ""}
              placeholder="同一公司内唯一"
              onInput={(code) =>
                setProject({ ...project, code: code.trim() || null })
              }
            />
            <Field
              label="联系人"
              value={project.contactName ?? ""}
              placeholder="现场联系人"
              onInput={(contactName) =>
                setProject({
                  ...project,
                  contactName: contactName.trim() || null,
                })
              }
            />
            <Field
              label="联系电话"
              value={project.contactPhone ?? ""}
              placeholder="11 位手机号"
              type="number"
              maxLength={11}
              onInput={(contactPhone) =>
                setProject({ ...project, contactPhone: contactPhone || null })
              }
            />
            <Picker
              mode="date"
              value={project.plannedStartDate}
              onChange={(event) =>
                setProject({ ...project, plannedStartDate: event.detail.value })
              }
            >
              <ListItem
                primary="计划开工日期"
                secondary={project.plannedStartDate}
                chip="选择"
              />
            </Picker>
            <Picker
              mode="date"
              value={project.plannedEndDate ?? project.plannedStartDate}
              start={project.plannedStartDate}
              onChange={(event) =>
                setProject({ ...project, plannedEndDate: event.detail.value })
              }
            >
              <ListItem
                primary="计划完工日期"
                secondary={project.plannedEndDate ?? "未设置"}
                chip="选择"
              />
            </Picker>
            <Field
              label="项目名称"
              value={project.name}
              placeholder="项目名称"
              onInput={(name) => setProject({ ...project, name })}
            />
            <Field
              label="项目地址"
              value={project.address}
              placeholder="详细地址"
              onInput={(address) => setProject({ ...project, address })}
            />
            <Segmented
              options={[
                { value: "PREPARING", label: "筹备" },
                { value: "ACTIVE", label: "进行中" },
                { value: "SUSPENDED", label: "暂停" },
                { value: "COMPLETED", label: "完工" },
              ]}
              value={project.status}
              onChange={(status) => setProject({ ...project, status })}
            />
            <ProjectGeofence
              value={project}
              disabled={busy}
              onChange={(location) =>
                setProject((current) =>
                  current === null ? null : { ...current, ...location },
                )
              }
            />
            <Field
              label="备注"
              value={project.remark ?? ""}
              placeholder="项目补充说明"
              maxLength={1000}
              onInput={(remark) =>
                setProject({ ...project, remark: remark || null })
              }
            />
            <Notice>修改范围会影响后续打卡，请核对现场位置后保存。</Notice>
            <Button
              loading={busy}
              onClick={() => {
                void save();
              }}
            >
              保存项目设置
            </Button>
          </Section>
        </>
      ) : null}
    </Screen>
  );
}
