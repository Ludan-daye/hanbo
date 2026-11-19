import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";

import {
  PageHeader,
  Screen,
  Segmented,
  SkeletonRows,
  StateView,
} from "../../components/ui/index";
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
  fetchAccounts,
  fetchAuditEntries,
  fetchCompanies,
  fetchSystemSettings,
  saveAccount,
  saveCompany,
  saveSystemSettings,
  type Account,
  type AuditEntry,
  type Company,
  type SystemSettings,
} from "../../services/workflows";
import { useSession } from "../../store/session";
import { errorMessage } from "../../services/error-messages";
import { levelText, scopeOptions, systemScreen } from "./system-view";
import { AccountView, AccountsTab } from "./views/accounts";
import { AuditTab } from "./views/audit";
import { CompaniesTab, CompanyView, NewCompanyView } from "./views/companies";
import { SettingsTab } from "./views/settings";

import "./index.scss";

type Tab = "COMPANIES" | "ACCOUNTS" | "SETTINGS" | "AUDIT";

export default function SystemManagement(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  const { revision, refresh } = usePageRefresh();
  const [tab, setTab] = useState<Tab>("COMPANIES");
  const [companies, setCompanies] = useState<readonly Company[]>([]);
  const [accounts, setAccounts] = useState<readonly Account[]>([]);
  const [projects, setProjects] = useState<readonly CompanyProject[]>([]);
  const [teams, setTeams] = useState<readonly ProjectTeam[]>([]);
  const [audit, setAudit] = useState<readonly AuditEntry[]>([]);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [draft, setDraft] = useState<Account | null>(null);
  const [companyName, setCompanyName] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  // 读取失败整块换成出错状态；保存、校验失败只在按钮旁边说明，填的东西留着。
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  // 同一个页面里的另外两屏：点开的公司，和新增公司。改账号权限那一屏跟着 draft 走。
  const [openCompanyId, setOpenCompanyId] = useState<string | null>(null);
  const [addingCompany, setAddingCompany] = useState<boolean>(false);
  const allowed = state.me?.roles.highestRoleCode === "SYSTEM_ADMIN";
  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    setLoadError(null);
    setError(null);
    setLoading(true);
    void (async (): Promise<void> => {
      try {
        const [companyRows, accountRows, systemSettings, logs] =
          await Promise.all([
            fetchCompanies(),
            fetchAccounts(),
            fetchSystemSettings(),
            fetchAuditEntries(),
          ]);
        const projectRows = (
          await Promise.all(
            companyRows.map((row) => fetchCompanyProjects(row.id)),
          )
        ).flat();
        const teamRows = (
          await Promise.all(projectRows.map((row) => fetchProjectTeams(row.id)))
        ).flat();
        if (!cancelled) {
          setCompanies(companyRows);
          setAccounts(accountRows);
          setSettings(systemSettings);
          setAudit(logs);
          setProjects(projectRows);
          setTeams(teamRows);
        }
      } catch (failure: unknown) {
        if (!cancelled) setLoadError(errorMessage(failure, "请稍后重试。"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [allowed, revision]);
  const runAction = async (action: () => Promise<unknown>): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      setCompanyName("");
      setDraft(null);
      refresh();
      await Taro.showToast({ title: "已保存", icon: "success" });
    } catch (failure: unknown) {
      setError(errorMessage(failure, "没保存成功，请重试。"));
    } finally {
      setBusy(false);
    }
  };
  const scopes = draft
    ? scopeOptions(draft.roleCode, companies, projects, teams)
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
    if (confirmed.confirm) await runAction(() => saveAccount(draft));
  };
  const openCompany = companies.find((row) => row.id === openCompanyId) ?? null;
  const screen = systemScreen({
    editingAccount: draft !== null,
    addingCompany,
    hasCompany: openCompany !== null,
  });
  const backToList = (): void => {
    setDraft(null);
    setAddingCompany(false);
    setOpenCompanyId(null);
    setError(null);
  };
  const title =
    screen === "account"
      ? "账号权限"
      : screen === "new-company"
        ? "新增公司"
        : screen === "company" && openCompany !== null
          ? openCompany.name
          : "平台管理";

  const renderScreen = (): JSX.Element | null => {
    if (screen === "account" && draft !== null)
      return (
        <AccountView
          saved={accounts.find((row) => row.id === draft.id) ?? draft}
          draft={draft}
          self={draft.id === state.me?.user.id}
          scopes={scopes}
          busy={busy}
          problem={error}
          onRole={(roleCode) =>
            setDraft({
              ...draft,
              roleCode,
              scopeId:
                scopeOptions(roleCode, companies, projects, teams)[0]?.id ?? "",
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
          name={companyName}
          busy={busy}
          problem={error}
          onName={setCompanyName}
          onCreate={() => {
            void runAction(async () => {
              await saveCompany({
                id: "",
                name: companyName.trim(),
                status: "ACTIVE",
              });
              // 建好了回到公司列表；没建成留在这一屏，名称还在。
              setAddingCompany(false);
            });
          }}
        />
      );
    if (screen === "company" && openCompany !== null)
      return (
        <CompanyView
          company={openCompany}
          projectCount={
            projects.filter((row) => row.companyId === openCompany.id).length
          }
          busy={busy}
          problem={error}
          onProjects={() => {
            void Taro.navigateTo({
              url: `/pages/company-projects/index?companyId=${openCompany.id}`,
            });
          }}
          onToggle={() => {
            void runAction(() =>
              saveCompany({
                ...openCompany,
                status:
                  openCompany.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE",
              }),
            );
          }}
        />
      );
    if (tab === "COMPANIES")
      return (
        <CompaniesTab
          companies={companies}
          projects={projects}
          onOpen={(companyId) => {
            setOpenCompanyId(companyId);
            setError(null);
          }}
          onAdd={() => {
            setAddingCompany(true);
            setError(null);
          }}
        />
      );
    if (tab === "ACCOUNTS")
      return (
        <AccountsTab
          accounts={accounts}
          search={search}
          onSearch={setSearch}
          onOpen={(account) => {
            setDraft(account);
            setError(null);
          }}
        />
      );
    if (tab === "SETTINGS")
      return settings ? (
        <SettingsTab
          settings={settings}
          busy={busy}
          problem={error}
          onChange={setSettings}
          onSave={() => {
            void runAction(() => saveSystemSettings(settings));
          }}
        />
      ) : null;
    return <AuditTab audit={audit} accounts={accounts} />;
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
          {loading ? (
            <SkeletonRows rows={4} gap />
          ) : loadError !== null ? (
            <StateView
              kind="error"
              title="平台数据没读到"
              sub={loadError}
              onRetry={refresh}
            />
          ) : (
            renderScreen()
          )}
        </>
      )}
    </Screen>
  );
}
