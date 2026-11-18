import { describe, expect, test } from "vitest";

import { parseAccountProfileDraft } from "../src/services/account-profile-draft";

const draft = {
  nickname: "",
  realName: " 张建国 ",
  phone: "13800000001",
  nicknameRejected: false,
};

describe("account profile draft", () => {
  test("accepts real name and phone without a nickname", () => {
    expect(parseAccountProfileDraft(draft)).toEqual({
      input: { realName: "张建国", phone: "13800000001" },
    });
  });

  test("keeps a nickname the user filled in", () => {
    expect(parseAccountProfileDraft({ ...draft, nickname: " 张师傅 " })).toEqual({
      input: { nickname: "张师傅", realName: "张建国", phone: "13800000001" },
    });
  });

  test("rejects a nickname longer than 32 characters", () => {
    expect(
      parseAccountProfileDraft({ ...draft, nickname: "长".repeat(33) }),
    ).toEqual({ error: "昵称最多 32 个字符。" });
  });

  test("rejects a nickname WeChat did not pass", () => {
    expect(
      parseAccountProfileDraft({
        ...draft,
        nickname: "张师傅",
        nicknameRejected: true,
      }),
    ).toEqual({ error: "昵称尚未通过微信检查，请修改或清空。" });
  });

  test("still requires a valid real name", () => {
    expect(parseAccountProfileDraft({ ...draft, realName: " " })).toEqual({
      error: "请填写真实姓名，长度为 1 至 30 个字符。",
    });
  });

  test("still requires a valid phone number", () => {
    expect(parseAccountProfileDraft({ ...draft, phone: "123" })).toEqual({
      error: "请填写有效的 11 位手机号。",
    });
  });
});
