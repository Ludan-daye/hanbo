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
  createCompany,
  fetchSystemSettings,
  saveSystemSettings,
  type SystemSettings,
} from "../../services/workflows";
import { useSession } from "../../store/session";
import { errorMessage } from "../../services/error-messages";
import {
  EMPTY_COMPANY_DRAFT,
  companyFormOf,
  companyFilterOf,
  companyFormProblem,
  platformSettingsProblem,
  systemScreen,
  systemTabOf,
  type CompanyDraft,
  type CompanyFilter,
  type SystemTab,
} from "./system-view";
import { AuditLogList } from "../audit-log/audit-list";
import { AccountScreen, AccountsTab } from "./views/accounts";
import { CompaniesTab, NewCompanyView } from "./views/companies";
import { CompanyScreen, type CompanyMode } from "./views/company";
import { SettingsTab } from "./views/settings";

import "./index.scss";

type Tab = SystemTab;

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

export default function SystemManagement(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  const { revision, refresh } = usePageRefresh();
  // 首页的待办带着 tab、admin 进来：直接停在筛好的公司列表上。
  const params = Taro.useRouter().params;
  const [tab, setTab] = useState<Tab>(systemTabOf(params.tab));
  const [companyFilter, setCompanyFilter] = useState<CompanyFilter>(companyFilterOf(params.admin));
  const allowed = state.me?.roles.highestRoleCode === "SYSTEM_ADMIN";
  // 同一个页面里的另外几屏：点开的公司（看、改资料、任命）、新增公司、点开的账号。
  const [openCompany, setOpenCompany] = useState<{ readonly id: string; readonly name: string } | null>(null);
  const [companyMode, setCompanyMode] = useState<CompanyMode>("detail");
  const [addingCompany, setAddingCompany] = useState<boolean>(false);
  const [companyDraft, setCompanyDraft] = useState<CompanyDraft>(EMPTY_COMPANY_DRAFT);
  const [openAccount, setOpenAccount] = useState<{ readonly id: string; readonly name: string } | null>(null);
  // 读取失败各标签自己显示；保存、校验失败只在按钮旁边说明，填的东西留着。
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const settingsRead = useTabData(allowed && tab === "SETTINGS", revision, fetchSystemSettings);
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

  const screen = systemScreen({
    hasAccount: openAccount !== null,
    addingCompany,
    hasCompany: openCompany !== null,
  });
  const backToList = (): void => {
    if (screen === "company" && companyMode !== "detail") {
      setCompanyMode("detail");
      setError(null);
      return;
    }
    setOpenAccount(null);
    setAddingCompany(false);
    setOpenCompany(null);
    setCompanyMode("detail");
    setError(null);
  };
  const title =
    screen === "account" && openAccount !== null
      ? openAccount.name
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
    if (screen === "account" && openAccount !== null)
      return (
        <AccountScreen
          userId={openAccount.id}
          self={openAccount.id === state.me?.user.id}
          onLoaded={(name) => setOpenAccount({ id: openAccount.id, name })}
          onChanged={refresh}
          onOpenCompany={(company) => {
            // 公司管理员身份在公司详情里任免：换到那家公司，返回时回到列表。
            setOpenAccount(null);
            setOpenCompany(company);
            setCompanyMode("detail");
            setError(null);
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
          filter={companyFilter}
          onFilter={setCompanyFilter}
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
      return (
        <AccountsTab
          revision={revision}
          onRetry={refresh}
          onOpen={(account) => {
            setOpenAccount({ id: account.userId, name: account.displayName });
            setError(null);
          }}
        />
      );
    if (tab === "SETTINGS")
      return tabState(settings, settingsRead.error, () =>
        settings ? (
          <SettingsTab
            settings={settings}
            busy={busy}
            problem={error}
            onChange={setSettings}
            onSave={() => {
              const invalid = platformSettingsProblem(settings);
              if (invalid !== null) {
                setError(invalid);
                return;
              }
              void runAction(() => saveSystemSettings(settings));
            }}
          />
        ) : null,
      );
    // 日志：全平台的操作记录，和公司、项目的操作记录同一个列表，多了公司和操作人两个筛选。
    return <AuditLogList scope={{ kind: "PLATFORM" }} revision={revision} onRetry={refresh} />;
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
