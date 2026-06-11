import type { BindingTargetTypeValue } from "../bindings/bindings.types.js";

export type BindingInvitationStatusValue = "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";

export type BindingInvitationListItem = {
  readonly id: string;
  readonly targetType: BindingTargetTypeValue;
  readonly profileId: string;
  readonly projectId: string;
  readonly status: BindingInvitationStatusValue;
  readonly expiresAt: string;
  readonly createdAt: string;
  readonly acceptedByUserId: string | null;
};
