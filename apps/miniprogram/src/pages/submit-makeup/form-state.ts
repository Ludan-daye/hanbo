type MakeupDraft = {
  readonly projectId: string | null;
  readonly date: string;
  readonly loadedContext: string | null;
  readonly plan: {
    readonly isWorkday: boolean;
    readonly points: readonly { readonly code: string }[];
  } | null;
  readonly point: string;
  readonly reason: string;
  readonly busy: boolean;
  readonly submitted: boolean;
};

export const makeupPlanContext = (
  projectId: string | null,
  date: string,
): string => `${projectId ?? ""}/${date}`;
export const canSubmitWorkerMakeup = (input: MakeupDraft): boolean =>
  input.projectId !== null &&
  input.loadedContext === makeupPlanContext(input.projectId, input.date) &&
  input.plan?.isWorkday === true &&
  input.plan.points.some((point) => point.code === input.point) &&
  input.reason.trim().length > 0 &&
  !input.busy &&
  !input.submitted;
