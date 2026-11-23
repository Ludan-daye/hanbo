import { ApiError } from "../apiClient";
import { API_ERROR_MESSAGES } from "../error-messages";
import type {
  Company,
  CompanyAdmin,
  CompanyAdminCandidate,
  CompanyForm,
  IssuedInvitation,
  PlatformCompany,
  PlatformCompanyDetail,
  PlatformCompanyPage,
} from "../workflows";

import { demoId, type DemoState } from "./state";

// 平台管理的公司和公司管理员（2026-11-22 五级第一期），和 /system/companies 同口径。
// 演示里的邀请码不能真的拿去绑定：演示的绑定只认项目邀请码。

/** 演示公司除了三项基本信息，还记简称、信用代码和创建时间（联系人等在 companyProfiles）。 */
export type DemoCompany = Company & {
  readonly createdAt?: string;
  readonly creditCode?: string | null;
  readonly shortName?: string | null;
};

export type DemoCompanyAdmin = {
  readonly id: string;
  readonly companyId: string;
  readonly profileId: string;
  readonly name: string;
  readonly phone: string;
  /** 绑定了微信的账号；新人在绑定前是 null。 */
  readonly userId: string | null;
  readonly appointedAt: string;
  readonly invitation: (IssuedInvitation & { readonly status: "PENDING" | "REVOKED" }) | null;
};

const PAGE = 30;
const CREDIT_CODE = /^[0-9A-HJ-NP-RTUW-Y]{18}$/;
const PHONE = /^(?:1\d{10}|0\d{2,3}-?\d{7,8})$/;

const fail = (status: number, code: string, extra: Record<string, unknown> = {}): never => {
  throw new ApiError(status, API_ERROR_MESSAGES[code] ?? code, { ...extra, message: code });
};

/** 演示账号的管理档案编号，和 demoMe 的口径一致。 */
export const demoProfileIdOf = (accountId: string): string =>
  ({ "dev-team": "profile-team", "dev-project": "profile-project" } as Readonly<Record<string, string>>)[accountId] ??
  `profile-${accountId}`;

/** 还没有任命记录时，按演示账号里的公司管理员生成（和服务器迁移的回填一样）。 */
export const demoCompanyAdmins = (state: DemoState): readonly DemoCompanyAdmin[] =>
  state.companyAdmins ??
  state.accounts
    .filter((account) => account.roleCode === "COMPANY_ADMIN")
    .map((account) => ({
      appointedAt: "2026-01-01T00:00:00.000Z",
      companyId: account.scopeId,
      id: `company-admin-${account.id}`,
      invitation: null,
      name: account.name,
      phone: account.phone,
      profileId: demoProfileIdOf(account.id),
      userId: account.id,
    }));

const adminView = (admin: DemoCompanyAdmin): CompanyAdmin => ({
  appointedAt: admin.appointedAt,
  invitation:
    admin.userId !== null || admin.invitation === null
      ? null
      : {
          expiresAt: admin.invitation.expiresAt,
          status:
            admin.invitation.status === "PENDING" && Date.parse(admin.invitation.expiresAt) <= Date.now()
              ? "EXPIRED"
              : admin.invitation.status,
        },
  isBound: admin.userId !== null,
  managerProfileId: admin.profileId,
  memberId: admin.id,
  name: admin.name,
  phone: admin.phone,
});

const companyOf = (state: DemoState, companyId: string): DemoCompany =>
  (state.companies.find((row) => row.id === companyId) as DemoCompany | undefined) ??
  fail(404, "COMPANY_NOT_FOUND", { companyId });

const row = (state: DemoState, company: DemoCompany): PlatformCompany => {
  const projects = state.projects.filter((project) => project.companyId === company.id);
  return {
    activeProjectCount: projects.filter((project) => project.status === "ACTIVE").length,
    admins: demoCompanyAdmins(state)
      .filter((admin) => admin.companyId === company.id)
      .map((admin) => ({ isBound: admin.userId !== null, memberId: admin.id, name: admin.name, phone: admin.phone })),
    createdAt: company.createdAt ?? "2026-01-01T00:00:00.000Z",
    creditCode: company.creditCode ?? null,
    id: company.id,
    name: company.name,
    projectCount: projects.length,
    shortName: company.shortName ?? null,
    status: company.status,
  };
};

