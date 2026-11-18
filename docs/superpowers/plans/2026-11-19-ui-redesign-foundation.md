# 界面重做第一期：地基、工人首页和打卡 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把“标牌”设计的颜色、字、动效、公共组件和速度层做进小程序，并用它重写工人首页和打卡页。

**Architecture:** 样式变量和公共组件集中在 `src/styles` 和 `src/components/ui`，旧组件保留原有接口只换样子，新组件并排新增；页面逐个改用新组件。读取走一层模块级缓存，写操作会让缓存失效，回到页面时只有数据可能变了才重读。打卡页保留现有的状态和请求逻辑，只把渲染层换成一屏一步的视图。

**Tech Stack:** Taro 4.2、React 18、TypeScript、Sass（`rpx`）、Vitest（node 环境，`@tarojs/taro` 用 `test/taro-mock.ts`）。

**Spec:** `docs/superpowers/specs/2026-11-19-ui-redesign-design.md`，设计稿 `docs/design/ui-redesign/index.html`。

**执行方式:** 由写计划的同一个会话逐个任务实现（任务之间靠接口咬合，设计也在同一个上下文里），全部做完后请一位没参与的审查者看整个分支。

## Global Constraints

- 工作目录：`.worktrees/ui-redesign`，分支 `ui-redesign`，从 `origin/main` 建。所有命令在这个目录里跑，用 Node 22：`corepack pnpm …`。
- 不新增接口、权限、数据库字段；不引入新依赖。
- 一屏只有一处橙色 `#FF6A13`，一个黑色实心按钮。
- 橙底上写黑字 `#000000`，不写白字。
- 新样式单位一律 `rpx`；设计稿尺寸乘 2.64 取整到偶数。不用阴影、不用渐变。
- 动效只动 `transform` 和 `opacity`；缓动 `cubic-bezier(.2,.8,.2,1)`；除骨架外没有循环动画；不为动画调用 `setData`。
- 数字字体子集不超过 15KB，以 base64 内嵌，不走网络。
- 文案：标题用名称，按钮用动作；不用间隔号串联信息；按钮文字后不加箭头；不显示英文常量。
- 相对导入不写扩展名（小程序包的现有写法）；注释和界面文案用中文，标识符用英文。
- 每个任务结束：`corepack pnpm --filter @construction/miniprogram exec tsc --noEmit` 和 `corepack pnpm --filter @construction/miniprogram exec vitest run` 通过，然后提交。
- 演示构建（`build:h5:demo`）和微信构建（`build:weapp`）都必须通过。

## Review Focus

1. 换账号登录后看到上一个人的缓存数据。缓存键必须带用户编号，退出登录必须清空。测试在任务 3。
2. 在子页面做了写操作，30 秒内返回上一页，上一页还显示旧数据。任何成功的写请求都要让“回到页面不重读”失效。测试在任务 3。
3. 打卡过程中拍照、人脸会让页面隐藏再显示，不能因此重读数据、回到第一步。测试在任务 3（判断函数）和任务 5（步骤判定函数）。
4. 主按钮被连点两次，只能发出一次请求。测试在任务 3。
5. 320 宽的小屏上，长项目名、长人名把右侧状态挤出屏幕或换行。任务 6 用演示版在 320 宽截图检查，行内文字单行省略。

---

### Task 1: 变量、数字字体、动效样式

**Files:**
- Modify: `apps/miniprogram/src/styles/tokens.scss`
- Create: `apps/miniprogram/src/styles/motion.scss`
- Create: `apps/miniprogram/src/styles/digits-font.scss`（脚本生成，提交进仓库）
- Create: `apps/miniprogram/scripts/build-digits-font.py`
- Create: `apps/miniprogram/src/assets/fonts/OFL.txt`
- Modify: `apps/miniprogram/src/app.scss`
- Test: `apps/miniprogram/test/digits-font.test.ts`

**Interfaces:**
- Produces（CSS 变量，全部挂在 `page, body, .taro_page` 上）：
  `--hi:#FF6A13` `--k:#000000` `--page:#EDEEF0` `--sheet:#FFFFFF` `--well:#F4F5F6` `--hair:#EEF0F1` `--muted:#7A8087` `--ph:#B4B9BE` `--warn:#FFD100` `--bad:#D7261E` `--good:#00843D` `--r-sign:48rpx` `--r-sheet:36rpx` `--r-btn:36rpx` `--r-chip:20rpx` `--gutter:36rpx` `--ease:cubic-bezier(.2,.8,.2,1)` `--num:"HanboDigits","DIN Alternate","Bahnschrift",-apple-system,sans-serif`
