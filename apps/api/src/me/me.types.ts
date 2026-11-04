export type MyProjectMembership = {
  readonly taskAttendanceOnly?: boolean;
  readonly projectId: string;
  readonly projectName: string;
  readonly projectRoleLabel: string;
  readonly teamId: string | null;
  readonly teamName: string | null;
};
