import { describe, expect, test } from "vitest";
import { emptyWorkerRegistration } from "@construction/domain";
import {
  cleanIdNumber,
  cleanCardNumber,
  groupCardNumber,
  readAddressDraft,
  writeAddressDraft,
  readTelephoneDraft,
  writeTelephoneDraft,
  readInsuranceDraft,
  writeInsuranceDraft,
  registrationIssues,
} from "../src/services/worker-registration-form";

describe("worker registration input and saved data compatibility", () => {
  test("retains legacy addresses and round trips a selected region without losing detail", () => {
    expect(readAddressDraft("四川省成都市测试路 1 号")).toEqual({
      region: [],
      detail: "四川省成都市测试路 1 号",
    });
    const value = {
      region: ["四川省", "成都市", "武侯区"],
      detail: "测试路 1 号 2 栋",
    };
    expect(readAddressDraft(writeAddressDraft(value))).toEqual(value);
  });
  test("keeps legacy insurance notes and saves structured dates as readable text", () => {
    expect(readInsuranceDraft("原有保险说明").notes).toBe("原有保险说明");
    const value = {
      name: "团体意外险",
      company: "测试保险公司",
      startsOn: "2026-01-01",
      endsOn: "2026-12-31",
      notes: "原有保险说明\n保单待核实",
    };
    expect(readInsuranceDraft(writeInsuranceDraft(value))).toEqual(value);
  });
  test("normalizes pasted numbers without converting cards to numeric values", () => {
    expect(cleanIdNumber(" 110105 19491231 002x ")).toBe("11010519491231002X");
    expect(writeTelephoneDraft(readTelephoneDraft("+86 138 0000 0883"))).toBe(
      "13800000883",
    );
    for (const phone of ["010-12345678", "028-12345678", "0816-1234567"])
      expect(writeTelephoneDraft(readTelephoneDraft(phone))).toBe(phone);
    expect(writeTelephoneDraft(readTelephoneDraft("08161234567"))).toBe(
      "0816-1234567",
    );
    expect(cleanCardNumber(groupCardNumber("6222020000000000000"))).toBe(
      "6222020000000000000",
    );
  });
  test("requires address selection, keeps declarations explicit, and rejects reversed coverage dates", () => {
    const address = readAddressDraft("旧地址");
    const insurance = {
      name: "意外险",
      company: "",
      startsOn: "2026-12-31",
      endsOn: "2026-01-01",
      notes: "",
    };
    const value = {
      ...emptyWorkerRegistration(),
      idNumber: "11010519491231002X",
      residentialAddress: "旧地址",
      emergencyContactName: "测试联系人",
      emergencyContactPhone: "13800000883",
      hasPersonalInsurance: true,
      insuranceDetails: writeInsuranceDraft(insurance),
      payrollBankCard: "6222020000000000000",
    };
    const fields = registrationIssues(value, address, insurance).map(
      (issue) => issue.field,
    );
    expect(fields).toContain("region");
    expect(fields).toContain("hasLongTermMedication");
    expect(fields).toContain("insuranceEndsOn");
    expect(fields).not.toContain("payrollBankCard");
  });
});
