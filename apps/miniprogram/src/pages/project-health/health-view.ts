import type { ProjectHealth } from "../../services/management.types";

// 各项目一览的几行字和链接，不碰界面，方便单测。

export type HealthLine = {
  readonly key: string;
  readonly title: string;
  readonly count: number;
  readonly url: string;
};

/** 一个项目下面的几行：有数的才列，数等于点进去的列表条数。 */
export const healthLines = (
  project: ProjectHealth["projects"][number],
  companyId: string,
): readonly HealthLine[] => {
  const p = `projectId=${encodeURIComponent(project.projectId)}`;
  const rows: readonly HealthLine[] = [
    { key: "violations", title: "违规待复核", count: project.violationPending, url: `/pages/safety-review/index?${p}` },
    { key: "appeals", title: "申诉待处理", count: project.appealPending, url: `/pages/safety-review/index?${p}&tab=APPEAL` },
    { key: "faces", title: "底照待审核", count: project.facePending, url: `/pages/face-review/index?${p}` },
    {
      key: "registrations",
      title: "资料待核实",
      count: project.registrationPending,
      url: `/pages/company-people/index?companyId=${encodeURIComponent(companyId)}&${p}&status=ACTIVE&registrationStatus=PENDING`,
    },
    { key: "credit", title: "信用低于 60 分", count: project.lowCredit, url: `/pages/safety-review/index?${p}` },
  ];
  return rows.filter((row) => row.count > 0);
};

/** 有积压的项目排前面，积压多的更靠前；完工的项目放最后。 */
export const healthOrder = (
  projects: ProjectHealth["projects"],
): ProjectHealth["projects"] => {
  const total = (row: ProjectHealth["projects"][number]): number =>
    row.violationPending + row.appealPending + row.facePending + row.registrationPending + row.lowCredit;
  return [...projects].sort(
    (a, b) =>
      Number(a.status === "COMPLETED") - Number(b.status === "COMPLETED") ||
      total(b) - total(a) ||
      a.name.localeCompare(b.name, "zh"),
  );
};
