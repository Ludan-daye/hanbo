import Taro from "@tarojs/taro";

import { FRONTEND_DEMO } from "../config/env";

export type WorkEntry = "LONG_TERM" | "TEMPORARY";

export type WorkEntryOption = {
  readonly value: WorkEntry;
  readonly label: string;
  readonly description: string;
};

export const WORK_ENTRY_OPTIONS: readonly WorkEntryOption[] = [
  {
    value: "LONG_TERM",
    label: "长期用工",
    description: "长期参与项目，按班组安排工作",
  },
  {
    value: "TEMPORARY",
    label: "临时用工",
    description: "短期进场，参与临时或零星工作",
  },
];

const WORK_ENTRY_KEY: string = FRONTEND_DEMO
  ? "demoOnboardingWorkEntry"
  : "onboardingWorkEntry";

// This choice guides onboarding only; project assignments remain server-owned.
export const readWorkEntry = (): WorkEntry | null => {
  const value: unknown = Taro.getStorageSync(WORK_ENTRY_KEY);
  if (value === "" || value === undefined || value === null) return null;
  if (value === "LONG_TERM" || value === "TEMPORARY") return value;
  throw new Error("用工入口记录无效，请退出登录后重新选择入口。");
};

export const saveWorkEntry = (entry: WorkEntry): void => {
  Taro.setStorageSync(WORK_ENTRY_KEY, entry);
};

export const clearWorkEntry = (): void => {
  Taro.removeStorageSync(WORK_ENTRY_KEY);
};
