import { View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";

import {
  BottomBar,
  Button,
  Card,
  CardActions,
  CardMeta,
  CardTitle,
  Check,
  Code,
  EntryGrid,
  FormInput,
  Notice,
  Row,
  SearchField,
  SectionTitle,
  Segmented,
  Sheet,
  SkeletonRows,
  StateView,
} from "../../../components/ui";
import { ApiError } from "../../../services/apiClient";
import { errorMessage } from "../../../services/error-messages";
import { formatChinaDate } from "../../../services/time";
import {
  appointCompanyAdmin,
  fetchCompany,
  fetchCompanyAdminCandidates,
  reissueCompanyAdminInvitation,
  revokeCompanyAdmin,
  updateCompany,
  type CompanyAdmin,
  type CompanyAdminAppointment,
  type CompanyAdminCandidate,
  type IssuedInvitation,
  type PlatformCompanyDetail,
} from "../../../services/workflows";
import {
  companyAdminSub,
  companyDraftOf,
  companyEntries,
  companyFormOf,
  companyFormProblem,
  type CompanyDraft,
} from "../system-view";
import { CompanyFields } from "./companies";

/** 点开一家公司之后的三屏：看（资料、管理员、进入公司）、改资料、任命管理员。 */
export type CompanyMode = "detail" | "edit" | "appoint";

type Issued = IssuedInvitation & { readonly name: string };

const copy = async (code: string): Promise<void> => {
  try {
    await Taro.setClipboardData({ data: code });
    await Taro.showToast({ icon: "success", title: "已复制" });
  } catch {
    await Taro.showToast({ icon: "none", title: "没复制上，请再点一次" });
  }
};

/** 服务器说这个手机号已有管理档案时带回的人，前端改成直接选他。 */
const existingProfile = (
  cause: unknown,
): { readonly profileId: string; readonly name: string } | null => {
  if (!(cause instanceof ApiError)) return null;
  const body = cause.responseBody as
    | { readonly message?: unknown; readonly profileId?: unknown; readonly name?: unknown }
    | null;
  return body?.message === "MANAGER_PHONE_EXISTS" && typeof body.profileId === "string"
    ? { profileId: body.profileId, name: typeof body.name === "string" ? body.name : "他" }
    : null;
};

export const CompanyScreen = ({
  companyId,
  mode,
  onMode,
  onLoaded,
  onChanged,
}: {
  readonly companyId: string;
  readonly mode: CompanyMode;
  readonly onMode: (mode: CompanyMode) => void;
  /** 读到公司后把名称交给页头。 */
  readonly onLoaded: (name: string) => void;
  /** 改了东西，回到列表时要重读。 */
  readonly onChanged: () => void;
}): JSX.Element => {
  const [company, setCompany] = useState<PlatformCompanyDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<number>(0);
  const [busy, setBusy] = useState<boolean>(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [draft, setDraft] = useState<CompanyDraft | null>(null);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [lastRevoked, setLastRevoked] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    fetchCompany(companyId).then(
      (next) => {
        if (cancelled) return;
        setCompany(next);
        onLoaded(next.name);
      },
      (cause: unknown) => {
        if (!cancelled) setLoadError(errorMessage(cause, "公司资料没读到"));
      },
    );
    return () => {
      cancelled = true;
    };
    // onLoaded 是页面的 state setter，引用不变。
  }, [companyId, attempt]);

  const reload = (): void => setAttempt((value) => value + 1);

  if (company === null)
    return loadError !== null ? (
      <StateView kind="error" title="公司资料没读到" sub={loadError} onRetry={reload} />
    ) : (
      <SkeletonRows rows={5} gap />
    );

  const run = async (
    action: () => Promise<void>,
    fallback: string,
    onFailure?: (cause: unknown) => void,
  ): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      await action();
    } catch (cause: unknown) {
      setProblem(errorMessage(cause, fallback));
      onFailure?.(cause);
    } finally {
      setBusy(false);
    }
  };

  if (mode === "edit") {
    const current = draft ?? companyDraftOf(company);
    const save = (): void => {
      const form = companyFormOf(current);
      const invalid = companyFormProblem(form);
      if (invalid !== null) {
        setProblem(invalid);
        return;
      }
      void run(async () => {
        const next = await updateCompany(company.id, { ...form, expectedUpdatedAt: company.updatedAt });
        setCompany(next);
        onLoaded(next.name);
        setDraft(null);
        onChanged();
        onMode("detail");
        await Taro.showToast({ title: "已保存", icon: "success" });
      }, "没保存成功，请重试。");
    };
    return (
      <>
        <CompanyFields draft={current} busy={busy} onChange={setDraft} />
        <Notice>名称和信用代码只有平台能改；公司管理员在“公司设置”里只能改联系人、电话和地址。</Notice>
        {problem !== null ? <Notice tone="error">{problem}</Notice> : null}
        <BottomBar
          primary={busy ? "保存中…" : "保存资料"}
          busy={busy}
          disabled={!current.name.trim()}
          onPrimary={save}
        />
      </>
    );
  }

  if (mode === "appoint")
    return (
      <AppointView
        companyId={company.id}
        busy={busy}
        problem={problem}
        onProblem={setProblem}
        onAppoint={(body, name, onFailure) => {
          void run(async () => {
            const result = await appointCompanyAdmin(company.id, body);
            setIssued(result.invitation === null ? null : { ...result.invitation, name });
            setLastRevoked(false);
            onChanged();
            reload();
            onMode("detail");
            await Taro.showToast({ title: "已任命", icon: "success" });
          }, "没任命成功，请重试。", onFailure);
        }}
      />
    );

  const revoke = async (admin: CompanyAdmin): Promise<void> => {
    if (busy) return;
    const last = company.admins.length === 1;
    const confirmed = await Taro.showModal({
      title: "撤销公司管理员",
      content: last
        ? `${admin.name}是这家公司最后一位管理员。撤销后公司没有管理员，直到你再任命一位。他在各项目里的身份不变。`
        : `撤销后，${admin.name}不再管理这家公司；他在各项目里的身份不变。`,
      confirmText: "撤销",
    });
    if (!confirmed.confirm) return;
    await run(async () => {
      const result = await revokeCompanyAdmin(company.id, admin.memberId);
      setLastRevoked(result.remainingAdmins === 0);
      if (issued?.name === admin.name) setIssued(null);
      onChanged();
      reload();
      await Taro.showToast({ title: "已撤销", icon: "success" });
    }, "没撤销成功，请重试。");
  };

  const reissue = (admin: CompanyAdmin): void => {
    void run(async () => {
      const next = await reissueCompanyAdminInvitation(company.id, admin.memberId);
      setIssued({ ...next, name: admin.name });
      reload();
    }, "邀请码没生成，请重试。");
  };

  const facts: ReadonlyArray<readonly [string, string | null]> = [
    ["简称", company.shortName],
    ["信用代码", company.creditCode],
    ["联系人", company.contactName],
    ["联系电话", company.contactPhone],
    ["地址", company.address],
  ];

  return (
    <>
      <SectionTitle>公司管理员</SectionTitle>
      {company.admins.length === 0 ? (
        <Sheet gap>
          <Row title="还没有管理员" sub="任命一位，这家公司才有人管理项目和人员。" hazard />
        </Sheet>
      ) : (
        // 一人一张卡：手机号和绑定情况写全，操作放在卡片底部，窄屏也不挤。
        company.admins.map((admin) => (
          <Card key={admin.memberId} gap>
            <CardTitle>{admin.name}</CardTitle>
            <CardMeta>{companyAdminSub(admin)}</CardMeta>
            <CardActions>
              {!admin.isBound ? (
                <Button variant="outline" disabled={busy} onClick={() => reissue(admin)}>
                  重新生成邀请码
                </Button>
              ) : null}
              <Button variant="text" disabled={busy} onClick={() => void revoke(admin)}>
                撤销
              </Button>
            </CardActions>
          </Card>
        ))
      )}
      {issued !== null ? (
        <View className="m-fade">
          <Card gap>
            <CardMeta>{issued.name}的邀请码</CardMeta>
            <View className="system-code">
              <Code>{issued.code}</Code>
            </View>
            <CardMeta>
              {formatChinaDate(issued.expiresAt)} 前有效。复制后发给他本人，他在微信里填好姓名、手机号，用这个码绑定后就是这家公司的管理员。
            </CardMeta>
            <CardActions>
              <Button variant="outline" onClick={() => void copy(issued.code)}>
                复制邀请码
              </Button>
            </CardActions>
          </Card>
        </View>
      ) : null}
      {lastRevoked ? <Notice tone="warning">这家公司现在没有管理员了。</Notice> : null}
      {problem !== null ? <Notice tone="error">{problem}</Notice> : null}
      <Button
        wide
        disabled={busy}
        onClick={() => {
          setProblem(null);
          onMode("appoint");
        }}
      >
        任命公司管理员
      </Button>
      <Notice>撤销只收回公司管理员这一项；他在各项目里的管理员、班组长身份不变，要改到项目人员里改。</Notice>

      <SectionTitle>进入公司</SectionTitle>
      <EntryGrid
        gap
        items={companyEntries(company.id).map((entry) => ({
          icon: entry.icon,
          label: entry.title,
          onClick: () => {
            void Taro.navigateTo({ url: entry.url });
          },
        }))}
      />
      <Notice>和这家公司的管理员看到的一样，在里面做的事都记在这家公司的操作记录里。</Notice>
      <SectionTitle>公司资料</SectionTitle>
      <Sheet gap>
        <Row
          title="状态"
          status={company.status === "ACTIVE" ? { kind: "ok", text: "正常" } : { kind: "warn", text: "已暂停" }}
        />
        <Row
          title="项目"
          value={company.projectCount === 0 ? "还没有" : `${company.activeProjectCount} 个进行中，共 ${company.projectCount} 个`}
          mute
        />
        {facts.map(([title, value]) => (
          <Row key={title} title={title} value={value ?? "未填写"} mute />
        ))}
      </Sheet>
      <Button
        variant="outline"
        wide
        disabled={busy}
        onClick={() => {
          setDraft(null);
          setProblem(null);
          onMode("edit");
        }}
      >
        修改资料
      </Button>
    </>
  );
};

