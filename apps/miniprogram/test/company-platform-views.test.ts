import { describe, expect, it } from "vitest";

import {
  managerSub,
  managerSummary,
} from "../src/components/project-manager-picker/summary";
import {
  companyPersonLine,
  matchesPerson,
  personRow,
} from "../src/pages/company-people/person-row";
import {
  accountLastLogin,
  accountRoleTarget,
  accountRowStatus,
  accountRowSub,
  auditTime,
  companyAdminSub,
  companyDraftOf,
  companyEntries,
  companyFormOf,
  companyFormProblem,
  companyRowStatus,
  companyRowSub,
  EMPTY_COMPANY_DRAFT,
  systemScreen,
} from "../src/pages/system-management/system-view";
import type { CompanyParticipant } from "../src/services/management.types";
import type { PlatformAccount, PlatformAccountRole } from "../src/services/workflows";

const person = (patch: Partial<CompanyParticipant>): CompanyParticipant => ({
  displayName: "张建国",
  memberId: "member-1",
  participantType: "WORKER",
  phone: "13800000001",
  profileId: "profile-1",
  projectId: "project-1",
  projectName: "滨江花园一期",
  projectRoleLabel: "钢筋工",
  requiresAttendance: true,
  status: "ACTIVE",
  teamId: "team-1",
  teamName: "钢筋一班",
  ...patch,
});

describe("项目管理员那一行", () => {
  it("没选时是空的，选一个写姓名，选多个写“等几人”", () => {
    expect(managerSummary([])).toBe("");
    expect(managerSummary([{ name: "陈工" }])).toBe("陈工");
    expect(managerSummary([{ name: "陈工" }, { name: "李工" }])).toBe(
      "陈工 等 2 人",
    );
    // 新建项目里只录了新管理员也写名字，不再是“请选择”。
    expect(managerSummary([...[], { name: "新经理", phone: "13900000000" }])).toBe("新经理");
  });

  it("副行写手机号和有没有绑定微信，不用间隔号", () => {
    expect(managerSub({ phone: "13800000002", isBound: true })).toBe(
      "13800000002，已绑定微信",
    );
    expect(managerSub({ phone: "13800000003", isBound: false })).toBe(
      "13800000003，还没绑定微信",
    );
  });
});

describe("公司人员的一行", () => {
  it("普通工人：副行是工种、项目、班组，右侧不写身份", () => {
    expect(personRow(person({}))).toEqual({
      title: "张建国",
      avatar: "张",
      sub: "钢筋工，滨江花园一期，钢筋一班",
      status: null,
      tag: null,
    });
  });

  it("班组长、管理员：身份写在右侧，副行不重复", () => {
    const leader = personRow(
      person({ displayName: "王师傅", projectRoleLabel: "TEAM_LEADER" }),
    );
    expect(leader.tag).toBe("班组长");
    expect(leader.sub).toBe("滨江花园一期，钢筋一班");
    const admin = personRow(
      person({
        participantType: "MANAGER",
        projectRoleLabel: "PROJECT_ADMIN",
        teamId: null,
        teamName: null,
        additionalRoles: [{ roleCode: "TEAM_LEADER", teamId: "team-1" }],
      }),
    );
    expect(admin.tag).toBe("管理员、班组长");
    expect(admin.sub).toBe("滨江花园一期");
  });

  it("不在场的写状态；没有姓名的靠手机尾号分辨", () => {
    expect(personRow(person({ status: "SUSPENDED" })).status).toEqual({
      kind: "warn",
      text: "已暂停",
    });
    expect(personRow(person({ status: "EXITED" })).status).toEqual({
      kind: "idle",
      text: "已退场",
    });
    const unnamed = personRow(person({ displayName: null }));
    expect(unnamed.title).toBe("姓名待补录");
    expect(unnamed.avatar).toBe("？");
    expect(unnamed.sub).toBe("尾号 0001，钢筋工，滨江花园一期，钢筋一班");
  });

  it("岗位配置认不出来的人照样显示，只是不归到工人或管理里", () => {
    const odd = person({
      participantType: "MANAGER",
      projectRoleLabel: "安全员",
    });
    expect(personRow(odd).tag).toBeNull();
    expect(personRow(odd).sub).toBe("安全员，滨江花园一期，钢筋一班");
    expect(matchesPerson(odd, "ALL", "安全员")).toBe(true);
    expect(matchesPerson(odd, "WORKER", "")).toBe(false);
    expect(matchesPerson(odd, "MANAGEMENT", "")).toBe(false);
  });

  it("按工人、管理两类筛，搜得到班组和项目", () => {
    const worker = person({});
    const admin = person({
      participantType: "MANAGER",
      projectRoleLabel: "PROJECT_ADMIN",
    });
    expect(matchesPerson(worker, "WORKER", "")).toBe(true);
    expect(matchesPerson(worker, "MANAGEMENT", "")).toBe(false);
    expect(matchesPerson(admin, "MANAGEMENT", "")).toBe(true);
    expect(matchesPerson(worker, "ALL", " 钢筋一班 ")).toBe(true);
    expect(matchesPerson(worker, "ALL", "滨江")).toBe(true);
    expect(matchesPerson(worker, "ALL", "木工")).toBe(false);
  });
});

