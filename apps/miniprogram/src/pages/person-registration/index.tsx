import { View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";

import { personInitial } from "../../components/member-role-editor/person-text";
import {
  BottomBar,
  Button,
  Card,
  KV,
  Notice,
  PageHeader,
  Row,
  Screen,
  SectionTitle,
  Sheet,
  StateView,
} from "../../components/ui/index";
import { useManagedProjectId } from "../../hooks/use-management-scope";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { useSessionGuard } from "../../hooks/use-session-guard";
import { errorMessage } from "../../services/error-messages";
import {
  fetchMemberRegistration,
  verifyMemberRegistration,
  type MemberRegistration,
} from "../../services/registration-review";
import { useSession } from "../../store/session";

import {
  registrationGroups,
  registrationSub,
  verificationActions,
  verificationLabel,
} from "./registration-review-view";

const ACTION_TEXT = {
  VERIFIED: "核对无误",
  NEEDS_UPDATE: "需要更正",
} as const;

/**
 * 用工资料核实：项目管理员看工人填的用工登记原文，标记“已核实”或“需更正”。
 * 不用写理由，也不用传凭证；每次标记都留操作记录。
 */
export default function PersonRegistration(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  const projectId = useManagedProjectId(state.me);
  const { memberId } = Taro.useRouter().params;
  const { revision, refresh } = usePageRefresh();
  const [data, setData] = useState<MemberRegistration | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  useEffect(() => {
    if (!projectId || !memberId) return;
    let cancelled = false;
    setLoadError(null);
    void fetchMemberRegistration(projectId, memberId).then(
      (value) => {
        if (!cancelled) setData(value);
      },
      (cause: unknown) => {
        if (!cancelled) setLoadError(errorMessage(cause, "用工资料没读到"));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [projectId, memberId, revision]);

  const mark = async (status: "VERIFIED" | "NEEDS_UPDATE"): Promise<void> => {
    if (!projectId || !memberId || data === null || busy) return;
    if (status === "NEEDS_UPDATE") {
      const answer = await Taro.showModal({
        title: "标记为需更正",
        content: "请当面或电话告诉他哪里要改，他在小程序里改好后会重新等你核实。",
        confirmText: "标记",
      });
      if (!answer.confirm) return;
    }
    setBusy(true);
    setSubmitError(null);
    try {
      setData(
        await verifyMemberRegistration(projectId, memberId, {
          status,
          expectedVersion: data.verification.version,
        }),
      );
      await Taro.showToast({
        icon: "success",
        title: status === "VERIFIED" ? "已核实" : "已标记",
      });
    } catch (cause: unknown) {
      setSubmitError(errorMessage(cause, "没有标记成功，请重试"));
    } finally {
      setBusy(false);
    }
  };

  const header = <PageHeader title="用工资料" />;
  if (!projectId || !memberId)
    return (
      <Screen header={header}>
        <StateView kind="empty" title="请从成员资料进入" />
      </Screen>
    );
  if (data === null)
    return (
      <Screen header={header}>
        {loadError ? (
          <StateView title="用工资料没读到" sub={loadError} onRetry={refresh} />
        ) : (
          <StateView title="正在读取用工资料" />
        )}
      </Screen>
    );

  const label = verificationLabel(data);
  const actions = verificationActions(data);
  return (
    <Screen header={header}>
      <Sheet gap>
        <Row
          title={data.displayName ?? "姓名待补录"}
          avatar={personInitial(data.displayName)}
          sub={registrationSub(data)}
          status={label}
        />
      </Sheet>
      {data.registration === null ? (
        <StateView
          kind="empty"
          title="他还没填用工登记"
          sub="工人绑定微信后在小程序里填写，填好后这里才能核实。"
        />
      ) : (
        registrationGroups(data.registration).map((group) => (
          <View key={group.title}>
            <SectionTitle>{group.title}</SectionTitle>
            <Card>
              {group.lines.map((line) => (
                <KV key={line.label} label={line.label} value={line.value} />
              ))}
            </Card>
          </View>
        ))
      )}
      {data.registration !== null ? (
        <Notice>
          {data.verification.status === "NEEDS_UPDATE"
            ? "已标记需更正。他改好提交后，状态会回到待核实。"
            : "和本人、身份证、银行卡核对过再标记。资料只在管理时用，不要外传。"}
        </Notice>
      ) : null}
      {submitError ? <Notice tone="error">{submitError}</Notice> : null}
      {actions.primary !== null || actions.secondary !== null ? (
        <BottomBar
          primary={
            actions.primary === null
              ? undefined
              : busy
                ? "保存中…"
                : ACTION_TEXT[actions.primary]
          }
          busy={busy}
          onPrimary={() => {
            if (actions.primary !== null) void mark(actions.primary);
          }}
        >
          {actions.secondary !== null ? (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                if (actions.secondary !== null) void mark(actions.secondary);
              }}
            >
              {actions.primary === null ? "改为需要更正" : ACTION_TEXT[actions.secondary]}
            </Button>
          ) : null}
        </BottomBar>
      ) : null}
    </Screen>
  );
}