const detail = (state: DemoState, companyId: string): PlatformCompanyDetail => {
  const company = companyOf(state, companyId);
  const profile = state.companyProfiles?.[companyId];
  return {
    ...row(state, company),
    address: profile?.address ?? null,
    admins: demoCompanyAdmins(state).filter((admin) => admin.companyId === companyId).map(adminView),
    contactName: profile?.contactName ?? null,
    contactPhone: profile?.contactPhone ?? null,
    updatedAt: profile?.updatedAt ?? company.createdAt ?? "2026-01-01T00:00:00.000Z",
  };
};

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() !== "" ? value.trim() : null);

const readForm = (body: Record<string, unknown>): CompanyForm => {
  const form: CompanyForm = {
    address: text(body.address),
    contactName: text(body.contactName),
    contactPhone: text(body.contactPhone),
    creditCode: text(body.creditCode)?.toUpperCase() ?? null,
    name: text(body.name) ?? "",
    shortName: text(body.shortName),
  };
  if (form.name === "" || (form.contactPhone !== null && !PHONE.test(form.contactPhone)))
    fail(400, "INVALID_SYSTEM_COMPANY_REQUEST");
  if (form.creditCode !== null && !CREDIT_CODE.test(form.creditCode)) fail(400, "INVALID_CREDIT_CODE");
  return form;
};

const assertUnique = (state: DemoState, form: CompanyForm, companyId: string | null): void => {
  const others = (state.companies as readonly DemoCompany[]).filter((row) => row.id !== companyId);
  if (others.some((row) => row.name.toLowerCase() === form.name.toLowerCase())) fail(409, "COMPANY_NAME_EXISTS");
  if (form.creditCode !== null && others.some((row) => row.creditCode === form.creditCode))
    fail(409, "COMPANY_CREDIT_CODE_EXISTS");
};

const saveForm = (state: DemoState, company: DemoCompany, form: CompanyForm, now: string): DemoState => ({
  ...state,
  companies: [
    ...state.companies.filter((row) => row.id !== company.id),
    { ...company, creditCode: form.creditCode, name: form.name, shortName: form.shortName },
  ],
  companyProfiles: {
    ...state.companyProfiles,
    [company.id]: { address: form.address, contactName: form.contactName, contactPhone: form.contactPhone, updatedAt: now },
  },
});

