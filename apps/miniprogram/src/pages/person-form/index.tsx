import { View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";

import { MemberRoleEditor } from "../../components/member-role-editor";
import {
  ChipsRow,
  DateRow,
  SelectRow,
} from "../../components/member-role-editor/form-rows";
import {
  BottomBar,
  FormInput,
  FormSwitch,
  Notice,
  PageHeader,
  Row,
  Screen,
  SectionTitle,
  Sheet,
  StateView,
} from "../../components/ui/index";
import { useManagedProjectId } from "../../hooks/use-management-scope";
import { canGrantProjectAdmin } from "../../routing/projectAdmin";
import { useSessionGuard } from "../../hooks/use-session-guard";
import {
  memberRoleAssignments,
  memberRoleFields,
} from "../../services/member-roles";
import type {
  MemberRoleAssignment,
  MemberStatus,
  ProjectTeam,
} from "../../services/management.types";
import { fetchProjectTeams } from "../../services/management";
import {
  createPerson,
  fetchPerson,
  updatePerson,
  type PersonForm,
} from "../../services/workflows";
import { chinaToday, formatChinaDate } from "../../services/time";
import {
  fetchMemberRegistration,
  type MemberRegistration,
} from "../../services/registration-review";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { verificationLabel } from "../person-registration/registration-review-view";
import { useSession } from "../../store/session";
import { errorMessage } from "../../services/error-messages";

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

const STATUS_OPTIONS: ReadonlyArray<{
  readonly value: MemberStatus;
  readonly label: string;
}> = [
  { value: "ACTIVE", label: "在场" },
  { value: "SUSPENDED", label: "暂停" },
  { value: "EXITED", label: "已退场" },
];
const PHONE = /^1\d{10}$/;

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
  const [attempt, setAttempt] = useState<number>(0);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  // 点过保存、没通过检查之后，把有问题的行标出来。
  const [checked, setChecked] = useState<boolean>(false);
  // 工人的用工资料核实状态；没读到时那一行只是不写状态，不挡表单。
  const [registration, setRegistration] = useState<MemberRegistration | null>(
    null,
  );
  const { revision } = usePageRefresh();
  useEffect(() => {
    if (!projectId || !memberId || form.participantType !== "WORKER") return;
    let cancelled = false;
    void fetchMemberRegistration(projectId, memberId).then(
      (value) => {
        if (!cancelled) setRegistration(value);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [projectId, memberId, form.participantType, revision]);
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
          setError(errorMessage(failure, "读取人员资料失败"));
          setLoading(false);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [projectId, memberId, initialTeamId, attempt]);
  const reload = (): void => {
    setLoadFailed(false);
    setError(null);
    setLoading(true);
    setAttempt(attempt + 1);
  };
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
        !PHONE.test(body.phone) ||
        !body.projectRoleLabel ||
        !body.workType
      )
        throw new Error("请填写姓名、11 位手机号、工种和本项目岗位。");
    } catch (failure: unknown) {
      setChecked(true);
      setError(errorMessage(failure, "请检查本项目的身份。"));
      return;
    }
    if (memberId && body.status !== "ACTIVE") {
      const result = await Taro.showModal({
        title: body.status === "EXITED" ? "确认成员退场" : "确认暂停成员",
        content: "停止该成员后续考勤，保留历史记录。",
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
      setError(errorMessage(failure, "保存人员资料失败"));
    } finally {
      setBusy(false);
    }
  };

  const header = <PageHeader title={memberId ? "成员资料" : "添加成员"} />;
  if (!projectId)
    return (
      <Screen header={header}>
        <StateView kind="empty" title="请从项目人员页面进入" />
      </Screen>
    );
  if (loading)
    return (
      <Screen header={header}>
        <StateView kind="loading" title="正在读取成员资料" />
      </Screen>
    );
  if (loadFailed)
    return (
      <Screen header={header}>
        <StateView
          kind="error"
          title="成员资料没读到"
          sub={error ?? "请返回人员列表后重新进入。"}
          onRetry={reload}
        />
      </Screen>
    );

  // 只是工人时，才需要填岗位、选考勤班组；班组长和管理员的班组由身份决定。
  const onlyWorker = !roles.some((role) => role.roleCode !== "WORKER");
  // 管理人员档案的岗位不由这里填。
  const asksJob = onlyWorker && form.participantType !== "MANAGER";
  const team = teams.find((row) => row.id === form.teamId);
  // 项目管理员不能任免别的项目管理员：没有“管理员”可选；
  // 已经是管理员的人，身份里的管理员和在场状态都由公司管理员调整。
  const adminLocked = !canGrantProjectAdmin(state.me);
  const peerAdmin =
    adminLocked &&
    Boolean(memberId) &&
    roles.some((role) => role.roleCode === "PROJECT_ADMIN");
  return (
    <Screen header={header}>
      <Sheet gap>
        <FormInput
          label="姓名"
          required
          value={form.displayName}
          placeholder="请输入姓名"
          maxLength={30}
          error={checked && !form.displayName.trim()}
          onInput={(displayName) => setForm({ ...form, displayName })}
        />
        <FormInput
          label="手机号"
          required
          value={form.phone}
          placeholder="11 位手机号"
          type="number"
          maxLength={11}
          error={checked && !PHONE.test(form.phone.trim())}
          onInput={(phone) => setForm({ ...form, phone })}
        />
        <FormInput
          label="工种"
          required
          value={form.workType}
          placeholder="例如：钢筋工、电工"
          maxLength={40}
          error={checked && !form.workType.trim()}
          onInput={(workType) => {
            setForm({ ...form, workType });
            if (workerJob === form.workType) setWorkerJob(workType);
          }}
        />
      </Sheet>

      {memberId && form.participantType === "WORKER" ? (
        <Sheet gap>
          <Row
            title="用工资料"
            sub="身份证、住址、紧急联系人、健康、保险、工资卡"
            status={registration === null ? undefined : verificationLabel(registration)}
            chevron
            onClick={() =>
              void Taro.navigateTo({
                url: `/pages/person-registration/index?projectId=${encodeURIComponent(projectId)}&memberId=${encodeURIComponent(memberId)}`,
              })
            }
          />
        </Sheet>
      ) : null}

      <SectionTitle>在本项目</SectionTitle>
      <Sheet>
        <MemberRoleEditor
          value={roles}
          onChange={setRoles}
          teams={teams}
          disabled={busy}
          invalid={checked}
          locked={adminLocked ? ["PROJECT_ADMIN"] : []}
        />
        {asksJob ? (
          <FormInput
            label="本项目岗位"
            required
            value={workerJob}
            placeholder="例如：钢筋工、木工"
            error={checked && !workerJob.trim()}
            onInput={setWorkerJob}
          />
        ) : null}
        {onlyWorker ? (
          <SelectRow
            label="班组"
            options={["暂不分配", ...teams.map((row) => row.name)]}
            index={teams.findIndex((row) => row.id === form.teamId) + 1}
            value={team?.name ?? ""}
            placeholder="暂不分配"
            onChange={(picked) =>
              setForm({ ...form, teamId: teams[picked - 1]?.id ?? null })
            }
          />
        ) : null}
        <DateRow
          label="进场日期"
          value={formatChinaDate(form.enteredAt)}
          end={chinaToday()}
          onChange={(value) =>
            setForm({
              ...form,
              enteredAt: new Date(`${value}T00:00:00+08:00`).toISOString(),
            })
          }
        />
        <FormSwitch
          label="参与考勤"
          checked={form.requiresAttendance}
          onChange={(requiresAttendance) =>
            setForm({ ...form, requiresAttendance })
          }
        />
        {memberId && !peerAdmin ? (
          <ChipsRow
            label="状态"
            options={STATUS_OPTIONS}
            selected={[form.status]}
            onToggle={(status) => {
              if (status !== form.status)
                setForm({
                  ...form,
                  status,
                  exitedAt:
                    status === "EXITED" ? new Date().toISOString() : null,
                });
            }}
          />
        ) : null}
        {form.status === "EXITED" && form.exitedAt !== null ? (
          <DateRow
            label="退场日期"
            value={formatChinaDate(form.exitedAt)}
            start={formatChinaDate(form.enteredAt)}
            end={chinaToday()}
            onChange={(value) =>
              setForm({
                ...form,
                exitedAt: new Date(`${value}T23:59:59+08:00`).toISOString(),
              })
            }
          />
        ) : null}
      </Sheet>
      <Notice>
        <View>身份可以选几个。兼任共用一份档案，考勤和评分不重复统计。</View>
        {peerAdmin ? (
          <View>他是项目管理员，管理员身份和在场状态请公司管理员调整。</View>
        ) : null}
        {memberId ? null : (
          <View>建档后到“邀请绑定”生成邀请码，交给本人用微信绑定。</View>
        )}
      </Notice>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <BottomBar
        primary={busy ? "保存中…" : "保存"}
        busy={busy}
        onPrimary={() => {
          void submit();
        }}
      />
    </Screen>
  );
}
