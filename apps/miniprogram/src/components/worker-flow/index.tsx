import type { PropsWithChildren } from "react";

import { AppHeader, PageHeader, Screen } from "../ui/index";

/**
 * 页面外壳的简写：带返回的页头（root 为真时是不带返回的根页面页头）加页面内容。
 * enabled 只为兼容旧调用保留，不再有区别。
 */
export const FlowScreen = ({
  title,
  children,
  root = false,
}: PropsWithChildren<{
  readonly title: string;
  readonly enabled?: boolean;
  readonly root?: boolean;
}>): JSX.Element => (
  <Screen header={root ? <AppHeader title={title} /> : <PageHeader title={title} />}>
    {children}
  </Screen>
);
