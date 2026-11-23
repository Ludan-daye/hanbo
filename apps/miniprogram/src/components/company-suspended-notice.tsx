import { View } from "@tarojs/components";

import { Notice } from "./ui/index";
import { useCachedRead } from "../hooks/use-cached-read";
import { companySuspendedNotice } from "../services/company-status";
import { fetchAppSettings, type AppSettings } from "../services/workflows";
import { useSession } from "../store/session";

/**
 * 所在公司暂停时放在首页、工作台最上面的一条说明；没有暂停就什么也不显示。
 * 有暂停时才读平台设置，写上平台联系电话（和首页公告同一份缓存，读不到就不写电话）。
 */
export const CompanySuspendedNotice = (): JSX.Element | null => {
  const { state } = useSession();
  const me = state.me;
  const suspended = me !== null && companySuspendedNotice(me) !== null;
  const settings = useCachedRead<AppSettings>(
    suspended && me !== null ? `${me.user.id}:app-settings` : null,
    fetchAppSettings,
    0,
  );
  const notice = me === null ? null : companySuspendedNotice(me, settings.data?.supportPhone ?? null);
  if (notice === null) return null;
  return (
    <Notice tone="warning">
      {notice.title}
      <View className="ui-notice__sub">{notice.sub}</View>
    </Notice>
  );
};
