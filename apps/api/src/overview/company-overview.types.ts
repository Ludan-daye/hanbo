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

/** 各项目一览 (2026-11-21 Q10): per project backlogs, each equal to the list it opens. */
export type ProjectHealthResponse = {
  readonly companyId: string;
  readonly projects: readonly {
    /** Confirmed violations with a pending appeal. */
    readonly appealPending: number;
    /** Pending baseline photos of active members. */
    readonly facePending: number;
    /** Active workers whose safety credit is below 60. */
    readonly lowCredit: number;
    readonly name: string;
    readonly projectId: string;
    /** Active workers whose 用工登记 is not verified yet (people-page registrationStatus=PENDING). */
    readonly registrationPending: number;
    readonly status: "ACTIVE" | "COMPLETED" | "PREPARING" | "SUSPENDED";
    readonly violationPending: number;
  }[];
};