- Produces（旧变量名保留并指向新值，旧页面不改也能换色）：`--bg→--page` `--surface→--sheet` `--surface-sunk→--well` `--ink→#000` `--ink-soft→--muted` `--line→--hair` `--clay→#000` `--clay-pressed→#000` `--clay-tint→--well` `--primary→#000` `--primary-pressed→#23272B` `--steel→#3D4349` `--gold→--warn` `--success→--good` `--danger→--bad` `--radius-card→36rpx` `--radius-pill→36rpx`
- Produces（工具类）：`.num`（数字字体加等宽数字）；`.is-pressed`（按下：`opacity:.72`，`transform:scale(.985)`）；`.m-fade`（淡入 140ms）；`.m-step`（从右 24rpx 淡入 180ms）；`.m-stamp`（1.5 倍缩到原大并淡入 240ms）；`.sk`（骨架灰块，明暗 1.2s 循环）

- [ ] **Step 1: 建工作目录并确认基线**

```bash
git worktree add .worktrees/ui-redesign -b ui-redesign origin/main
cd .worktrees/ui-redesign
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @construction/domain build
corepack pnpm --filter @construction/miniprogram exec tsc --noEmit
corepack pnpm --filter @construction/miniprogram exec vitest run
```
Expected: 类型检查无输出；测试 28 个文件 237 项通过。

- [ ] **Step 2: 写字体测试**

```ts
// test/digits-font.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("digits font", () => {
  const css = readFileSync(new URL("../src/styles/digits-font.scss", import.meta.url), "utf8");
  it("declares the embedded digits face", () => {
    expect(css).toContain('font-family: "HanboDigits"');
    expect(css).toContain('format("truetype")');
  });
  it("stays under 15KB", () => {
    const payload = /base64,([A-Za-z0-9+/=]+)/.exec(css)?.[1] ?? "";
    expect(payload.length).toBeGreaterThan(1000);
    expect(Buffer.from(payload, "base64").byteLength).toBeLessThan(15 * 1024);
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `corepack pnpm --filter @construction/miniprogram exec vitest run test/digits-font.test.ts`
Expected: FAIL，找不到 `digits-font.scss`。

- [ ] **Step 4: 写 `scripts/build-digits-font.py <BarlowCondensed-Bold.ttf>` 并生成字体样式**

用 fontTools 的 `Subsetter` 只保留 `0123456789:./-%+−` 和空格（`−` 是 U+2212），去掉 hinting 和布局特性，输出 TTF 的 base64，写成：

```scss
@font-face {
  font-family: "HanboDigits";
  font-weight: 700;
  src: url("data:font/ttf;charset=utf-8;base64,…") format("truetype");
}
```

字体来源：`https://raw.githubusercontent.com/google/fonts/main/ofl/barlowcondensed/BarlowCondensed-Bold.ttf`，许可文件 `OFL.txt` 取自同一目录，放到 `src/assets/fonts/OFL.txt`。原始 TTF 不进仓库。

- [ ] **Step 5: 重写 `tokens.scss`，新建 `motion.scss`，在 `app.scss` 里引入三个样式文件**

`app.scss` 现有的 `prefers-reduced-motion` 段保留。页面默认字号改为 `36rpx`、行高 `1.45`。

- [ ] **Step 6: 跑测试、类型检查，提交**

```bash
git add apps/miniprogram/src/styles apps/miniprogram/src/app.scss apps/miniprogram/src/assets/fonts apps/miniprogram/scripts/build-digits-font.py apps/miniprogram/test/digits-font.test.ts
git commit -m "feat(miniprogram): 标牌设计的颜色变量、数字字体和动效样式"
```

---

### Task 2: 公共组件

**Files:**
- Create: `apps/miniprogram/src/components/ui/sign.tsx` `sheet.tsx` `status.tsx` `status-kind.ts` `stamp.tsx` `steps.tsx` `bottom-bar.tsx` `date-switch.tsx` `form.tsx` `skeleton.tsx` `press.ts` `kit.scss`
- Modify: `apps/miniprogram/src/components/ui/index.tsx`（导出新组件；`Button`、`Notice`、`StateView`、`Field` 换样子）
- Modify: `apps/miniprogram/src/components/ui/segmented.tsx` `bottom-nav.tsx` `page-header.tsx` `list-item.tsx` `stat-card.tsx` `ui.scss`
- Test: `apps/miniprogram/test/status-kind.test.ts`

