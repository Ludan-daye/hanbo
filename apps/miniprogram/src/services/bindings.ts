import { apiClient } from "./client";

export type BindingTargetType = "WORKER" | "MANAGER";

export type BindingInvitation = {
  readonly code: string;
  readonly expiresAt: string;
  readonly id: string;
  readonly profileId: string;
  readonly projectId: string;
  readonly targetType: BindingTargetType;
};

export const createInvitation = async (
  projectId: string,
  body: { readonly profileId: string; readonly targetType: BindingTargetType }
): Promise<BindingInvitation> =>
  apiClient.request<BindingInvitation>(`/bindings/projects/${projectId}/invitations`, { data: body, method: "POST" });
