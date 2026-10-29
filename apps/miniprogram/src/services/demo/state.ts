import type { DemoMemberHistory } from "./member-history";
import { defaultAttendancePoints } from "@construction/domain/attendance.js";
import type { DemoPlan } from "./plans";
import type { MeResponse, RoleCode } from "../auth.types";
import type { AccountProfile } from "../account";
import type { FaceProfile } from "../face";
import type {
  CompanyProject,
  ManagedProject,
  ManagedParticipant,
  DefaultAttendanceConfiguration,
  ProjectInvitation,
  ProjectParticipant,
  ProjectTeam,
  TeamLeaderReference,
} from "../management.types";
import type {
  AttendancePointCode,
  AttendanceRecord,
  Makeup,
} from "../me.types";
import { chinaDaysAgo, chinaToday } from "../time";
import type {
  Account,
  AuditEntry,
  Company,
  SystemSettings,
} from "../workflows";

export type DemoFace = FaceProfile & { readonly photo: string };
export type DemoInvitation = ProjectInvitation & { readonly code: string };
export type DemoTeam = ProjectTeam & {
  readonly workType?: string | null;
  readonly remark?: string | null;
  readonly updatedAt?: string;
  readonly leader?: TeamLeaderReference | null;
};
export type DemoState = {
  readonly memberHistories?: readonly DemoMemberHistory[];
  readonly plans?: readonly DemoPlan[];
  readonly version: 2;
  readonly companies: readonly Company[];
  readonly projects: readonly ManagedProject[];
  readonly teams: readonly DemoTeam[];
  readonly people: readonly ManagedParticipant[];
  readonly accounts: readonly Account[];
  readonly invitations: readonly DemoInvitation[];
  readonly configurations: Readonly<
    Record<string, DefaultAttendanceConfiguration>
  >;
  readonly records: readonly AttendanceRecord[];
  readonly makeups: readonly Makeup[];
  readonly faces: readonly DemoFace[];
  readonly settings: SystemSettings;
  readonly audit: readonly AuditEntry[];
  readonly boundProfileId: string | null;
  readonly accountProfiles?: Readonly<Record<string, AccountProfile>>;
};

export type LegacyDemoState = Omit<
  DemoState,
  "version" | "people" | "projects"
> & {
  readonly version: 1;
  readonly people: readonly (ProjectParticipant &
    Partial<ManagedParticipant>)[];
  readonly projects: readonly (CompanyProject & Partial<ManagedProject>)[];
};

