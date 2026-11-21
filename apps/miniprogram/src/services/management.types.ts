export type ParticipantType = "WORKER" | "MANAGER";
export type MemberStatus = "ACTIVE" | "EXITED" | "SUSPENDED";

export type MemberRoleAssignment = {
  readonly roleCode: "WORKER" | "TEAM_LEADER" | "PROJECT_ADMIN";
  readonly teamId: string | null;
  readonly teamName?: string | null;
};
export type AdditionalMemberRole = MemberRoleAssignment & {
  readonly roleCode: "WORKER" | "TEAM_LEADER";
};
export type WorkRoleScope = {
  readonly roleCode:
    | "WORKER"
    | "TEAM_LEADER"
    | "PROJECT_ADMIN"
    | "COMPANY_ADMIN"
    | "SYSTEM_ADMIN";
  readonly scopeType: "GLOBAL" | "COMPANY" | "PROJECT" | "TEAM";
  readonly scopeId: string;
  readonly scopeName: string;
  readonly projectId: string | null;
};

export type ProjectParticipant = {
  readonly taskAttendanceOnly?: boolean;
  readonly additionalRoles?: readonly AdditionalMemberRole[];
  readonly displayName: string | null;
  readonly memberId: string;
  readonly participantType: ParticipantType;
  readonly phone: string;
  readonly profileId: string;
  readonly projectId: string;
  readonly projectRoleLabel: string;
  readonly requiresAttendance: boolean;
  readonly status: MemberStatus;
  readonly teamId: string | null;
  readonly teamName: string | null;
};

export type ManagedParticipant = ProjectParticipant & {
  readonly workType: string | null;
  readonly enteredAt: string;
  readonly exitedAt: string | null;
  readonly updatedAt: string;
  readonly profileUpdatedAt: string;
  readonly nameStatus: "AVAILABLE" | "REQUIRES_UPDATE";
};

