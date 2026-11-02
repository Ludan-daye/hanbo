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
  registrationIssuesForStep,
  registrationIssueStep,
  prepareWorkerRegistration,
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

describe("four-step registration and complete edit payload", () => {
  const address = {
    region: ["四川省", "成都市", "武侯区"],
    detail: "测试路 1 号",
  };
  const insurance = readInsuranceDraft("");
  const telephone = readTelephoneDraft("13800000883");

  test("next validates only the current group while final validation locates the first unfinished group", () => {
    const value = prepareWorkerRegistration(
      {
        ...emptyWorkerRegistration(),
        idNumber: "11010519491231002X",
      },
      address,
      insurance,
      readTelephoneDraft(""),
    );
    expect(registrationIssuesForStep(value, address, insurance, 1)).toEqual([]);
    const issues = registrationIssues(value, address, insurance);
    expect(registrationIssueStep(issues[0].field)).toBe(2);
    expect(
      registrationIssuesForStep(value, address, insurance, 4).map(
        (issue) => issue.field,
      ),
    ).toEqual(["payrollBankCard"]);
  });

  test("health and insurance require active choices and conditional fields stay in step three", () => {
    const value = emptyWorkerRegistration();
    expect(
      registrationIssuesForStep(value, address, insurance, 3).map(
        (issue) => issue.field,
      ),
    ).toEqual(["hasLongTermMedication", "hasPersonalInsurance"]);
    expect(
      registrationIssuesForStep(
        { ...value, hasLongTermMedication: true, hasPersonalInsurance: true },
        address,
        insurance,
        3,
      ).map((issue) => issue.field),
    ).toEqual([
      "medicationDetails",
      "insuranceName",
      "insuranceStartsOn",
      "insuranceEndsOn",
    ]);
  });

  const saved = {
    idNumber: "11010519491231002X",
    residentialAddress: "旧地址原文",
    emergencyContactName: "原联系人",
    emergencyContactPhone: "010-12345678",
    hasLongTermMedication: true,
    medicationDetails: "原申报说明",
    hasPersonalInsurance: true,
    insuranceDetails: "原保险说明：保障期限待核实",
    payrollBankCard: "6222020000000000000",
  };

  test("editing one group keeps the full saved payload, legacy text and read-only identity", () => {
    const value = prepareWorkerRegistration(
      {
        ...saved,
        idNumber: "attempted change",
        emergencyContactName: "新联系人",
      },
      readAddressDraft(saved.residentialAddress),
      readInsuranceDraft(saved.insuranceDetails),
      telephone,
      { saved },
    );
    expect(value).toEqual({
      idNumber: "11010519491231002X",
      residentialAddress: "旧地址原文",
      emergencyContactName: "新联系人",
      emergencyContactPhone: "13800000883",
      hasLongTermMedication: true,
      medicationDetails: "原申报说明",
      hasPersonalInsurance: true,
      insuranceDetails: "原保险说明：保障期限待核实",
      payrollBankCard: "6222020000000000000",
    });
    expect(
      registrationIssues(
        value,
        readAddressDraft(saved.residentialAddress),
        readInsuranceDraft(saved.insuranceDetails),
        { saved },
      ),
    ).toEqual([]);
  });

  test("legacy compatibility does not bypass first registration or validation after changing that group", () => {
    const legacyAddress = readAddressDraft(saved.residentialAddress);
    const legacyInsurance = readInsuranceDraft(saved.insuranceDetails);
    expect(
      registrationIssues(saved, legacyAddress, legacyInsurance).map(
        (issue) => issue.field,
      ),
    ).toEqual([
      "region",
      "insuranceName",
      "insuranceStartsOn",
      "insuranceEndsOn",
    ]);
    const changedAddress = { ...legacyAddress, detail: "修改后地址" };
    const changedInsurance = { ...legacyInsurance, notes: "修改后说明" };
    const value = prepareWorkerRegistration(
      saved,
      changedAddress,
      changedInsurance,
      telephone,
      { saved },
    );
    expect(
      registrationIssues(value, changedAddress, changedInsurance, {
        saved,
      }).map((issue) => issue.field),
    ).toEqual([
      "region",
      "insuranceName",
      "insuranceStartsOn",
      "insuranceEndsOn",
    ]);
  });

  test("final payload normalizes pasted identifiers, landline and explicit negative declarations", () => {
    const value = prepareWorkerRegistration(
      {
        ...saved,
        idNumber: " 110105 19491231 002x ",
        payrollBankCard: "6222 0200 0000 0000 000",
        hasLongTermMedication: false,
        hasPersonalInsurance: false,
      },
      address,
      insurance,
      { kind: "LANDLINE", mobile: "", areaCode: "028", number: "12345678" },
    );
    expect(value).toEqual({
      idNumber: "11010519491231002X",
      residentialAddress:
        "地区：四川省 / 成都市 / 武侯区\n详细地址：测试路 1 号",
      emergencyContactName: "原联系人",
      emergencyContactPhone: "028-12345678",
      hasLongTermMedication: false,
      medicationDetails: "",
      hasPersonalInsurance: false,
      insuranceDetails: "",
      payrollBankCard: "6222020000000000000",
    });
  });

  test("long saved declarations return an issue in the correct group instead of an unlocated final error", () => {
    expect(
      registrationIssuesForStep(
        { ...saved, medicationDetails: "长".repeat(501) },
        address,
        insurance,
        3,
      ).map((issue) => issue.field),
    ).toContain("medicationDetails");
    expect(registrationIssueStep("medicationDetails")).toBe(3);
  });
});
