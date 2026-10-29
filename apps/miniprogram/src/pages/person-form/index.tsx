import { Picker, Switch, View } from "@tarojs/components";
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
import {
  participantPermissionRole,
  permissionLevel,
} from "../../routing/permissionLevels";
import { useManagedProjectId } from "../../hooks/use-management-scope";
import { useSessionGuard } from "../../hooks/use-session-guard";
import { fetchProjectTeams } from "../../services/management";
import type { ProjectTeam } from "../../services/management.types";
import {
  createPerson,
  fetchPerson,
  updatePerson,
  type PersonForm,
} from "../../services/workflows";
import { chinaToday, formatChinaDate } from "../../services/time";
import { useSession } from "../../store/session";

const emptyPerson = (enteredAt: string): PersonForm => ({
  displayName: "",
  phone: "",
  participantType: "WORKER",
  projectRoleLabel: "",
  workType: "",
  teamId: null,
  requiresAttendance: true,
  status: "ACTIVE",
  enteredAt,
  exitedAt: null,
  expectedUpdatedAt: null,
  expectedProfileUpdatedAt: null,
});
export default function PersonFormPage(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  const projectId = useManagedProjectId(state.me);
  const { memberId, teamId: initialTeamId } = Taro.useRouter().params;
  const [form, setForm] = useState<PersonForm>(() =>
    emptyPerson(new Date().toISOString()),
  );
  const [teams, setTeams] = useState<readonly ProjectTeam[]>([]);
  const [loadFailed, setLoadFailed] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void Promise.all([
      fetchProjectTeams(projectId),
      memberId ? fetchPerson(projectId, memberId) : Promise.resolve(null),
    ]).then(
      ([rows, person]) => {
        if (cancelled) return;
        setTeams(rows);
        if (
          !memberId &&
          initialTeamId &&
          rows.some((row) => row.id === initialTeamId)
        )
          setForm({
            ...emptyPerson(new Date().toISOString()),
            teamId: initialTeamId,
          });
        if (memberId) {
          if (!person) {
            setLoadFailed(true);
            setError("没有找到该成员，请返回列表刷新。");
            setLoading(false);
            return;
          }
          setForm({
            displayName: person.displayName ?? "",
            phone: person.phone,
            participantType: person.participantType,
            projectRoleLabel: person.projectRoleLabel,
            workType: person.workType ?? "",
            enteredAt: person.enteredAt,
            exitedAt: person.exitedAt,
            expectedUpdatedAt: person.updatedAt,
            expectedProfileUpdatedAt: person.profileUpdatedAt,
            teamId: person.teamId,
            requiresAttendance: person.requiresAttendance,
            status: person.status,
          });
        }
        setLoading(false);
      },
      (failure: unknown) => {
        if (!cancelled) {
          setLoadFailed(true);
          setError(
            failure instanceof Error ? failure.message : "读取人员资料失败",
          );
          setLoading(false);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [projectId, memberId, initialTeamId]);
  const submit = async (): Promise<void> => {
    if (!projectId || busy) return;
    const body: PersonForm = {
      ...form,
      displayName: form.displayName.trim(),
      phone: form.phone.trim(),
      projectRoleLabel: form.projectRoleLabel.trim(),
      workType: form.workType.trim(),
    };
    if (
      !body.displayName ||
      !/^1\d{10}$/.test(body.phone) ||
      !body.projectRoleLabel ||
      !body.workType
    ) {
      setError("请填写姓名、11 位手机号、工作种类和项目岗位。");
      return;
    }
    if (body.projectRoleLabel === "TEAM_LEADER" && !body.teamId) {
      setError("班组长必须选择管理班组。");
      return;
    }
    if (memberId && body.status !== "ACTIVE") {
      const result = await Taro.showModal({
        title: body.status === "EXITED" ? "确认成员退场" : "确认暂停成员",
        content: "该成员将不再作为在场人员参与后续考勤，历史记录会保留。",
        confirmText: "确认保存",
      });
      if (!result.confirm) return;
    }
    setBusy(true);
    setError(null);
    try {
      if (memberId) await updatePerson(projectId, memberId, body);
      else await createPerson(projectId, body);
      await Taro.showToast({ title: "已保存", icon: "success" });
      await Taro.navigateBack();
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : "保存人员资料失败");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen>
      <PageHeader title={memberId ? "成员资料" : "添加项目成员"} />
      {!projectId ? (
        <StateView title="请从项目人员页面进入" />
      ) : loading ? (
        <StateView title="加载中…" />
      ) : loadFailed ? (
        <StateView title="无法读取成员资料" sub="请返回人员列表后重新进入。" />
      ) : (
        <>
          <Notice>先建立人员档案，再生成邀请码，由本人微信登录后绑定。</Notice>
          <Section title="基本资料">
            {!memberId ? (
              <Segmented
                options={[
                  { value: "WORKER", label: "一级 · 个人" },
                  { value: "TEAM_LEADER", label: "二级 · 班组" },
                  { value: "PROJECT_ADMIN", label: "三级 · 项目" },
                ]}
                value={participantPermissionRole(form)}
                onChange={(role) =>
                  setForm({
                    ...form,
                    participantType:
                      role === "PROJECT_ADMIN" ? "MANAGER" : "WORKER",
                    projectRoleLabel: role === "WORKER" ? "" : role,
                    teamId: role === "PROJECT_ADMIN" ? null : form.teamId,
                  })
                }
              />
            ) : null}
            <ListItem
              primary="项目权限"
              secondary={permissionLevel(participantPermissionRole(form)).label}
            />
            <Field
              label="姓名 *"
              value={form.displayName}
              placeholder="请输入成员姓名"
              onInput={(displayName) => setForm({ ...form, displayName })}
              maxLength={30}
            />
            <Field
              label="手机号 *"
              value={form.phone}
              placeholder="请输入 11 位手机号"
              type="number"
              maxLength={11}
              onInput={(phone) => setForm({ ...form, phone })}
            />
            <Field
              label="工作种类 / 工种 *"
              value={form.workType}
              placeholder="例如：钢筋工、木工、电工、安全管理"
              maxLength={40}
              onInput={(workType) => setForm({ ...form, workType })}
            />
            {memberId && form.participantType === "WORKER" ? (
              <Segmented
                options={[
                  { value: "WORKER", label: "一级 · 普通工人" },
                  { value: "TEAM_LEADER", label: "二级 · 班组长" },
                ]}
                value={participantPermissionRole(form)}
                onChange={(role) =>
                  setForm({
                    ...form,
                    projectRoleLabel:
                      role === "TEAM_LEADER" ? role : form.workType,
                  })
                }
              />
            ) : null}
            {form.participantType === "WORKER" &&
            form.projectRoleLabel !== "TEAM_LEADER" ? (
              <Field
                label="本项目岗位 *"
                value={form.projectRoleLabel}
                placeholder="例如：钢筋工、木工"
                onInput={(projectRoleLabel) =>
                  setForm({ ...form, projectRoleLabel })
                }
              />
            ) : memberId && form.participantType === "MANAGER" ? (
              <Segmented
                options={[
                  { value: "TEAM_LEADER", label: "二级 · 班组权限" },
                  { value: "PROJECT_ADMIN", label: "三级 · 项目管理" },
                ]}
                value={form.projectRoleLabel}
                onChange={(projectRoleLabel) =>
                  setForm({
                    ...form,
                    projectRoleLabel,
                    teamId:
                      projectRoleLabel === "PROJECT_ADMIN" ? null : form.teamId,
                  })
                }
              />
            ) : null}
          </Section>
          <Section title="项目安排">
            <Picker
              mode="date"
              value={formatChinaDate(form.enteredAt)}
              end={chinaToday()}
              onChange={(event) =>
                setForm({
                  ...form,
                  enteredAt: new Date(
                    `${event.detail.value}T00:00:00+08:00`,
                  ).toISOString(),
                })
              }
            >
              <ListItem
                primary="进场日期"
                secondary={formatChinaDate(form.enteredAt)}
                chip="选择"
              />
            </Picker>
            {form.status === "EXITED" && form.exitedAt !== null ? (
              <Picker
                mode="date"
                value={formatChinaDate(form.exitedAt)}
                start={formatChinaDate(form.enteredAt)}
                end={chinaToday()}
                onChange={(event) =>
                  setForm({
                    ...form,
                    exitedAt: new Date(
                      `${event.detail.value}T23:59:59+08:00`,
                    ).toISOString(),
                  })
                }
              >
                <ListItem
                  primary="退场日期"
                  secondary={formatChinaDate(form.exitedAt)}
                  chip="选择"
                />
              </Picker>
            ) : null}
            {form.projectRoleLabel !== "PROJECT_ADMIN" ? (
              <Picker
                mode="selector"
                range={[
                  form.participantType === "MANAGER"
                    ? "请选择班组"
                    : "暂不分配",
                  ...teams.map((row) => row.name),
                ]}
                value={teams.findIndex((row) => row.id === form.teamId) + 1}
                onChange={(event) =>
                  setForm({
                    ...form,
                    teamId: teams[Number(event.detail.value) - 1]?.id ?? null,
                  })
                }
              >
                <ListItem
                  primary={
                    form.participantType === "MANAGER"
                      ? "管理班组 *"
                      : "所属班组"
                  }
                  secondary={
                    teams.find((row) => row.id === form.teamId)?.name ??
                    (form.participantType === "MANAGER"
                      ? "请选择班组"
                      : "暂不分配")
                  }
                  chip="选择"
                />
              </Picker>
            ) : null}
            <View className="form-toggle">
              <View>参与考勤</View>
              <Switch
                checked={form.requiresAttendance}
                color="#246bfd"
                onChange={(event) =>
                  setForm({ ...form, requiresAttendance: event.detail.value })
                }
              />
            </View>
            <Segmented
              options={[
                { value: "ACTIVE", label: "在场" },
                { value: "SUSPENDED", label: "暂停" },
                { value: "EXITED", label: "已退场" },
              ]}
              value={form.status}
              onChange={(status) =>
                setForm({
                  ...form,
                  status,
                  exitedAt:
                    status === "EXITED" ? new Date().toISOString() : null,
                })
              }
            />
          </Section>
          <Button
            loading={busy}
            onClick={() => {
              void submit();
            }}
          >
            保存人员资料
          </Button>
        </>
      )}
      {error ? <Notice>{error}</Notice> : null}
    </Screen>
  );
}
