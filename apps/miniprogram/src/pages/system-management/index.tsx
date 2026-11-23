import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";

import {
  PageHeader,
  Screen,
  Segmented,
  SkeletonRows,
  StateView,
} from "../../components/ui";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { useSessionGuard } from "../../hooks/use-session-guard";
import {
  fetchCompanyProjects,
  fetchProjectTeams,
} from "../../services/management";
import type {
  CompanyProject,
  ProjectTeam,
} from "../../services/management.types";
import {
  createCompany,
  fetchAccounts,
  fetchAuditEntries,
  fetchCompanies,
  fetchSystemSettings,
  saveAccount,
  saveSystemSettings,
  type Account,
  type AuditEntry,
  type Company,
  type SystemSettings,
} from "../../services/workflows";
import { useSession } from "../../store/session";
import { errorMessage } from "../../services/error-messages";
import {
  EMPTY_COMPANY_DRAFT,
  companyFormOf,
  companyFormProblem,
  levelText,
  scopeOptions,
  systemScreen,
  type CompanyDraft,
} from "./system-view";
import { AccountView, AccountsTab } from "./views/accounts";
import { AuditTab } from "./views/audit";
import { CompaniesTab, NewCompanyView } from "./views/companies";
import { CompanyScreen, type CompanyMode } from "./views/company";
import { SettingsTab } from "./views/settings";

import "./index.scss";

type Tab = "COMPANIES" | "ACCOUNTS" | "SETTINGS" | "AUDIT";

/** 一个标签自己读自己的数据：读不到只影响这一个标签。 */
const useTabData = <T,>(
  enabled: boolean,
  revision: number,
  load: () => Promise<T>,
): { readonly data: T | null; readonly error: string | null } => {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setError(null);
    load().then(
      (next) => {
        if (!cancelled) setData(next);
      },
      (cause: unknown) => {
        if (!cancelled) setError(errorMessage(cause, "请稍后重试。"));
      },
    );
    return () => {
      cancelled = true;
    };
    // load 每次渲染都是新的；只按标签和刷新次数重读。
  }, [enabled, revision]);
  return { data, error };
};

/** 账号的管理范围要用的公司、项目、班组：点开一个账号时才读（账号标签现在只有演示版）。 */
const loadScopeData = async (): Promise<{
  readonly companies: readonly Company[];
  readonly projects: readonly CompanyProject[];
  readonly teams: readonly ProjectTeam[];
}> => {
  const companies = (await fetchCompanies({ search: "", status: null, cursor: null })).items.map(
    (row): Company => ({ id: row.id, name: row.name, status: row.status === "ACTIVE" ? "ACTIVE" : "SUSPENDED" }),
  );
  const projects = (await Promise.all(companies.map((row) => fetchCompanyProjects(row.id)))).flat();
  const teams = (await Promise.all(projects.map((row) => fetchProjectTeams(row.id)))).flat();
  return { companies, projects, teams };
};