/** Preserve saved demo identities while adding a new baseline for previously absent fields. */
export const upgradeDemoState = (
  state: LegacyDemoState,
  baseline: string,
): DemoState => ({
  ...state,
  version: 2,
  projects: state.projects.map(
    (project): ManagedProject => ({
      ...project,
      code: project.code ?? null,
      contactName: project.contactName ?? null,
      contactPhone: project.contactPhone ?? null,
      remark: project.remark ?? null,
      updatedAt: project.updatedAt ?? baseline,
    }),
  ),
  people: state.people.map(
    (person): ManagedParticipant => ({
      ...person,
      workType:
        person.workType ??
        (person.participantType === "WORKER"
          ? person.projectRoleLabel
          : "施工管理"),
      enteredAt: person.enteredAt ?? baseline,
      exitedAt:
        person.exitedAt ?? (person.status === "EXITED" ? baseline : null),
      updatedAt: person.updatedAt ?? baseline,
      profileUpdatedAt: person.profileUpdatedAt ?? baseline,
      nameStatus: person.nameStatus ?? "AVAILABLE",
    }),
  ),
});
export const upgradeDemoPlanning = (
  state: DemoState,
  startsOn: string,
): DemoState => ({
  ...state,
  plans: state.projects.map(
    (project): DemoPlan => ({
      id: `baseline-two-${project.id}`,
      projectId: project.id,
      scopeType: "PROJECT",
      scopeId: project.id,
      label: "默认安排",
      name: "每日两次",
      startsOn,
      endsOn: null,
      inherit: false,
      points: defaultAttendancePoints,
      workdays: [1, 2, 3, 4, 5, 6, 7],
      authorUserId: null,
      authorLevel: 6,
    }),
  ),
});
export const DEMO_POINT_CODES: readonly AttendancePointCode[] = [
  "SEGMENT_1_START",
  "SEGMENT_1_END",
  "SEGMENT_2_START",
  "SEGMENT_2_END",
];
export const demoId = (prefix: string): string =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
export const initialConfiguration = (): DefaultAttendanceConfiguration => ({
  shift: {
    id: "shift-standard",
    name: "标准两段班",
    segments: [
      {
        sequence: 1,
        startTime: "08:00",
        endTime: "12:00",
        lateGraceMins: 10,
        earlyGraceMins: 10,
      },
      {
        sequence: 2,
        startTime: "13:30",
        endTime: "17:30",
        lateGraceMins: 10,
        earlyGraceMins: 10,
      },
    ],
  },
  schedule: {
    shiftId: "shift-standard",
    startsOn: chinaDaysAgo(90),
    endsOn: null,
    workdays: [1, 2, 3, 4, 5, 6],
  },
});
export const makeDemoRecord = (
  person: ProjectParticipant,
  date: string,
  pointCode: AttendancePointCode,
  occurredAt: string,
): AttendanceRecord => ({
  id: demoId("record"),
  projectId: person.projectId,
  participantId: person.profileId,
  participantType: person.participantType,
  attendanceDate: date,
  pointCode,
  occurredAt,
  status: "VALID",
  facePassed: false,
  faceScore: null,
  abnormalReason: null,
  geofenceDistanceM: "0",
  locationAccuracyM: "10",
  latitude: "31.2304",
  longitude: "121.4737",
  selfieObjectKey: "demo/selfie",
  selfieHash: "demo-selfie",
  sitePhotoObjectKey: "demo/site",
  sitePhotoHash: "demo-site",
});
export const initialDemoState = (): DemoState => {
  const projects: readonly CompanyProject[] = [
    {
      id: "demo-project",
      companyId: "demo-company",
      name: "滨江花园 · 一期工程",
      address: "上海市黄浦区滨江路 168 号",
      status: "ACTIVE",
      centerLatitude: "31.2304",
      centerLongitude: "121.4737",
      geofenceRadiusM: 300,
      plannedStartDate: chinaDaysAgo(90),
      plannedEndDate: null,
    },
    {
      id: "demo-project-2",
      companyId: "demo-company",
      name: "城市更新 · 配套中心",
      address: "上海市浦东新区建设路 66 号",
      status: "PREPARING",
      centerLatitude: "31.2244",
      centerLongitude: "121.5447",
      geofenceRadiusM: 200,
      plannedStartDate: chinaToday(),
      plannedEndDate: null,
    },
  ];
  const people: readonly ProjectParticipant[] = [
    {
      memberId: "member-worker",
      profileId: "profile-worker",
      projectId: "demo-project",
      displayName: "张建国（演示）",
      phone: "13800000001",
      participantType: "WORKER",
      projectRoleLabel: "钢筋工",
      teamId: "demo-team",
      teamName: "钢筋一班",
      requiresAttendance: true,
      status: "ACTIVE",
    },
    {
      memberId: "member-worker-2",
      profileId: "profile-worker-2",
      projectId: "demo-project",
      displayName: "李明（演示）",
      phone: "13800000002",
      participantType: "WORKER",
      projectRoleLabel: "木工",
      teamId: "demo-team-2",
      teamName: "木工一班",
      requiresAttendance: true,
      status: "ACTIVE",
    },
    {
      memberId: "member-team",
      profileId: "profile-team",
      projectId: "demo-project",
      displayName: "王师傅（演示）",
      phone: "13800000003",
      participantType: "MANAGER",
      projectRoleLabel: "TEAM_LEADER",
      teamId: "demo-team",
      teamName: "钢筋一班",
      requiresAttendance: true,
      status: "ACTIVE",
    },
    {
      memberId: "member-project",
      profileId: "profile-project",
      projectId: "demo-project",
      displayName: "陈工（演示）",
      phone: "13800000004",
      participantType: "MANAGER",
      projectRoleLabel: "PROJECT_ADMIN",
      teamId: null,
      teamName: null,
      requiresAttendance: true,
      status: "ACTIVE",
    },
    {
      memberId: "member-unbound",
      profileId: "profile-unbound",
      projectId: "demo-project",
      displayName: "待入场成员（演示）",
      phone: "13800000006",
      participantType: "WORKER",
      projectRoleLabel: "普工",
      teamId: "demo-team",
      teamName: "钢筋一班",
      requiresAttendance: true,
      status: "ACTIVE",
    },
  ];
  const records: readonly AttendanceRecord[] = people
    .filter((p) => p.memberId !== "member-unbound")
    .flatMap((person) =>
      [0, 1, 2, 3, 4, 5, 6].flatMap((days) =>
        DEMO_POINT_CODES.filter(
          (_point, index) =>
            (days !== 0 || index === 0) &&
            !(days === 1 && person.memberId === "member-worker" && index === 0),
        ).map((point) =>
          makeDemoRecord(
            person,
            chinaDaysAgo(days),
            point,
            `${chinaDaysAgo(days)}T${["08:00", "12:00", "13:30", "17:30"][DEMO_POINT_CODES.indexOf(point)]}:00+08:00`,
          ),
        ),
      ),
    );
  return {
    version: 2,
    companies: [
      { id: "demo-company", name: "瀚渤建设（演示）", status: "ACTIVE" },
    ],
    projects: projects.map(
      (project): ManagedProject => ({
        ...project,
        code: null,
        contactName: null,
        contactPhone: null,
        remark: null,
        updatedAt: new Date().toISOString(),
      }),
    ),
    people: people.map(
      (person): ManagedParticipant => ({
        ...person,
        workType:
          person.participantType === "WORKER"
            ? person.projectRoleLabel
            : "施工管理",
        enteredAt: new Date(`${chinaDaysAgo(90)}T00:00:00+08:00`).toISOString(),
        exitedAt: null,
        updatedAt: new Date().toISOString(),
        profileUpdatedAt: new Date().toISOString(),
        nameStatus: "AVAILABLE",
      }),
    ),
    records,
    teams: [
      {
        id: "demo-team",
        projectId: "demo-project",
        name: "钢筋一班",
        status: "ACTIVE",
      },
      {
        id: "demo-team-2",
        projectId: "demo-project",
        name: "木工一班",
        status: "ACTIVE",
      },
    ],
    accounts: [
      {
        id: "dev-system",
        name: "平台管理员",
        phone: "13800000000",
        roleCode: "SYSTEM_ADMIN",
        scopeId: "GLOBAL",
        status: "ACTIVE",
      },
      {
        id: "dev-company",
        name: "公司管理员",
        phone: "13800000005",
        roleCode: "COMPANY_ADMIN",
        scopeId: "demo-company",
        status: "ACTIVE",
      },
      {
        id: "dev-project",
        name: "陈工",
        phone: "13800000004",
        roleCode: "PROJECT_ADMIN",
        scopeId: "demo-project",
        status: "ACTIVE",
      },
      {
        id: "dev-team",
        name: "王师傅",
        phone: "13800000003",
        roleCode: "TEAM_LEADER",
        scopeId: "demo-team",
        status: "ACTIVE",
      },
      {
        id: "dev-worker",
        name: "张建国",
        phone: "13800000001",
        roleCode: "WORKER",
        scopeId: "demo-project",
        status: "ACTIVE",
      },
    ],
    configurations: { "demo-project": initialConfiguration() },
    plans: [
      {
        id: "demo-baseline-two",
        projectId: "demo-project",
        scopeType: "PROJECT",
        scopeId: "demo-project",
        label: "默认安排",
        name: "每日两次",
        startsOn: chinaToday(),
        endsOn: null,
        inherit: false,
        points: defaultAttendancePoints,
        workdays: [1, 2, 3, 4, 5, 6, 7],
        authorUserId: null,
        authorLevel: 6,
      },
    ],
    invitations: [
      {
        id: "invite-initial",
        code: "HANBO-DEMO",
        projectId: "demo-project",
        profileId: "profile-unbound",
        targetType: "WORKER",
        status: "PENDING",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
        acceptedByUserId: null,
      },
    ],
    makeups: [
      {
        id: "makeup-initial",
        projectId: "demo-project",
        participantId: "profile-worker",
        participantType: "WORKER",
        attendanceDate: chinaDaysAgo(1),
        pointCode: "SEGMENT_1_START",
        requestedOccurredAt: `${chinaDaysAgo(1)}T08:00:00+08:00`,
        reason: "入场时手机没电，申请补录上午上班。",
        requesterUserId: "dev-worker",
        status: "PENDING",
        approvalReason: null,
        approvedAt: null,
        approverUserId: null,
      },
    ],
    faces: [],
    settings: {
      supportPhone: "400-000-0000",
      announcement: "安全第一，进入施工现场请佩戴安全帽。",
    },
    audit: [],
    boundProfileId: null,
  };
};
export const demoMe = (state: DemoState, userId: string): MeResponse => {
  const account: Account | undefined = state.accounts.find(
    (row) => row.id === userId,
  );
  if (account?.status === "SUSPENDED")
    throw new Error("该演示账号已停用，请由系统管理员恢复。");
  const profileId: string | null =
    userId === "dev-unbound"
      ? state.boundProfileId
      : ((
          {
            "dev-worker": "profile-worker",
            "dev-team": "profile-team",
            "dev-project": "profile-project",
          } as Readonly<Record<string, string>>
        )[userId] ?? null);
  const boundPerson: ProjectParticipant | undefined = state.people.find(
    (p) => p.profileId === profileId,
  );
  const boundRole: RoleCode | null =
    !boundPerson || boundPerson.status !== "ACTIVE"
      ? null
      : boundPerson.participantType === "WORKER"
        ? boundPerson.projectRoleLabel === "TEAM_LEADER"
          ? "TEAM_LEADER"
          : "WORKER"
        : boundPerson.projectRoleLabel === "TEAM_LEADER"
          ? "TEAM_LEADER"
          : "PROJECT_ADMIN";
  const roleCode: RoleCode | null =
    boundPerson === undefined ? (account?.roleCode ?? null) : boundRole;
  const scopeType: string =
    roleCode === "SYSTEM_ADMIN"
      ? "GLOBAL"
      : roleCode === "COMPANY_ADMIN"
        ? "COMPANY"
        : roleCode === "TEAM_LEADER"
          ? "TEAM"
          : "PROJECT";
  return {
    user: {
      id: userId,
      isBound: userId !== "dev-unbound" || profileId !== null,
      status: "ACTIVE",
    },
    profile: { id: profileId, type: boundPerson?.participantType ?? null },
    roles: {
      highestRoleCode: roleCode,
      assignments:
        roleCode === null
          ? []
          : [
              {
                roleCode,
                scope: {
                  scopeType,
                  scopeId:
                    (boundPerson === undefined ? account?.scopeId : null) ??
                    (roleCode === "TEAM_LEADER"
                      ? boundPerson?.teamId
                      : boundPerson?.projectId) ??
                    "demo-project",
                },
              },
            ],
    },
  };
};
