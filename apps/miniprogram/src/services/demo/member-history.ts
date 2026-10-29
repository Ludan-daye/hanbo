import type {
  ManagedParticipant,
  ProjectParticipant,
} from "../management.types";
import { formatChinaDate } from "../time";
import type { DemoState } from "./state";

export type DemoMemberHistory = {
  readonly recordedAt: string;
  readonly person: ManagedParticipant;
};
export const demoMemberOn = (
  state: DemoState,
  person: ProjectParticipant,
  date: string,
): ManagedParticipant => {
  const current = state.people.find((row) => row.memberId === person.memberId);
  if (!current) throw new Error("找不到成员历史对应的档案。");
  const versions = (state.memberHistories ?? [])
    .filter((row) => row.person.memberId === person.memberId)
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  return (
    versions.find((row) => formatChinaDate(row.recordedAt) <= date)?.person ??
    versions[versions.length - 1]?.person ??
    current
  );
};
export const demoMemberEligible = (
  person: ManagedParticipant,
  date: string,
): boolean =>
  person.requiresAttendance &&
  person.status !== "SUSPENDED" &&
  date >= formatChinaDate(person.enteredAt) &&
  (person.exitedAt === null
    ? person.status === "ACTIVE"
    : date <= formatChinaDate(person.exitedAt));