export default function SystemManagement(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  const { revision, refresh } = usePageRefresh();
  const [tab, setTab] = useState<Tab>("COMPANIES");
  const allowed = state.me?.roles.highestRoleCode === "SYSTEM_ADMIN";
  // 同一个页面里的另外几屏：点开的公司（看、改资料、任命）、新增公司、改账号权限。
  const [openCompany, setOpenCompany] = useState<{ readonly id: string; readonly name: string } | null>(null);
  const [companyMode, setCompanyMode] = useState<CompanyMode>("detail");
  const [addingCompany, setAddingCompany] = useState<boolean>(false);
  const [companyDraft, setCompanyDraft] = useState<CompanyDraft>(EMPTY_COMPANY_DRAFT);
  const [draft, setDraft] = useState<Account | null>(null);
  const [scopeData, setScopeData] = useState<Awaited<ReturnType<typeof loadScopeData>> | null>(null);
  const [search, setSearch] = useState<string>("");
  // 读取失败各标签自己显示；保存、校验失败只在按钮旁边说明，填的东西留着。
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const accounts = useTabData(allowed && (tab === "ACCOUNTS" || tab === "AUDIT"), revision, fetchAccounts);
  const settingsRead = useTabData(allowed && tab === "SETTINGS", revision, fetchSystemSettings);
  const audit = useTabData<readonly AuditEntry[]>(allowed && tab === "AUDIT", revision, fetchAuditEntries);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  useEffect(() => setSettings(settingsRead.data), [settingsRead.data]);

  const runAction = async (action: () => Promise<unknown>): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      refresh();
      await Taro.showToast({ title: "已保存", icon: "success" });
    } catch (failure: unknown) {
      setError(errorMessage(failure, "没保存成功，请重试。"));
    } finally {
      setBusy(false);
    }
  };

  const openAccount = (account: Account): void => {
    setDraft(account);
    setError(null);
    if (scopeData !== null) return;
    loadScopeData().then(setScopeData, (cause: unknown) =>
      setError(errorMessage(cause, "管理范围没读到，请返回重试。")),
    );
  };
  const scopes =
    draft && scopeData
      ? scopeOptions(draft.roleCode, scopeData.companies, scopeData.projects, scopeData.teams)
      : [];
  const savePermissions = async (): Promise<void> => {
    if (!draft || busy) return;
    const scope = scopes.find((row) => row.id === draft.scopeId);
    if (!draft.scopeId || scope === undefined) {
      setError("请选择和权限等级对应的管理范围。");
      return;
    }
    const confirmed = await Taro.showModal({
      title: "调整账号权限",
      content: `${draft.name}：${levelText(draft.roleCode)}，${scope.name}，${draft.status === "ACTIVE" ? "正常使用" : "停用"}。新权限在这个账号下次进入时生效。`,
      confirmText: "保存权限",
    });
    if (confirmed.confirm)
      await runAction(async () => {
        await saveAccount(draft);
        setDraft(null);
      });
  };

  const screen = systemScreen({
    editingAccount: draft !== null,
    addingCompany,
    hasCompany: openCompany !== null,
  });
  const backToList = (): void => {
    if (screen === "company" && companyMode !== "detail") {
      setCompanyMode("detail");
      setError(null);
      return;
    }
    setDraft(null);
    setAddingCompany(false);
    setOpenCompany(null);
    setCompanyMode("detail");
    setError(null);
  };
  const title =
    screen === "account"
      ? "账号权限"
      : screen === "new-company"
        ? "新增公司"
        : screen === "company" && openCompany !== null
          ? companyMode === "edit"
            ? "修改公司资料"
            : companyMode === "appoint"
              ? "任命公司管理员"
              : openCompany.name
          : "平台管理";

  const createNewCompany = (): void => {
    const form = companyFormOf(companyDraft);
    const invalid = companyFormProblem(form);
    if (invalid !== null) {
      setError(invalid);
      return;
    }
    void (async (): Promise<void> => {
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        const created = await createCompany(form);
        // 建好了直接打开这家公司，下一步就是任命管理员；没建成留在这一屏，填的还在。
        setCompanyDraft(EMPTY_COMPANY_DRAFT);
        setAddingCompany(false);
        setOpenCompany({ id: created.id, name: created.name });
        setCompanyMode("detail");
        refresh();
        await Taro.showToast({ title: "已创建", icon: "success" });
      } catch (failure: unknown) {
        setError(errorMessage(failure, "没创建成功，请重试。"));
      } finally {
        setBusy(false);
      }
    })();
  };

  const tabState = (
    data: unknown,
    loadError: string | null,
    render: () => JSX.Element | null,
  ): JSX.Element | null =>
    loadError !== null ? (
      <StateView kind="error" title="平台数据没读到" sub={loadError} onRetry={refresh} />
    ) : data === null ? (
      <SkeletonRows rows={4} gap />
    ) : (
      render()
    );

  const renderScreen = (): JSX.Element | null => {
    if (screen === "account" && draft !== null)
      return (
        <AccountView
          saved={accounts.data?.find((row) => row.id === draft.id) ?? draft}
          draft={draft}
          self={draft.id === state.me?.user.id}
          scopes={scopes}
          busy={busy}
          problem={error}
          onRole={(roleCode) =>
            setDraft({
              ...draft,
              roleCode,
              scopeId: scopeData
                ? (scopeOptions(roleCode, scopeData.companies, scopeData.projects, scopeData.teams)[0]?.id ?? "")
                : "",
            })
          }
          onScope={(scopeId) => setDraft({ ...draft, scopeId })}
          onStatus={(status) => setDraft({ ...draft, status })}
          onSave={() => {
            void savePermissions();
          }}
        />
      );
    if (screen === "new-company")
      return (
        <NewCompanyView
          draft={companyDraft}
          busy={busy}
          problem={error}
          onChange={setCompanyDraft}
          onCreate={createNewCompany}
        />
      );
    if (screen === "company" && openCompany !== null)
      return (
        <CompanyScreen
          companyId={openCompany.id}
          mode={companyMode}
          onMode={setCompanyMode}
          onLoaded={(name) => setOpenCompany({ id: openCompany.id, name })}
          onChanged={refresh}
        />
      );
    if (tab === "COMPANIES")
      return (
        <CompaniesTab
          revision={revision}
          onRetry={refresh}
          onOpen={(company) => {
            setOpenCompany({ id: company.id, name: company.name });
            setCompanyMode("detail");
            setError(null);
          }}
          onAdd={() => {
            setAddingCompany(true);
            setError(null);
          }}
        />
      );
    if (tab === "ACCOUNTS")
      return tabState(accounts.data, accounts.error, () => (
        <AccountsTab
          accounts={accounts.data ?? []}
          search={search}
          onSearch={setSearch}
          onOpen={openAccount}
        />
      ));
    if (tab === "SETTINGS")
      return tabState(settings, settingsRead.error, () =>
        settings ? (
          <SettingsTab
            settings={settings}
            busy={busy}
            problem={error}
            onChange={setSettings}
            onSave={() => {
              void runAction(() => saveSystemSettings(settings));
            }}
          />
        ) : null,
      );
    return tabState(audit.data, audit.error, () => (
      <AuditTab audit={audit.data ?? []} accounts={accounts.data ?? []} />
    ));
  };

  return (
    <Screen
      header={
        <PageHeader
          title={title}
          onBack={screen === "list" ? undefined : backToList}
        />
      }
    >
      {!allowed ? (
        <StateView
          kind="empty"
          title="只有超级管理员能用平台管理"
          sub="这个账号没有平台管理权限。"
        />
      ) : (
        <>
          {screen === "list" ? (
            <Segmented<Tab>
              options={[
                { value: "COMPANIES", label: "公司" },
                { value: "ACCOUNTS", label: "账号" },
                { value: "SETTINGS", label: "设置" },
                { value: "AUDIT", label: "日志" },
              ]}
              value={tab}
              onChange={(value) => {
                setTab(value);
                setError(null);
              }}
            />
          ) : null}
          {renderScreen()}
        </>
      )}
    </Screen>
  );
}
