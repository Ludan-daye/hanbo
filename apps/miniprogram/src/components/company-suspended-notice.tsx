import { View } from "@tarojs/components";

import { Notice } from "./ui/index";
import { companySuspendedNotice } from "../services/company-status";
import { useSession } from "../store/session";

/** 所在公司暂停时放在首页、工作台最上面的一条说明；没有暂停就什么也不显示。 */
export const CompanySuspendedNotice = (): JSX.Element | null => {
  const { state } = useSession();
  const notice = state.me === null ? null : companySuspendedNotice(state.me);
  if (notice === null) return null;
  return (
    <Notice tone="warning">
      {notice.title}
      <View className="ui-notice__sub">{notice.sub}</View>
    </Notice>
  );
};