describe("公司人员一人一行", () => {
  const item = {
    displayName: "李明",
    faceStatus: "APPROVED" as const,
    participantType: "WORKER" as const,
    phone: "13800000001",
    profileId: "w-1",
    projectCount: 2,
    projects: [
      { memberId: "m-1", projectId: "p-1", projectName: "滨江花园", roleLabel: "TEAM_LEADER", status: "ACTIVE" as const, teamName: "钢筋一班" },
      { memberId: "m-2", projectId: "p-2", projectName: "城市更新", roleLabel: "钢筋工", status: "ACTIVE" as const, teamName: null },
      { memberId: "m-3", projectId: "p-3", projectName: "老项目", roleLabel: "钢筋工", status: "EXITED" as const, teamName: null },
    ],
    registrationStatus: "VERIFIED" as const,
  };
  it("写在几个项目，资料都齐时右侧写身份", () => {
    expect(companyPersonLine(item)).toEqual({
      title: "李明",
      avatar: "李",
      sub: "在 2 个项目：滨江花园、城市更新",
      status: null,
      tag: "班组长",
    });
  });
  it("资料问题排在身份前面，最要紧的先写", () => {
    expect(companyPersonLine({ ...item, registrationStatus: "NEEDS_UPDATE", faceStatus: "NONE" }).status).toEqual({ kind: "bad", text: "资料需更正" });
    expect(companyPersonLine({ ...item, registrationStatus: "PENDING" }).status).toEqual({ kind: "warn", text: "资料待核实" });
    expect(companyPersonLine({ ...item, faceStatus: "NONE" }).status).toEqual({ kind: "warn", text: "没交底照" });
    expect(companyPersonLine({ ...item, participantType: "MANAGER", registrationStatus: null }).status).toBeNull();
  });
  it("没填用工资料和资料待核实分开写", () => {
    expect(companyPersonLine({ ...item, registrationStatus: "NOT_SUBMITTED" }).status).toEqual({ kind: "warn", text: "没填用工资料" });
    expect(companyPersonLine({ ...item, registrationStatus: "PENDING" }).status?.text).toBe("资料待核实");
  });
  it("按底照或资料筛选时先写筛的那一项", () => {
    const both = { ...item, registrationStatus: "PENDING" as const, faceStatus: "NONE" as const };
    expect(companyPersonLine(both).status?.text).toBe("资料待核实");
    expect(companyPersonLine(both, { faceStatus: "NONE" }).status?.text).toBe("没交底照");
    expect(companyPersonLine({ ...both, registrationStatus: "NOT_SUBMITTED" }, { registrationStatus: "NOT_SUBMITTED" }).status?.text).toBe("没填用工资料");
  });
  it("都退场了写原来在哪", () => {
    const gone = { ...item, projects: [item.projects[2]!] };
    expect(companyPersonLine(gone).sub).toBe("已退场，原在 老项目");
    expect(companyPersonLine(gone).status).toEqual({ kind: "idle", text: "已退场" });
  });
});

