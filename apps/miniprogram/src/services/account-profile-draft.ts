import type { AccountProfileInput } from "./account";

export type AccountProfileDraft = {
  readonly nickname: string;
  readonly realName: string;
  readonly phone: string;
  readonly nicknameRejected: boolean;
};

export const parseAccountProfileDraft = (
  draft: AccountProfileDraft,
):
  | { readonly input: AccountProfileInput }
  | { readonly error: string } => {
  const nickname: string = draft.nickname.trim();
  const realName: string = draft.realName.trim();
  const phone: string = draft.phone.trim();
  if (draft.nicknameRejected)
    return { error: "昵称尚未通过微信检查，请修改或清空。" };
  if (nickname.length > 32) return { error: "昵称最多 32 个字符。" };
  if (
    realName.length < 1 ||
    realName.length > 30 ||
    !/^[\p{L}\p{M} ·•・.'’-]+$/u.test(realName)
  )
    return { error: "请填写真实姓名，长度为 1 至 30 个字符。" };
  if (!/^1[3-9]\d{9}$/.test(phone))
    return { error: "请填写有效的 11 位手机号。" };
  return {
    input: { ...(nickname.length > 0 ? { nickname } : {}), realName, phone },
  };
};
