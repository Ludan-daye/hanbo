export type AccountProfileInput = {
  readonly nickname: string;
  readonly realName: string;
  readonly phone: string;
};

export type AccountProfile = {
  readonly realName: string | null;
  readonly phone: string | null;
  readonly nickname: string | null;
  readonly avatarDataUrl: string | null;
  readonly isBound: boolean;
  readonly phoneMasked: string | null;
};
