import {
  joinText,
  personInitial,
} from "../../components/member-role-editor/person-text";
import type { StatusKind } from "../../components/ui/status-kind";
import { displayProjectRole } from "../../routing/features";
import type { CompanyPeopleItem } from "../../services/management.types";

/**
 * 公司人员一人一行（2026-11-21 Q8）：副行写在哪几个项目，右侧写最要紧的一件资料问题：
 * 资料需更正、底照没通过、资料待核实、没填用工资料、底照没交或待审；都没问题就写身份。
 * 按某个资料或底照状态筛选时，右侧先写筛的那一项，免得筛“没交底照”却显示“资料待核实”。
 */
export const companyPersonLine = (
  item: CompanyPeopleItem,
  focus: {
    readonly registrationStatus?: CompanyPeopleItem["registrationStatus"];
    readonly faceStatus?: CompanyPeopleItem["faceStatus"] | null;
  } = {},
): {
  readonly title: string;
  readonly avatar: string;
  readonly sub: string;
  readonly status: { readonly kind: StatusKind; readonly text: string } | null;
  readonly tag: string | null;
} => {
  const active = item.projects.filter((row) => row.status !== "EXITED");
  const names = (active.length > 0 ? active : item.projects).map((row) => row.projectName);
  const roles = new Set(
    active
      .map((row) => row.roleLabel)
      .filter((label) => label === "PROJECT_ADMIN" || label === "TEAM_LEADER")
      .map(displayProjectRole),
  );
  type Status = { readonly kind: StatusKind; readonly text: string };
  const registration: Status | null =
    item.registrationStatus === "NEEDS_UPDATE"
      ? { kind: "bad", text: "资料需更正" }
      : item.registrationStatus === "PENDING"
        ? { kind: "warn", text: "资料待核实" }
        : item.registrationStatus === "NOT_SUBMITTED"
          ? { kind: "warn", text: "没填用工资料" }
          : null;
  const face: Status | null =
    item.faceStatus === "REJECTED"
      ? { kind: "bad", text: "底照未通过" }
      : item.faceStatus === "NONE"
        ? { kind: "warn", text: "没交底照" }
        : item.faceStatus === "PENDING"
          ? { kind: "warn", text: "底照待审" }
          : null;
  const ordered: readonly (Status | null)[] = [
    focus.faceStatus ? face : null,
    focus.registrationStatus ? registration : null,
    item.registrationStatus === "NEEDS_UPDATE" ? registration : null,
    item.faceStatus === "REJECTED" ? face : null,
    registration,
    face,
    active.length === 0 ? { kind: "idle", text: "已退场" } : null,
  ];
  return {
    title: item.displayName ?? "姓名待补录",
    avatar: personInitial(item.displayName),
    sub: joinText([
      item.displayName === null && `尾号 ${item.phone.slice(-4)}`,
      active.length === 0
        ? `已退场，原在 ${names.join("、")}`
        : active.length === 1
          ? names[0]
          : `在 ${active.length} 个项目：${names.join("、")}`,
    ]),
    status: ordered.find((row) => row !== null) ?? null,
    tag: roles.size === 0 ? null : [...roles].join("、"),
  };
};