export type ParticipantPage = {
  readonly items: readonly ManagedParticipant[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
};

export type ParticipantPageOptions = {
  readonly permissionRole?: "WORKER" | "TEAM_LEADER" | "PROJECT_ADMIN" | null;
  readonly page: number;
  readonly pageSize: number;
  readonly search: string;
  readonly participantType: ParticipantType | null;
  readonly teamId: string | null;
  readonly status: MemberStatus | null;
};

export type ReportTotals = {
  readonly abnormalRecordCount: number;
  readonly absenceCount: number;
  readonly actualAttendedDays: number;
  readonly approvedMakeupCount: number;
  readonly earlyLeaveCount: number;
  readonly lateCount: number;
  readonly missingPunchCount: number;
  readonly participantCount: number;
  readonly scheduledDays: number;
  readonly workedMinutes: number;
  readonly normalMinutes: number;
  readonly overtimeMinutes: number;
  readonly unclassifiedMinutes: number;
  readonly confirmedViolationCount: number;
};

export type ReportParticipantBase = {
  readonly projectKind: "REGULAR" | "REPAIR";
  readonly isTemporary: boolean;
  readonly safetyCreditScore: number | null;
  readonly safetyCreditAsOf: string | null;
  readonly projectId: string;
  readonly projectName: string;
  readonly evaluation: ProjectEvaluation | null;
  readonly displayName: string | null;
  readonly memberId: string;
  readonly memberStatus: MemberStatus;
  readonly participantId: string;
  readonly participantType: ParticipantType;
  readonly phone: string;
  readonly projectRoleLabel: string;
  readonly requiresAttendance: boolean;
  readonly teamId: string | null;
  readonly teamName: string | null;
  /** 这个人所在班组现在的组长。 */
  readonly teamLeaderName?: string | null;
  readonly workType: string | null;
};

/** 报表筛选里的一个班组，带上它现在的组长。 */
export type ReportTeamOption = {
  readonly teamId: string;
  readonly teamName: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly status: string;
  readonly leaderMemberId: string | null;
  readonly leaderName: string | null;
};

export type DailyReportParticipant = ReportParticipantBase & {
  readonly abnormalRecordCount: number;
  readonly approvedMakeupCount: number;
  readonly isAbsent: boolean;
  readonly isEarlyLeave: boolean;
  readonly isLate: boolean;
  readonly isMissingPunch: boolean;
  readonly workedMinutes: number;
  readonly normalMinutes: number;
  readonly overtimeMinutes: number;
  readonly unclassifiedMinutes: number;
  readonly confirmedViolationCount: number;
};

export type RangeReportParticipant = ReportParticipantBase &
  Omit<ReportTotals, "participantCount">;

/** 项目管理员首页：今天的应到、到岗、缺卡和三类待办的条数，不带明细。 */
export type ProjectOverview = {
  readonly attendance: {
    readonly expected: number;
    readonly missing: number;
    readonly present: number;
    readonly workedMinutes: number;
  };
  readonly date: string;
  readonly projectId: string;
  readonly todos: {
    readonly appealPending: number;
    readonly facePending: number;
    readonly makeupPending: number;
    readonly violationPending: number;
  };
};

/** 公司管理员首页：每个项目一行今天的应到、到岗、缺卡，加公司的待办条数，不带明细。 */
export type CompanyOverview = {
  readonly attendance: {
    readonly expected: number;
    readonly missing: number;
    readonly present: number;
    readonly workedMinutes: number;
  };
  readonly companyId: string;
  readonly date: string;
  readonly projects: readonly {
    readonly attendance: {
      readonly expected: number;
      readonly missing: number;
      readonly present: number;
    };
    readonly name: string;
    readonly projectId: string;
    readonly status: ProjectStatus;
    readonly todos: {
      readonly facePending: number;
      readonly violationPending: number;
    };
  }[];
  readonly todos: {
    /** 只有公司管理员能批的补卡（申请人是项目管理员，或项目里没有更高职级的人）。 */
    readonly makeupOnlyYou: number;
    readonly makeupPending: number;
    readonly transferPending: number;
  };
};

export type DailyReport = {
  readonly endDate: string;
  readonly participants: ReadonlyArray<DailyReportParticipant>;
  readonly periodType: "DAILY";
  readonly projectId: string;
  readonly startDate: string;
  readonly totals: ReportTotals;
};

export type RangeReport = {
  readonly endDate: string;
  readonly participants: ReadonlyArray<RangeReportParticipant>;
  readonly periodType: "WEEKLY" | "MONTHLY";
  readonly projectId: string;
  readonly startDate: string;
  readonly totals: ReportTotals;
};

export type ProjectStatus = "PREPARING" | "ACTIVE" | "SUSPENDED" | "COMPLETED";

export type CompanyProject = {
  readonly id: string;
  readonly companyId: string;
  readonly name: string;
  readonly status: ProjectStatus;
  readonly address: string;
  readonly centerLatitude: string;
  readonly centerLongitude: string;
  readonly geofenceRadiusM: number;
  readonly plannedStartDate: string;
  readonly plannedEndDate: string | null;
  /** 只有公司项目列表带：在场人数和现在的项目管理员。 */
  readonly activeMembers?: number;
  readonly adminNames?: readonly string[];
  /** 只有新建项目的回应带：套用的公司默认版本，没套用是 null。 */
  readonly appliedDefaultsVersion?: number | null;
};

export type ManagedProject = CompanyProject & {
  readonly code: string | null;
  readonly contactName: string | null;
  readonly contactPhone: string | null;
  readonly remark: string | null;
  readonly updatedAt: string;
};

export type CompanyParticipant = ProjectParticipant & {
  readonly projectName: string;
};

export type ProjectTeam = {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly status: string;
};

export type TeamLeaderReference = {
  readonly memberId: string;
  readonly participantType: ParticipantType;
};
export type ManagedTeam = ProjectTeam & {
  readonly workType: string | null;
  readonly remark: string | null;
  readonly updatedAt: string;
  readonly memberCount: number;
  readonly leader:
    | (TeamLeaderReference & {
        readonly displayName: string | null;
        readonly phone: string;
      })
    | null;
};
export type TeamForm = {
  readonly name: string;
  readonly status: "ACTIVE" | "SUSPENDED";
  readonly workType: string | null;
  readonly remark: string | null;
  readonly leader: TeamLeaderReference | null;
  readonly expectedUpdatedAt: string;
};
export type ReuseProject = { readonly id: string; readonly name: string };
export type ReusePersonForm = {
  readonly additionalRoles?: readonly AdditionalMemberRole[];
  readonly sourceProjectId: string;
  readonly sourceMemberId: string;
  readonly participantType: ParticipantType;
  readonly expectedSourceUpdatedAt: string;
  readonly expectedProfileUpdatedAt: string;
  readonly projectRoleLabel: string;
  readonly teamId: string | null;
  readonly requiresAttendance: boolean;
  readonly enteredAt: string;
};

export type BindingInvitationStatus =
  | "PENDING"
  | "ACCEPTED"
  | "EXPIRED"
  | "REVOKED";
export type BindingTargetType = "WORKER" | "MANAGER";

export type ProjectInvitation = {
  readonly id: string;
  readonly targetType: BindingTargetType;
  readonly profileId: string;
  readonly projectId: string;
  readonly status: BindingInvitationStatus;
  readonly expiresAt: string;
  readonly createdAt: string;
  readonly acceptedByUserId: string | null;
};

export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type ShiftSegment = {
  readonly sequence: 1 | 2;
  readonly startTime: string;
  readonly endTime: string;
  readonly lateGraceMins: number;
  readonly earlyGraceMins: number;
};

export type DefaultShiftBody = {
  readonly name: string;
  readonly segments: readonly [ShiftSegment, ShiftSegment];
};

export type DefaultScheduleBody = {
  readonly startsOn: string;
  readonly endsOn: string | null;
  readonly workdays: readonly IsoWeekday[];
};

export type DefaultAttendanceConfiguration = {
  readonly shift: (DefaultShiftBody & { readonly id: string }) | null;
  readonly schedule:
    | (DefaultScheduleBody & { readonly shiftId: string })
    | null;
};

export type CreateProjectBody = {
  readonly managerProfileIds: readonly string[];
  /** 套用公司默认的打卡安排和工时规则；不传就是套用。 */
  readonly applyCompanyDefaults?: boolean;
  /** 还不在本公司任何项目里的新管理员（姓名＋手机号），建好后用邀请码绑定。 */
  readonly newManagers?: readonly { readonly name: string; readonly phone: string }[];
  readonly name: string;
  readonly address: string;
  readonly centerLatitude: string;
  readonly centerLongitude: string;
  readonly geofenceRadiusM: number;
  readonly status: ProjectStatus;
  readonly plannedStartDate: string;
  readonly plannedEndDate: string | null;
};

export type ProjectManagerCandidate = {
  readonly profileId: string;
  readonly name: string;
  readonly phone: string;
  readonly isBound: boolean;
};

export type ProjectEvaluation = {
  readonly id: string;
  readonly score: number;
  readonly comment: string | null;
  readonly reviewerName: string;
  readonly reviewedAt: string;
  readonly updatedAt: string;
};
export type ReportPersonDay = {
  readonly date: string;
  readonly teamName: string | null;
  readonly planName: string;
  readonly worktimeRuleVersion: number;
  readonly isPendingVerification: boolean;
  readonly isScheduled: boolean;
  readonly workedMinutes: number;
  readonly normalMinutes: number;
  readonly overtimeMinutes: number;
  readonly unclassifiedMinutes: number;
  readonly confirmedViolationCount: number;
  readonly flags: readonly string[];
  readonly points: readonly {
    readonly code: string;
    readonly label: string;
    readonly time: string;
    readonly graceMins: number;
  }[];
  readonly records: readonly {
    readonly id: string;
    readonly pointCode: string;
    readonly occurredAt: string;
    readonly isValid: boolean;
    readonly source: string;
    readonly latitude: string | null;
    readonly longitude: string | null;
    readonly locationAccuracyM: string | null;
    readonly geofenceDistanceM: string | null;
  }[];
  readonly makeups: readonly {
    readonly id: string;
    readonly pointLabel: string;
    readonly requestedOccurredAt: string;
    readonly status: string;
    readonly reason: string;
    readonly approvalReason: string | null;
    readonly approverName: string | null;
    readonly approvedAt: string | null;
  }[];
};
export type ReportPersonDetail = {
  readonly person: ReportParticipantBase;
  readonly canEvaluate: boolean;
  readonly startDate: string;
  readonly endDate: string;
  readonly days: readonly ReportPersonDay[];
};

/** 项目负责人页：公司每个项目现在由谁管（在场的项目管理员）。 */
export type ProjectAdmins = {
  readonly projects: readonly {
    readonly admins: readonly {
      readonly displayName: string | null;
      readonly isBound: boolean;
      readonly memberId: string;
      readonly participantType: ParticipantType;
      readonly phone: string;
      readonly profileId: string;
    }[];
    readonly name: string;
    readonly projectId: string;
    readonly status: ProjectStatus;
  }[];
};

/** 一个人在本公司各项目的任职（看不到别家公司的）。 */
export type CompanyPersonMembership = {
  readonly enteredAt: string;
  readonly evaluationScore: number | null;
  readonly exitedAt: string | null;
  readonly history: readonly {
    readonly recordedAt: string;
    readonly status: MemberStatus;
    readonly teamName: string | null;
    readonly projectRoleLabel: string;
  }[];
  readonly memberId: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly projectRoleLabel: string;
  readonly projectStatus: ProjectStatus;
  readonly roles: readonly {
    readonly roleCode: "PROJECT_ADMIN" | "TEAM_LEADER" | "WORKER";
    readonly teamId: string | null;
    readonly teamName: string | null;
  }[];
  readonly status: MemberStatus;
  readonly teamId: string | null;
  readonly teamName: string | null;
  readonly updatedAt: string;
};
export type CompanyPerson = {
  readonly displayName: string | null;
  readonly isBound: boolean;
  readonly memberships: readonly CompanyPersonMembership[];
  readonly participantType: ParticipantType;
  readonly phone: string;
  readonly profileId: string;
};
/** 离岗：默认只收回管理职务；EXIT_ALL 是在本公司所有项目办退场。 */
export type OffboardMode = "REVOKE_ADMIN" | "EXIT_ALL";

/** 公司人员一人一行（2026-11-21 Q8）：在哪几个项目、资料核实和底照状态。 */
export type CompanyPeopleItem = {
  readonly displayName: string | null;
  readonly faceStatus: "APPROVED" | "NONE" | "PENDING" | "REJECTED";
  readonly participantType: ParticipantType;
  readonly phone: string;
  readonly profileId: string;
  readonly projectCount: number;
  readonly projects: readonly {
    readonly memberId: string;
    readonly projectId: string;
    readonly projectName: string;
    readonly roleLabel: string;
    readonly status: MemberStatus;
    readonly teamName: string | null;
  }[];
  readonly registrationStatus: "NEEDS_UPDATE" | "PENDING" | "VERIFIED" | null;
};
export type CompanyPeoplePage = {
  readonly items: readonly CompanyPeopleItem[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
};
export type CompanyPeopleQuery = {
  readonly page: number;
  readonly pageSize: number;
  readonly search: string;
  readonly projectId?: string | null;
  readonly participantType?: ParticipantType | null;
  readonly permissionRole?: "WORKER" | "TEAM_LEADER" | "PROJECT_ADMIN" | null;
  readonly status?: MemberStatus | null;
  readonly registrationStatus?: "NEEDS_UPDATE" | "PENDING" | "VERIFIED" | null;
  readonly faceStatus?: "APPROVED" | "NONE" | "PENDING" | "REJECTED" | null;
};

/** 公司默认的打卡安排和工时规则（2026-11-21 Q6）：只在新建项目时套用一次。 */
export type CompanyAttendanceDefaultValues = {
  readonly name: string;
  readonly points: readonly import("@construction/domain").ScheduledAttendancePoint[];
  readonly workdays: readonly number[];
  readonly worktime: import("@construction/domain").WorktimeRule;
};
export type CompanyAttendanceDefaults = {
  readonly companyId: string;
  readonly current:
    | (CompanyAttendanceDefaultValues & {
        readonly createdAt: string;
        readonly createdByName: string | null;
        readonly version: number;
      })
    | null;
  readonly fallback: CompanyAttendanceDefaultValues;
  readonly latestVersion: number;
};
/** 公司资料：公司管理员只能改联系人、电话、地址（Q12）。 */
export type CompanyProfile = {
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
