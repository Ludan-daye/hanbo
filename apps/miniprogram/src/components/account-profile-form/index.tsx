import { Button as NativeButton, Image, Input, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState, type ReactNode } from "react";

import { FRONTEND_DEMO } from "../../config/env";
import {
  saveAccountAvatar,
  saveAccountProfile,
  type AccountProfile,
} from "../../services/account";
import { parseAccountProfileDraft } from "../../services/account-profile-draft";
import { errorMessage } from "../../services/error-messages";
import {
  BottomBar,
  Button,
  FormInput,
  LineIcon,
  Notice,
  PRESS,
  Sheet,
} from "../ui/index";

import "./index.scss";

const nativeAvatarPicker: boolean = process.env.TARO_ENV === "weapp";

type AccountProfileFormProps = {
  readonly profile: AccountProfile;
  readonly submitLabel: string;
  readonly onSaved: (profile: AccountProfile) => Promise<void>;
  /** 只为兼容旧调用保留，不再有区别。 */
  readonly appearance?: "worker";
  /** Onboarding asks only for the identity fields; nickname and avatar stay in 我的. */
  readonly identityOnly?: boolean;
  /**
   * 把“保存”放进页面底部的操作条（入场流程用），次要操作写在 children 里。
   * 不传时保存按钮跟在表单下面，这一屏别的地方就不要再放黑色实心按钮了。
   */
  readonly inBar?: boolean;
  /** 表单下面的一句说明；不传时提醒姓名和手机号要和档案一致。 */
  readonly note?: string;
  readonly children?: ReactNode;
};

export const AccountProfileForm = ({
  profile,
  submitLabel,
  onSaved,
  identityOnly = false,
  inBar = false,
  note,
  children,
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
      setError(errorMessage(cause, "未完成头像选择，请重新选择图片。"));
    }
  };
  const submit = async (): Promise<void> => {
    if (busy) return;
    setSavedMessage(null);
    const parsed = parseAccountProfileDraft({
      nickname: identityOnly ? "" : nickname,
      realName,
      phone,
      nicknameRejected: !identityOnly && nicknameRejected,
    });
    if ("error" in parsed) {
      setError(parsed.error);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (avatarPath !== null) await saveAccountAvatar(avatarPath);
      const updated: AccountProfile = await saveAccountProfile(parsed.input);
      await onSaved(updated);
      setSavedMessage("资料保存好了");
    } catch (cause: unknown) {
      setError(errorMessage(cause, "资料保存失败，请重试。"));
    } finally {
      setBusy(false);
    }
  };

  const avatar: string | null = avatarPath ?? profile.avatarDataUrl;
  const blocked: boolean = !identityOnly && nicknameRejected;
  const label: string = busy ? "保存中…" : submitLabel;
  return (
    <View className="account-form">
      <Sheet gap>
        {identityOnly ? null : (
          <>
            {/* 头像要用微信的“选头像”能力，只能是原生按钮；样子做成和别的行一样。 */}
            <NativeButton
              className="account-form__avatar ui-press"
              {...PRESS}
              openType={nativeAvatarPicker ? "chooseAvatar" : undefined}
              onChooseAvatar={chooseAvatar}
              disabled={busy ? true : undefined}
              onClick={() => {
                if (!nativeAvatarPicker) void chooseLocalAvatar();
              }}
            >
              <View className="account-form__avatar-pic">
                {avatar === null ? (
                  <LineIcon name="user" tone="muted" />
                ) : (
                  <Image
                    className="account-form__avatar-image"
                    src={avatar}
                    mode="aspectFill"
                  />
                )}
              </View>
              <View className="account-form__avatar-text">
                <View className="account-form__avatar-title">
                  {FRONTEND_DEMO ? "演示头像" : "微信头像"}
                </View>
                <View className="account-form__avatar-sub">
                  {avatarPath !== null
                    ? "选好了，保存后生效"
                    : "选填，点这里换一张"}
                </View>
              </View>
              <View className="ui-chevron" />
            </NativeButton>
            {/* 昵称要用微信的昵称输入和审核回调，公共的 FormInput 没有这些，这一行单独写。 */}
            <View className="ui-form-row">
              <View className="ui-form-row__label">
                {FRONTEND_DEMO ? "演示昵称" : "微信昵称"}
              </View>
              <Input
                className="ui-form-row__input"
                type={nativeAvatarPicker ? "nickname" : "text"}
                value={nickname}
                maxlength={32}
                disabled={busy ? true : undefined}
                placeholder={
                  FRONTEND_DEMO || !nativeAvatarPicker
                    ? "选填"
                    : "选填，点这里用微信昵称"
                }
                placeholderClass="ui-form-row__placeholder"
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
                    setError("昵称尚未通过微信检查，请修改或清空。");
                  }
                }}
              />
            </View>
          </>
        )}
        <FormInput
          label="真实姓名"
          required
          value={realName}
          maxLength={30}
          placeholder="与人员档案一致"
          onInput={(value: string): void => {
            setRealName(value);
            setError(null);
            setSavedMessage(null);
          }}
        />
        <FormInput
          label="手机号"
          required
          value={phone}
          maxLength={11}
          type="number"
          placeholder="本人手机号"
          onInput={(value: string): void => {
            setPhone(value);
            setError(null);
            setSavedMessage(null);
          }}
        />
      </Sheet>
      <Notice>{note ?? "姓名和手机号要和本人档案一致。"}</Notice>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {savedMessage ? <Notice tone="success">{savedMessage}</Notice> : null}
      {inBar ? (
        <BottomBar
          primary={label}
          busy={busy}
          disabled={blocked}
          onPrimary={() => {
            void submit();
          }}
        >
          {children}
        </BottomBar>
      ) : (
        <Button
          loading={busy}
          disabled={blocked}
          onClick={() => {
            void submit();
          }}
        >
          {label}
        </Button>
      )}
    </View>
  );
};
