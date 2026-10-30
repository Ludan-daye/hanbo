import { Picker } from "@tarojs/components";
import { Button, ListItem, Section, Subtitle } from "../ui";
import type {
  MemberRoleAssignment,
  ProjectTeam,
} from "../../services/management.types";

type Props = {
  readonly value: readonly MemberRoleAssignment[];
  readonly teams: readonly ProjectTeam[];
  readonly disabled: boolean;
  readonly onChange: (roles: readonly MemberRoleAssignment[]) => void;
};

const options: readonly {
  readonly roleCode: MemberRoleAssignment["roleCode"];
  readonly name: string;
  readonly description: string;
}[] = [
  {
    roleCode: "WORKER",
    name: "一级 · 工人",
    description: "在本项目承担施工工作",
  },
  {
    roleCode: "TEAM_LEADER",
    name: "二级 · 班组长",
    description: "管理指定班组，可兼管多个班组",
  },
  {
    roleCode: "PROJECT_ADMIN",
    name: "三级 · 项目管理员",
    description: "管理本项目的人员、考勤和报表",
  },
];

export const MemberRoleEditor = ({
  value,
  teams,
  disabled,
  onChange,
}: Props): JSX.Element => (
  <Section
    title="本项目职级 · 可多选"
    sub="兼任不会新增人员档案；考勤与评分仍按一人统计。"
  >
    {options.map((option) => {
      const selected = value.some((role) => role.roleCode === option.roleCode);
      return (
        <ListItem
          key={option.roleCode}
          primary={option.name}
          secondary={option.description}
          chip={selected ? "✓ 已选择" : "选择"}
          onClick={() => {
            if (!disabled)
              onChange(
                selected
                  ? value.filter((role) => role.roleCode !== option.roleCode)
                  : [
                      ...value,
                      {
                        roleCode: option.roleCode,
                        teamId: option.roleCode === "TEAM_LEADER" ? "" : null,
                      },
                    ],
              );
          }}
        />
      );
    })}
    {value.map((role, index) =>
      role.roleCode === "TEAM_LEADER" ? (
        <Picker
          key={index}
          mode="selector"
          disabled={disabled}
          range={["请选择管理班组", ...teams.map((team) => team.name)]}
          value={teams.findIndex((team) => team.id === role.teamId) + 1}
          onChange={(event) =>
            onChange(
              value.map((item, position) =>
                position === index
                  ? {
                      roleCode: "TEAM_LEADER",
                      teamId: teams[Number(event.detail.value) - 1]?.id ?? "",
                    }
                  : item,
              ),
            )
          }
        >
          <ListItem
            primary="管理班组 *"
            secondary={
              teams.find((team) => team.id === role.teamId)?.name ??
              "请选择班组"
            }
            chip="选择"
          />
        </Picker>
      ) : null,
    )}
    {value.some((role) => role.roleCode === "TEAM_LEADER") ? (
      <>
        {teams.length === 0 ? (
          <Subtitle>请先在本项目建立班组，再分配班组长职级。</Subtitle>
        ) : null}
        <Button
          variant="outline"
          disabled={
            disabled ||
            value.filter((role) => role.roleCode === "TEAM_LEADER").length >=
              Math.min(teams.length, 19)
          }
          onClick={() =>
            onChange([...value, { roleCode: "TEAM_LEADER", teamId: "" }])
          }
        >
          兼管另一个班组
        </Button>
        {value.filter((role) => role.roleCode === "TEAM_LEADER").length > 1 ? (
          <Button
            variant="outline"
            disabled={disabled}
            onClick={() => {
              const last = value
                .map((role) => role.roleCode)
                .lastIndexOf("TEAM_LEADER");
              onChange(value.filter((_role, index) => index !== last));
            }}
          >
            移除最后一个管理班组
          </Button>
        ) : null}
      </>
    ) : null}
  </Section>
);
