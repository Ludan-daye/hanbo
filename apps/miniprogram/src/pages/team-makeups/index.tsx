import { View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
import { useSessionGuard } from "../../hooks/use-session-guard";

import {
  Button,
  Field,
  ListItem,
  Notice,
  PageHeader,
  Screen,
  StateView,
  Subtitle,
} from "../../components/ui/index";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { resolveTeamLeaderTeamId } from "../../routing/teamLeader";
import {
  approveMakeup,
  fetchPendingMakeups,
  rejectMakeup,
  type PendingMakeup,
} from "../../services/makeups";
import { fetchTeamParticipants } from "../../services/management";
import type { ProjectParticipant } from "../../services/management.types";
import { formatChinaHm } from "../../services/time";
import { useSession } from "../../store/session";

const POINT_LABEL: Readonly<Record<PendingMakeup["pointCode"], string>> = {
  SEGMENT_1_END: "上午下班",
  SEGMENT_1_START: "上午上班",
  SEGMENT_2_END: "下午下班",
  SEGMENT_2_START: "下午上班",
};
type ReviewAction = (
  id: string,
  body: { readonly approvalReason: string },
) => Promise<unknown>;
export default function TeamMakeups(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  const { revision, refresh } = usePageRefresh();
  const teamId = resolveTeamLeaderTeamId(state.me);
  const [items, setItems] = useState<readonly PendingMakeup[] | null>(null);
  const [members, setMembers] = useState<readonly ProjectParticipant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Readonly<Record<string, string>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    if (teamId === null) return;
    let cancelled = false;
    setError(null);
    void Promise.all([
      fetchPendingMakeups(teamId),
      fetchTeamParticipants(teamId),
    ]).then(
      ([rows, people]) => {
        if (!cancelled) {
          setItems(rows);
          setMembers(people);
        }
      },
      (cause) => {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : "无法读取审批列表");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [teamId, revision]);
  const review = async (
    id: string,
    action: ReviewAction,
    title: string,
  ): Promise<void> => {
    if (busy !== null) return;
    const approvalReason = (reasons[id] ?? "").trim();
    if (approvalReason.length === 0) {
      await Taro.showToast({ icon: "none", title: "请填写审批意见" });
      return;
    }
    const confirmation = await Taro.showModal({
      title,
      content: `审批意见：${approvalReason}`,
      confirmText: "确认处理",
      confirmColor: "#2675ed",
    });
    if (!confirmation.confirm) return;
    setBusy(id);
    setError(null);
    try {
      await action(id, { approvalReason });
      setItems((rows) => (rows ?? []).filter((row) => row.id !== id));
      setOpenId(null);
      await Taro.showToast({ icon: "success", title: "已处理" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "审批未完成，请重试");
    } finally {
      setBusy(null);
    }
  };
  return (
    <Screen>
      <PageHeader title="补卡审批" />
      {teamId === null ? (
        <StateView title="暂无班组管理权限" />
      ) : (
        <View>
          <Notice>
            请核实实际出勤情况后处理申请，审批结果将同步到工人的考勤记录。
          </Notice>
          <View className="report-section-title">
            待处理申请 · {items?.length ?? 0} 条
          </View>
          {items === null && error === null ? (
            <StateView title="加载中…" />
          ) : null}
          {error ? (
            <StateView title="操作未完成" sub={error} onRetry={refresh} />
          ) : null}
          {items?.length === 0 ? (
            <StateView title="全部处理完毕" sub="目前没有待审批的补卡申请。" />
          ) : null}
          {(items ?? []).map((item) => {
            const member = members.find(
              (person) =>
                person.profileId === item.participantId &&
                person.participantType === item.participantType,
            );
            const name =
              member?.displayName ??
              (member ? `成员 · ${member.phone.slice(-4)}` : "班组成员");
            return (
              <View key={item.id} className="form-card">
                <ListItem
                  primary={name}
                  secondary={`${item.attendanceDate} · ${POINT_LABEL[item.pointCode]} · ${formatChinaHm(item.requestedOccurredAt)}`}
                  chip="待审批"
                  onClick={() => {
                    if (busy === null)
                      setOpenId(openId === item.id ? null : item.id);
                  }}
                />
                <Subtitle>申请原因：{item.reason}</Subtitle>
                {openId === item.id ? (
                  <View>
                    <Field
                      value={reasons[item.id] ?? ""}
                      placeholder="填写审批意见（必填）"
                      onInput={(value) => {
                        setReasons((previous) => ({
                          ...previous,
                          [item.id]: value,
                        }));
                      }}
                    />
                    <View className="action-row">
                      <Button
                        loading={busy === item.id}
                        disabled={
                          busy !== null ||
                          (reasons[item.id] ?? "").trim().length === 0
                        }
                        onClick={() => {
                          void review(
                            item.id,
                            approveMakeup,
                            "确认通过这条补卡？",
                          );
                        }}
                      >
                        通过申请
                      </Button>
                      <Button
                        variant="danger"
                        disabled={
                          busy !== null ||
                          (reasons[item.id] ?? "").trim().length === 0
                        }
                        onClick={() => {
                          void review(
                            item.id,
                            rejectMakeup,
                            "确认驳回这条补卡？",
                          );
                        }}
                      >
                        驳回申请
                      </Button>
                    </View>
                  </View>
                ) : (
                  <Button
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() => {
                      setOpenId(item.id);
                    }}
                  >
                    查看并审批
                  </Button>
                )}
              </View>
            );
          })}
        </View>
      )}
    </Screen>
  );
}
