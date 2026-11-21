import { View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useRef, useState } from "react";

import {
  joinText,
  personInitial,
} from "../../components/member-role-editor/person-text";
import {
  BottomBar,
  Button,
  Card,
  CardActions,
  CardMeta,
  Check,
  Code,
  Notice,
  PageHeader,
  Row,
  Screen,
  Segmented,
  Sheet,
  SkeletonRows,
  StateView,
} from "../../components/ui/index";
import { useManagedProjectId } from "../../hooks/use-management-scope";
import { useSessionGuard } from "../../hooks/use-session-guard";
import { displayProjectRole } from "../../routing/features";
import {
  createInvitation,
  type BindingInvitation,
  type BindingTargetType,
} from "../../services/bindings";
import { fetchParticipants } from "../../services/management";
import type { ProjectParticipant } from "../../services/management.types";
import { formatChinaDate, formatChinaHm } from "../../services/time";
import { useSession } from "../../store/session";
import { errorMessage } from "../../services/error-messages";

import "./index.scss";

const TARGET_OPTIONS = [
  { label: "工人", value: "WORKER" as const },
  { label: "管理员", value: "MANAGER" as const },
];

const personName = (person: ProjectParticipant): string =>
  person.displayName ?? `尾号 ${person.phone.slice(-4)} 的成员`;

/** “11月25日 10:00” */
const expiryLabel = (iso: string): string => {
  const date = formatChinaDate(iso);
  return `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日 ${formatChinaHm(iso)}`;
};

