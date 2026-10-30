import type { SessionPhase } from "../store/sessionReducer";

export const sessionEntryUrl = (phase: SessionPhase): string | null => {
  switch (phase) {
    case "anonymous":
      return "/pages/login/index";
    case "loading":
      return null;
    case "profile-required":
      return "/pages/complete-profile/index";
    case "worker-registration-required":
      return "/pages/worker-registration/index";
    case "face-enrollment-required":
      return "/pages/face-profile/index?onboarding=1";
    case "unbound":
      return "/pages/bind/index";
    case "norole":
    case "ready":
      return "/pages/home/index";
  }
};
