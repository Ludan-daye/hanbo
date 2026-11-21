import type { ScheduledAttendancePoint, WorktimeRule } from "@construction/domain";

export type CompanyAttendanceDefaults = {
  readonly name: string;
  readonly points: readonly ScheduledAttendancePoint[];
  readonly workdays: readonly number[];
  readonly worktime: WorktimeRule;
};

/** GET/PUT /management/companies/:companyId/attendance-defaults. */
export type CompanyAttendanceDefaultsResponse = {
  readonly companyId: string;
  /** null until a company admin saves one; new projects then get the platform fallback. */
  readonly current:
    | (CompanyAttendanceDefaults & {
        readonly createdAt: string;
        readonly createdByName: string | null;
        readonly version: number;
      })
    | null;
  /** What a project gets without company defaults (每日两次, default worktime rule). */
  readonly fallback: CompanyAttendanceDefaults;
  /** Send back as expectedVersion; 0 before the first save. */
  readonly latestVersion: number;
};

export type CompanyAttendanceDefaultsWrite = CompanyAttendanceDefaults & {
  readonly expectedVersion: number;
};

/** Q12: what a company admin may change about the company itself. */
export type CompanyProfileResponse = {
  readonly address: string | null;
  readonly contactName: string | null;
  readonly contactPhone: string | null;
  readonly creditCode: string | null;
  readonly id: string;
  readonly name: string;
  readonly shortName: string | null;
  readonly status: string;
  readonly updatedAt: string;
};

export type CompanyProfileWrite = {
  readonly address: string | null;
  readonly contactName: string | null;
  readonly contactPhone: string | null;
  readonly expectedUpdatedAt: string;
};
