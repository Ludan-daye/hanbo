import type { StatusKind } from "../../components/ui/status-kind";
import type { FaceProfile } from "../../services/face";

export type ReviewTab = "PENDING" | "DONE";

/** 底照状态的短说法，配上状态的形状。 */
export const faceReviewStatus = (
  status: string,
): { readonly kind: StatusKind; readonly text: string } =>
  status === "PENDING"
    ? { kind: "warn", text: "待审核" }
    : status === "APPROVED"
      ? { kind: "ok", text: "已通过" }
      : status === "REJECTED"
        ? { kind: "bad", text: "未通过" }
        : {
            kind: "idle",
            text: status === "REPLACED" ? "已重新提交" : "已失效",
          };

/** 这个标签下的底照：等着审核的，或已经有结果的。 */
export const facesForTab = (
  profiles: ReadonlyArray<FaceProfile>,
  tab: ReviewTab,
): ReadonlyArray<FaceProfile> =>
  profiles.filter(
    (profile) => (profile.status === "PENDING") === (tab === "PENDING"),
  );

/**
 * 现在展开哪一条。点开的那条还在列表里，就是它；
 * 待审核里总要有一条是展开的，所以没点开过（或点开的那条已经审完）时展开最前面那条；
 * 已审核里不点就都收着。
 */
export const shownFaceId = (
  list: ReadonlyArray<{ readonly id: string }>,
  openId: string | null,
  tab: ReviewTab,
): string | null =>
  openId !== null && list.some((item) => item.id === openId)
    ? openId
    : tab === "PENDING"
      ? (list[0]?.id ?? null)
      : null;

/**
 * 一次只展开一条：把列表分成展开那条之前的、展开的那条、之后的。
 * 没有展开的（或要展开的已经不在列表里）时，全部算“之前的”。
 */
export const splitAtOpen = <T extends { readonly id: string }>(
  list: ReadonlyArray<T>,
  openId: string | null,
): {
  readonly before: ReadonlyArray<T>;
  readonly current: T | null;
  readonly after: ReadonlyArray<T>;
} => {
  const index =
    openId === null ? -1 : list.findIndex((item) => item.id === openId);
  return index < 0
    ? { before: list, current: null, after: [] }
    : {
        before: list.slice(0, index),
        current: list[index] ?? null,
        after: list.slice(index + 1),
      };
};
