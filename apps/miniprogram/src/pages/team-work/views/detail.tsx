import { View } from "@tarojs/components";
import type { TeamTask } from "@construction/domain";

import { taskStatusLabel } from "../../../components/team-work-fields";
import {
  BottomBar,
  Button,
  Card,
  CardMeta,
  Notice,
  Row,
  SectionTitle,
  Sheet,
  SignLine,
} from "../../../components/ui";
import {
  taskEditable,
  taskHours,
  taskTimeRange,
  type TaskPersonRow,
} from "../task-view";
import { TextAction } from "./text-action";

/**
 * 安排详情：人在中间，加人和邀请是两行入口，完成是黑按钮。
 * 已完成、已取消的安排只能看、确认临时工退场、照着再排一次。
 */
export const DetailView = ({
  task,
  people,
  today,
  busy,
  completing,
  validInvites,
  problem,
  onRemove,
  onExit,
  onRemind,
  onAdd,
  onInvite,
  onReuse,
  onEdit,
  onComplete,
  onCancel,
}: {
  readonly task: TeamTask;
  readonly people: readonly TaskPersonRow[];
  readonly today: string;
  readonly busy: boolean;
  /** 正在确认完成。 */
  readonly completing: boolean;
  /** 还有效的邀请码个数；没读过邀请记录时为 null。 */
  readonly validInvites: number | null;
  readonly problem: string | null;
  readonly onRemove: (person: TaskPersonRow) => void;
  readonly onExit: (person: TaskPersonRow) => void;
  /** 临时工漏打开工卡：提醒他申请开工补卡。 */
  readonly onRemind: (person: TaskPersonRow) => void;
  readonly onAdd: () => void;
  readonly onInvite: () => void;
  readonly onReuse: () => void;
  readonly onEdit: () => void;
  readonly onComplete: () => void;
  readonly onCancel: () => void;
}): JSX.Element => {
  const open = task.status === "OPEN";
  return (
    <>
      <SignLine
        title={taskStatusLabel(task.status)}
        sub={`${taskTimeRange(task, today)}，约 ${taskHours(task)} 小时`}
      />
      <SectionTitle>{`人员 ${people.length} 人`}</SectionTitle>
      {people.length === 0 ? (
        <Notice>
          {open
            ? "还没有安排人。从下面添加本班人员，或者邀请临时工。"
            : "这项安排没有安排人。"}
        </Notice>
      ) : (
        <Sheet>
          {people.map((person) => (
            <Row
              key={person.memberId}
              title={person.name}
              sub={person.sub}
              avatar={person.name.slice(0, 1)}
              status={person.status ?? undefined}
            >
              {person.remind ? (
                <TextAction disabled={busy} onClick={() => onRemind(person)}>
                  漏打开工
                </TextAction>
              ) : null}
              {person.action === "remove" ? (
                <TextAction disabled={busy} onClick={() => onRemove(person)}>
                  撤下
                </TextAction>
              ) : person.action === "exit" ? (
                <TextAction disabled={busy} onClick={() => onExit(person)}>
                  确认退场
                </TextAction>
              ) : null}
            </Row>
          ))}
        </Sheet>
      )}
      {open ? (
        <Sheet gap>
          <Row
            title="添加本班人员"
            icon="plus"
            chevron
            onClick={busy ? undefined : onAdd}
          />
          <Row
            title="邀请临时工"
            icon="key"
            value={
              validInvites !== null && validInvites > 0
                ? `${validInvites} 个邀请码有效`
                : undefined
            }
            mute
            chevron
            onClick={busy ? undefined : onInvite}
          />
        </Sheet>
      ) : null}
      <SectionTitle>安排内容</SectionTitle>
      <Card>
        <CardMeta>
          {task.projectName}，{task.teamName}
        </CardMeta>
        <CardMeta>
          {task.workType ? `${task.workType}，` : ""}负责人{" "}
          {task.supervisorName}
        </CardMeta>
        {task.description ? (
          <View className="team-work-notes">{task.description}</View>
        ) : null}
      </Card>
      <Sheet gap>
        <Row
          title="套用这项安排"
          sub="内容和本班的人带进一项新安排"
          icon="doc"
          chevron
          onClick={busy ? undefined : onReuse}
        />
      </Sheet>
      {problem !== null ? <Notice tone="error">{problem}</Notice> : null}
      {open ? (
        <BottomBar
          primary={completing ? "确认中…" : "确认已完成"}
          busy={busy}
          onPrimary={onComplete}
        >
          <TextAction danger disabled={busy} onClick={onCancel}>
            取消任务
          </TextAction>
          {taskEditable(task) ? (
            <Button variant="outline" disabled={busy} onClick={onEdit}>
              修改
            </Button>
          ) : null}
        </BottomBar>
      ) : null}
    </>
  );
};
