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
import { MemberRoleEditor } from "../../components/member-role-editor";
import {
  memberRoleAssignments,
  memberRoleFields,
} from "../../services/member-roles";
import type { MemberRoleAssignment } from "../../services/management.types";
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
  const [roles, setRoles] = useState<readonly MemberRoleAssignment[]>([
    { roleCode: "WORKER", teamId: null },
  ]);
  const [workerJob, setWorkerJob] = useState<string>("");
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
          setRoles(memberRoleAssignments(person));
          setWorkerJob(
            ["WORKER", "TEAM_LEADER", "PROJECT_ADMIN"].includes(
              person.projectRoleLabel,
            )
              ? (person.workType ?? "")
              : person.projectRoleLabel,
          );
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
    let body: PersonForm;
    try {
      const fields = memberRoleFields(
        roles,
        form.participantType === "MANAGER" ? "WORKER" : workerJob.trim(),
        form.teamId,
      );
      body = {
        ...form,
        ...fields,
        participantType:
          !memberId && fields.projectRoleLabel === "PROJECT_ADMIN"
            ? "MANAGER"
            : form.participantType,
        displayName: form.displayName.trim(),
        phone: form.phone.trim(),
        workType: form.workType.trim(),
      };
      if (
        !body.displayName ||
        !/^1\d{10}$/.test(body.phone) ||
        !body.projectRoleLabel ||
        !body.workType
      )
        throw new Error("请填写姓名、11 位手机号、工作种类和项目岗位。");
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : "请检查项目职级。");
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
              onInput={(workType) => {
                setForm({ ...form, workType });
                if (workerJob === form.workType) setWorkerJob(workType);
              }}
            />
            {!roles.some((role) => role.roleCode !== "WORKER") ? (
              <Field
                label="本项目岗位 *"
                value={workerJob}
                placeholder="例如：钢筋工、木工"
                onInput={setWorkerJob}
              />
            ) : null}
          </Section>
          <MemberRoleEditor
            value={roles}
            onChange={setRoles}
            teams={teams}
            disabled={busy}
          />
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
            {!roles.some((role) => role.roleCode !== "WORKER") ? (
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
                  primary="所属考勤班组"
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
