import { Notice } from "./ui/index";
import { readWorkEntry, type WorkEntry } from "../services/work-entry";

/** 入场时提醒一句登录时选的用工方式；从“我是管理人员”进来的没选过，就不显示。 */
export const WorkEntryNotice = (): JSX.Element | null => {
  const entry: WorkEntry | null = readWorkEntry();
  if (entry === null) return null;
  return (
    <Notice>
      {entry === "TEMPORARY" ? "你选的是临时用工。" : "你选的是长期用工。"}
      选错了就退出登录重选。
    </Notice>
  );
};
