import { Image } from "@tarojs/components";

import { AppIcon } from "../ui/icon";

import "./index.scss";

export const AccountAvatar = ({
  src,
}: {
  readonly src: string | null;
}): JSX.Element =>
  src === null ? (
    <AppIcon name="user" />
  ) : (
    <Image className="account-avatar-image" src={src} mode="aspectFill" />
  );