describe("平台管理", () => {
  it("点开账号时显示账号那一屏，其次是新增公司、点开的公司，否则是列表", () => {
    const none = {
      hasAccount: false,
      addingCompany: false,
      hasCompany: false,
    };
    expect(systemScreen(none)).toBe("list");
    expect(systemScreen({ ...none, hasCompany: true })).toBe("company");
    expect(systemScreen({ ...none, addingCompany: true })).toBe("new-company");
    expect(systemScreen({ ...none, hasAccount: true })).toBe("account");
  });

  it("最近登录的时间按中国时间写到分钟", () => {
    expect(auditTime("2026-11-18T02:20:00.000Z")).toBe("11-18 10:20");
    expect(auditTime("2026-12-31T16:05:00.000Z")).toBe("01-01 00:05");
    expect(auditTime("不是时间")).toBe("");
  });
});

describe("平台的公司一行", () => {
  const admin = (name: string) => ({ isBound: true, memberId: name, name, phone: "13900000001" });
  it("写进行中项目数和管理员姓名，没有管理员的标红，正常的不写状态", () => {
    expect(companyRowSub({ activeProjectCount: 3, projectCount: 5, admins: [admin("张三"), admin("李四")] })).toBe(
      "3 个进行中项目，管理员：张三、李四",
    );
    expect(companyRowSub({ activeProjectCount: 0, projectCount: 0, admins: [] })).toBe("还没有项目");
    expect(companyRowStatus({ admins: [], status: "ACTIVE" })).toEqual({ kind: "bad", text: "没有管理员" });
    expect(companyRowStatus({ admins: [admin("张三")], status: "ACTIVE" })).toBeUndefined();
    expect(companyRowStatus({ admins: [admin("张三")], status: "SUSPENDED" })).toEqual({ kind: "warn", text: "已暂停" });
  });

  it("管理员副行：绑定了没有，邀请码到哪天", () => {
    expect(companyAdminSub({ phone: "13900000001", isBound: true, invitation: null })).toBe("13900000001，已绑定微信");
    expect(
      companyAdminSub({ phone: "13900000001", isBound: false, invitation: { status: "PENDING", expiresAt: "2026-11-29T02:00:00.000Z" } }),
    ).toBe("13900000001，等他用邀请码绑定，11-29 前有效");
    expect(
      companyAdminSub({ phone: "13900000001", isBound: false, invitation: { status: "EXPIRED", expiresAt: "2026-11-20T02:00:00.000Z" } }),
    ).toBe("13900000001，邀请码已过期");
    expect(companyAdminSub({ phone: "13900000001", isBound: false, invitation: null })).toBe("13900000001，还没绑定微信");
  });

  it("进入公司：公司管理员的那些页面，每个都带上这家公司", () => {
    const entries = companyEntries("c 1");
    expect(entries.map((entry) => entry.title)).toEqual([
      "公司项目",
      "公司人员",
      "项目负责人",
      "各项目一览",
      "调人申请",
      "公司报表",
      "操作记录",
      "公司设置",
      "新建项目",
    ]);
    expect(entries.every((entry) => entry.url.endsWith("?companyId=c%201"))).toBe(true);
    expect(entries.some((entry) => entry.url.startsWith("/pages/schedules/") || entry.url.startsWith("/pages/team-makeups/"))).toBe(false);
  });

  it("公司资料：空着的写 null，信用代码大写，先在手机上查格式", () => {
    const form = companyFormOf({ ...EMPTY_COMPANY_DRAFT, name: " 瀚渤建设 ", creditCode: "91310115ma1k3yj12x", contactPhone: " " });
    expect(form).toEqual({
      address: null,
      contactName: null,
      contactPhone: null,
      creditCode: "91310115MA1K3YJ12X",
      name: "瀚渤建设",
      shortName: null,
    });
    expect(companyFormProblem(form)).toBeNull();
    expect(companyFormProblem({ ...form, name: "" })).toBe("请填写公司名称。");
    expect(companyFormProblem({ ...form, creditCode: "91310115MA1K3YO12X" })).toContain("18 位");
    expect(companyFormProblem({ ...form, contactPhone: "12345" })).toContain("联系电话");
    expect(companyFormProblem({ ...form, contactPhone: "021-12345678" })).toBeNull();
    expect(
      companyDraftOf({
        activeProjectCount: 0,
        address: null,
        admins: [],
        contactName: "王经理",
        contactPhone: null,
        createdAt: "2026-11-22T00:00:00.000Z",
        creditCode: null,
        id: "c",
        name: "瀚渤建设",
        projectCount: 0,
        shortName: null,
        status: "ACTIVE",
        updatedAt: "2026-11-22T00:00:00.000Z",
      }),
    ).toEqual({ ...EMPTY_COMPANY_DRAFT, contactName: "王经理", name: "瀚渤建设" });
  });
});

