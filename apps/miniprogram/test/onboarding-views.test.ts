import { afterEach, describe, expect, test } from "vitest";

import {
  archiveLabel,
  nextStepLabel,
  roleLabel,
} from "../src/pages/bind/bind-view";
import {
  ONBOARDING_STEPS,
  onboardingTotal,
  readOnboardingTotal,
} from "../src/pages/complete-profile/onboarding-steps";
import {
  faceStage,
  faceTime,
  stampDay,
} from "../src/pages/face-profile/face-profile-view";
import {
  addressHint,
  cardHint,
  groupStatus,
  idNumberHint,
  insuranceHints,
  mobileHint,
  REGISTRATION_GROUPS,
  stepProblems,
  visibleProblems,
} from "../src/pages/worker-registration/registration-view";
import { clearWorkEntry, saveWorkEntry } from "../src/services/work-entry";
import type {
  InsuranceDraft,
  RegistrationField,
  RegistrationIssue,
} from "../src/services/worker-registration-form";
import Taro from "./taro-mock";

afterEach(() => clearWorkEntry());

describe("onboarding step bar", () => {
  test("workers walk seven steps, the four registration groups being steps 3 to 6", () => {
    expect(ONBOARDING_STEPS).toHaveLength(7);
    expect(REGISTRATION_GROUPS.map((group) => group.onboardingStep)).toEqual([
      3, 4, 5, 6,
    ]);
    expect(REGISTRATION_GROUPS.map((group) => group.title)).toEqual(
      ONBOARDING_STEPS.slice(2, 6),
    );
    // 以后来改资料时没有“核对”这回事，列表上只叫“银行卡”。
    expect(REGISTRATION_GROUPS[3].short).toBe("银行卡");
  });
  test("someone who signed in as a manager only has the first two steps", () => {
    expect(onboardingTotal(null)).toBe(2);
    expect(onboardingTotal("LONG_TERM")).toBe(7);
    expect(onboardingTotal("TEMPORARY")).toBe(7);
    expect(readOnboardingTotal()).toBe(2);
    saveWorkEntry("TEMPORARY");
    expect(readOnboardingTotal()).toBe(7);
  });
  test("an unreadable stored entry falls back to seven steps instead of throwing", () => {
    Taro.setStorageSync("onboardingWorkEntry", "SOMETHING_ELSE");
    expect(readOnboardingTotal()).toBe(7);
  });
});

describe("bind result", () => {
  test("role is written as level and name without a separator dot", () => {
    expect(roleLabel("WORKER")).toBe("一级 普通工人");
    expect(roleLabel("TEAM_LEADER")).toBe("二级 班组长");
    expect(roleLabel("SYSTEM_ADMIN")).toBe("五级 超级管理员");
  });
  test("archive type is named only once it is known", () => {
    expect(archiveLabel("WORKER")).toBe("工人档案");
    expect(archiveLabel("MANAGER")).toBe("管理人员档案");
    expect(archiveLabel(null)).toBe("已关联");
  });
  test("the button says where it leads", () => {
    const worker = { goesHome: false, entered: false };
    expect(nextStepLabel({ ...worker, registrationComplete: false })).toBe(
      "继续填用工登记",
    );
    expect(nextStepLabel({ ...worker, registrationComplete: true })).toBe(
      "查看用工登记",
    );
    expect(
      nextStepLabel({
        goesHome: true,
        entered: false,
        registrationComplete: false,
      }),
    ).toBe("进入首页");
    expect(
      nextStepLabel({
        goesHome: true,
        entered: true,
        registrationComplete: true,
      }),
    ).toBe("回首页");
  });
});

