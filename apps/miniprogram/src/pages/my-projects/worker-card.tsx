import { Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";

import {
  Button,
  Card,
  CardActions,
  CardMeta,
  CardTitle,
  Divider,
  KV,
} from "../../components/ui";
import { displayProjectRole } from "../../routing/features";
import {
  myProjectDetailUrl,
  type ProjectAttendance,
} from "../../services/project-attendance";
import type { ProjectCardView } from "./worker-card-state";

const go = (url: string): void => {
  void Taro.navigateTo({ url });
};

/**
 * “我的项目”里的一张卡片：项目、今天的状态、下一张卡，加一个现在最该做的操作。
 * 一屏只有一个黑按钮，所以哪张卡片用黑按钮由页面决定（primary）。
 */
export const WorkerProjectCard = ({
  entry,
  view,
  primary,
  onRetry,
}: {
  readonly entry: ProjectAttendance;
  readonly view: ProjectCardView;
  readonly primary: boolean;
  readonly onRetry: () => void;
}): JSX.Element => {
  const { action, next } = view;
  return (
    <View data-project-id={entry.project.projectId}>
      <Card gap>
        <CardTitle status={view.status}>{entry.project.projectName}</CardTitle>
        <CardMeta>
          {entry.project.teamName ?? "未分配班组"}，
          {displayProjectRole(entry.project.projectRoleLabel)}
        </CardMeta>
        {view.hint !== null ? <CardMeta>{view.hint}</CardMeta> : null}
        {next !== null ? (
          <>
            <Divider />
            <KV label="下一张卡">
              {next.label} <Text className="num">{next.scheduledTime}</Text>
            </KV>
          </>
        ) : null}
        <CardActions>
          <Button
            variant={primary ? "primary" : "outline"}
            onClick={action.kind === "retry" ? onRetry : () => go(action.url)}
          >
            {action.label}
          </Button>
          <Button
            variant="text"
            onClick={() => go(myProjectDetailUrl(entry.project.projectId))}
          >
            项目详情
          </Button>
        </CardActions>
      </Card>
    </View>
  );
};
