/** The project-admin home: today's attendance totals and pending counts, no rows. */
export type ProjectOverviewResponse = {
  readonly attendance: {
    /** 应到: same rule as the daily report's scheduled days. */
    readonly expected: number;
    readonly missing: number;
    readonly present: number;
    readonly workedMinutes: number;
  };
  /** Asia/Shanghai YYYY-MM-DD. */
  readonly date: string;
  readonly projectId: string;
  readonly todos: {
    /** Confirmed violations with a pending appeal. */
    readonly appealPending: number;
    /** Pending baseline photos of active members (one per person). */
    readonly facePending: number;
    /** Same count as GET /makeups/pending?projectId= lists for this user. */
    readonly makeupPending: number;
    /** Violations still waiting for the first review. */
    readonly violationPending: number;
  };
};
