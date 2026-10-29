import { ForbiddenException, SetMetadata } from "@nestjs/common";
import type { User } from "@prisma/client";

export const ALLOW_INCOMPLETE_ACCOUNT = "allowIncompleteAccount";
export const AllowIncompleteAccount = (): ReturnType<typeof SetMetadata> =>
  SetMetadata(ALLOW_INCOMPLETE_ACCOUNT, true);

type OnboardingProfile = Pick<
  User,
  "openid" | "nickname" | "avatarObjectKey" | "encryptedRealName" | "phone"
>;

export const assertAccountProfileComplete = (user: OnboardingProfile): void => {
  if (
    !user.openid?.trim() ||
    !user.nickname?.trim() ||
    !user.avatarObjectKey ||
    !user.encryptedRealName?.trim() ||
    !/^1[3-9]\d{9}$/.test(user.phone ?? "")
  ) {
    throw new ForbiddenException({ message: "ACCOUNT_PROFILE_REQUIRED" });
  }
};

export const assertIdentityMatches = (
  identity: { readonly realName: string; readonly phone: string },
  profile: { readonly realName: string; readonly phone: string },
): void => {
  if (
    identity.realName.normalize("NFKC").trim() !==
      profile.realName.normalize("NFKC").trim() ||
    identity.phone !== profile.phone
  ) {
    throw new ForbiddenException({ message: "ACCOUNT_IDENTITY_MISMATCH" });
  }
};
