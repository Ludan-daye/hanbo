/**
 * 可点元素展开这组属性，并带上 `ui-press` 类名：按下立刻有反馈，松开 120ms 回弹。
 * 样式在 styles/motion.scss。
 */
export const PRESS = {
  hoverClass: "is-pressed",
  hoverStartTime: 0,
  hoverStayTime: 120,
} as const;
