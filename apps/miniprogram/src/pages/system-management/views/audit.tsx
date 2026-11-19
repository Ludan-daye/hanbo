import { View } from "@tarojs/components";

import { Notice, Row, Sheet, StateView } from "../../../components/ui";
import type { Account, AuditEntry } from "../../../services/workflows";
import { auditActor, auditTime, describeAudit } from "../system-view";

/** “日志”标签：只读。谁、什么时候、做了什么。 */
export const AuditTab = ({
  audit,
  accounts,
}: {
  readonly audit: readonly AuditEntry[];
  /** 用来把日志里的账号编号换成姓名。 */
  readonly accounts: readonly Account[];
}): JSX.Element =>
  audit.length === 0 ? (
    <StateView
      kind="empty"
      title="还没有操作日志"
      sub="有人新增、修改或删除了东西，会记在这里。"
    />
  ) : (
    <>
      <Sheet gap>
        {audit.map((row) => (
          <Row
            key={row.id}
            title={describeAudit(row.action)}
            sub={auditActor(row.actor, accounts)}
            mute
          >
            <View className="num">{auditTime(row.createdAt)}</View>
          </Row>
        ))}
      </Sheet>
      <Notice>
        这里是演示数据里最近的 200 条操作。正式环境的操作由服务器记录。
      </Notice>
    </>
  );
