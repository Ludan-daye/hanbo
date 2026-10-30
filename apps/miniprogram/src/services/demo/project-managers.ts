import { memberRoleAssignments } from "../member-roles";
import type { ProjectManagerCandidate } from "../management.types";
import { demoMe, type DemoState } from "./state";

export const demoProjectManagers = (
  state: DemoState,
  companyId: string,
): readonly ProjectManagerCandidate[] => {
  const companyManagers: readonly ProjectManagerCandidate[] = state.accounts
    .filter(
      (account) =>
        account.roleCode === "COMPANY_ADMIN" &&
        account.scopeId === companyId &&
        account.status === "ACTIVE",
    )
    .map((account) => ({
      profileId: `profile-${account.id}`,
      name: account.name,
      phone: account.phone,
      isBound: true,
    }));
  const members: readonly ProjectManagerCandidate[] = state.people
    .filter(
      (person) =>
        (person.participantType === "MANAGER" || memberRoleAssignments(person).some((role) => role.roleCode !== "WORKER")) &&
        person.status === "ACTIVE" &&
        state.projects.some(
          (project) =>
            project.id === person.projectId && project.companyId === companyId,
        ),
    )
    .filter(
      (person) =>
        !state.accounts.some(
          (account) =>
            account.status !== "ACTIVE" && account.phone === person.phone,
        ),
    )
    .map((person) => ({
      profileId: person.profileId,
      name: person.displayName!,
      phone: person.phone,
      isBound:
        state.accounts
          .filter((account) => account.status === "ACTIVE")
          .some(
            (account) =>
              demoMe(state, account.id).profile.id === person.profileId,
          ) || state.boundProfileId === person.profileId,
    }));
  return [...companyManagers, ...members].filter(
    (person, index, all) =>
      all.findIndex((row) => row.profileId === person.profileId) === index,
  );
};
