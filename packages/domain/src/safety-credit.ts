import type { WorktimeInterval } from "./worktime.js";

export type SafetySeverity = "GENERAL" | "SERIOUS" | "MAJOR";
export type SafetyViolationStatus =
  | "PENDING"
  | "CONFIRMED"
  | "REJECTED"
  | "REVOKED";
export type SafetyDecisionAction = "CONFIRM" | "REJECT" | "REVOKE";
export type SafetyCreditPolicyInput = {
  readonly startsOn: string;
  readonly generalPoints: number;
  readonly seriousPoints: number;
  readonly majorPoints: number;
  readonly recoveryWorkdays: number;
  readonly recoveryPoints: number;
};
export type SafetyCreditPolicyView = SafetyCreditPolicyInput & {
  readonly version: number;
  readonly createdAt: string;
};
export type SafetyCreditDecisionView = {
  readonly action: SafetyDecisionAction;
  readonly reason: string;
  readonly createdAt: string;
};
export type SafetyCreditAppealView = {
  readonly id: string;
  readonly reason: string;
  readonly status: "PENDING" | "ACCEPTED" | "REJECTED";
  readonly createdAt: string;
  readonly reviewedAt: string | null;
  readonly reviewReason: string | null;
};
export type SafetyViolationView = {
  readonly id: string;
  readonly workerId: string;
  readonly projectId: string;
  readonly teamId: string;
  readonly memberId: string;
  readonly category: string;
  readonly severity: SafetySeverity;
  readonly occurredAt: string;
  readonly description: string;
  readonly evidenceObjectKeys: readonly string[];
  readonly points: number;
  readonly policyVersion: number;
  readonly status: SafetyViolationStatus;
  readonly createdAt: string;
  readonly reviewedAt: string | null;
  readonly reviewReason: string | null;
  readonly decisions: readonly SafetyCreditDecisionView[];
  readonly appeals: readonly SafetyCreditAppealView[];
};
export type SafetyViolationInput = {
  readonly memberId: string;
  readonly category: string;
  readonly severity: SafetySeverity;
  readonly occurredAt: string;
  readonly description: string;
  readonly evidence: readonly {
    readonly objectKey: string;
    readonly hash: string;
  }[];
};
export type SafetyCreditSummary = {
  readonly workerId: string;
  readonly score: number;
  readonly confirmedViolationCount: number;
  readonly recoveryPoints: number;
  readonly recoveryWorkdays: number;
  readonly asOf: string;
};
export type SafetyCreditRank = SafetyCreditSummary & {
  readonly memberId: string;
  readonly name: string;
  readonly rank: number;
};
export type SafetyCreditBoard = {
  readonly workers: readonly SafetyCreditRank[];
  readonly violations: readonly SafetyViolationView[];
  readonly policies: readonly SafetyCreditPolicyView[];
};
export type MySafetyCredit = {
  readonly summary: SafetyCreditSummary;
  readonly violations: readonly SafetyViolationView[];
  readonly policies: readonly SafetyCreditPolicyView[];
};
export const safetyCreditDay = (date: Date): string =>
  new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 10);

export const safetyStatusAt = (
  decisions: readonly SafetyCreditDecisionView[],
  asOf: Date,
): SafetyViolationStatus => {
  const latest = [...decisions]
    .filter((row) => Date.parse(row.createdAt) <= asOf.getTime())
    .sort(
      (a, b) =>
        Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
        Number(a.action === "REVOKE") - Number(b.action === "REVOKE"),
    )
    .at(-1);
  if (latest === undefined) return "PENDING";
  return latest.action === "CONFIRM"
    ? "CONFIRMED"
    : latest.action === "REJECT"
      ? "REJECTED"
      : "REVOKED";
};

/** Replay effective incidents and actual worked dates; never mutate caller data. */
export const calculateSafetyCredit = (
  workerId: string,
  violations: readonly SafetyViolationView[],
  workedDates: readonly string[],
  policies: readonly SafetyCreditPolicyView[],
  asOf: Date,
  snapshotAt: Date,
): SafetyCreditSummary => {
  const end: string = safetyCreditDay(asOf);
  const applicable = [...policies]
    .filter((row) => Date.parse(row.createdAt) <= snapshotAt.getTime())
    .sort(
      (a, b) => a.startsOn.localeCompare(b.startsOn) || a.version - b.version,
    );
  const effective = violations.filter(
    (row) =>
      row.workerId === workerId &&
      Date.parse(row.createdAt) <= snapshotAt.getTime() &&
      Date.parse(row.occurredAt) <= asOf.getTime() &&
      safetyStatusAt(row.decisions, snapshotAt) === "CONFIRMED",
  );
  const days: readonly string[] = [
    ...new Set([
      ...workedDates,
      ...effective.map((row) => safetyCreditDay(new Date(row.occurredAt))),
    ]),
  ]
    .filter((day) => day <= end)
    .sort();
  const worked = new Set(workedDates);
  const result = days.reduce<{
    score: number;
    recoveryPoints: number;
    streak: number;
  }>(
    (previous, day) => {
      const incidents = effective
        .filter((row) => safetyCreditDay(new Date(row.occurredAt)) === day)
        .sort(
          (a, b) =>
            a.occurredAt.localeCompare(b.occurredAt) ||
            a.id.localeCompare(b.id),
        );
      if (incidents.length > 0)
        return {
          ...previous,
          score: incidents.reduce(
            (score, row) => Math.max(0, score - row.points),
            previous.score,
          ),
          streak: 0,
        };
      const policy = applicable.filter((row) => row.startsOn <= day).at(-1);
      if (!worked.has(day) || policy === undefined || previous.score === 100)
        return previous;
      const streak: number = previous.streak + 1;
      if (streak < policy.recoveryWorkdays) return { ...previous, streak };
      const gain: number = Math.min(
        100 - previous.score,
        policy.recoveryPoints,
      );
      return {
        score: previous.score + gain,
        recoveryPoints: previous.recoveryPoints + gain,
        streak: 0,
      };
    },
    { score: 100, recoveryPoints: 0, streak: 0 },
  );
  return {
    workerId,
    score: result.score,
    confirmedViolationCount: effective.length,
    recoveryPoints: result.recoveryPoints,
    recoveryWorkdays: result.streak,
    asOf: asOf.toISOString(),
  };
};

/** Calendar dates with at least one actual completed minute; repeated projects count once. */
export const completedSafetyWorkDates = (
  intervals: readonly WorktimeInterval[],
  asOf: Date,
): readonly string[] =>
  [
    ...new Set(
      intervals.flatMap((interval) => {
        if (
          interval.end === null ||
          interval.end > asOf ||
          interval.end.getTime() - interval.start.getTime() < 60000
        )
          return [];
        const dates: string[] = [];
        for (
          let instant = Date.parse(
            `${safetyCreditDay(interval.start)}T00:00:00+08:00`,
          );
          instant < interval.end.getTime();
          instant += 86400000
        ) {
          if (
            Math.min(instant + 86400000, interval.end.getTime()) -
              Math.max(instant, interval.start.getTime()) >=
            60000
          )
            dates.push(safetyCreditDay(new Date(instant)));
        }
        return dates;
      }),
    ),
  ].sort();
