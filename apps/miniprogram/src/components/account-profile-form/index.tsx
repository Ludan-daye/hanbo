import { Button as NativeButton, Input, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";

import { FRONTEND_DEMO } from "../../config/env";
import {
  saveAccountAvatar,
  saveAccountProfile,
  type AccountProfile,
} from "../../services/account";
import { Button, Field, Notice } from "../ui/index";
import { AccountAvatar } from "../account-avatar";

import "./index.scss";

const nativeAvatarPicker: boolean = process.env.TARO_ENV === "weapp";

type AccountProfileFormProps = {
  readonly profile: AccountProfile;
  readonly submitLabel: string;
  readonly onSaved: (profile: AccountProfile) => Promise<void>;
};

export const AccountProfileForm = ({
  profile,
  submitLabel,
  onSaved,
}: AccountProfileFormProps): JSX.Element => {
  const [realName, setRealName] = useState<string>(profile.realName ?? "");
  const [phone, setPhone] = useState<string>(profile.phone ?? "");
  const [nickname, setNickname] = useState<string>(profile.nickname ?? "");
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [nicknameRejected, setNicknameRejected] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    setNickname(profile.nickname ?? "");
    setRealName(profile.realName ?? "");
    setPhone(profile.phone ?? "");
    setAvatarPath(null);
  }, [profile]);

  const selectAvatar = (path: string): void => {
    setAvatarPath(path);
    setError(null);
    setSavedMessage(null);
  };
  const chooseAvatar = (event: { readonly detail: unknown }): void => {
    const detail = event.detail;
    if (
      detail === null ||
      typeof detail !== "object" ||
      !("avatarUrl" in detail) ||
      typeof detail.avatarUrl !== "string" ||
      detail.avatarUrl.length === 0
    ) {
      setError("未取得头像图片，请重新选择。");
      return;
    }
    selectAvatar(detail.avatarUrl);
  };
  const chooseLocalAvatar = async (): Promise<void> => {
    if (busy) return;
    setError(null);
    try {
      const result = await Taro.chooseImage({
        count: 1,
        sizeType: ["compressed"],
        sourceType: ["album"],
      });
      const path: string | undefined = result.tempFilePaths[0];
      if (!path) throw new Error("未取得头像图片，请重新选择。");
      selectAvatar(path);
    } catch (cause: unknown) {
      setError(
        cause instanceof Error
          ? cause.message
          : "未完成头像选择，请重新选择图片。",
      );
    }
  };
  const submit = async (): Promise<void> => {
    if (busy) return;
    setSavedMessage(null);
    if (avatarPath === null && !profile.avatarDataUrl) {
      setError("请先选择头像，再保存资料。");
      return;
    }
    const trimmedNickname: string = nickname.trim();
    if (
      nicknameRejected ||
      trimmedNickname.length === 0 ||
      trimmedNickname.length > 32
    ) {
      setError("请填写可用昵称，长度为 1 至 32 个字符。");
      return;
    }
    const trimmedName: string = realName.trim();
    const trimmedPhone: string = phone.trim();
    if (
      trimmedName.length < 1 ||
      trimmedName.length > 30 ||
      !/^[\p{L}\p{M} ·•・.'’-]+$/u.test(trimmedName)
    ) {
      setError("请填写真实姓名，长度为 1 至 30 个字符。");
      return;
    }
    if (!/^1[3-9]\d{9}$/.test(trimmedPhone)) {
      setError("请填写有效的 11 位手机号。");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (avatarPath !== null) await saveAccountAvatar(avatarPath);
      const updated: AccountProfile = await saveAccountProfile({
        nickname: trimmedNickname,
        realName: trimmedName,
        phone: trimmedPhone,
      });
      await onSaved(updated);
      setSavedMessage("账号资料已保存");
    } catch (cause: unknown) {
      setError(
        cause instanceof Error ? cause.message : "资料保存失败，请重试。",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <NativeButton
        className="account-avatar-button"
        openType={nativeAvatarPicker ? "chooseAvatar" : undefined}
        onChooseAvatar={chooseAvatar}
        disabled={busy ? true : undefined}
        onClick={() => {
          if (!nativeAvatarPicker) void chooseLocalAvatar();
        }}
      >
        <View className="profile-avatar">
          <AccountAvatar src={avatarPath ?? profile.avatarDataUrl} />
        </View>
        <View>
          <View className="account-avatar-button__title">
            {FRONTEND_DEMO ? "选择演示头像" : "选择微信头像"}
          </View>
          <View className="account-avatar-button__sub">
            {avatarPath !== null
              ? "已选择，保存后生效"
              : "必填 · 点击选择或更换头像"}
          </View>
        </View>
        <View className="account-avatar-button__arrow">›</View>
      </NativeButton>
      <View className="ui-field-wrap">
        <View className="ui-field-label">
          {FRONTEND_DEMO ? "演示昵称（必填）" : "微信昵称（必填）"}
        </View>
        <Input
          className="ui-field"
          type={nativeAvatarPicker ? "nickname" : "text"}
          value={nickname}
          maxlength={32}
          disabled={busy ? true : undefined}
          placeholder={FRONTEND_DEMO ? "请填写演示昵称" : "点击使用微信昵称"}
          onInput={(event) => {
            setNickname(event.detail.value);
            setNicknameRejected(false);
            setError(null);
            setSavedMessage(null);
          }}
          onBlur={(event) => setNickname(event.detail.value)}
          onNickNameReview={(event) => {
            const detail = event.detail as {
              readonly pass?: boolean;
              readonly timeout?: boolean;
            };
            if (detail.pass === false || detail.timeout === true) {
              setNicknameRejected(true);
              setError("昵称尚未通过微信检查，请修改后重新保存。");
            }
          }}
        />
      </View>
      <Field
        label="真实姓名（必填）"
        value={realName}
        maxLength={30}
        placeholder="请填写与人员档案一致的姓名"
        onInput={(value: string): void => {
          setRealName(value);
          setError(null);
          setSavedMessage(null);
        }}
      />
      <Field
        label="手机号（必填）"
        value={phone}
        maxLength={11}
        type="number"
        placeholder="请填写本人 11 位手机号"
        onInput={(value: string): void => {
          setPhone(value);
          setError(null);
          setSavedMessage(null);
        }}
      />
      <View className="account-identity-note">
        姓名和手机号须与管理员登记的本人档案一致。
      </View>
      {error ? <Notice>{error}</Notice> : null}
      <Button
        loading={busy}
        disabled={nicknameRejected}
        onClick={() => {
          void submit();
        }}
      >
        {submitLabel}
      </Button>
      {savedMessage ? (
        <View className="account-saved">{savedMessage}</View>
      ) : null}
    </>
  );
};
