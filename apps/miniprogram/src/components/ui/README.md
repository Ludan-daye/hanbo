# 公共组件（标牌设计）

设计规矩见 `docs/superpowers/specs/2026-11-19-ui-redesign-design.md`，每个页面的设计稿见 `docs/design/ui-redesign/`（`index.html` 用浏览器打开；`src/s_*.py` 是生成它的源码，一个 `phone(...)` 就是一屏）。

全部从 `components/ui` 引入。样式在 `kit.scss`，尺寸单位一律 `rpx`。

## 四条硬规矩

1. **一屏只有一处橙色**：`Sign` 或 `SignLine`，放这一屏最要紧的那件事。橙底上只写黑字。
2. **一屏只有一个黑色实心按钮**：`SignButton`、`BottomBar` 的主操作、`Button`（默认 `primary`）三者只能出现一个。其余用 `variant="outline"`（黑框）或 `variant="text"`（下划线文字）。列表里多条都要处理时，只有最该办的那条用黑按钮。
3. **状态用形状加颜色**：`Status`（绿方块正常、黄三角等人处理、红圆点异常）。等你处理的事用带警戒条的行：`<Row hazard />`。办完了盖红章：`Stamp`。
4. **不用阴影、渐变，不用间隔号（·）串信息，按钮文字后不加箭头，不显示英文常量。** 标题用名称，按钮用动作。

## 页面骨架

```tsx
<Screen header={<PageHeader title="申请补卡" />}>   {/* 根页面用 <AppHeader title=… onSwitch=… /> */}
  …内容…
  <BottomBar primary="提交申请" busy={saving} onPrimary={submit}>   {/* 固定在底部 */}
    <Button variant="outline" onClick={…}>重拍</Button>               {/* 次要操作，可没有 */}
  </BottomBar>
</Screen>
```

- 根页面底部放 `<BottomNav active="home" />`，不放 `BottomBar`。
- `Screen` 自带两侧留边和底部留白，内容不会被导航或操作条挡住。
- `BottomBar` 是固定定位的：**不要把它放进带 `m-step`、`m-fade` 的容器里**（动画作用在 transform 上时，固定定位会改成相对那个容器）。

## 设计稿里的零件对应哪个组件

| 设计稿（`lib.py`） | 组件 |
|---|---|
| `nav(title)` / `nav(title, back=False, switch=True)` | `PageHeader` / `AppHeader`（`onSwitch`） |
| `sign_punch` / `sign_text` / `.sign` | `Sign` 里放 `SignTop` `SignCount` `SignClock` `SignText` `SignAlert` `SignButton` `SignNote` |
| `cs(head, sub, number)` | `SignLine title sub value` |
| `h(text, link)` | `SectionTitle action onAction` |
| `sheet(row(...), …)` | `Sheet`（`gap`）里放 `Row` |
| `row(label, right, sub, chev, haz, avatar, mute, icon)` | `Row title titleNum sub value mute status chevron hazard avatar icon onClick`；右侧要放别的东西就写在 children 里 |
| `st(kind, text)` | `Status kind`；不传 `kind` 时按文案推断 |
| `nums([...])` | `Numbers items`（`wrap` 可折行） |
| `grid([...], cols)` | `EntryGrid items cols` |
| `card(...)`、`.tt` `.me2` `.act` `.div`、`kv` | `Card`（`gap` `stamped`）里放 `CardTitle` `CardMeta` `CardActions` `Divider` `KV` |
| `tl(...)` | `Timeline items` |
| `seg([...], active)` | `Segmented options value onChange` |
| `dsw(text)` | `DateSwitch label onPrev onNext`；按天切换直接用 `components/team-work-fields` 的 `WorkDate` |
| `search(ph)` | `SearchField` |
| `f(label, value, ph, chev, req, bad)` | `FormRow`（点一下去选）或 `FormInput`（直接输入），都放在 `Sheet` 里 |
| `area(label, …)` | `FormArea` |
| `sw(on)` | `FormSwitch` |
| `chips([...], active)` | `Chips options selected onToggle`（放在白条里加 `onSheet`） |
| `weekdays(on)` | `Weekdays` |
| `ck(on, round_)` | `Check checked round`（只管显示，点击交给所在的 `Row`） |
| `ferr(text)` | `FormError` |
| `steps(n, total, label)` | `Steps` |
| `say(head, sub)` | `Say title sub`（`center`） |
| `pic(text)` / `pics(...)` / `addpic()` | `Photo`（`small` `add`）/ `PhotoRow` |
| `stamp(text, sub, big)` | `Stamp text sub size="lg" play` |
| `code(text)` | `Code` |
| `.pbar` | `ProgressBar percent` |
| `nt(text)` | `<Notice>`（一段灰字） |
| `er(head, sub)` | `<Notice tone="error">`，第二行用 `<View className="ui-notice__sub">` |
| `empty(head, sub, action)` | `StateView title sub onRetry retryLabel kind="empty"` |
| `cta(primary, *others)` | `BottomBar primary`，others 写在 children 里 |
| `b2(text)` / `b3(text)` / `go(text)` | `Button variant="outline"` / `variant="text"` / 默认 |
| `links(...)` | `Links` 里放 `Button variant="text"` |
| `ic(name)` | `LineIcon name tone` |
| `tab(role, active)` | `BottomNav active` |

## 读取、出错、提交

- 读取中：`StateView` 标题含“加载、读取、正在”时显示骨架；也可以直接放 `SkeletonSign`、`SkeletonRows`。
- 读取失败：`StateView`（带“重新加载”）。**校验或提交失败**：`<Notice tone="error">` 放在按钮附近，不要整页换成出错状态，免得把用户填的东西刷掉。
- 提交中：按钮传 `busy`（`BottomBar`、`SignButton`）或 `loading`（`Button`），并把文案换成“…中”；按钮变灰、不能再点。
- 需要先显示上次数据再核对的读取，用 `hooks/use-cached-read`（键里带用户编号）。

## 动效

`styles/motion.scss` 里只有这几样，别加新的：按下反馈（组件已内置；自己写可点的 `View` 时加 `className="ui-press" {...PRESS}`）、`m-fade`（展开的内容淡入）、`m-step`（换到流程的下一步）、`m-stamp`（`Stamp play`）、骨架。

## 写页面自己的样式时

- 单位用 `rpx`，颜色用 `styles/tokens.scss` 里的变量（`--hi` `--k` `--page` `--sheet` `--well` `--hair` `--muted` `--ph` `--warn` `--bad` `--good`）。
- 数字要用窄体粗字时加 `className="num"`。
- 一行里的文字会被挤时，标题用单行省略，右侧内容 `flex-shrink: 0`。
