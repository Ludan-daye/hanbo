import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";

import {
  Button,
  Chips,
  Notice,
  Row,
  SearchField,
  SectionTitle,
  Sheet,
  SkeletonRows,
  StateView,
} from "../../../components/ui";
import { displayProjectRole } from "../../../routing/features";
import { errorMessage } from "../../../services/error-messages";
import {
  disableAccount,
  enableAccount,
  fetchAccount,
  fetchAccounts,
  type PlatformAccount,
  type PlatformAccountDetail,
  type PlatformAccountRole,
  type PlatformAccountStatus,
} from "../../../services/workflows";
import {
  accountLastLogin,
  accountRoleSub,
  accountRoleTarget,
  accountRowStatus,
  accountRowSub,
} from "../system-view";

type StatusFilter = "ALL" | PlatformAccountStatus;

const STATUS_FILTERS: ReadonlyArray<{ readonly value: StatusFilter; readonly label: string }> = [
  { value: "ALL", label: "全部" },
  { value: "ACTIVE", label: "正常" },
  { value: "DISABLED", label: "已停用" },
];

/** “账号”标签：服务器上按姓名、手机号查，一次读 30 个；只列绑定了的账号。 */
export const AccountsTab = ({
  revision,
  onOpen,
  onRetry,
}: {
  /** 每次变了就从头再读（停用、恢复之后，点重试）。 */
  readonly revision: number;
  readonly onOpen: (account: PlatformAccount) => void;
  readonly onRetry: () => void;
}): JSX.Element => {
  const [search, setSearch] = useState<string>("");
  const [query, setQuery] = useState<string>("");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [items, setItems] = useState<readonly PlatformAccount[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const filter = status === "ALL" ? null : status;

  // 停下输入半秒再查，免得每敲一个字发一次请求。
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 500);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setLoadError(null);
    setMoreError(null);
    fetchAccounts({ search: query, status: filter, cursor: null }).then(
      (page) => {
        if (cancelled) return;
        setItems(page.items);
        setCursor(page.nextCursor);
      },
      (cause: unknown) => {
        if (!cancelled) setLoadError(errorMessage(cause, "账号列表没读到"));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [query, filter, revision]);

  const loadMore = async (): Promise<void> => {
    if (cursor === null || loadingMore) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await fetchAccounts({ search: query, status: filter, cursor });
      setItems((current) => [...(current ?? []), ...page.items]);
      setCursor(page.nextCursor);
    } catch (cause: unknown) {
      setMoreError(errorMessage(cause, "没读到更多，请重试"));
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <>
      <SearchField value={search} placeholder="搜索姓名或手机号" onInput={setSearch} />
      <Chips<StatusFilter> options={STATUS_FILTERS} selected={[status]} onToggle={setStatus} />
      {loadError !== null ? (
        <StateView kind="error" title="账号列表没读到" sub={loadError} onRetry={onRetry} />
      ) : items === null ? (
        <SkeletonRows rows={4} gap />
      ) : items.length === 0 ? (
        query === "" && filter === null ? (
          <StateView kind="empty" title="还没有账号" sub="有人用邀请码绑定之后，会出现在这里。" />
        ) : (
          <StateView kind="empty" title="没有找到账号" sub="换个姓名、手机号或状态试试。" />
        )
      ) : (
        <>
          <Sheet gap>
            {items.map((account) => (
              <Row
                key={account.userId}
                title={account.displayName}
                avatar={account.displayName.slice(0, 1)}
                sub={accountRowSub(account)}
                status={accountRowStatus(account)}
                chevron
                onClick={() => onOpen(account)}
              />
            ))}
          </Sheet>
          {moreError !== null ? <Notice tone="error">{moreError}</Notice> : null}
          {cursor !== null ? (
            <Button variant="outline" wide loading={loadingMore} disabled={loadingMore} onClick={() => void loadMore()}>
              再读 30 个
            </Button>
          ) : null}
          <Notice>点一个账号，看他在各公司、各项目的身份，必要时停用。身份要到它所在的公司或项目里改。</Notice>
        </>
      )}
    </>
  );
};

/** 一个账号：身份（只显示，点了去改的地方）、登录情况、停用和恢复。 */
export const AccountScreen = ({
  userId,
  self,
  onLoaded,
  onChanged,
  onOpenCompany,
}: {
  readonly userId: string;
  /** 这是当前登录的账号。 */
  readonly self: boolean;
  /** 读到账号后把姓名交给页头。 */
  readonly onLoaded: (name: string) => void;
  /** 停用或恢复了，回到列表时要重读。 */
  readonly onChanged: () => void;
  /** 公司管理员身份：打开平台里的这家公司。 */
  readonly onOpenCompany: (company: { readonly id: string; readonly name: string }) => void;
}): JSX.Element => {
  const [account, setAccount] = useState<PlatformAccountDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<number>(0);
  const [busy, setBusy] = useState<boolean>(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    fetchAccount(userId).then(
      (next) => {
        if (cancelled) return;
        setAccount(next);
        onLoaded(next.displayName);
      },
      (cause: unknown) => {
        if (!cancelled) setLoadError(errorMessage(cause, "账号没读到"));
      },
    );
    return () => {
      cancelled = true;
    };
    // onLoaded 是页面的 state setter，引用不变。
  }, [userId, attempt]);

  if (account === null)
    return loadError !== null ? (
      <StateView kind="error" title="账号没读到" sub={loadError} onRetry={() => setAttempt((value) => value + 1)} />
    ) : (
      <SkeletonRows rows={4} gap />
    );

  const disabled = account.status === "DISABLED";
  const toggle = async (): Promise<void> => {
    if (busy) return;
    const confirmed = await Taro.showModal({
      title: disabled ? "恢复账号" : "停用账号",
      content: disabled
        ? `恢复后，${account.displayName}可以重新登录，身份和以前一样。`
        : `停用后，${account.displayName}会立刻退出登录，也不能再登录。他的任职、考勤和补卡记录都不动，随时可以恢复。`,
      confirmText: disabled ? "恢复" : "停用",
    });
    if (!confirmed.confirm) return;
    setBusy(true);
    setProblem(null);
    try {
      const next = disabled ? await enableAccount(account.userId) : await disableAccount(account.userId);
      setAccount(next);
      onChanged();
      await Taro.showToast({ title: disabled ? "已恢复" : "已停用", icon: "success" });
    } catch (cause: unknown) {
      setProblem(errorMessage(cause, disabled ? "没恢复成功，请重试。" : "没停用成功，请重试。"));
    } finally {
      setBusy(false);
    }
  };

  const openRole = (role: PlatformAccountRole): (() => void) | undefined => {
    const target = accountRoleTarget(role);
    if (target === null) return undefined;
    return target.kind === "company"
      ? () => onOpenCompany({ id: target.companyId, name: target.name })
      : () => {
          void Taro.navigateTo({ url: target.url });
        };
  };

  return (
    <>
      <Sheet gap>
        <Row
          title={account.displayName}
          avatar={account.displayName.slice(0, 1)}
          sub={[account.phone, accountLastLogin(account)].filter((part) => part !== null).join("，")}
          status={disabled ? { kind: "bad", text: "已停用" } : { kind: "ok", text: "正常" }}
        />
      </Sheet>

      <SectionTitle>身份</SectionTitle>
      {account.roles.length === 0 ? (
        <Sheet gap>
          <Row title="还没有身份" sub="他绑定了，但不在任何项目里，也没有被任命。" mute />
        </Sheet>
      ) : (
        <Sheet gap>
          {account.roles.map((role) => {
            const onClick = openRole(role);
            return (
              <Row
                key={`${role.roleCode}:${role.scopeType}:${role.scopeId}`}
                title={displayProjectRole(role.roleCode)}
                sub={accountRoleSub(role)}
                chevron={onClick !== undefined}
                {...(onClick === undefined ? {} : { onClick })}
              />
            );
          })}
        </Sheet>
      )}
      <Notice>这里只显示。公司管理员在公司详情里任免；项目、班组身份点进去，在那个项目的人员资料里改。</Notice>

      <SectionTitle>账号</SectionTitle>
      {self ? (
        <Notice>这是你自己的账号，不能停用。</Notice>
      ) : account.isSystemAdmin ? (
        <Notice>超级管理员只能由部署的人在服务器上用命令开通或撤销，这里不能停用。</Notice>
      ) : (
        <>
          <Sheet gap>
            <Row
              title="登录中的设备"
              value={account.activeSessionCount === 0 ? "没有" : `${account.activeSessionCount} 个`}
              mute
            />
          </Sheet>
          {problem !== null ? <Notice tone="error">{problem}</Notice> : null}
          <Button variant={disabled ? "outline" : "danger"} wide loading={busy} disabled={busy} onClick={() => void toggle()}>
            {disabled ? "恢复账号" : "停用账号"}
          </Button>
          <Notice>
            {disabled ? "恢复后他可以重新登录。" : "员工离职、手机丢失或账号被盗时停用。停用会让他立刻退出登录。"}
          </Notice>
        </>
      )}
    </>
  );
};
