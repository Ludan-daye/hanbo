import { formatChinaDate, formatChinaHm } from "../../services/time";
import type { AuditLogScope } from "../../services/audit-log";

/**
 * 看哪一份操作记录：链接里带了项目就看这个项目；带了公司、或者本人是公司管理员
 * 而链接里没有项目，就看整个公司；都没有时看本人管理的项目。
 */
export const auditLogScope = (input: {
  readonly projectParam: string | undefined;
  readonly companyParam: string | undefined;
  readonly projectId: string | null;
  readonly companyId: string | null;
}): AuditLogScope | null => {
  if (input.projectParam && input.projectId !== null)
    return { kind: "PROJECT", id: input.projectId };
  if (input.companyId !== null) return { kind: "COMPANY", id: input.companyId };
  if (input.projectId !== null) return { kind: "PROJECT", id: input.projectId };
  return null;
};

/** 时间：今天只写几点，今年写月日，往年带年份。 */
export const auditTimeLabel = (iso: string, today: string): string => {
  const day = formatChinaDate(iso);
  const time = formatChinaHm(iso);
  if (day === today) return `今天 ${time}`;
  const [year, month, date] = day.split("-");
  return year === today.slice(0, 4)
    ? `${Number(month)}月${Number(date)}日 ${time}`
    : `${year}年${Number(month)}月${Number(date)}日 ${time}`;
};