export default function Invitation(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  const projectId = useManagedProjectId(state.me);
  // 新建项目后“去邀请”带 target=MANAGER，直接停在管理员一栏。
  const requestedTarget = Taro.useRouter().params.target;
  const [target, setTarget] = useState<BindingTargetType>(
    requestedTarget === "MANAGER" ? "MANAGER" : "WORKER",
  );
  const [items, setItems] = useState<ReadonlyArray<ProjectParticipant> | null>(
    null,
  );
  const [attempt, setAttempt] = useState(0);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(
    null,
  );
  const [invitation, setInvitation] = useState<BindingInvitation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // 请求回来时拿它核对：返回的码必须属于此刻选中的人。
  const selectionRef = useRef({ profileId: selectedProfileId, target });
  selectionRef.current = { profileId: selectedProfileId, target };

  useEffect(() => {
    if (projectId === null) {
      return;
    }
    let cancelled = false;
    setLoadError(null);
    void (async () => {
      try {
        const rows = await fetchParticipants(projectId);
        if (!cancelled) {
          setItems(rows);
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(errorMessage(e, "成员列表读取失败，请重试。"));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, attempt]);

  const visible = (items ?? []).filter((p) => p.participantType === target);

  if (projectId === null) {
    return (
      <Screen header={<PageHeader title="邀请绑定" />}>
        <StateView
          kind="empty"
          title="没有可以管理的项目"
          sub="当前账号没有项目管理员身份。"
        />
      </Screen>
    );
  }

  const submit = async (): Promise<void> => {
    if (selectedProfileId === null || busy) {
      return;
    }
    const requested = { profileId: selectedProfileId, target };
    setBusy(true);
    setError(null);
    try {
      const r = await createInvitation(projectId, {
        profileId: requested.profileId,
        targetType: requested.target,
      });
      // 生成期间换了人（或换了类型），这张码不属于当前选中的人，不显示。
      const current = selectionRef.current;
      if (
        r.profileId !== current.profileId ||
        requested.profileId !== current.profileId ||
        requested.target !== current.target
      ) {
        return;
      }
      setInvitation(r);
    } catch (e) {
      const current = selectionRef.current;
      if (
        requested.profileId !== current.profileId ||
        requested.target !== current.target
      ) {
        return;
      }
      const message = errorMessage(e, "邀请码生成未完成，请重试。");
      setError(message);
      await Taro.showToast({ icon: "none", title: message });
    } finally {
      setBusy(false);
    }
  };
  const copy = async (code: string): Promise<void> => {
    try {
      await Taro.setClipboardData({ data: code });
      await Taro.showToast({ icon: "success", title: "已复制" });
    } catch {
      await Taro.showToast({ icon: "none", title: "没复制上，请再点一次" });
    }
  };

  // 邀请码和出错说明都跟在选中的那一行下面，名单再长也不用翻到底。
  const selectedIndex = visible.findIndex(
    (p) => p.profileId === selectedProfileId,
  );
  const splitAt =
    invitation !== null || error !== null ? selectedIndex + 1 : visible.length;
  const head = splitAt > 0 ? visible.slice(0, splitAt) : visible;
  const tail = splitAt > 0 ? visible.slice(splitAt) : [];
  const selected = selectedIndex < 0 ? null : (visible[selectedIndex] ?? null);
  // 重名的人在副行里带上手机尾号，免得把码发错人。
  const repeated = new Set(
    visible
      .map(personName)
      .filter((name, index, names) => names.indexOf(name) !== index),
  );
  const row = (p: ProjectParticipant): JSX.Element => (
    <Row
      key={p.profileId}
      title={personName(p)}
      avatar={personInitial(p.displayName)}
      sub={joinText([
        displayProjectRole(p.projectRoleLabel),
        p.teamName,
        repeated.has(personName(p)) ? `尾号 ${p.phone.slice(-4)}` : null,
      ])}
      onClick={() => {
        if (busy) {
          return;
        }
        setSelectedProfileId(p.profileId);
        setInvitation(null);
        setError(null);
      }}
    >
      <Check round checked={p.profileId === selectedProfileId} />
    </Row>
  );

  return (
    <Screen header={<PageHeader title="邀请绑定" />}>
      <Segmented
        options={TARGET_OPTIONS}
        value={target}
        onChange={(v) => {
          if (busy) {
            return;
          }
          setTarget(v);
          setSelectedProfileId(null);
          setInvitation(null);
          setError(null);
        }}
      />

      {items === null ? (
        loadError !== null ? (
          <StateView
            kind="error"
            title="成员没读到"
            sub={loadError}
            onRetry={() => setAttempt(attempt + 1)}
          />
        ) : (
          <SkeletonRows rows={4} gap />
        )
      ) : visible.length === 0 ? (
        <StateView
          kind="empty"
          title={target === "WORKER" ? "还没有工人" : "还没有管理员"}
          sub="先到项目人员里添加成员，再来生成邀请码。"
        />
      ) : (
        <>
          <Sheet gap>{head.map(row)}</Sheet>
          {invitation !== null && selected !== null ? (
            <View className="m-fade">
              <Card gap>
                <CardMeta>{personName(selected)}的邀请码</CardMeta>
                <View
                  className={
                    invitation.code.length > 8
                      ? "invitation-code invitation-code--long"
                      : "invitation-code"
                  }
                >
                  <Code>{invitation.code}</Code>
                </View>
                <CardMeta>
                  有效到 {expiryLabel(invitation.expiresAt)}
                  。复制后发给他本人，由他在微信里绑定。
                </CardMeta>
                <CardActions>
                  <Button
                    onClick={() => {
                      void copy(invitation.code);
                    }}
                  >
                    复制邀请码
                  </Button>
                  <Button
                    variant="text"
                    disabled={busy}
                    onClick={() => {
                      void submit();
                    }}
                  >
                    {busy ? "生成中…" : "重新生成"}
                  </Button>
                </CardActions>
              </Card>
            </View>
          ) : null}
          {error !== null ? <Notice tone="error">{error}</Notice> : null}
          {tail.length > 0 ? <Sheet gap>{tail.map(row)}</Sheet> : null}
          <Notice>
            邀请码给还没绑定微信的成员用。选一个人，生成后发给他本人。
          </Notice>
          {invitation === null ? (
            <BottomBar
              primary={busy ? "生成中…" : "生成邀请码"}
              busy={busy}
              disabled={selectedProfileId === null}
              onPrimary={() => {
                void submit();
              }}
            />
          ) : null}
        </>
      )}
    </Screen>
  );
}
