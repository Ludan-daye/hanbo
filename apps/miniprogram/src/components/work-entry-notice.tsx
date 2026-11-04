import { Notice } from "./ui/index";
import { readWorkEntry, type WorkEntry } from "../services/work-entry";

export const WorkEntryNotice = (): JSX.Element | null => {
  const entry: WorkEntry | null = readWorkEntry();
  if (entry === null) return null;
  return (
    <Notice>
      {entry === "TEMPORARY" ? "临时用工入口" : "长期用工入口"}
    </Notice>
  );
};
