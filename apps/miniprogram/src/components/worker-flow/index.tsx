import { View } from "@tarojs/components";
import type { PropsWithChildren } from "react";

import { useSession } from "../../store/session";
import { AppHeader, PageHeader, Screen } from "../ui/index";

import "./index.scss";

/** Shared worker presentation only; route guards and business logic stay in each page. */
export const FlowScreen = ({
  title,
  children,
  enabled,
  root = false,
}: PropsWithChildren<{
  readonly title: string;
  readonly enabled?: boolean;
  readonly root?: boolean;
}>): JSX.Element => {
  const { state } = useSession();
  const worker = enabled ?? state.me?.roles.highestRoleCode === "WORKER";
  const Header = root ? AppHeader : PageHeader;
  if (!worker) {
    return (
      <Screen>
        <Header title={title} />
        {children}
      </Screen>
    );
  }
  return (
    <Screen
      appearance="worker"
      header={<Header title={title} appearance="worker" />}
    >
      <View className="worker-flow">{children}</View>
    </Screen>
  );
};
