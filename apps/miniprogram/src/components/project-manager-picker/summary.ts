import type { ProjectManagerCandidate } from "../../services/management.types";

/** 最多能选多少名项目管理员。 */
export const MANAGER_LIMIT = 20;

/** 表单行里的一句话：选了谁。没选时是空的，由表单行显示占位字。 */
export const managerSummary = (
  managers: readonly Pick<ProjectManagerCandidate, "name">[],
): string =>
  managers.length === 0
    ? ""
    : managers.length === 1
      ? managers[0].name
      : `${managers[0].name} 等 ${managers.length} 人`;

/** 人选那一行的副行：手机号，绑没绑微信。 */
export const managerSub = (
  person: Pick<ProjectManagerCandidate, "phone" | "isBound">,
): string =>
  `${person.phone}，${person.isBound ? "已绑定微信" : "还没绑定微信"}`;