**Interfaces:**
- Consumes: 任务 1 的变量和工具类。
- Produces:

```ts
// press.ts —— 所有可点元素展开这组属性
export const PRESS: { readonly hoverClass: "is-pressed"; readonly hoverStartTime: 0; readonly hoverStayTime: 120 };

// status-kind.ts
export type StatusKind = "ok" | "warn" | "bad" | "idle";
export const statusKindFor: (label: string) => StatusKind;

// status.tsx
export const Status: (p: { readonly kind?: StatusKind; readonly children: string }) => JSX.Element; // kind 缺省时按文案推断

// sign.tsx
export const Sign: (p: PropsWithChildren) => JSX.Element;                                   // 橙色标牌容器
export const SignTop: (p: { readonly left: string; readonly right?: string }) => JSX.Element;
export const SignCount: (p: { readonly value: string; readonly unit: string }) => JSX.Element;      // 大数字加单位
export const SignClock: (p: { readonly title: string; readonly note?: string; readonly time: string }) => JSX.Element;
export const SignText: (p: { readonly title: string; readonly sub?: string }) => JSX.Element;       // 一句结论加说明
export const SignAlert: (p: { readonly label: string; readonly value: string; readonly action?: string; readonly onClick?: () => void }) => JSX.Element; // 黑色例外条
export const SignButton: (p: { readonly children: string; readonly busy?: boolean; readonly disabled?: boolean; readonly onClick?: () => void }) => JSX.Element;
export const SignNote: (p: { readonly children: string }) => JSX.Element;
export const SignLine: (p: { readonly title: string; readonly sub?: string; readonly value?: string }) => JSX.Element; // 小标牌

// sheet.tsx
export const Sheet: (p: PropsWithChildren<{ readonly gap?: boolean }>) => JSX.Element;
export const Row: (p: PropsWithChildren<{
  readonly title: string; readonly sub?: string; readonly value?: string;
  readonly status?: { readonly kind?: StatusKind; readonly text: string };
  readonly chevron?: boolean; readonly hazard?: boolean; readonly avatar?: string; readonly icon?: IconName;
  readonly onClick?: () => void;
}>) => JSX.Element;                                                                          // children 放在右侧
export const SectionTitle: (p: { readonly children: string; readonly action?: string; readonly onAction?: () => void }) => JSX.Element;
export const Numbers: (p: { readonly items: ReadonlyArray<{ readonly value: string; readonly unit?: string; readonly label: string; readonly tone?: "bad"; readonly onClick?: () => void }> }) => JSX.Element;

// stamp.tsx
export const Stamp: (p: { readonly text: string; readonly sub?: string; readonly size?: "sm" | "lg"; readonly play?: boolean }) => JSX.Element; // play 为真时播放一次落章

// steps.tsx
export const Steps: (p: { readonly current: number; readonly total: number; readonly label: string }) => JSX.Element;

// bottom-bar.tsx —— 固定在底部，留出安全区；children 是次要操作
export const BottomBar: (p: PropsWithChildren<{ readonly primary?: string; readonly busy?: boolean; readonly disabled?: boolean; readonly onPrimary?: () => void }>) => JSX.Element;
export const BottomBarSpace: () => JSX.Element;                                              // 占位，防止内容被操作条挡住

// date-switch.tsx
export const DateSwitch: (p: { readonly label: string; readonly onPrev: () => void; readonly onNext: () => void; readonly onPick?: () => void }) => JSX.Element;

// form.tsx
export const FormRow: (p: PropsWithChildren<{ readonly label: string; readonly required?: boolean; readonly value?: string; readonly placeholder?: string; readonly chevron?: boolean; readonly error?: boolean; readonly onClick?: () => void }>) => JSX.Element;
export const FormError: (p: { readonly children: string }) => JSX.Element;

// skeleton.tsx
export const SkeletonSign: (p: { readonly tall?: boolean }) => JSX.Element;
export const SkeletonRows: (p: { readonly rows: number }) => JSX.Element;
```

- 旧组件接口不变：`Button`（`variant: "primary" | "outline" | "danger" | "text"`，`danger` 改为红框白底）、`Notice`、`StateView`、`Segmented`、`ListItem`、`StatCard`/`StatCards`、`BottomNav`、`PageHeader`、`AppHeader`、`Field`、`Section`。`appearance` 属性继续接受但不再产生两种样子。
- `AppHeader` 新增可选属性 `onSwitch?: () => void`：有它时标题后显示向下的小三角，整行可点。

