import type {
  MemberRoleAssignment,
  ProjectParticipant,
} from "../../services/management.types";
import { memberRoleAssignments } from "../../services/member-roles";

type RoleCode = MemberRoleAssignment["roleCode"];

/** 本项目身份的三个选项，按职级从低到高。 */
export const ROLE_CHOICES: ReadonlyArray<{
  readonly value: RoleCode;
  readonly label: string;
}> = [
  { value: "WORKER", label: "工人" },
  { value: "TEAM_LEADER", label: "班组长" },
  { value: "PROJECT_ADMIN", label: "管理员" },
];

/** 头像里的那个字：姓名的第一个字；没有姓名时是问号。 */
export const personInitial = (name: string | null | undefined): string =>
  Array.from((name ?? "").trim())[0] ?? "？";

/** 把几段信息用逗号连起来，空的跳过。 */
export const joinText = (
  parts: ReadonlyArray<string | null | undefined | false>,
): string =>
  parts
    .filter(
      (part): part is string => typeof part === "string" && part.trim() !== "",
    )
    .join("，");

/** 手机号中间四位打码；不是 11 位数字的原样返回。 */
export const maskPhone = (phone: string): string =>
  /^\d{11}$/.test(phone) ? `${phone.slice(0, 3)}****${phone.slice(7)}` : phone;

/** “2026-11-18” 写成 “2026年11月18日”；认不出来的原样返回。 */
export const dateLabel = (value: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match
    ? `${match[1]}年${Number(match[2])}月${Number(match[3])}日`
    : value;
};

/**
 * 人员列表右侧写的身份：普通工人不写，班组长、管理员写出来，
 * 兼任的按职级从高到低用顿号连起来。岗位配置认不出来时也不写。
 */
export const personRoleText = (
  person: Pick<
    ProjectParticipant,
    "participantType" | "projectRoleLabel" | "teamId" | "additionalRoles"
  >,
): string => {
  let codes: ReadonlyArray<RoleCode>;
  try {
    codes = memberRoleAssignments(person).map((role) => role.roleCode);
  } catch {
    return "";
  }
  return ROLE_CHOICES.filter(
    (choice) => choice.value !== "WORKER" && codes.includes(choice.value),
  )
    .map((choice) => choice.label)
    .reverse()
    .join("、");
};

/** 现在选中了哪几种身份（一个人可以管几个班组，班组长只算一种）。 */
export const selectedRoleCodes = (
  roles: ReadonlyArray<MemberRoleAssignment>,
): ReadonlyArray<RoleCode> =>
  ROLE_CHOICES.filter((choice) =>
    roles.some((role) => role.roleCode === choice.value),
  ).map((choice) => choice.value);

/**
 * 点一下身份：没选的选上，选了的去掉。
 * 新选上的班组长还没有班组，要接着选；去掉班组长时，管的几个班组一起去掉。
 */
export const toggleMemberRole = (
  roles: ReadonlyArray<MemberRoleAssignment>,
  roleCode: RoleCode,
): ReadonlyArray<MemberRoleAssignment> =>
  roles.some((role) => role.roleCode === roleCode)
    ? roles.filter((role) => role.roleCode !== roleCode)
    : [...roles, { roleCode, teamId: roleCode === "TEAM_LEADER" ? "" : null }];

/**
 * 身份一行里给哪些选项：当前用户不能授予的身份（如项目管理员不能任命管理员）不出现；
 * 这个人已经有的话照样显示，但点了没用。
 */
export const roleChoicesFor = (
  roles: ReadonlyArray<MemberRoleAssignment>,
  locked: ReadonlyArray<RoleCode>,
): typeof ROLE_CHOICES =>
  ROLE_CHOICES.filter(
    (choice) =>
      !locked.includes(choice.value) ||
      roles.some((role) => role.roleCode === choice.value),
  );
