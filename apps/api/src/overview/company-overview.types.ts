import type { ProjectStatusValue } from "../management/management.types.js";

/** The company-admin home: today's totals per project and pending counts, no rows. */
export type CompanyOverviewResponse = {
  readonly attendance: {
    /** 应到: same rule as the company daily report's scheduled days. */
    readonly expected: number;
    readonly missing: number;
    readonly present: number;
    readonly workedMinutes: number;
  };
  readonly companyId: string;
  /** Asia/Shanghai YYYY-MM-DD. */
  readonly date: string;
  /** Every project of the company, whatever its status; the client folds non-active ones. */
  readonly projects: readonly {
    readonly attendance: {
      readonly expected: number;
      readonly missing: number;
      readonly present: number;
    };
    readonly name: string;
    readonly projectId: string;
    readonly status: ProjectStatusValue;
    readonly todos: {
      /** Pending baseline photos of active members (one per person). */
      readonly facePending: number;
      /** Violations still waiting for the first review. */
      readonly violationPending: number;
    };
  }[];
  readonly todos: {
    /** Same count as GET /makeups/pending?onlyMine=true lists for this company. */
    readonly makeupOnlyYou: number;
    /** Same count as GET /makeups/pending lists for this company. */
    readonly makeupPending: number;
    readonly transferPending: number;
  };
};