- [ ] **Step 1: 写状态推断测试**

```ts
// test/status-kind.test.ts
import { describe, expect, it } from "vitest";
import { statusKindFor } from "../src/components/ui/status-kind";

describe("statusKindFor", () => {
  it("marks normal states ok", () => {
    for (const label of ["正常", "已通过", "已完成", "已加入", "已确认", "核验通过", "已打卡", "到岗", "在场", "进行中"])
      expect(statusKindFor(label)).toBe("ok");
  });
  it("marks things waiting for someone warn", () => {
    for (const label of ["待审批", "待审核", "待打卡", "待完成", "待整改", "待确认", "审核中", "已暂停", "筹备中"])
      expect(statusKindFor(label)).toBe("warn");
  });
  it("marks exceptions bad", () => {
    for (const label of ["缺卡", "迟到", "早退", "缺勤", "已驳回", "异常", "未通过", "已过期", "已作废", "严重", "重大"])
      expect(statusKindFor(label)).toBe("bad");
  });
  it("treats compound and unknown labels sensibly", () => {
    expect(statusKindFor("缺卡 / 迟到")).toBe("bad");
    expect(statusKindFor("07:52 已打卡")).toBe("ok");
    expect(statusKindFor("到点再打")).toBe("idle");
    expect(statusKindFor("已退场")).toBe("idle");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**（`status-kind` 模块不存在）

- [ ] **Step 3: 实现 `status-kind.ts`**

按“包含”匹配而不是全等：先查异常词，再查待处理词，再查正常词，都不中返回 `idle`。`list-item.tsx` 里现有的三个词表并入这里，`ListItem` 改用 `statusKindFor`。

- [ ] **Step 4: 实现新组件和 `kit.scss`**

尺寸取自设计稿（`docs/design/ui-redesign/src/lib.py` 的 CSS，数值乘 2.64）：标牌内边距 48、圆角 48；大数字 244、大时间 276，行高 0.88；内容条圆角 36、行高 126、带副行或头像 152；警戒条宽 20，`repeating-linear-gradient(-45deg,#000 0 14rpx,var(--warn) 14rpx 28rpx)`；主按钮高 148、圆角 36、字 52；底部操作条按钮高 132；红章小号 174、大号 312，旋转 −12 度。所有可点元素加 `{...PRESS}`。行内标题和副行 `white-space:nowrap;overflow:hidden;text-overflow:ellipsis`，右侧内容 `flex-shrink:0`。

- [ ] **Step 5: 旧组件换样子**

`ui.scss` 里对应规则改为新变量和新圆角；`Segmented` 的选中块改成绝对定位的白块，用 `transform: translateX(n*100%)` 移动，160ms；`BottomNav` 白底、选中黑色、其余 `#A3A8AE`；`PageHeader`/`AppHeader` 标题左对齐、字重 800、去掉底边线。删除 `worker.scss` 和 `worker-flow/index.scss` 里对 `.ui-btn`、`.ui-notice`、`.ui-state`、`.ui-listitem`、`.ui-segmented`、`.ui-statcard` 的二次覆盖。

- [ ] **Step 6: 跑测试、类型检查、两种构建，提交**

```bash
corepack pnpm --filter @construction/miniprogram exec vitest run
corepack pnpm --filter @construction/miniprogram exec tsc --noEmit
corepack pnpm --filter @construction/miniprogram build:h5:demo
git add apps/miniprogram/src/components apps/miniprogram/test/status-kind.test.ts
git commit -m "feat(miniprogram): 标牌设计的公共组件"
```

---

### Task 3: 速度层

**Files:**
- Create: `apps/miniprogram/src/services/read-cache.ts`
- Create: `apps/miniprogram/src/hooks/use-cached-read.ts`
- Create: `apps/miniprogram/src/hooks/use-action.ts`
- Modify: `apps/miniprogram/src/hooks/use-page-refresh.ts`
- Modify: `apps/miniprogram/src/services/apiClient.ts`、`apps/miniprogram/src/services/demo/client.ts`（写请求成功后调用 `noteWrite()`）
- Modify: `apps/miniprogram/src/store/session.tsx`（退出登录时 `clearReadCache()`）
- Test: `apps/miniprogram/test/read-cache.test.ts` `apps/miniprogram/test/page-refresh.test.ts` `apps/miniprogram/test/use-action.test.ts`

**Interfaces:**
- Produces:

```ts
// services/read-cache.ts
export const cachedRead: <T>(key: string, fetcher: () => Promise<T>) => Promise<T>; // 同一个 key 的并发请求合并成一次；成功后存结果和时间
export const peekRead: <T>(key: string) => T | undefined;                           // 上次成功的结果
export const readAge: (key: string, now?: number) => number | null;                 // 距上次成功多少毫秒
export const invalidateReads: (prefix?: string) => void;                            // 丢弃匹配前缀的缓存，不传则全部
export const clearReadCache: () => void;                                            // 退出登录用
export const noteWrite: () => void;                                                 // 任何写请求成功后调用
export const writeVersion: () => number;                                            // 写操作计数

// hooks/use-page-refresh.ts
export const shouldRefreshOnShow: (s: { readonly lastShownAt: number | null; readonly now: number; readonly writesAtLastShow: number; readonly writesNow: number; readonly minIntervalMs: number }) => boolean;
export const usePageRefresh: (options?: { readonly minShowIntervalMs?: number }) => { readonly revision: number; readonly refresh: () => void }; // 默认 30000

// hooks/use-cached-read.ts
export const useCachedRead: <T>(key: string | null, fetcher: () => Promise<T>, revision: number) =>
  { readonly data: T | null; readonly loading: boolean; readonly refreshing: boolean; readonly error: string | null };
// 有缓存：data 立刻是缓存值，refreshing 为真；没缓存：loading 为真。key 为 null 时不读。

// hooks/use-action.ts
export const createActionGuard: () => { readonly run: <T>(action: () => Promise<T>) => Promise<T | undefined>; readonly busy: () => boolean };
export const useAction: () => { readonly busy: boolean; readonly run: <T>(action: () => Promise<T>) => Promise<T | undefined> };
```

- 缓存键约定：`${userId}:${名称}:${参数}`，例如 `u1:my-projects`、`u1:today:${projectId}`。调用方负责带上用户编号。

- [ ] **Step 1: 写测试**

```ts
// test/read-cache.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cachedRead, clearReadCache, invalidateReads, noteWrite, peekRead, readAge, writeVersion } from "../src/services/read-cache";

beforeEach(() => clearReadCache());

describe("read cache", () => {
  it("stores the last successful result and its age", async () => {
    await cachedRead("u1:a", async () => 1);
    expect(peekRead<number>("u1:a")).toBe(1);
    expect(readAge("u1:a", Date.now() + 500)).toBeGreaterThanOrEqual(500);
  });
  it("merges concurrent reads of the same key", async () => {
    const fetcher = vi.fn(async () => 7);
    await Promise.all([cachedRead("u1:b", fetcher), cachedRead("u1:b", fetcher)]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("keeps the previous value when a refresh fails", async () => {
    await cachedRead("u1:c", async () => "old");
    await expect(cachedRead("u1:c", async () => { throw new Error("x"); })).rejects.toThrow("x");
    expect(peekRead("u1:c")).toBe("old");
  });
  it("drops by prefix and entirely", async () => {
    await cachedRead("u1:a", async () => 1);
    await cachedRead("u2:a", async () => 2);
    invalidateReads("u1:");
    expect(peekRead("u1:a")).toBeUndefined();
    expect(peekRead("u2:a")).toBe(2);
    clearReadCache();
    expect(peekRead("u2:a")).toBeUndefined();
  });
  it("counts writes", () => {
    const before = writeVersion();
    noteWrite();
    expect(writeVersion()).toBe(before + 1);
  });
});
```

```ts
// test/page-refresh.test.ts
import { describe, expect, it } from "vitest";
import { shouldRefreshOnShow } from "../src/hooks/use-page-refresh";

const base = { now: 100_000, writesAtLastShow: 3, writesNow: 3, minIntervalMs: 30_000 };
describe("shouldRefreshOnShow", () => {
  it("refreshes on first show", () => expect(shouldRefreshOnShow({ ...base, lastShownAt: null })).toBe(true));
  it("skips when shown again within the interval and nothing was written", () =>
    expect(shouldRefreshOnShow({ ...base, lastShownAt: 95_000 })).toBe(false));
  it("refreshes after the interval", () => expect(shouldRefreshOnShow({ ...base, lastShownAt: 60_000 })).toBe(true));
  it("refreshes when anything was written in between", () =>
    expect(shouldRefreshOnShow({ ...base, lastShownAt: 99_000, writesNow: 4 })).toBe(true));
});
```

```ts
// test/use-action.test.ts
import { describe, expect, it, vi } from "vitest";
import { createActionGuard } from "../src/hooks/use-action";

describe("createActionGuard", () => {
  it("runs once when triggered twice before the first finishes", async () => {
    const guard = createActionGuard();
    let release: () => void = () => {};
    const action = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const first = guard.run(action);
    const second = guard.run(action);
    expect(guard.busy()).toBe(true);
    release();
    await Promise.all([first, second]);
    expect(action).toHaveBeenCalledTimes(1);
    expect(guard.busy()).toBe(false);
  });
  it("frees the guard when the action throws", async () => {
    const guard = createActionGuard();
    await expect(guard.run(async () => { throw new Error("x"); })).rejects.toThrow("x");
    expect(guard.busy()).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现四个模块**

`usePageRefresh` 记住上次显示的时间和当时的写计数；`useDidShow` 时用 `shouldRefreshOnShow` 判断，`refresh()` 总是生效。`apiClient.request` 和演示客户端在 `method` 不是 `GET` 且请求成功时调用 `noteWrite()`。

- [ ] **Step 4: 跑全部测试、类型检查，提交**

```bash
git add apps/miniprogram/src/services/read-cache.ts apps/miniprogram/src/hooks apps/miniprogram/src/services/apiClient.ts apps/miniprogram/src/services/demo/client.ts apps/miniprogram/src/store/session.tsx apps/miniprogram/test
git commit -m "feat(miniprogram): 读取缓存、回到页面按需重读、按钮防连点"
```

---

### Task 4: 工人首页

**Files:**
- Modify: `apps/miniprogram/src/components/worker-home/index.tsx` `index.scss`
- Create: `apps/miniprogram/src/services/worker-home-sign.ts`
- Modify: `apps/miniprogram/src/hooks/use-my-project-attendance.ts`（改用 `useCachedRead`）
- Modify: 仓库根目录的 `.prettierignore`（移除 `worker-home/index.scss`）
- Test: `apps/miniprogram/test/worker-home-sign.test.ts`

**Interfaces:**
- Consumes: 任务 2 的 `Sign*`、`Sheet`、`Row`、`Numbers`、`SectionTitle`、`SkeletonSign`、`SkeletonRows`、`AppHeader`；任务 3 的 `useCachedRead`、`usePageRefresh`。
- Produces:

```ts
// services/worker-home-sign.ts —— 首页标牌显示什么，纯函数
export type WorkerHomeSign =
  | { readonly kind: "punch"; readonly card: string; readonly before: string; readonly projectId: string }   // 该打卡了
  | { readonly kind: "text"; readonly title: string; readonly sub: string;                                   // 一句结论：打完了、打不了、不用打、没项目
      readonly action?: { readonly label: string; readonly url: string } | { readonly label: string; readonly retry: true } };
export const cardName: (point: Pick<AttendanceTodayPoint, "kind" | "label">) => string;       // 上班卡、下班卡，其余用安排里的名称
export const cardDeadline: (point: Pick<AttendanceTodayPoint, "kind" | "scheduledTime">) => string; // “08:00 前打”“17:30 后打”“12:00 打”
export const workerHomeSign: (input: {
  readonly entry: ProjectAttendance | null;   // 当前选中的项目；没有项目时为 null
  readonly blocker: WorkerReminder | null;    // workerFaceBlocker 的结果；演示人脸可用时传 null
  readonly now: string;                       // ISO 时间
}) => WorkerHomeSign;
```

- 标牌大时间显示现在的时间，每 30 秒更新一次，只更新这一个文本节点所在的组件。
- 首页不读定位。标牌最下面一行是班组和工种。

- [ ] **Step 1: 写 `worker-home-sign.test.ts`**，用 `test/worker-home-selection.test.ts` 里构造项目考勤数据的方式。断言：
  - 上班时点未打：`{ kind: "punch", card: "上班卡", before: "08:00 前打" }`；下班时点是“17:30 后打”；自定义时点用原名称和“12:00 打”。
  - 有底照拦截：`kind: "text"`，标题是拦截的标题，`action.label` 是“查看底照”。
  - 全部时点都有有效记录：标题“今天 2 张卡都打了”，副行含“上班 07:52，下班 17:34”和“记工 8.5 小时”。
  - 有异常记录：标题“卡打了，有异常要核对”，`action.label` 是“看今天的记录”。
  - 非工作日“今天不用打卡”；未配置“今天还没排班”；只按任务考勤的项目“按任务开工、完工”，`action.label` 是“我的任务”。
  - 读取失败或日期不是今天：“今天的安排没读到”，`action` 是 `{ label: "重新读取", retry: true }`。
  - `entry` 为 `null`：“还没有加入项目”。
- [ ] **Step 2: 跑测试确认失败**
- [ ] **Step 3: 实现 `workerHomeSign`**，判断顺序和 `worker-home/index.tsx` 现有的 `renderTask` 一致，不改规则：没有项目、安排没读到、只按任务考勤、未配置或休息、全部打完、底照拦截、有待打时点（用 `workerHomeNextPoint`）。
- [ ] **Step 4: 重写 `worker-home/index.tsx` 的渲染层**，结构按设计稿“首页：该打卡了、今天打完了、还不能打卡”三屏：页头（项目名可切换）、标牌、本月三个数字、等你处理（缺卡、被驳回的补卡带警戒条）和“我的任务”一行、底部导航。读取中用 `SkeletonSign` 和 `SkeletonRows`。项目切换沿用现有的选择逻辑和本机记忆。
- [ ] **Step 5: 跑测试、类型检查、演示构建；在演示版截图和设计稿对照；提交**

```bash
git commit -m "feat(miniprogram): 工人首页改用标牌"
```

---

### Task 5: 打卡页拆成一屏一步

**Files:**
- Modify: `apps/miniprogram/src/pages/punch/index.tsx` `index.scss`
- Create: `apps/miniprogram/src/pages/punch/punch-stage.ts`
- Create: `apps/miniprogram/src/pages/punch/views/locate.tsx` `photo.tsx` `safety.tsx` `face.tsx` `result.tsx` `points.tsx` `blocked.tsx`
- Modify: `apps/miniprogram/src/components/attendance-safety-card.tsx` `attendance-safety-card.scss`
- Modify: 仓库根目录的 `.prettierignore`（移除 `pages/punch/index.scss`、`attendance-safety-card.scss`）
- Test: `apps/miniprogram/test/punch-stage.test.ts`

**Interfaces:**
- Consumes: 任务 2 的 `Steps`、`BottomBar`、`Sheet`、`Row`、`Stamp`、`Notice`；任务 3 的 `usePageRefresh`；`worker-view.ts` 现有的 `workerPunchStep`、`WorkerPunchStep`。
- Produces:

```ts
// pages/punch/punch-stage.ts —— 现在该显示哪一屏，纯函数。步骤判定沿用 worker-view.ts 的 workerPunchStep
export type PunchScreen =
  | "unavailable"   // 读不到项目或今日安排
  | "loading"
  | "stale"         // 安排的日期不是今天
  | "result"        // 已保存
  | "blocked"       // 没有可打的卡：没排班、休息、都打完了、任务时间不对、底照没通过
  | "points"        // 用户点开了“今天的卡”
  | "locate" | "photo" | "safety" | "face" | "saving";
export const punchScreen: (s: {
  readonly failed: boolean; readonly loaded: boolean; readonly stale: boolean;
  readonly hasResult: boolean; readonly blocked: boolean; readonly showPoints: boolean;
  readonly step: WorkerPunchStep;
}) => PunchScreen;
export const screenStep: (screen: PunchScreen) => { readonly current: number; readonly label: string } | null; // 1 定位 2 现场照片 3 安全交底 4 人脸核验
```

- `workerPunchStep` 不改：不在范围内时回到定位这一步，已拍的照片保留，重新定位通过后直接接着走。
- 底照没通过时一进页面就显示 `blocked`，不让人先定位、拍照之后才发现打不了。

- 保留 `index.tsx` 里现有的全部状态、请求和处理函数（`confirmLocation`、`pickSitePhoto`、`startFacePunch`、`savePunch`、视频活体流程、任务和加班模式、`confirmWorkerSafety`）。只替换渲染层，并删除非工人样式的那套渲染。
- 第一步的图是示意图：一个圆和一个点，圆是考勤范围，点按“距中心米数除以允许半径”摆在圆内或圆外，最远画到图的边缘。不用 `Map` 组件。
- 步骤之间切换时，新一步的容器加 `m-step`。
- 结果页用大号 `Stamp`，`play` 为真；异常打卡不盖章，用 `Notice tone="error"` 说明。
- “今天的卡”视图列出今日时点和加班进场、加班补卡入口；从第一步的“今天的卡”一行进入，选完回到第一步。

- [ ] **Step 1: 写 `punch-stage.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { punchScreen, screenStep } from "../src/pages/punch/punch-stage";
import { workerPunchStep } from "../src/pages/punch/worker-view";

const idle = { phase: "IDLE", inside: false, hasPhoto: false, faceReady: true, safetyReady: false, validProof: false, locationDenied: false, cameraDenied: false } as const;
const base = { failed: false, loaded: true, stale: false, hasResult: false, blocked: false, showPoints: false };
const screen = (step: Partial<typeof idle> | { phase: string }, outer: Partial<typeof base> = {}) =>
  punchScreen({ ...base, ...outer, step: workerPunchStep({ ...idle, ...step } as Parameters<typeof workerPunchStep>[0]) });

describe("punchScreen", () => {
  it("walks the four steps in order", () => {
    expect(screen({})).toBe("locate");
    expect(screen({ inside: true })).toBe("photo");
    expect(screen({ inside: true, hasPhoto: true })).toBe("safety");
    expect(screen({ inside: true, hasPhoto: true, safetyReady: true })).toBe("face");
  });
  it("returns to locate when a later check finds the worker outside, and shows saving for a kept proof", () => {
    expect(screen({ inside: false, hasPhoto: true, safetyReady: true })).toBe("locate");
    expect(screen({ validProof: true })).toBe("saving");
    expect(screen({ phase: "SUBMITTING" })).toBe("saving");
    expect(screen({ phase: "PREPARING", inside: true, hasPhoto: true })).toBe("face");
  });
  it("orders the outer states: unavailable, loading, stale, result, blocked, points", () => {
    expect(screen({}, { failed: true, loaded: false })).toBe("unavailable");
    expect(screen({}, { loaded: false })).toBe("loading");
    expect(screen({}, { stale: true, hasResult: true })).toBe("stale");
    expect(screen({}, { hasResult: true, blocked: true })).toBe("result");
    expect(screen({}, { blocked: true, showPoints: true })).toBe("blocked");
    expect(screen({ inside: true }, { showPoints: true })).toBe("points");
  });
  it("numbers the steps", () => {
    expect(screenStep("locate")).toEqual({ current: 1, label: "定位" });
    expect(screenStep("photo")).toEqual({ current: 2, label: "现场照片" });
    expect(screenStep("safety")).toEqual({ current: 3, label: "安全交底" });
    expect(screenStep("face")).toEqual({ current: 4, label: "人脸核验" });
    expect(screenStep("saving")).toEqual({ current: 4, label: "人脸核验" });
    expect(screenStep("result")).toBeNull();
    expect(screenStep("points")).toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**
- [ ] **Step 3: 实现 `punch-stage.ts`**
- [ ] **Step 4: 写七个视图组件**，每个只接收要显示的数据和回调，不自己发请求。文案和布局按设计稿“打卡”一组八屏。
- [ ] **Step 5: 改 `index.tsx`**：用 `punchScreen` 选视图，页头标题是当前这张卡的名称（例如“上班卡”），步骤条用 `screenStep`，主按钮放进 `BottomBar`。`usePageRefresh({ minShowIntervalMs: 30000 })` 保证拍照和人脸返回时不重读。原来只对工人生效的日期更替、权限检查、核验过期处理改为对所有人生效。
- [ ] **Step 6: 跑测试、类型检查、两种构建**
- [ ] **Step 7: 在演示版走一遍并截图对照**：定位、拍照、停 65 秒、确认交底、自动进人脸、落章；范围外；人脸失败后保留交底确认并可重试。
- [ ] **Step 8: 提交**

```bash
git commit -m "feat(miniprogram): 打卡页改成一屏一步"
```

---

### Task 6: 对照、检查、推送

**Files:**
- Modify: `README.md`（功能进度里加一行：界面重做进行中，分支 `ui-redesign`）

- [ ] **Step 1: 小屏检查**：演示版在 320 宽和 430 宽各截工人首页和打卡四步，行内文字不换行、右侧状态不被挤出。
- [ ] **Step 2: 量构建产物**：`du -sh apps/miniprogram/dist-weapp` 不超过 1.6MB。
- [ ] **Step 3: 微信开发者工具**：`cli open --project <工作目录>/apps/miniprogram`，用仓库里的 `miniprogram-automator` 连上模拟器，走工人首页和打卡到拍照前，确认没有运行时异常；截图存到 `output/`。
- [ ] **Step 4: 全量验证并推送分支**

```bash
corepack pnpm --filter @construction/miniprogram exec tsc --noEmit
corepack pnpm --filter @construction/miniprogram exec vitest run
corepack pnpm --filter @construction/miniprogram build:weapp
corepack pnpm --filter @construction/miniprogram build:h5:demo
git push -u origin ui-redesign
```
