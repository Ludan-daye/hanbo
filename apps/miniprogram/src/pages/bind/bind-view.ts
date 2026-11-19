import { displayProjectRole } from "../../routing/features";
import { permissionLevel } from "../../routing/permissionLevels";
import type { RoleCode } from "../../services/auth.types";

const LEVEL_NAMES = "一二三四五";

/** 权限那一行的写法：“一级 普通工人”。级别和名称之间用空格，不用间隔号。 */
export const roleLabel = (roleCode: RoleCode): string =>
  `${LEVEL_NAMES[permissionLevel(roleCode).level - 1]}级 ${displayProjectRole(roleCode)}`;

/** 绑到的是哪一种档案。刚绑好、还没重新读身份时不知道是哪种，只说关联上了。 */
export const archiveLabel = (type: "WORKER" | "MANAGER" | null): string =>
  type === "MANAGER"
    ? "管理人员档案"
    : type === "WORKER"
      ? "工人档案"
      : "已关联";

/**
 * 绑好之后底部按钮上的字，要和点了之后去的地方一致：
 * 工人去用工登记（登记过的是去查看），其余的回首页。
 */
export const nextStepLabel = (input: {
  /** 点了之后是不是直接进首页（不是工人档案）。 */
  readonly goesHome: boolean;
  /** 是从别的页面点进来的，不是入场流程里的这一步。 */
  readonly entered: boolean;
  readonly registrationComplete: boolean;
}): string => {
  if (input.goesHome) return input.entered ? "回首页" : "进入首页";
  return input.registrationComplete ? "查看用工登记" : "继续填用工登记";
};
