import { View } from "@tarojs/components";
import type { TeamTask } from "@construction/domain";

import {
  taskStatusLabel,
  WorkDate,
} from "../../../components/team-work-fields";
import {
  BottomBar,
  Button,
  Notice,
  Row,
  Sheet,
  SignLine,
  SkeletonRows,
  StateView,
} from "../../../components/ui";
import { summarizeTasks, taskListTime } from "../task-view";

/** 工作安排：按天看排了什么。主角是底部的“新建安排”，套用历史是旁边的黑框。 */
export const ListView = ({
  date,
  today,
  tasks,
  loadError,
  problem,
  canCreate,
  canReuse,
  onDate,
  onRetry,
  onOpen,
  onCreate,
  onHistory,
}: {
  readonly date: string;
  readonly today: string;
  /** null 是还没读到。 */
  readonly tasks: readonly TeamTask[] | null;
  /** 没读到的原因；有它就显示重试。 */
  readonly loadError: string | null;
  /** “新建安排”没成的原因。 */
  readonly problem: string | null;
  readonly canCreate: boolean;
  readonly canReuse: boolean;
  readonly onDate: (value: string) => void;
  readonly onRetry: () => void;
  readonly onOpen: (task: TeamTask) => void;
  readonly onCreate: () => void;
  readonly onHistory: () => void;
}): JSX.Element => {
  const summary = summarizeTasks(tasks ?? [], date, today);
  return (
    <>
      <WorkDate value={date} onChange={onDate} />
      {tasks === null ? (
        loadError !== null ? (
          <StateView
            kind="error"
            title="工作安排没读到"
            sub={loadError}
            onRetry={onRetry}
          />
        ) : (
          <>
            <View className="team-work-sk sk" />
            <SkeletonRows rows={2} gap />
          </>
        )
      ) : tasks.length === 0 ? (
        <StateView
          kind="empty"
          title="这天还没有安排"
          sub="新建一项，或者套用以前排过的。"
        />
      ) : (
        <>
          <SignLine title={summary.title} sub={summary.sub} />
          <Sheet gap>
            {tasks.map((task) => (
              <Row
                key={task.id}
                title={task.title}
                sub={`${taskListTime(task, date)}，${task.assignments.length} 人`}
                status={{ text: taskStatusLabel(task.status) }}
                chevron
                onClick={() => onOpen(task)}
              />
            ))}
          </Sheet>
        </>
      )}
      {problem !== null ? <Notice tone="error">{problem}</Notice> : null}
      <BottomBar primary="新建安排" disabled={!canCreate} onPrimary={onCreate}>
        <Button variant="outline" disabled={!canReuse} onClick={onHistory}>
          套用历史
        </Button>
      </BottomBar>
    </>
  );
};
