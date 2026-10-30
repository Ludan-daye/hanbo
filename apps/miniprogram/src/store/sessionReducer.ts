import type { MeResponse } from "../services/auth.types";
import type { AccountProfile } from "../services/account";

export type SessionState = {
  readonly accessToken: string | null;
  readonly refreshToken: string | null;
  readonly me: MeResponse | null;
  readonly accountProfile: AccountProfile | null;
  readonly faceEnrollmentRequired: boolean;
};

export type SessionAction =
  | { type: "SET_TOKENS"; accessToken: string; refreshToken: string }
  | { type: "SET_ACCESS_TOKEN"; accessToken: string }
  | {
      type: "SET_ME";
      me: MeResponse;
      accountProfile: AccountProfile;
      faceEnrollmentRequired: boolean;
    }
  | { type: "CLEAR" };

export type SessionPhase =
  | "anonymous"
  | "loading"
  | "profile-required"
  | "worker-registration-required"
  | "face-enrollment-required"
  | "unbound"
  | "norole"
  | "ready";

export const initialSessionState: SessionState = {
  accessToken: null,
  me: null,
  accountProfile: null,
  refreshToken: null,
  faceEnrollmentRequired: false,
};

export const sessionReducer = (
  state: SessionState,
  action: SessionAction,
): SessionState => {
  switch (action.type) {
    case "SET_TOKENS":
      return {
        ...state,
        accessToken: action.accessToken,
        refreshToken: action.refreshToken,
      };
    case "SET_ACCESS_TOKEN":
      return { ...state, accessToken: action.accessToken };
    case "SET_ME":
      return {
        ...state,
        me: action.me,
        accountProfile: action.accountProfile,
        faceEnrollmentRequired: action.faceEnrollmentRequired,
      };
    case "CLEAR":
      return initialSessionState;
    default:
      return state;
  }
};

export const sessionPhase = (state: SessionState): SessionPhase => {
  if (state.accessToken === null) {
    return "anonymous";
  }
  if (state.me === null || state.accountProfile === null) {
    return "loading";
  }
  if (
    !state.accountProfile.nickname?.trim() ||
    !state.accountProfile.avatarDataUrl ||
    !state.accountProfile.realName?.trim() ||
    !/^1[3-9]\d{9}$/.test(state.accountProfile.phone ?? "")
  ) {
    return "profile-required";
  }
  if (!state.me.user.isBound) {
    return "unbound";
  }
  if (state.accountProfile.workerRegistration === "REQUIRED")
    return "worker-registration-required";
  if (state.faceEnrollmentRequired) return "face-enrollment-required";
  return state.me.roles.highestRoleCode === null ? "norole" : "ready";
};
