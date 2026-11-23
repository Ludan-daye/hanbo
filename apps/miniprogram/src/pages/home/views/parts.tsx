import { View } from "@tarojs/components";
import Taro, { usePullDownRefresh } from "@tarojs/taro";
import { useEffect, type PropsWithChildren } from "react";

import { CompanySuspendedNotice } from "../../../components/company-suspended-notice";
import { ScopeChooser } from "../../../components/role-panels/index";
import { scopeShortName } from "../../../components/role-panels/scope";
import {
  AppHeader,
  BottomNav,
  Button,
  Notice,
  Row,
  Screen,
  SectionTitle,
  Sheet,
  Sign,
  SignAlert,
  SignButton,
  SignCount,
  SignText,
  SignTop,
  SkeletonRows,
  SkeletonSign,
} from "../../../components/ui/index";
import { useCachedRead, type CachedRead } from "../../../hooks/use-cached-read";
import type { DailyReport } from "../../../services/management.types";
import {
  fetchAppSettings,
  type AppSettings,
} from "../../../services/workflows";
import { signDateLabel, type HomeTodo } from "../home-model";
import type { HomeScope } from "../use-home-scope";

export const APP_NAME = "瀚渤智慧工地";

export const go = (url: string): void => {
  void Taro.navigateTo({ url });
};

/** 页头上的名字：当前班组、项目或公司；还不知道时写应用名。 */
export const scopeTitle = (scope: HomeScope["scope"]): string =>
  (scope ? scopeShortName(scope) : "") || APP_NAME;

/** 下拉刷新：强制重读，读完收起下拉的动画。 */
export const usePullRefresh = (refresh: () => void, busy: boolean): void => {
  usePullDownRefresh(refresh);
  useEffect(() => {
    if (!busy) Taro.stopPullDownRefresh();
  }, [busy]);
};

/** 首页公告：平台设置里的一条，所有人的首页都显示（五级第五期，Q12）。 */
export const useAnnouncement = (
  userId: string,
  revision: number,
): CachedRead<AppSettings> =>
  useCachedRead<AppSettings>(
    `${userId}:app-settings`,
    fetchAppSettings,
    revision,
    "公告没读到，请重试。",
  );

/** 管理人员首页的外壳：页头、内容、公告、没读到的说明、底部导航。 */
export const HomeShell = ({
  title,
  onSwitch,
  announcement,
  notRemembered,
  problem,
  onRetry,
  children,
}: PropsWithChildren<{
  readonly title: string;
  readonly onSwitch?: () => void;
  readonly announcement?: string | null;
  readonly notRemembered?: boolean;
  /** 次要内容没读到时说明一声，主角（标牌）自己有出错的样子。 */
  readonly problem?: string | null;
  readonly onRetry?: () => void;
}>): JSX.Element => (
  <Screen header={<AppHeader title={title} onSwitch={onSwitch} />}>
    <CompanySuspendedNotice />
    {children}
    {announcement ? <Notice>公告：{announcement}</Notice> : null}
    {notRemembered ? (
      <Notice>换好了，但这次没能记住，下次打开可能要再选一次。</Notice>
    ) : null}
    {problem ? (
      <>
        <Notice tone="error">
          有些信息没读到
          <View className="ui-notice__sub">{problem}</View>
        </Notice>
        <Button variant="outline" onClick={onRetry}>
          重新读取
        </Button>
      </>
    ) : null}
    <BottomNav active="home" />
  </Screen>
);

/** 换班组、换项目、换公司。 */
export const HomeScopeChooser = ({
  title,
  choice,
}: {
  readonly title: string;
  readonly choice: HomeScope;
}): JSX.Element => (
  <ScopeChooser
    title={title}
    scopes={choice.available ?? []}
    current={choice.scope}
    onChoose={choice.choose}
    onCancel={choice.stopChoosing}
  />
);

/**
 * 首页的主角：今天几个人到岗，谁缺卡。
 * 没读到时标牌自己说明并给重试；读取中是和标牌等位的骨架。
 */
export const AttendanceSign = ({
  date,
  report,
  missing,
  missingLabel = "缺卡",
  onOpen,
  onRetry,
}: {
  readonly date: string;
  /** 日报，或项目概览里换成同样字段的合计：只用到应到和到岗。 */
  readonly report: Pick<
    CachedRead<{
      readonly totals: Pick<
        DailyReport["totals"],
        "scheduledDays" | "actualAttendedDays"
      >;
    }>,
    "data" | "error"
  >;
  /** 黑条里写谁缺卡或缺几个人；空着就不出黑条。 */
  readonly missing: string;
  /** 黑条的标签：组长首页写谁缺卡；项目、公司首页写未到几人（和应到、到岗加得上）。 */
  readonly missingLabel?: string;
  readonly onOpen: () => void;
  readonly onRetry: () => void;
}): JSX.Element => {
  if (report.data === null)
    return report.error === null ? (
      <SkeletonSign />
    ) : (
      <Sign>
        <SignText title="今天的考勤没读到" sub={report.error} />
        <SignButton onClick={onRetry}>重新读取</SignButton>
      </Sign>
    );
  const { totals } = report.data;
  return (
    <Sign>
      <SignTop
        left={signDateLabel(date)}
        right={`应到 ${totals.scheduledDays} 人`}
      />
      <SignCount value={String(totals.actualAttendedDays)} unit="人到岗" />
      {missing ? (
        <SignAlert
          label={missingLabel}
          value={missing}
          action="查看"
          onClick={onOpen}
        />
      ) : null}
    </Sign>
  );
};

/** 等你处理：一行一件，带警戒条；一件都没有时说一声。 */
export const TodoSheet = ({
  todos,
  loading,
  incomplete,
}: {
  readonly todos: readonly HomeTodo[];
  /** 还在读、也没有上次的数据：先用一行骨架占位。 */
  readonly loading: boolean;
  /** 有一类待办没读到：这时不能说“没有”，页面下方另有说明和重试。 */
  readonly incomplete: boolean;
}): JSX.Element => (
  <>
    <SectionTitle>等你处理</SectionTitle>
    {todos.length === 0 && loading ? (
      <SkeletonRows rows={1} />
    ) : (
      <Sheet>
        {todos.length === 0 ? (
          <Row title={incomplete ? "待办没读到" : "没有等你处理的事"} />
        ) : (
          [
            ...todos.filter((todo) => todo.plain !== true),
            ...todos.filter((todo) => todo.plain === true),
          ].map((todo) => (
            <Row
              key={todo.key}
              title={todo.title}
              sub={todo.sub}
              value={todo.note}
              mute={todo.time === undefined}
              hazard={todo.plain !== true}
              chevron
              onClick={() => go(todo.url)}
            >
              {todo.time ? <View className="num">{todo.time}</View> : null}
            </Row>
          ))
        )}
      </Sheet>
    )}
  </>
);
