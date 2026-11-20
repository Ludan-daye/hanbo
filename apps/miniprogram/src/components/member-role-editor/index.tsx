import { View } from "@tarojs/components";

import { Button } from "../ui";
import type {
  MemberRoleAssignment,
  ProjectTeam,
} from "../../services/management.types";

import { ChipsRow, SelectRow } from "./form-rows";
import {
  roleChoicesFor,
  selectedRoleCodes,
  toggleMemberRole,
} from "./person-text";

import "./index.scss";

type Props = {
  readonly value: readonly MemberRoleAssignment[];
  readonly teams: readonly ProjectTeam[];
  readonly disabled: boolean;
  /** 提交时没通过检查：把没选身份、没选班组的行标出来。 */
  readonly invalid?: boolean;
  /** 当前用户不能授予或去掉的身份：没有就不出现，已有就锁住。 */
  readonly locked?: readonly MemberRoleAssignment["roleCode"][];
  readonly onChange: (roles: readonly MemberRoleAssignment[]) => void;
};

/** 一个人最多管几个班组。 */
const MAX_LED_TEAMS = 19;

/**
 * 本项目身份：一行里点选，可以选几个；选了班组长才出现“管哪个班组”。
 * 兼任共用一份档案，考勤和评分不重复统计。
 * 这里只出表单行，要放在 Sheet 里。
 */
export const MemberRoleEditor = ({
  value,
  teams,
  disabled,
  invalid,
  locked = [],
  onChange,
}: Props): JSX.Element => {
  const ledCount = value.filter(
    (role) => role.roleCode === "TEAM_LEADER",
  ).length;
  const canLeadMore =
    ledCount > 0 && ledCount < Math.min(teams.length, MAX_LED_TEAMS);
  return (
    <>
      <ChipsRow
        label="身份"
        required
        error={invalid === true && value.length === 0}
        options={roleChoicesFor(value, locked)}
        selected={selectedRoleCodes(value)}
        onToggle={(roleCode) => {
          if (!disabled && !locked.includes(roleCode))
            onChange(toggleMemberRole(value, roleCode));
        }}
      />
      {value.map((role, index) =>
        role.roleCode === "TEAM_LEADER" ? (
          <SelectRow
            key={index}
            label={
              value
                .slice(0, index)
                .some((earlier) => earlier.roleCode === "TEAM_LEADER")
                ? "还管哪个班组"
                : "管哪个班组"
            }
            required
            disabled={disabled}
            error={invalid === true && !role.teamId}
            options={["请选择管理班组", ...teams.map((team) => team.name)]}
            index={teams.findIndex((team) => team.id === role.teamId) + 1}
            value={teams.find((team) => team.id === role.teamId)?.name ?? ""}
            placeholder={
              teams.length === 0 ? "还没有班组，先去建一个" : "请选择"
            }
            onChange={(picked) =>
              onChange(
                value.map((item, position) =>
                  position === index
                    ? {
                        roleCode: "TEAM_LEADER",
                        teamId: teams[picked - 1]?.id ?? "",
                      }
                    : item,
                ),
              )
            }
          />
        ) : null,
      )}
      {canLeadMore || ledCount > 1 ? (
        <View className="member-roles__more">
          {ledCount > 1 ? (
            <Button
              variant="text"
              disabled={disabled}
              onClick={() => {
                const last = value
                  .map((role) => role.roleCode)
                  .lastIndexOf("TEAM_LEADER");
                onChange(value.filter((_role, index) => index !== last));
              }}
            >
              少管一个班组
            </Button>
          ) : null}
          {canLeadMore ? (
            <Button
              variant="text"
              disabled={disabled}
              onClick={() =>
                onChange([...value, { roleCode: "TEAM_LEADER", teamId: "" }])
              }
            >
              再管一个班组
            </Button>
          ) : null}
        </View>
      ) : null}
    </>
  );
};
