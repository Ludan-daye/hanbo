import {
  PERMISSION_LEVELS,
  permissionLabel,
} from "../../routing/permissionLevels";
import { Picker, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";

import {
  Button,
  Field,
  ListItem,
  Notice,
  PageHeader,
  Screen,
  Section,
  Segmented,
  StateView,
  Subtitle,
} from "../../components/ui/index";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { useSessionGuard } from "../../hooks/use-session-guard";
import type { RoleCode } from "../../services/auth.types";
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

type Tab = "COMPANIES" | "ACCOUNTS" | "SETTINGS" | "AUDIT";
type ScopeOption = { readonly id: string; readonly name: string };
const ROLE_OPTIONS: readonly RoleCode[] = PERMISSION_LEVELS.map(
  (level) => level.roleCode,
);
const scopeOptions = (
  role: RoleCode,
  companies: readonly Company[],
  projects: readonly CompanyProject[],
  teams: readonly ProjectTeam[],
): readonly ScopeOption[] =>
  role === "SYSTEM_ADMIN"
    ? [{ id: "GLOBAL", name: "全平台" }]
    : role === "COMPANY_ADMIN"
      ? companies
      : role === "TEAM_LEADER"
        ? teams
        : projects;

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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const allowed = state.me?.roles.highestRoleCode === "SYSTEM_ADMIN";
  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
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
        if (!cancelled)
          setError(
            failure instanceof Error ? failure.message : "平台数据读取失败",
          );
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
      setError(failure instanceof Error ? failure.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };
  const savePermissions = async (): Promise<void> => {
    if (!draft || busy) return;
    if (
      !draft.scopeId ||
      !scopeOptions(draft.roleCode, companies, projects, teams).some(
        (row) => row.id === draft.scopeId,
      )
    ) {
      setError("请选择与角色对应的有效管理范围。");
      return;
    }
    const confirmed = await Taro.showModal({
      title: "确认调整账号权限",
      content: `${draft.name}：${permissionLabel(draft.roleCode)}。新权限将在此账号下次进入时生效。`,
      confirmText: "确认保存",
    });
    if (confirmed.confirm) await runAction(() => saveAccount(draft));
  };
  const scopes = draft
    ? scopeOptions(draft.roleCode, companies, projects, teams)
    : [];
  return (
    <Screen>
      <PageHeader title="平台管理" />
      {!allowed ? (
        <StateView title="需要五级平台管理权限" />
      ) : (
        <>
          <Segmented
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
          {error ? (
            <StateView title="操作未完成" sub={error} onRetry={refresh} />
          ) : null}
          {loading ? <StateView title="加载中…" /> : null}
          {!loading && tab === "COMPANIES" ? (
            <>
              <Section
                title="公司与项目"
                sub={`共 ${companies.length} 家公司 · ${projects.length} 个项目`}
              >
                {companies.map((company) => (
                  <View key={company.id} className="management-card">
                    <ListItem
                      primary={company.name}
                      secondary={`${projects.filter((row) => row.companyId === company.id).length} 个项目`}
                      chip={company.status === "ACTIVE" ? "正常" : "已暂停"}
                      onClick={() => {
                        void Taro.navigateTo({
                          url: `/pages/company-projects/index?companyId=${company.id}`,
                        });
                      }}
                    />
                    <Button
                      variant="outline"
                      loading={busy}
                      onClick={() => {
                        void runAction(() =>
                          saveCompany({
                            ...company,
                            status:
                              company.status === "ACTIVE"
                                ? "SUSPENDED"
                                : "ACTIVE",
                          }),
                        );
                      }}
                    >
                      {company.status === "ACTIVE" ? "暂停公司" : "恢复公司"}
                    </Button>
                  </View>
                ))}
              </Section>
              <Section title="新增公司">
                <Field
                  label="公司名称"
                  value={companyName}
                  placeholder="请输入完整公司名称"
                  onInput={setCompanyName}
                />
                <Button
                  disabled={!companyName.trim()}
                  loading={busy}
                  onClick={() => {
                    void runAction(() =>
                      saveCompany({
                        id: "",
                        name: companyName.trim(),
                        status: "ACTIVE",
                      }),
                    );
                  }}
                >
                  创建公司
                </Button>
              </Section>
            </>
          ) : null}
          {!loading && tab === "ACCOUNTS" ? (
            <>
              <Field
                value={search}
                placeholder="搜索姓名或手机号"
                onInput={setSearch}
              />
              <Notice>
                角色决定能做什么，管理范围决定能查看哪些数据。本人账号的权限须由其他管理员调整。
              </Notice>
              {accounts
                .filter((row) =>
                  `${row.name} ${row.phone}`.includes(search.trim()),
                )
                .map((account) => (
                  <ListItem
                    key={account.id}
                    primary={account.name}
                    secondary={`${permissionLabel(account.roleCode)} · ${account.phone}`}
                    chip={account.status === "ACTIVE" ? "正常" : "已停用"}
                    onClick={() => {
                      setDraft(account);
                      setError(null);
                    }}
                  />
                ))}
              {draft ? (
                <Section title={`编辑 · ${draft.name}`}>
                  {draft.id === state.me?.user.id ? (
                    <Notice>当前登录账号不可在此修改。</Notice>
                  ) : (
                    <>
                      <Picker
                        mode="selector"
                        range={ROLE_OPTIONS.map((role) =>
                          permissionLabel(role),
                        )}
                        value={ROLE_OPTIONS.indexOf(draft.roleCode)}
                        onChange={(event) => {
                          const roleCode =
                            ROLE_OPTIONS[Number(event.detail.value)];
                          setDraft({
                            ...draft,
                            roleCode,
                            scopeId:
                              scopeOptions(
                                roleCode,
                                companies,
                                projects,
                                teams,
                              )[0]?.id ?? "",
                          });
                        }}
                      >
                        <ListItem
                          primary="权限等级"
                          secondary={permissionLabel(draft.roleCode)}
                          chip="选择"
                        />
                      </Picker>
                      <Picker
                        mode="selector"
                        range={scopes.map((row) => row.name)}
                        value={Math.max(
                          0,
                          scopes.findIndex((row) => row.id === draft.scopeId),
                        )}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            scopeId: scopes[Number(event.detail.value)].id,
                          })
                        }
                      >
                        <ListItem
                          primary="管理范围"
                          secondary={
                            scopes.find((row) => row.id === draft.scopeId)
                              ?.name ?? "请先创建对应公司、项目或班组"
                          }
                          chip="选择"
                        />
                      </Picker>
                      <Segmented
                        options={[
                          { value: "ACTIVE", label: "正常使用" },
                          { value: "SUSPENDED", label: "停用账号" },
                        ]}
                        value={draft.status}
                        onChange={(status) => setDraft({ ...draft, status })}
                      />
                      <Button
                        loading={busy}
                        onClick={() => {
                          void savePermissions();
                        }}
                      >
                        保存权限设置
                      </Button>
                    </>
                  )}
                  <Button variant="outline" onClick={() => setDraft(null)}>
                    关闭编辑
                  </Button>
                </Section>
              ) : null}
            </>
          ) : null}
          {!loading && tab === "SETTINGS" && settings ? (
            <Section title="平台设置">
              <Field
                label="联系电话"
                value={settings.supportPhone}
                placeholder="请输入管理员联系电话"
                onInput={(supportPhone) =>
                  setSettings({ ...settings, supportPhone })
                }
              />
              <Field
                label="首页公告"
                value={settings.announcement}
                placeholder="请输入现场提醒"
                maxLength={160}
                onInput={(announcement) =>
                  setSettings({ ...settings, announcement })
                }
              />
              <Button
                loading={busy}
                disabled={!settings.supportPhone.trim()}
                onClick={() => {
                  void runAction(() => saveSystemSettings(settings));
                }}
              >
                保存平台设置
              </Button>
            </Section>
          ) : null}
          {!loading && tab === "AUDIT" ? (
            <Section title="操作日志" sub="展示当前演示数据中的最近 200 次操作">
              {audit.length === 0 ? <StateView title="暂无操作日志" /> : null}
              {audit.map((row) => (
                <ListItem
                  key={row.id}
                  primary={row.action}
                  secondary={`${row.actor} · ${new Date(row.createdAt).toLocaleString("zh-CN")}`}
                />
              ))}
              <Subtitle>正式环境的日志将由服务器记录并校验访问权限。</Subtitle>
            </Section>
          ) : null}
        </>
      )}
    </Screen>
  );
}
