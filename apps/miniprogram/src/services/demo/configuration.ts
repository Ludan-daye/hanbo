import type {
  DefaultAttendanceConfiguration,
  ProjectParticipant,
} from "../management.types";
import type { DemoState } from "./state";

/** Explicit business precedence: a dated member schedule overrides a team schedule and the project default. */
export const effectiveDemoConfiguration = (
  state: DemoState,
  person: ProjectParticipant,
  date: string,
): DefaultAttendanceConfiguration => {
  const keys = [
    `${person.projectId}/members/${person.memberId}`,
    `${person.projectId}/teams/${person.teamId}`,
    person.projectId,
  ];
  for (const key of keys) {
    const configuration = state.configurations[key];
    const schedule = configuration?.schedule;
    if (
      configuration?.shift &&
      schedule &&
      schedule.startsOn <= date &&
      (schedule.endsOn === null || date <= schedule.endsOn)
    )
      return configuration;
  }
  return { shift: null, schedule: null };
};
