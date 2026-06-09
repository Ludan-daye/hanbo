export type BindingTargetTypeValue = "MANAGER" | "WORKER";

export type CreateBindingInvitationRequest = {
  readonly profileId: string;
  readonly targetType: BindingTargetTypeValue;
};

export type BindingInvitationResponse = {
  readonly code: string;
  readonly expiresAt: string;
  readonly id: string;
  readonly profileId: string;
  readonly projectId: string;
  readonly targetType: BindingTargetTypeValue;
};
