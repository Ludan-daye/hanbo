const pad = (n: number): string => String(n).padStart(2, "0");

export const formatChinaHm = (isoUtc: string): string => {
  const utcMs = new Date(isoUtc).getTime();
  const china = new Date(utcMs + 8 * 60 * 60 * 1000);
  return `${pad(china.getUTCHours())}:${pad(china.getUTCMinutes())}`;
};