describe("平台的账号", () => {
  const account = (patch: Partial<PlatformAccount>): PlatformAccount => ({
    displayName: "陈工",
    highestRoleCode: "PROJECT_ADMIN",
    lastLoginAt: "2026-11-18T02:20:00.000Z",
    phone: "13800000004",
    profileType: "MANAGER",
    roleCount: 1,
    status: "ACTIVE",
    userId: "u1",
    ...patch,
  });
  const role = (patch: Partial<PlatformAccountRole>): PlatformAccountRole => ({
    companyId: "c1",
    memberId: "m1",
    projectId: "p1",
    roleCode: "PROJECT_ADMIN",
    scopeId: "p1",
    scopeName: "滨江花园一期",
    scopeType: "PROJECT",
    source: "PROJECT_MEMBERSHIP",
    ...patch,
  });

  it("一行写最高身份、身份数和手机号；只有停用的写状态", () => {
    expect(accountRowSub(account({}))).toBe("项目管理员，13800000004");
    expect(accountRowSub(account({ highestRoleCode: "COMPANY_ADMIN", roleCount: 3 }))).toBe("公司管理员等 3 项身份，13800000004");
    expect(accountRowSub(account({ highestRoleCode: null, phone: null, roleCount: 0 }))).toBe("还没有身份");
    expect(accountRowStatus(account({}))).toBeUndefined();
    expect(accountRowStatus(account({ status: "DISABLED" }))).toEqual({ kind: "bad", text: "已停用" });
  });

  it("最近登录按中国时间写", () => {
    expect(accountLastLogin(account({}))).toBe("11-18 10:20");
    expect(accountLastLogin(account({ lastLoginAt: null }))).toBe("还没有");
  });

  it("项目、班组身份跳到他在那个项目的人员资料，公司身份打开公司详情，平台身份不跳", () => {
    expect(accountRoleTarget(role({}))).toEqual({ kind: "page", url: "/pages/person-form/index?projectId=p1&memberId=m1" });
    expect(accountRoleTarget(role({ memberId: null }))).toEqual({ kind: "page", url: "/pages/participants/index?projectId=p1" });
    expect(accountRoleTarget(role({ memberId: null, projectId: null }))).toBeNull();
    expect(
      accountRoleTarget(role({ companyId: "c1", memberId: null, projectId: null, scopeName: "瀚渤建设", scopeType: "COMPANY", source: "COMPANY_APPOINTMENT" })),
    ).toEqual({ kind: "company", companyId: "c1", name: "瀚渤建设" });
    expect(accountRoleTarget(role({ companyId: null, scopeType: "GLOBAL", source: "PLATFORM" }))).toBeNull();
  });
});
