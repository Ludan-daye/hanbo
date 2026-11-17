import { describe, expect, it } from "vitest";

import { stateKindForTitle } from "../src/components/ui/state-kind";

describe("stateKindForTitle", () => {
  it("treats failure titles as errors even when they mention loading or reading", () => {
    for (const title of [
      "加载失败",
      "安全信用读取失败",
      "班组考勤读取失败",
      "任务加载失败",
      "无法读取项目详情",
      "操作未完成",
    ])
      expect(stateKindForTitle(title)).toBe("error");
  });

  it("treats in-progress titles as loading", () => {
    for (const title of ["加载中…", "正在读取审批列表…", "读取中", "加载成员…"])
      expect(stateKindForTitle(title)).toBe("loading");
  });

  it("treats everything else as an empty state", () => {
    for (const title of ["暂无记录", "请先选择项目", "当天暂无工作任务", "全部处理完毕"])
      expect(stateKindForTitle(title)).toBe("empty");
  });
});
