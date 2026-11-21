import { Picker, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useState } from "react";

import {
  BottomBar,
  Card,
  CardMeta,
  CardTitle,
  Chips,
  FormRow,
  Notice,
  PageHeader,
  Row,
  Screen,
  SectionTitle,
  Sheet,
  SignLine,
  SkeletonRows,
  StateView,
} from "../../components/ui/index";
import { useCachedRead } from "../../hooks/use-cached-read";
import { useManagedCompanyId } from "../../hooks/use-management-scope";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { useSessionGuard } from "../../hooks/use-session-guard";
import { errorMessage } from "../../services/error-messages";
import {
  fetchCompanyPerson,
  offboardCompanyPerson,
} from "../../services/management";
import type {
  CompanyPerson,
  OffboardMode,
} from "../../services/management.types";
import { chinaToday, formatChinaDate } from "../../services/time";
import { useSession } from "../../store/session";

import {
  hasManagementPosts,
  historyLines,
  membershipRoles,
  membershipStatus,
  offboardSummary,
  offboardWords,
} from "../company-admins/admins-view";

const MODES: ReadonlyArray<{ readonly value: OffboardMode; readonly label: string }> = [
  { value: "REVOKE_ADMIN", label: "只收回管理职务" },
  { value: "EXIT_ALL", label: "所有项目都退场" },
];

/**
 * 人员任职：一个人在本公司各项目的身份、班组、进退场和项目评分，点一个项目进去改身份。
 * 底部“离岗”一次处理他在本公司的所有项目（2026-11-21 Q3）：默认只收回管理职务，
 * 也可以全部退场；考勤和补卡记录都不动。
 */
export default function CompanyPersonPage(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  const companyId = useManagedCompanyId(state.me);
  const params = Taro.useRouter().params;
  const participantType = params.participantType === "MANAGER" ? "MANAGER" : "WORKER";
  const profileId = params.profileId ? decodeURIComponent(params.profileId) : null;
  const { revision, refresh } = usePageRefresh();
  const userId = state.me?.user.id;
  const read = useCachedRead<CompanyPerson>(
    companyId === null || profileId === null || userId === undefined
      ? null
      : `${userId}:company-person:${companyId}:${participantType}:${profileId}`,
    () => fetchCompanyPerson(companyId ?? "", participantType, profileId ?? ""),
    revision,
    "任职没读到",
  );
  const [saved, setSaved] = useState<CompanyPerson | null>(null);
  // 没选过时按他有没有管理职务来：有就默认只收回职务，没有就默认全部退场。
  const [chosenMode, setMode] = useState<OffboardMode | null>(null);
  const [date, setDate] = useState<string>(chinaToday());
  const [busy, setBusy] = useState<boolean>(false);
  const [failure, setFailure] = useState<string | null>(null);
  const person = saved ?? read.data;
  const header = <PageHeader title="人员任职" />;
  if (companyId === null || profileId === null)
    return (
      <Screen header={header}>
        <StateView kind="empty" title="请从项目负责人或公司人员进入" />
      </Screen>
    );
  if (person === null)
    return (
      <Screen header={header}>
        {read.error !== null ? (
          <StateView title="任职没读到" sub={read.error} onRetry={refresh} />
        ) : (
          <SkeletonRows rows={3} gap />
        )}
      </Screen>
    );
  const mode: OffboardMode =
    chosenMode ?? (hasManagementPosts(person) ? "REVOKE_ADMIN" : "EXIT_ALL");
  const words = offboardWords(mode);
  const summary = offboardSummary(person, mode);
  const own = state.me?.profile.id === person.profileId;
  const active = person.memberships.filter((row) => row.status !== "EXITED");
  const offboard = async (): Promise<void> => {
    if (busy || summary.projects.length === 0) return;
    const answer = await Taro.showModal({
      title: words.title,
      content: summary.text,
      confirmText: words.confirm,
      confirmColor: "#D7261E",
    });
    if (!answer.confirm) return;
    setBusy(true);
    setFailure(null);
    try {
      setSaved(
        await offboardCompanyPerson(companyId, participantType, profileId, {
          effectiveDate: date,
          mode,
        }),
      );
      await Taro.showToast({ icon: "success", title: "已办理" });
    } catch (cause: unknown) {
      setFailure(errorMessage(cause, "没有办成，请重试"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen header={header}>
      <SignLine
        title={person.displayName ?? "姓名待补录"}
        sub={`${person.phone}${person.isBound ? "" : "，还没绑定微信"}；${active.length === 0 ? "本公司的项目都已退场" : `在 ${active.length} 个项目`}`}
      />
      <SectionTitle>在本公司的任职</SectionTitle>
      {person.memberships.map((membership) => (
        <Card
          key={membership.memberId}
          gap
          onClick={() => {
            void Taro.navigateTo({
              url: `/pages/person-form/index?projectId=${encodeURIComponent(membership.projectId)}&memberId=${encodeURIComponent(membership.memberId)}`,
            });
          }}
        >
          <CardTitle status={membershipStatus(membership)}>{membership.projectName}</CardTitle>
          <CardMeta>
            {membershipRoles(membership)}
            {membership.teamName ? `，${membership.teamName}` : ""}
          </CardMeta>
          <CardMeta>
            {`${formatChinaDate(membership.enteredAt)} 进场`}
            {membership.exitedAt ? `，${formatChinaDate(membership.exitedAt)} 退场` : ""}
            {membership.evaluationScore === null ? "" : `，项目评分 ${membership.evaluationScore}`}
          </CardMeta>
          {membership.history.length > 1 ? (
            <View className="m-fade">
              {historyLines(membership.history)
                .slice(0, 5)
                .map((line, index) => (
                  <CardMeta key={`${membership.memberId}-${index}`}>{line}</CardMeta>
                ))}
            </View>
          ) : null}
        </Card>
      ))}
      {own ? (
        <Notice>这是你自己的任职，离岗要由更高一级的管理员办理。</Notice>
      ) : active.length > 0 ? (
        <>
          <SectionTitle>离岗</SectionTitle>
          <Chips
            options={MODES}
            selected={[mode]}
            onToggle={(value) => {
              if (!busy) setMode(value);
            }}
          />
          <Picker mode="date" value={date} onChange={(event) => setDate(event.detail.value)}>
            <Sheet gap>
              <FormRow label="离岗日期" value={date} chevron />
            </Sheet>
          </Picker>
          <Notice>{summary.text}</Notice>
          {failure !== null ? <Notice tone="error">{failure}</Notice> : null}
          <BottomBar
            primary={busy ? "办理中…" : words.button}
            busy={busy}
            disabled={summary.projects.length === 0}
            onPrimary={() => void offboard()}
          />
        </>
      ) : (
        <Sheet gap>
          <Row title="他在本公司的项目都已退场" mute />
        </Sheet>
      )}
    </Screen>
  );
}
