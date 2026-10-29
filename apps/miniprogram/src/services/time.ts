const pad = (value: number): string => String(value).padStart(2, "0");
const chinaDate = (date: Date): Date =>
  new Date(date.getTime() + 8 * 60 * 60 * 1000);
const dateText = (date: Date): string =>
  `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

export const formatChinaHm = (isoUtc: string): string => {
  const date = chinaDate(new Date(isoUtc));
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
};
export const formatChinaDate = (isoUtc: string): string => dateText(chinaDate(new Date(isoUtc)));
export const chinaToday = (): string => dateText(chinaDate(new Date()));
export const chinaMonth = (): string => chinaToday().slice(0, 7);
export const chinaDaysAgo = (days: number): string => {
  const date = chinaDate(new Date());
  date.setUTCDate(date.getUTCDate() - days);
  return dateText(date);
};
export const mondayForDate = (value: string): string => {
  const date = new Date(`${value}T00:00:00Z`);
  const weekday = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - (weekday === 0 ? 6 : weekday - 1));
  return dateText(date);
};
export const chinaMonday = (): string => mondayForDate(chinaToday());
export const chinaDateLabel = (): string => {
  const date = chinaDate(new Date());
  return `${date.getUTCMonth() + 1}月${date.getUTCDate()}日 · 星期${"日一二三四五六"[date.getUTCDay()]}`;
};
