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
import { useManagedProjectId } from "../../hooks/use-management-scope";
import { useSessionGuard } from "../../hooks/use-session-guard";
import {
  fetchParticipants,
  fetchProjectTeams,
} from "../../services/management";
import type { ProjectTeam } from "../../services/management.types";
import {
  createPerson,
  updatePerson,
  type PersonForm,
} from "../../services/workflows";
import { useSession } from "../../store/session";

const EMPTY_PERSON: PersonForm = {
  displayName: "",
  phone: "",
  participantType: "WORKER",
  projectRoleLabel: "",
  teamId: null,
  requiresAttendance: true,
  status: "ACTIVE",
};
export default function PersonFormPage(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  const projectId = useManagedProjectId(state.me);
  const { memberId, teamId: initialTeamId } = Taro.useRouter().params;
  const [form, setForm] = useState<PersonForm>(EMPTY_PERSON);
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
      memberId ? fetchParticipants(projectId) : Promise.resolve([]),
    ]).then(
      ([rows, people]) => {
        if (cancelled) return;
        setTeams(rows);
        if (
          !memberId &&
          initialTeamId &&
          rows.some((row) => row.id === initialTeamId)
        )
          setForm({ ...EMPTY_PERSON, teamId: initialTeamId });
        if (memberId) {
          const person = people.find((row) => row.memberId === memberId);
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
    };
    if (
      !body.displayName ||
      !/^1\d{10}$/.test(body.phone) ||
      !body.projectRoleLabel
    ) {
      setError("请填写姓名、11 位手机号和工种或管理角色。");
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
                  { value: "WORKER", label: "工人" },
                  { value: "MANAGER", label: "管理员" },
                ]}
                value={form.participantType}
                onChange={(participantType) =>
                  setForm({
                    ...form,
                    participantType,
                    projectRoleLabel:
                      participantType === "MANAGER" ? "TEAM_LEADER" : "",
                    teamId: null,
                  })
                }
              />
            ) : null}
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
            {form.participantType === "WORKER" ? (
              <Field
                label="工种 / 岗位 *"
                value={form.projectRoleLabel}
                placeholder="例如：钢筋工、木工"
                onInput={(projectRoleLabel) =>
                  setForm({ ...form, projectRoleLabel })
                }
              />
            ) : (
              <Segmented
                options={[
                  { value: "TEAM_LEADER", label: "班组长" },
                  { value: "PROJECT_ADMIN", label: "项目管理员" },
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
            )}
          </Section>
          <Section title="项目安排">
            {form.projectRoleLabel !== "PROJECT_ADMIN" ? (
              <Picker
                mode="selector"
                range={["暂不分配", ...teams.map((row) => row.name)]}
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
                    form.participantType === "MANAGER" ? "管理班组" : "所属班组"
                  }
                  secondary={
                    teams.find((row) => row.id === form.teamId)?.name ??
                    "暂不分配"
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
              onChange={(status) => setForm({ ...form, status })}
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
