import { View } from "@tarojs/components";
import type { NewTaskInvitation, TaskInvitation } from "@construction/domain";

import { workTimestamp } from "../../../components/team-work-fields";
import {
  Button,
  Card,
  CardActions,
  CardMeta,
  Code,
  FormInput,
  Notice,
  Row,
  SectionTitle,
  Sheet,
  type StatusKind,
} from "../../../components/ui";
import { TextAction } from "./text-action";

const INVITE_STATUS: Record<
  Exclude<TaskInvitation["status"], "PENDING">,
  { readonly kind: StatusKind; readonly text: string }
> = {
  ACCEPTED: { kind: "ok", text: "已加入" },
  EXPIRED: { kind: "idle", text: "已过期" },
  REVOKED: { kind: "idle", text: "已作废" },
};

/**
 * 邀请临时工：填姓名和手机号，生成六位码。
 * 完整的码只在这一页显示这一次，所以放得很大，下面就是复制。
 */
export const InviteView = ({
  realName,
  phone,
  issued,
  invites,
  busy,
  creating,
  problem,
  onRealName,
  onPhone,
  onCreate,
  onCopy,
  onRevoke,
}: {
  readonly realName: string;
  readonly phone: string;
  /** 刚生成的邀请，带完整的码。 */
  readonly issued: NewTaskInvitation | null;
  readonly invites: readonly TaskInvitation[];
  readonly busy: boolean;
  /** 正在生成邀请码。 */
  readonly creating: boolean;
  readonly problem: string | null;
  readonly onRealName: (value: string) => void;
  readonly onPhone: (value: string) => void;
  readonly onCreate: () => void;
  readonly onCopy: () => void;
  readonly onRevoke: (invite: TaskInvitation) => void;
}): JSX.Element => (
  <>
    <Sheet gap>
      <FormInput
        label="真实姓名"
        required
        value={realName}
        onInput={onRealName}
        placeholder="和本人登记的一致"
        maxLength={50}
        disabled={busy}
      />
      <FormInput
        label="手机号"
        required
        value={phone}
        onInput={onPhone}
        type="number"
        maxLength={11}
        placeholder="11 位手机号"
        disabled={busy}
      />
    </Sheet>
    {problem !== null ? <Notice tone="error">{problem}</Notice> : null}
    {/* 码出来以后，这一屏的黑按钮让给“复制邀请码”。 */}
    <Button
      variant={issued === null ? "primary" : "outline"}
      wide={issued !== null}
      loading={creating}
      disabled={busy || realName.trim().length === 0 || phone.length !== 11}
      onClick={onCreate}
    >
      {creating ? "生成中…" : "生成六位邀请码"}
    </Button>
    {issued !== null ? (
      <View className="m-fade">
        <Card gap>
          <CardMeta>邀请码已生成，只给{issued.name}本人用</CardMeta>
          <Code>{issued.code}</Code>
          <CardMeta>
            有效到 {workTimestamp(issued.expiresAt)}
            。离开这一页就不再显示完整的码。
          </CardMeta>
          <CardActions>
            <Button onClick={onCopy}>复制邀请码</Button>
          </CardActions>
        </Card>
      </View>
    ) : null}
    {invites.length > 0 ? (
      <>
        <SectionTitle>发出过的邀请</SectionTitle>
        <Sheet>
          {invites.map((invite) => (
            <Row
              key={invite.id}
              title={invite.name}
              // 这一行右边还有“作废”，写“有效到”会被省略号截掉时间
              sub={
                invite.status === "PENDING"
                  ? `${invite.phoneMasked}，${workTimestamp(invite.expiresAt)} 过期`
                  : invite.phoneMasked
              }
              status={
                invite.status === "PENDING"
                  ? undefined
                  : INVITE_STATUS[invite.status]
              }
            >
              {invite.status === "PENDING" ? (
                <TextAction
                  danger
                  disabled={busy}
                  onClick={() => onRevoke(invite)}
                >
                  作废
                </TextAction>
              ) : null}
            </Row>
          ))}
        </Sheet>
      </>
    ) : null}
  </>
);
