import { auditCategoriesFor, type AuditCategory } from "@construction/domain";

import { formatChinaDate, formatChinaHm } from "../../services/time";
import type { AuditLogEntry, AuditLogNarrow, AuditLogScope } from "../../services/audit-log";

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

export type PickOption<T> = { readonly value: T | null; readonly label: string };

/** “类型”的选项：“公司”从公司的操作记录起才有，“平台”只在平台日志里有。 */
export const auditTypeOptions = (
  kind: AuditLogScope["kind"],
): readonly PickOption<AuditCategory>[] => [
  { value: null, label: "全部操作" },
  ...auditCategoriesFor(kind),
];

/** 一条下面那行灰字：时间，公司的写项目，平台的再写公司。 */
export const auditEntryMeta = (
  entry: Pick<AuditLogEntry, "createdAt" | "companyName" | "projectName">,
  kind: AuditLogScope["kind"],
  today: string,
): string =>
  [
    auditTimeLabel(entry.createdAt, today),
    kind === "PLATFORM" ? entry.companyName : null,
    kind === "PROJECT" ? null : entry.projectName,
  ]
    .filter((part): part is string => part !== null && part !== "")
    .join("，");

/**
 * 公司、操作人的选项：“全部”在最前；点记录选中的那个不在已读的名单里时补在后面，
 * 选择器才写得出名字。
 */
export const narrowOptions = (
  allLabel: string,
  rows: readonly { readonly id: string; readonly name: string }[],
  selected: { readonly id: string; readonly name: string } | null,
): readonly PickOption<string>[] => [
  { value: null, label: allLabel },
  ...rows.map((row) => ({ value: row.id, label: row.name })),
  ...(selected !== null && !rows.some((row) => row.id === selected.id)
    ? [{ value: selected.id, label: selected.name }]
    : []),
];

/** 点平台日志的一条：可以只看这个人的、只看这家公司的（已经在看的不再列）。 */
export const auditEntryNarrowing = (
  entry: Pick<AuditLogEntry, "actorUserId" | "actorName" | "companyId" | "companyName">,
  narrow: AuditLogNarrow,
): readonly {
  readonly label: string;
  readonly field: keyof AuditLogNarrow;
  readonly id: string;
  readonly name: string;
}[] => [
  ...(entry.actorUserId !== null && entry.actorUserId !== narrow.actorUserId
    ? [
        {
          field: "actorUserId" as const,
          id: entry.actorUserId,
          label: `只看 ${entry.actorName ?? "这个人"} 的操作`,
          name: entry.actorName ?? "这个人",
        },
      ]
    : []),
  ...(entry.companyId !== null && entry.companyId !== narrow.companyId
    ? [
        {
          field: "companyId" as const,
          id: entry.companyId,
          label: `只看“${entry.companyName ?? "这家公司"}”`,
          name: entry.companyName ?? "这家公司",
        },
      ]
    : []),
];
