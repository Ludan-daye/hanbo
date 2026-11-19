import { Image, View } from "@tarojs/components";

import { LineIcon } from "../ui/line-icon";

import "./index.scss";

/**
 * 头像，填满外面那个框（大小和圆角由外面的框决定）。
 * 有照片用照片；没有照片时写名字的第一个字；名字也没有就是一个人形图标。
 */
export const AccountAvatar = ({
  src,
  name,
}: {
  readonly src: string | null;
  readonly name?: string | null;
}): JSX.Element => {
  if (src !== null)
    return (
      <Image className="account-avatar-image" src={src} mode="aspectFill" />
    );
  const initial = Array.from((name ?? "").trim())[0];
  return initial ? (
    <View className="account-avatar-initial">{initial}</View>
  ) : (
    <LineIcon name="user" tone="muted" />
  );
};
