export type MyProjectMembership = {
  readonly projectId: string;
  readonly projectName: string;
  readonly projectRoleLabel: string;
  readonly teamId: string | null;
  readonly teamName: string | null;
};
