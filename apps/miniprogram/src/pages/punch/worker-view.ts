export type WorkerPunchPhase =
  | "IDLE"
  | "LOCATING"
  | "PHOTO"
  | "PREPARING"
  | "VERIFYING"
  | "SUBMITTING";
export type WorkerPunchStepInput = {
  readonly phase: WorkerPunchPhase;
  readonly inside: boolean;
  readonly hasPhoto: boolean;
  readonly faceReady: boolean;
  readonly safetyReady: boolean;
  readonly validProof: boolean;
  readonly locationDenied: boolean;
  readonly cameraDenied: boolean;
};
export type WorkerPunchStep = {
  readonly stage: "location" | "photo" | "face" | "saving";
  readonly action:
    | "wait"
    | "retry-save"
    | "location-settings"
    | "locate"
    | "camera-settings"
    | "capture"
    | "face-profile"
    | "confirm-safety"
    | "verify";
};

export const workerPunchFeedback = (input: {
  readonly hasSchedule: boolean;
  readonly scheduleError: string | null;
  readonly error: string | null;
}): {
  readonly refreshWarning: string | null;
  readonly actionError: string | null;
} => {
  const refreshWarning = input.hasSchedule ? input.scheduleError : null;
  return {
    refreshWarning,
    actionError:
      refreshWarning !== null && input.error === refreshWarning
        ? null
        : input.error,
  };
};

/** Display only: existing handlers still validate location, proof and server state. */
export const workerPunchStep = (
  input: WorkerPunchStepInput,
): WorkerPunchStep => {
  if (input.phase === "SUBMITTING") return { stage: "saving", action: "wait" };
  if (input.phase === "IDLE" && input.validProof && input.locationDenied)
    return { stage: "saving", action: "location-settings" };
  if (input.validProof) return { stage: "saving", action: "retry-save" };
  if (input.phase === "PREPARING" || input.phase === "VERIFYING")
    return { stage: "face", action: "wait" };
  if (input.phase === "PHOTO") return { stage: "photo", action: "wait" };
  if (input.phase === "LOCATING") return { stage: "location", action: "wait" };
  if (!input.inside)
    return {
      stage: "location",
      action: input.locationDenied ? "location-settings" : "locate",
    };
  if (!input.hasPhoto)
    return {
      stage: "photo",
      action: input.cameraDenied ? "camera-settings" : "capture",
    };
  return {
    stage: "face",
    action: !input.faceReady
      ? "face-profile"
      : input.safetyReady
        ? "verify"
        : "confirm-safety",
  };
};
