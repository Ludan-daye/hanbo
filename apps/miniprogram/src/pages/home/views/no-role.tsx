import { useState } from "react";

import {
  AppHeader,
  BottomNav,
  Notice,
  Screen,
  Sign,
  SignButton,
  SignText,
} from "../../../components/ui/index";
import { errorMessage } from "../../../services/error-messages";
import { useSession } from "../../../store/session";

import { APP_NAME } from "./parts";

/** 已经绑定、还没分配角色：一句话说清现在的情况，给一个刷新。 */
export const NoRoleHome = (): JSX.Element => {
  const { refreshMe } = useSession();
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const reload = (): void => {
    if (busy) return;
    setBusy(true);
    setError(null);
    void refreshMe()
      .catch((cause: unknown): void => {
        setError(errorMessage(cause, "读取角色信息失败，请重试。"));
      })
      .finally((): void => setBusy(false));
  };
  return (
    <Screen header={<AppHeader title={APP_NAME} />}>
      <Sign>
        <SignText
          title="还没有分配角色"
          sub="请联系管理员给你分配角色，分配好以后点下面刷新。"
        />
        <SignButton busy={busy} onClick={reload}>
          {busy ? "刷新中" : "刷新角色信息"}
        </SignButton>
      </Sign>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <BottomNav active="home" />
    </Screen>
  );
};