type AppointTab = "EXISTING" | "NEW";

/** 任命：从已有的管理账号里选，或录入新人拿邀请码（Q1）。 */
const AppointView = ({
  companyId,
  busy,
  problem,
  onProblem,
  onAppoint,
}: {
  readonly companyId: string;
  readonly busy: boolean;
  readonly problem: string | null;
  readonly onProblem: (problem: string | null) => void;
  /** onFailure 拿到原始错误：手机号已有档案时，改成直接选那个人。 */
  readonly onAppoint: (
    body: CompanyAdminAppointment,
    name: string,
    onFailure?: (cause: unknown) => void,
  ) => void;
}): JSX.Element => {
  const [tab, setTab] = useState<AppointTab>("EXISTING");
  const [search, setSearch] = useState<string>("");
  const [query, setQuery] = useState<string>("");
  const [candidates, setCandidates] = useState<readonly CompanyAdminCandidate[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<number>(0);
  const [picked, setPicked] = useState<CompanyAdminCandidate | null>(null);
  const [name, setName] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [existing, setExisting] = useState<{ readonly profileId: string; readonly name: string } | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 500);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (tab !== "EXISTING") return;
    let cancelled = false;
    setCandidates(null);
    setLoadError(null);
    fetchCompanyAdminCandidates(companyId, query).then(
      (rows) => {
        if (!cancelled) setCandidates(rows);
      },
      (cause: unknown) => {
        if (!cancelled) setLoadError(errorMessage(cause, "管理账号没读到"));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [companyId, query, tab, attempt]);

  const submitNew = (): void => {
    const trimmed = { name: name.trim(), phone: phone.trim() };
    if (!trimmed.name || !/^1\d{10}$/.test(trimmed.phone)) {
      onProblem("请填写姓名和 11 位手机号。");
      return;
    }
    setExisting(null);
    onAppoint(trimmed, trimmed.name, (cause) => setExisting(existingProfile(cause)));
  };

  return (
    <>
      <Segmented<AppointTab>
        options={[
          { value: "EXISTING", label: "选已有账号" },
          { value: "NEW", label: "录入新人" },
        ]}
        value={tab}
        onChange={(next) => {
          if (busy) return;
          setTab(next);
          setExisting(null);
          onProblem(null);
        }}
      />
      {tab === "EXISTING" ? (
        <>
          <SearchField value={search} placeholder="搜索姓名或手机号" maxLength={30} onInput={setSearch} />
          {loadError !== null ? (
            <StateView kind="error" title="管理账号没读到" sub={loadError} onRetry={() => setAttempt(attempt + 1)} />
          ) : candidates === null ? (
            <SkeletonRows rows={3} gap />
          ) : candidates.length === 0 ? (
            <StateView
              kind="empty"
              title="没有找到可以任命的账号"
              sub="只有已经绑定微信的管理人员账号能选。还没有账号的人，用“录入新人”。"
            />
          ) : (
            <Sheet gap>
              {candidates.map((row) => (
                <Row
                  key={row.managerProfileId}
                  title={row.name}
                  avatar={row.name.slice(0, 1)}
                  sub={row.phone}
                  onClick={() => {
                    if (!busy) setPicked(row);
                  }}
                >
                  <Check round checked={picked?.managerProfileId === row.managerProfileId} />
                </Row>
              ))}
            </Sheet>
          )}
          <Notice>任命后他马上就能管理这家公司，不用重新登录。</Notice>
          {problem !== null ? <Notice tone="error">{problem}</Notice> : null}
          <BottomBar
            primary={busy ? "任命中…" : "任命为公司管理员"}
            busy={busy}
            disabled={picked === null}
            onPrimary={() => {
              if (picked !== null) onAppoint({ managerProfileId: picked.managerProfileId }, picked.name);
            }}
          />
        </>
      ) : (
        <>
          <Sheet gap>
            <FormInput label="姓名" required value={name} placeholder="和他身份证上的一致" maxLength={30} disabled={busy} onInput={setName} />
            <FormInput label="手机号" required value={phone} placeholder="11 位手机号" type="number" maxLength={11} disabled={busy} onInput={setPhone} />
          </Sheet>
          <Notice>会生成一个邀请码，七天内有效。他在微信里填同样的姓名和手机号，再用邀请码绑定。</Notice>
          {problem !== null ? <Notice tone="error">{problem}</Notice> : null}
          {existing !== null ? (
            <Button
              variant="outline"
              wide
              disabled={busy}
              onClick={() => onAppoint({ managerProfileId: existing.profileId }, existing.name)}
            >
              {`改为任命已有的 ${existing.name}`}
            </Button>
          ) : null}
          <BottomBar
            primary={busy ? "任命中…" : "任命并生成邀请码"}
            busy={busy}
            disabled={!name.trim() || !phone.trim()}
            onPrimary={submitNew}
          />
        </>
      )}
    </>
  );
};
