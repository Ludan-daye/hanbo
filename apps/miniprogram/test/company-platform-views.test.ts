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
  auditActor,
  auditTime,
  describeAudit,
  levelText,
  scopeOptions,
  systemScreen,
} from "../src/pages/system-management/system-view";
import type {
  CompanyParticipant,
  CompanyProject,
  ProjectTeam,
} from "../src/services/management.types";

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
  it("改账号时显示账号那一屏，其次是新增公司、点开的公司，否则是列表", () => {
    const none = {
      editingAccount: false,
      addingCompany: false,
      hasCompany: false,
    };
    expect(systemScreen(none)).toBe("list");
    expect(systemScreen({ ...none, hasCompany: true })).toBe("company");
    expect(systemScreen({ ...none, addingCompany: true })).toBe("new-company");
    expect(systemScreen({ ...none, editingAccount: true })).toBe("account");
  });

  it("权限等级写成“几级 身份”，不用间隔号", () => {
    expect(levelText("WORKER")).toBe("一级 普通工人");
    expect(levelText("PROJECT_ADMIN")).toBe("三级 项目管理员");
    expect(levelText("SYSTEM_ADMIN")).toBe("五级 超级管理员");
  });

  it("管理范围跟着等级走，班组名后面带项目", () => {
    const companies = [
      { id: "company-1", name: "瀚渤建设", status: "ACTIVE" as const },
    ];
    const projects = [
      { id: "project-1", companyId: "company-1", name: "滨江花园一期" },
    ] as readonly CompanyProject[];
    const teams: readonly ProjectTeam[] = [
      {
        id: "team-1",
        projectId: "project-1",
        name: "钢筋一班",
        status: "ACTIVE",
      },
      { id: "team-2", projectId: "gone", name: "木工一班", status: "ACTIVE" },
    ];
    expect(scopeOptions("SYSTEM_ADMIN", companies, projects, teams)).toEqual([
      { id: "GLOBAL", name: "全平台" },
    ]);
    expect(scopeOptions("COMPANY_ADMIN", companies, projects, teams)).toBe(
      companies,
    );
    expect(scopeOptions("PROJECT_ADMIN", companies, projects, teams)).toBe(
      projects,
    );
    expect(scopeOptions("WORKER", companies, projects, teams)).toBe(projects);
    expect(scopeOptions("TEAM_LEADER", companies, projects, teams)).toEqual([
      { id: "team-1", name: "钢筋一班（滨江花园一期）" },
      { id: "team-2", name: "木工一班" },
    ]);
  });

  it("日志把“请求方式 路径”换成一句话，屏上不出现英文", () => {
    expect(describeAudit("POST /system/companies")).toBe("保存公司");
    expect(describeAudit("PUT /system/accounts/dev-admin")).toBe(
      "调整账号权限",
    );
    expect(describeAudit("PUT /system/settings")).toBe("修改平台设置");
    expect(describeAudit("POST /management/companies/c1/projects")).toBe(
      "新建项目",
    );
    expect(describeAudit("PUT /management/projects/p1/teams/t1")).toBe(
      "修改班组",
    );
    expect(
      describeAudit("POST /team-work/teams/t1/tasks?date=2026-11-18"),
    ).toBe("提交班组任务");
    expect(describeAudit("DELETE /something/else")).toBe("删除数据");
  });

  it("服务器已经写成一句话的日志原样显示", () => {
    expect(describeAudit("调整账号权限")).toBe("调整账号权限");
  });

  it("日志里的账号编号换成姓名，时间按中国时间写到分钟", () => {
    const accounts = [{ id: "dev-admin", name: "陈工" }];
    expect(auditActor("dev-admin", accounts)).toBe("陈工");
    expect(auditActor("王师傅", accounts)).toBe("王师傅");
    expect(auditTime("2026-11-18T02:20:00.000Z")).toBe("11-18 10:20");
    expect(auditTime("2026-12-31T16:05:00.000Z")).toBe("01-01 00:05");
    expect(auditTime("不是时间")).toBe("");
  });
});
