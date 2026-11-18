import { Image } from "@tarojs/components";

// 线条图标，和设计稿是同一套路径。小程序里图片不能跟随文字颜色，
// 所以按“图标 + 颜色”生成 SVG 数据地址，生成过的留在内存里。
const PATHS = {
  home: "M3.5 11.5 12 4l8.5 7.5M5.5 10v9.5h13V10",
  grid: "M4 4h6.5v6.5H4zM13.5 4H20v6.5h-6.5zM4 13.5h6.5V20H4zM13.5 13.5H20V20h-6.5z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20c1.2-3.6 4-5 7.5-5s6.3 1.4 7.5 5",
  users:
    "M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 19.5c1-3.2 3.4-4.5 6.5-4.5s5.5 1.3 6.5 4.5M16 4.8a3.5 3.5 0 0 1 0 6.4M18 15.3c1.8.6 3 2 3.5 4.2",
  shield:
    "M12 3.5 5 6v5.5c0 4.2 2.8 7.4 7 9 4.2-1.6 7-4.8 7-9V6zM9 12l2.2 2.2 3.8-4.2",
  doc: "M6.5 3.5h8l4 4v13h-12zM14.5 3.5v4h4M9.5 12.5h5M9.5 16h5",
  clock: "M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17zM12 7.5V12l3 2",
  check: "M5 4.5h14v15H5zM8.5 12l2.5 2.5 4.5-5",
  chart: "M4.5 19.5h15M7.5 16v-5M12 16V6.5M16.5 16V9",
  task: "M9 4.5h6v3H9zM9 6H5.5v14.5h13V6H15M9 13.5l2 2 4-4.5",
  building:
    "M5 20.5V4.5h9v16M14 9.5h5v11M3.5 20.5h17M8 8h3M8 11.5h3M8 15h3",
  camera:
    "M4 8h3l1.5-2.5h7L17 8h3v11H4zM12 16.5a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z",
  face: "M8 3.5H5.5a2 2 0 0 0-2 2V8M16 3.5h2.5a2 2 0 0 1 2 2V8M8 20.5H5.5a2 2 0 0 1-2-2V16M16 20.5h2.5a2 2 0 0 0 2-2V16M9 10v1.5M15 10v1.5M9.5 15c1.6 1.2 3.4 1.2 5 0",
  calendar: "M4 6.5h16v13H4zM4 10.5h16M8 4v4M16 4v4",
  pin: "M12 21s6.5-5.6 6.5-11a6.5 6.5 0 1 0-13 0c0 5.4 6.5 11 6.5 11zM12 12.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4z",
  key: "M14.5 9.5a4 4 0 1 0-3.7 4L4 20.5h3.5v-2.5H10v-2.5l2.3-2.3a4 4 0 0 0 2.2-3.7z",
  search: "M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5 20 20",
  plus: "M12 5v14M5 12h14",
} as const;

export type LineIconName = keyof typeof PATHS;

const COLORS = {
  ink: "#000000",
  soft: "#A3A8AE",
  muted: "#7A8087",
  white: "#FFFFFF",
} as const;

const cache = new Map<string, string>();

const source = (name: LineIconName, tone: keyof typeof COLORS): string => {
  const key = `${name}/${tone}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="${COLORS[tone]}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${PATHS[name]}"/></svg>`;
  const uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  cache.set(key, uri);
  return uri;
};

export const LineIcon = ({
  name,
  tone,
}: {
  readonly name: LineIconName;
  readonly tone?: keyof typeof COLORS;
}): JSX.Element => (
  <Image
    className="ui-icon"
    src={source(name, tone ?? "ink")}
    mode="scaleToFill"
  />
);
