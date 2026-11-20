import { describe, expect, test } from "vitest";

import {
  registrationGroups,
  registrationSub,
  verificationActions,
  verificationLabel,
} from "../src/pages/person-registration/registration-review-view";
import type { MemberRegistration } from "../src/services/registration-review";

const registration = {
  idNumber: "320106199003071234",
  residentialAddress: "测试市测试路 8 号",
  emergencyContactName: "王测试",
  emergencyContactPhone: "13900002001",
  hasLongTermMedication: false,
  medicationDetails: "",
  hasPersonalInsurance: true,
  insuranceDetails: "意外险",
  payrollBankCard: "6222020200112233445",
};
const member = (
  status: MemberRegistration["verification"]["status"],
  submitted = true,
): MemberRegistration => ({
  displayName: "张建国",
  memberId: "m-1",
  phone: "13900000001",
  registration: submitted ? registration : null,
  submittedAt: submitted ? "2026-11-18T02:00:00.000Z" : null,
  verification: {
    status,
    verifiedAt: status === "PENDING" ? null : "2026-11-19T02:00:00.000Z",
    verifiedByName: status === "PENDING" ? null : "李经理",
    version: 2,
  },
});

describe("registration review view", () => {
  test("status is shape plus colour", () => {
    expect(verificationLabel(member("PENDING", false))).toEqual({ kind: "idle", text: "还没填" });
    expect(verificationLabel(member("PENDING"))).toEqual({ kind: "warn", text: "待核实" });
    expect(verificationLabel(member("VERIFIED"))).toEqual({ kind: "ok", text: "已核实" });
    expect(verificationLabel(member("NEEDS_UPDATE"))).toEqual({ kind: "bad", text: "需更正" });
  });

  test("the sub line says when it was submitted and who marked it", () => {
    expect(registrationSub(member("PENDING"))).toBe("2026年11月18日提交");
    expect(registrationSub(member("VERIFIED"))).toBe(
      "2026年11月18日提交，李经理2026年11月19日标记",
    );
    expect(registrationSub(member("PENDING", false))).toBe(
      "工人填好用工登记后才能核实",
    );
  });

  test("shows every field unmasked", () => {
    const lines = registrationGroups(registration).flatMap((group) => group.lines);
    expect(lines).toContainEqual({ label: "身份证号", value: "320106199003071234" });
    expect(lines).toContainEqual({ label: "长期服药", value: "没有" });
    expect(lines).toContainEqual({ label: "人身保险", value: "有，意外险" });
    expect(lines).toContainEqual({ label: "银行卡号", value: "6222 0202 0011 2233 445" });
  });

  test("one primary action at a time", () => {
    expect(verificationActions(member("PENDING"))).toEqual({ primary: "VERIFIED", secondary: "NEEDS_UPDATE" });
    expect(verificationActions(member("VERIFIED"))).toEqual({ primary: null, secondary: "NEEDS_UPDATE" });
    expect(verificationActions(member("NEEDS_UPDATE"))).toEqual({ primary: "VERIFIED", secondary: null });
    expect(verificationActions(member("PENDING", false))).toEqual({ primary: null, secondary: null });
  });
});
