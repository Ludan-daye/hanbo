import type { ReportTotals } from "../../services/management.types";

export const totalsStatItems = (
  totals: ReportTotals,
): ReadonlyArray<{ label: string; value: string }> => [
  { label: "统计人数", value: String(totals.participantCount) },
  { label: "应排天数", value: String(totals.scheduledDays) },
  { label: "实出天数", value: String(totals.actualAttendedDays) },
  { label: "迟到", value: String(totals.lateCount) },
  { label: "早退", value: String(totals.earlyLeaveCount) },
  { label: "缺卡", value: String(totals.missingPunchCount) },
  { label: "缺勤", value: String(totals.absenceCount) },
  { label: "补卡通过", value: String(totals.approvedMakeupCount) },
  { label: "异常记录", value: String(totals.abnormalRecordCount) },
  { label: "工时", value: `${(totals.workedMinutes / 60).toFixed(1)}h` },
];
