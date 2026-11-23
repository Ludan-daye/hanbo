// Platform management (/system/*, SYSTEM_ADMIN only). Phase 1 (2026-11-22): companies and
// their administrators; later phases add accounts, platform audit and settings here.

export type SystemCompanyStatus = "ACTIVE" | "SUSPENDED";

export type SystemCompanyQuery = {
  readonly cursor: string | null;
  readonly search: string;
  readonly status: SystemCompanyStatus | null;
};

/** The company form; every field but the name may be left blank (null). */
export type SystemCompanyWrite = {
  readonly address: string | null;
  readonly contactName: string | null;
  readonly contactPhone: string | null;
  readonly creditCode: string | null;
  readonly name: string;
  readonly shortName: string | null;
};

export type SystemCompanyUpdate = SystemCompanyWrite & {
  readonly expectedUpdatedAt: string;
};

/** Appoint an existing manager profile, or enter a new person who then binds with a code. */
export type CompanyAdminAppointment =
  | { readonly managerProfileId: string }
  | { readonly name: string; readonly phone: string };

export type CompanyAdminSummary = {
  readonly isBound: boolean;
  readonly memberId: string;
  readonly name: string;
  readonly phone: string;
};

/** The latest invitation of an appointee who has not bound yet; EXPIRED is derived. */
export type CompanyAdminInvitationView = {
  readonly expiresAt: string;
  readonly status: "PENDING" | "EXPIRED" | "ACCEPTED" | "REVOKED";
};

export type CompanyAdminView = CompanyAdminSummary & {
  readonly appointedAt: string;
  readonly invitation: CompanyAdminInvitationView | null;
  readonly managerProfileId: string;
};

export type SystemCompanyRow = {
  readonly activeProjectCount: number;
  readonly admins: readonly CompanyAdminSummary[];
  readonly createdAt: string;
  readonly creditCode: string | null;
  readonly id: string;
  readonly name: string;
  readonly projectCount: number;
  readonly shortName: string | null;
  readonly status: string;
};

export type SystemCompanyPage = {
  readonly items: readonly SystemCompanyRow[];
  readonly nextCursor: string | null;
};

export type SystemCompanyDetail = Omit<SystemCompanyRow, "admins"> & {
  readonly address: string | null;
  readonly admins: readonly CompanyAdminView[];
  readonly contactName: string | null;
  readonly contactPhone: string | null;
  readonly updatedAt: string;
};

export type CompanyAdminCandidate = {
  readonly managerProfileId: string;
  readonly name: string;
  readonly phone: string;
};

/** A code is returned once, when the appointee still has to bind. */
export type IssuedCompanyInvitation = {
  readonly code: string;
  readonly expiresAt: string;
};

export type CompanyAdminAppointed = {
  readonly invitation: IssuedCompanyInvitation | null;
  readonly member: CompanyAdminView;
};

export type CompanyAdminRevoked = {
  /** 0 means the company has no administrator left (Q2: allowed, shown in red). */
  readonly remainingAdmins: number;
};
