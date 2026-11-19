import { Picker, View } from "@tarojs/components";

import {
  BottomBar,
  Chips,
  FormRow,
  Notice,
  Row,
  SearchField,
  Sheet,
  StateView,
  type StatusKind,
} from "../../../components/ui";
import type { RoleCode } from "../../../services/auth.types";
import type { Account } from "../../../services/workflows";
import {
  ROLE_OPTIONS,
  accountSub,
  levelText,
  type ScopeOption,
} from "../system-view";

const accountStatus = (
  account: Account,
): { readonly kind: StatusKind; readonly text: string } =>
  account.status === "ACTIVE"
    ? { kind: "ok", text: "正常" }
    : { kind: "idle", text: "已停用" };

const STATUS_OPTIONS: ReadonlyArray<{
  readonly value: Account["status"];
  readonly label: string;
}> = [
  { value: "ACTIVE", label: "正常使用" },
  { value: "SUSPENDED", label: "停用" },
];

/** “账号”标签：找到人，点进去改权限。 */
export const AccountsTab = ({
  accounts,
  search,
  onSearch,
  onOpen,
}: {
  readonly accounts: readonly Account[];
  readonly search: string;
  readonly onSearch: (search: string) => void;
  readonly onOpen: (account: Account) => void;
}): JSX.Element => {
  const visible = accounts.filter((row) =>
    `${row.name} ${row.phone}`.includes(search.trim()),
  );
  return (
    <>
      <SearchField
        value={search}
        placeholder="搜索姓名或手机号"
        onInput={onSearch}
      />
      {visible.length === 0 ? (
        accounts.length === 0 ? (
          <StateView kind="empty" title="还没有账号" />
        ) : (
          <StateView
            kind="empty"
            title="没有找到账号"
            sub="换个姓名或手机号试试。"
          />
        )
      ) : (
        <>
          <Sheet gap>
            {visible.map((account) => (
              <Row
                key={account.id}
                title={account.name}
                avatar={account.name.slice(0, 1)}
                sub={accountSub(account)}
                status={accountStatus(account)}
                chevron
                onClick={() => onOpen(account)}
              />
            ))}
          </Sheet>
          <Notice>
            点一个账号，改它的权限等级、管理范围和状态。自己的权限要别的管理员来改。
          </Notice>
        </>
      )}
    </>
  );
};

/** 改一个账号的权限：等级、范围、状态。自己的不能改。 */
export const AccountView = ({
  saved,
  draft,
  self,
  scopes,
  busy,
  problem,
  onRole,
  onScope,
  onStatus,
  onSave,
}: {
  /** 现在生效的样子，显示在最上面那一行。 */
  readonly saved: Account;
  /** 正在改的样子。 */
  readonly draft: Account;
  /** 这是当前登录的账号。 */
  readonly self: boolean;
  /** 所选等级能管的范围。 */
  readonly scopes: readonly ScopeOption[];
  readonly busy: boolean;
  /** 没填对或没保存成功的原因。 */
  readonly problem: string | null;
  readonly onRole: (roleCode: RoleCode) => void;
  readonly onScope: (scopeId: string) => void;
  readonly onStatus: (status: Account["status"]) => void;
  readonly onSave: () => void;
}): JSX.Element => {
  const scope = scopes.find((row) => row.id === draft.scopeId);
  return (
    <>
      <Sheet gap>
        <Row
          title={saved.name}
          avatar={saved.name.slice(0, 1)}
          sub={accountSub(saved)}
          status={accountStatus(saved)}
        />
      </Sheet>
      {self ? (
        <Notice>
          这是你自己的账号。自己的权限不能自己改，要别的管理员来改。
        </Notice>
      ) : (
        <>
          <Sheet gap>
            <View className="system-pick">
              <Picker
                mode="selector"
                range={ROLE_OPTIONS.map(levelText)}
                value={ROLE_OPTIONS.indexOf(draft.roleCode)}
                disabled={busy}
                onChange={(event) =>
                  onRole(ROLE_OPTIONS[Number(event.detail.value)])
                }
              >
                <FormRow
                  label="权限等级"
                  value={levelText(draft.roleCode)}
                  chevron
                />
              </Picker>
            </View>
            {scopes.length === 0 ? (
              <FormRow
                label="管理范围"
                placeholder="先创建对应的公司、项目或班组"
              />
            ) : (
              <View className="system-pick">
                <Picker
                  mode="selector"
                  range={scopes.map((row) => row.name)}
                  value={Math.max(
                    0,
                    scopes.findIndex((row) => row.id === draft.scopeId),
                  )}
                  disabled={busy}
                  onChange={(event) =>
                    onScope(scopes[Number(event.detail.value)].id)
                  }
                >
                  <FormRow label="管理范围" placeholder="请选择" chevron>
                    {scope ? (
                      <View className="system-value">{scope.name}</View>
                    ) : undefined}
                  </FormRow>
                </Picker>
              </View>
            )}
            <FormRow label="状态">
              <Chips
                onSheet
                options={STATUS_OPTIONS}
                selected={[draft.status]}
                onToggle={onStatus}
              />
            </FormRow>
          </Sheet>
          <Notice>新权限在这个账号下次进入时生效。</Notice>
          {problem !== null ? <Notice tone="error">{problem}</Notice> : null}
          <BottomBar
            primary={busy ? "保存中…" : "保存权限"}
            busy={busy}
            onPrimary={onSave}
          />
        </>
      )}
    </>
  );
};
