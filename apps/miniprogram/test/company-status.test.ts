import { describe, expect, test } from "vitest";

import type { MeResponse } from "../src/services/auth.types";
import { companySuspendedNotice } from "../src/services/company-status";

const me = (companies: MeResponse["companies"], highestRoleCode: MeResponse["roles"]["highestRoleCode"] = "WORKER"): MeResponse => ({
  ...(companies === undefined ? {} : { companies }),
  profile: { id: "p", type: "WORKER" },
  roles: { assignments: [], highestRoleCode },
  user: { id: "u", isBound: true, status: "ACTIVE" },
});

const company = (name: string, status: string) => ({ id: name, name, status });

describe("公司暂停的说明（五级第三期）", () => {
  test("所在公司都暂停时，说明现在只能查看和导出", () => {
    expect(companySuspendedNotice(me([company("瀚渤建设", "SUSPENDED")]))).toEqual({
      title: "瀚渤建设已暂停",
      sub: "现在只能查看和导出记录，不能打卡、补卡、审批或修改。请联系平台恢复。",
    });
    expect(companySuspendedNotice(me([company("甲", "SUSPENDED"), company("乙", "SUSPENDED")]))?.title).toBe("你所在的公司都已暂停");
  });

  test("只停了其中几家时点名，别的照常", () => {
    expect(companySuspendedNotice(me([company("甲", "SUSPENDED"), company("乙", "ACTIVE")]))).toEqual({
      title: "甲已暂停",
      sub: "那里的项目只能查看和导出，不能打卡、补卡、审批或修改；别的公司照常。",
    });
  });

  test("没有暂停、没有公司、旧版服务器和超级管理员都不显示", () => {
    expect(companySuspendedNotice(me([company("甲", "ACTIVE")]))).toBeNull();
    expect(companySuspendedNotice(me([]))).toBeNull();
    expect(companySuspendedNotice(me(undefined))).toBeNull();
    expect(companySuspendedNotice(me([company("甲", "SUSPENDED")], "SYSTEM_ADMIN"))).toBeNull();
  });
});
