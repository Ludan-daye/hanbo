import type { TeamDailySummary } from "@construction/domain";
import { z } from "zod";

const count = z.number().int().nonnegative();
const snapshot: z.ZodType<TeamDailySummary> = z.object({
  teamId: z.string(),
  teamName: z.string(),
  projectName: z.string(),
  workDate: z.string(),
  generatedAt: z.string().datetime(),
  taskCount: count,
  completedTaskCount: count,
  cancelledTaskCount: count,
  temporaryWorkerCount: count,
  briefingCount: count,
  acknowledgementCount: count,
  openIssueCount: count,
  resolvedIssueCount: count,
  actualAttendedDays: z.number().nonnegative(),
  workedMinutes: count,
  missingPunchCount: count,
  tasks: z.array(
    z.object({
      id: z.string(),
      teamId: z.string(),
      teamName: z.string(),
      projectId: z.string(),
      projectName: z.string(),
      supervisorName: z.string(),
      title: z.string(),
      description: z.string(),
      workType: z.string(),
      startsAt: z.string(),
      endsAt: z.string(),
      status: z.enum(["OPEN", "COMPLETED", "CANCELLED"]),
      assignments: z.array(
        z.object({
          memberId: z.string(),
          name: z.string(),
          source: z.string(),
            taskAttendanceOnly: z.boolean().optional(),
            startedAt: z.string().nullable().optional(), finishedAt: z.string().nullable().optional(),
            workedMinutes: count.optional(), exitConfirmedAt: z.string().nullable().optional(),
        }),
      ),
    }),
  ),
  people: z.array(
    z.object({
      name: z.string(),
      workedMinutes: count,
      flags: z.array(z.string()),
    }),
  ),
});

export const readDailySnapshot = (
  value: unknown,
  teamId: string,
  day: string,
): TeamDailySummary => {
  const result = snapshot.safeParse(value);
  if (
    !result.success ||
    result.data.teamId !== teamId ||
    result.data.workDate !== day
  ) {
    throw new Error(
      JSON.stringify({
        message: "Invalid stored team daily snapshot",
        teamId,
        day,
        fields: result.success ? [] : result.error.issues,
      }),
    );
  }
  return result.data;
};
