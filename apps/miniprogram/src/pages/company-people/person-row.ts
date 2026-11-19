import {
  joinText,
  personInitial,
  personRoleText,
} from "../../components/member-role-editor/person-text";
import type { StatusKind } from "../../components/ui/status-kind";
import { displayProjectRole } from "../../routing/features";
import {
  permissionLevel,
  type PermissionCategory,
} from "../../routing/permissionLevels";
import type {
  CompanyParticipant,
  MemberRoleAssignment,
} from "../../services/management.types";
import {
  memberRoleAssignments,
  memberRoleLabels,
} from "../../services/member-roles";

export type PeopleFilter = "ALL" | PermissionCategory;

/**
 * 公司人员里的一行，和项目人员是一个样子，副行多写一个项目。
 * 一个人在几个项目就有几行，每行点进去是他在那个项目里的资料。
 */
export type PersonRow = {
  readonly title: string;
  readonly avatar: string;
  /** 工种，在哪个项目，哪个班组。项目排在班组前面：一行放不下时先保住项目。 */
  readonly sub: string;
  /** 不在场时的状态：已暂停、已退场。 */
  readonly status: { readonly kind: StatusKind; readonly text: string } | null;
  /** 在场时右侧的身份：班组长、管理员；普通工人没有。 */
  readonly tag: string | null;
};

export const personRow = (person: CompanyParticipant): PersonRow => {
  // 班组长、管理员的岗位就是身份，右侧已经写了，副行不再重复；其余的岗位是工种。
  const job =
    person.projectRoleLabel === "TEAM_LEADER" ||
    person.projectRoleLabel === "PROJECT_ADMIN"
      ? null
      : displayProjectRole(person.projectRoleLabel);
  return {
    title: person.displayName ?? "姓名待补录",
    avatar: personInitial(person.displayName),
    sub: joinText([
      // 没有姓名的人靠手机尾号分辨。
      person.displayName === null && `尾号 ${person.phone.slice(-4)}`,
      job,
      person.projectName,
      person.teamName,
    ]),
    status:
      person.status === "SUSPENDED"
        ? { kind: "warn", text: "已暂停" }
        : person.status === "EXITED"
          ? { kind: "idle", text: "已退场" }
          : null,
    tag: personRoleText(person) || null,
  };
};

// 岗位配置认不出来的人（数据有误）不让整页出错：只在“全部”里出现，按其余字段搜索。
const rolesOf = (
  person: CompanyParticipant,
): readonly MemberRoleAssignment[] => {
  try {
    return memberRoleAssignments(person);
  } catch {
    return [];
  }
};
const roleLabelsOf = (person: CompanyParticipant): string => {
  try {
    return memberRoleLabels(person);
  } catch {
    return "";
  }
};

/** 筛选和搜索：按工人、管理两类筛；搜姓名、手机号、班组、工种、身份和项目。 */
export const matchesPerson = (
  person: CompanyParticipant,
  filter: PeopleFilter,
  search: string,
): boolean =>
  (filter === "ALL" ||
    rolesOf(person).some(
      (role) => permissionLevel(role.roleCode).category === filter,
    )) &&
  `${person.displayName ?? ""} ${person.phone} ${person.teamName ?? ""} ${displayProjectRole(person.projectRoleLabel)} ${roleLabelsOf(person)} ${person.projectName}`.includes(
    search.trim(),
  );