const invitation = (): IssuedInvitation & { readonly status: "PENDING" } => ({
  code: `HANBO-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
  expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
  status: "PENDING",
});

/** 演示里能任命的人：在用的管理人员账号，还不是这家公司的管理员。 */
const candidates = (state: DemoState, companyId: string, search: string): readonly CompanyAdminCandidate[] => {
  const taken = new Set(
    demoCompanyAdmins(state)
      .filter((admin) => admin.companyId === companyId)
      .map((admin) => admin.profileId),
  );
  return state.accounts
    .filter((account) => account.roleCode !== "WORKER" && account.status === "ACTIVE")
    .map((account) => ({ managerProfileId: demoProfileIdOf(account.id), name: account.name, phone: account.phone }))
    .filter((row) => !taken.has(row.managerProfileId) && `${row.name}${row.phone}`.includes(search))
    .slice(0, 20);
};

type Result = { readonly state: DemoState; readonly data: unknown };

export const demoSystemCompanies = (
  state: DemoState,
  method: string,
  parts: readonly string[],
  query: Readonly<Record<string, string>>,
  body: Record<string, unknown>,
): Result => {
  const now = new Date().toISOString();
  const [, , companyId, section, memberId, action] = parts;
  if (companyId === undefined) {
    if (method === "GET") {
      const search = (query.search ?? "").trim().toLowerCase();
      const status = query.status ?? null;
      const rows = [...(state.companies as readonly DemoCompany[])]
        .filter(
          (company) =>
            (status === null || company.status === status) &&
            `${company.name}${company.shortName ?? ""}${company.creditCode ?? ""}`.toLowerCase().includes(search),
        )
        .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "") || b.id.localeCompare(a.id));
      const cursor = query.cursor ?? null;
      const start = cursor === null ? 0 : rows.findIndex((company) => company.id === cursor) + 1;
      const page = rows.slice(start, start + PAGE);
      const data: PlatformCompanyPage = {
        items: page.map((company) => row(state, company)),
        nextCursor: rows.length > start + PAGE ? (page[page.length - 1]?.id ?? null) : null,
      };
      return { state, data };
    }
    if (Object.keys(body).some((key) => !["address", "contactName", "contactPhone", "creditCode", "name", "shortName"].includes(key)))
      fail(400, "INVALID_SYSTEM_COMPANY_REQUEST");
    const form = readForm(body);
    assertUnique(state, form, null);
    const company: DemoCompany = { createdAt: now, id: demoId("company"), name: form.name, status: "ACTIVE" };
    const next = saveForm({ ...state, companies: [...state.companies, company] }, company, form, now);
    return { state: next, data: detail(next, company.id) };
  }
  const company = companyOf(state, companyId);
  if (section === undefined) {
    if (method === "GET") return { state, data: detail(state, companyId) };
    if (body.expectedUpdatedAt !== detail(state, companyId).updatedAt) fail(409, "COMPANY_CHANGED_RELOAD_BEFORE_SAVING");
    const form = readForm(body);
    assertUnique(state, form, companyId);
    const next = saveForm(state, company, form, now);
    return { state: next, data: detail(next, companyId) };
  }
  if (section === "admin-candidates") return { state, data: candidates(state, companyId, (query.search ?? "").trim()) };
  if (section !== "admins") fail(404, "NOT_FOUND");
  const admins = demoCompanyAdmins(state);
  if (memberId === undefined) {
    let admin: DemoCompanyAdmin;
    if (typeof body.managerProfileId === "string") {
      const account = state.accounts.find((row) => demoProfileIdOf(row.id) === body.managerProfileId);
      const pending = admins.find((row) => row.profileId === body.managerProfileId);
      if (account === undefined && pending === undefined) fail(404, "COMPANY_ADMIN_CANDIDATE_NOT_FOUND");
      if (admins.some((row) => row.companyId === companyId && row.profileId === body.managerProfileId))
        fail(409, "COMPANY_ADMIN_ALREADY_APPOINTED");
      const userId = account?.id ?? null;
      admin = {
        appointedAt: now,
        companyId,
        id: demoId("company-admin"),
        invitation: userId === null ? invitation() : null,
        name: account?.name ?? pending!.name,
        phone: account?.phone ?? pending!.phone,
        profileId: body.managerProfileId,
        userId,
      };
    } else {
      const name = text(body.name);
      const phone = text(body.phone);
      if (name === null || phone === null || !/^1\d{10}$/.test(phone)) return fail(400, "INVALID_COMPANY_ADMIN_REQUEST");
      const account = state.accounts.find((row) => row.phone === phone);
      if (account !== undefined && account.roleCode === "WORKER") fail(409, "COMPANY_ADMIN_PHONE_IS_WORKER");
      const pending = admins.find((row) => row.phone === phone);
      const known =
        account !== undefined
          ? { name: account.name, profileId: demoProfileIdOf(account.id) }
          : pending !== undefined
            ? { name: pending.name, profileId: pending.profileId }
            : null;
      if (known !== null) fail(409, "MANAGER_PHONE_EXISTS", known);
      admin = { appointedAt: now, companyId, id: demoId("company-admin"), invitation: invitation(), name, phone, profileId: demoId("profile"), userId: null };
    }
    const next: DemoState = { ...state, companyAdmins: [...admins, admin] };
    return {
      state: next,
      data: {
        invitation: admin.invitation === null ? null : { code: admin.invitation.code, expiresAt: admin.invitation.expiresAt },
        member: adminView(admin),
      },
    };
  }
  const admin = admins.find((row) => row.id === memberId && row.companyId === companyId) ?? fail(404, "COMPANY_ADMIN_NOT_FOUND");
  if (action === "revoke") {
    const remaining = admins.filter((row) => row !== admin);
    return {
      state: { ...state, companyAdmins: remaining },
      data: { remainingAdmins: remaining.filter((row) => row.companyId === companyId).length },
    };
  }
  if (action === "invitation") {
    if (admin.userId !== null) fail(409, "BINDING_TARGET_PROFILE_ALREADY_BOUND");
    const issued = invitation();
    return {
      state: { ...state, companyAdmins: admins.map((row) => (row === admin ? { ...row, invitation: issued } : row)) },
      data: { code: issued.code, expiresAt: issued.expiresAt },
    };
  }
  return fail(404, "NOT_FOUND");
};