describe("worker registration hints", () => {
  test("id number counts digits while onboarding and is locked when editing later", () => {
    expect(idNumberHint("", true)).toContain("粘贴");
    expect(idNumberHint("11010519491231002x", true)).toBe(
      "已输入 18 / 18 位。",
    );
    expect(idNumberHint("110105 1949", true)).toBe("已输入 10 / 18 位。");
    expect(idNumberHint("11010519491231002X", false)).toContain("管理员");
  });
  test("a legacy address without a region asks for a check", () => {
    expect(addressHint("", true)).toBe("详细地址不用再写省市区。");
    expect(
      addressHint(
        "地区：四川省 / 成都市 / 武侯区\n详细地址：测试路 1 号",
        true,
      ),
    ).toBe("详细地址不用再写省市区。");
    expect(addressHint("四川省成都市测试路 1 号", true)).toContain("请核对");
    expect(addressHint("四川省成都市测试路 1 号", false)).toContain("要改就");
  });
  test("phone and card numbers are grouped so they can be read back", () => {
    expect(mobileHint("")).toContain("粘贴");
    expect(mobileHint("+86 139 0000 0001")).toBe(
      "已输入 11 / 11 位：139 0000 0001",
    );
    expect(mobileHint("1390000")).toBe("已输入 7 / 11 位：1390000");
    expect(cardHint("")).toContain("粘贴");
    expect(cardHint("6222021234567890")).toBe(
      "已输入 16 位：6222 0212 3456 7890",
    );
  });
  test("insurance warns about an ended term and about legacy free text", () => {
    const insurance: InsuranceDraft = {
      name: "团体意外险",
      company: "",
      startsOn: "2025-01-01",
      endsOn: "2025-12-31",
      notes: "",
    };
    const base = { insurance, savedDetails: "", required: true };
    expect(insuranceHints({ ...base, today: "2025-12-31" })).toEqual([]);
    expect(insuranceHints({ ...base, today: "2026-01-01" })).toHaveLength(1);
    expect(
      insuranceHints({
        ...base,
        savedDetails: "原有保险说明",
        today: "2026-01-01",
      }),
    ).toHaveLength(2);
    expect(
      insuranceHints({
        insurance: { ...insurance, endsOn: "" },
        savedDetails: "原有保险说明",
        required: false,
        today: "2026-01-01",
      }),
    ).toEqual(["原来填的保险说明还留着，要改就把名称和保障日期补齐。"]);
  });
});

describe("worker registration problems", () => {
  const issues: readonly RegistrationIssue[] = [
    { field: "idNumber", message: "身份证号不对" },
    { field: "emergencyContactPhone", message: "电话不对" },
    { field: "insuranceStartsOn", message: "选开始日期" },
    { field: "insuranceEndsOn", message: "选结束日期" },
  ];
  const all = (field: RegistrationField): string | null =>
    issues.find((issue) => issue.field === field)?.message ?? null;

  test("a group with any failed check is marked for review", () => {
    expect(groupStatus(issues, 1)).toEqual({ kind: "warn", text: "待核对" });
    expect(groupStatus(issues, 3)).toEqual({ kind: "warn", text: "待核对" });
    expect(groupStatus(issues, 4)).toEqual({ kind: "ok", text: "已填写" });
  });
  test("only problems that are currently shown are listed, once each, in field order", () => {
    expect(
      visibleProblems(["insuranceEndsOn", "insuranceStartsOn", "region"], all),
    ).toEqual(["选结束日期", "选开始日期"]);
    expect(visibleProblems(["idNumber", "idNumber"], () => "同一句话")).toEqual(
      ["同一句话"],
    );
    // 还没轮到提示的字段不算。
    expect(visibleProblems(["idNumber"], () => null)).toEqual([]);
  });
  test("the page-level notice can tell which reasons are already under the fields of this step", () => {
    expect(stepProblems(issues, 3, all)).toEqual(["选开始日期", "选结束日期"]);
    expect(stepProblems(issues, 2, all)).toEqual(["电话不对"]);
    expect(stepProblems(issues, 4, all)).toEqual([]);
    expect(stepProblems(issues, 1, () => null)).toEqual([]);
  });
});

describe("face profile screens", () => {
  test("status picks the screen", () => {
    expect(faceStage(undefined)).toBe("none");
    expect(faceStage(null)).toBe("none");
    expect(faceStage("PENDING")).toBe("pending");
    expect(faceStage("APPROVED")).toBe("approved");
    expect(faceStage("REJECTED")).toBe("rejected");
    // 旧照被换掉之类的状态一律走“重新拍”。
    expect(faceStage("REPLACED")).toBe("other");
  });
  test("times are shown in Beijing time, with the year only when it is not this year", () => {
    expect(faceTime("2026-11-18T00:12:00.000Z", "2026-11-19")).toBe(
      "11-18 08:12",
    );
    expect(faceTime("2025-12-31T16:30:00.000Z", "2026-01-01")).toBe(
      "01-01 00:30",
    );
    expect(faceTime("2025-11-18T00:12:00.000Z", "2026-11-19")).toBe(
      "2025-11-18 08:12",
    );
  });
  test("the stamp carries the review day, or nothing when there is none", () => {
    expect(stampDay("2026-11-18T01:30:00.000Z")).toBe("11-18");
    expect(stampDay(null)).toBeUndefined();
  });
});
