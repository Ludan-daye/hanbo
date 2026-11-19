import { View } from "@tarojs/components";
import type { SafetyIssue } from "@construction/domain";

import {
  Button,
  Card,
  CardMeta,
  CardTitle,
  FormArea,
  Links,
  Notice,
  Row,
  Sheet,
  Stamp,
  StateView,
} from "../../../components/ui";
import {
  workDateLabel,
  workTimestamp,
} from "../../../components/team-work-fields";
import { needsFullText, severityStatus } from "../safety-view";

const place = (issue: SafetyIssue): string => issue.memberName ?? "班组现场";
const where = (issue: SafetyIssue): string =>
  `${workDateLabel(issue.workDate)}，${place(issue)}`;

/**
 * 隐患列表。没整改的带警戒条：一次只展开一条来登记整改结果，其余收成一行，
 * 所以屏上只有一个黑按钮。整改完的盖章存档。
 */
export const IssuesView = ({
  waiting,
  done,
  active,
  draft,
  error,
  moreFailed,
  busy,
  closing,
  hasMore,
  loadingMore,
  emptyTitle,
  onOpen,
  onDraft,
  onResolve,
  onMore,
  onRecord,
}: {
  readonly waiting: readonly SafetyIssue[];
  readonly done: readonly SafetyIssue[];
  /** 展开的那一条。 */
  readonly active: SafetyIssue | null;
  /** 展开的那一条正在写的整改结果。 */
  readonly draft: string;
  readonly error: string | null;
  /** 出错的是“加载更多”：原因写在那个按钮旁边，而不是展开的那一条下面。 */
  readonly moreFailed: boolean;
  readonly busy: boolean;
  readonly closing: boolean;
  readonly hasMore: boolean;
  readonly loadingMore: boolean;
  readonly emptyTitle: string;
  readonly onOpen: (id: string) => void;
  readonly onDraft: (value: string) => void;
  readonly onResolve: () => void;
  readonly onMore: () => void;
  readonly onRecord: () => void;
}): JSX.Element => {
  if (waiting.length === 0 && done.length === 0 && !hasMore)
    return (
      <>
        {error ? <Notice tone="error">{error}</Notice> : null}
        <StateView
          kind="empty"
          title={emptyTitle}
          sub="发现隐患就记一条，整改完登记结果才会关闭。"
          retryLabel="记录一条新隐患"
          onRetry={onRecord}
        />
      </>
    );
  const index = active === null ? waiting.length : waiting.indexOf(active);
  const errorAtCard = error !== null && active !== null && !moreFailed;
  const collapsed = (issue: SafetyIssue): JSX.Element => (
    <Row
      key={issue.id}
      hazard
      title={issue.description}
      sub={where(issue)}
      status={severityStatus(issue.severity)}
      onClick={() => onOpen(issue.id)}
    />
  );
  return (
    <>
      {index > 0 ? (
        <Sheet gap>{waiting.slice(0, index).map(collapsed)}</Sheet>
      ) : null}
      {active !== null ? (
        <View key={active.id} className="m-fade">
          <Sheet gap>
            <Row
              hazard
              title={active.description}
              sub={where(active)}
              status={severityStatus(active.severity)}
            />
            {needsFullText(active.description) ? (
              <View className="team-safety__detail">{active.description}</View>
            ) : null}
            <FormArea
              label="整改措施和核查结果"
              required
              value={draft}
              placeholder="写清怎么整改的、谁核查的"
              maxLength={2000}
              onInput={onDraft}
            />
          </Sheet>
          {errorAtCard ? <Notice tone="error">{error}</Notice> : null}
          <Button
            loading={closing}
            disabled={busy || !draft.trim()}
            onClick={onResolve}
          >
            {closing ? "关闭中…" : "确认整改并关闭"}
          </Button>
        </View>
      ) : null}
      {index + 1 < waiting.length ? (
        <Sheet gap>{waiting.slice(index + 1).map(collapsed)}</Sheet>
      ) : null}
      {done.map((issue) => (
        <Card key={issue.id} gap stamped>
          <CardTitle>{place(issue)}</CardTitle>
          <CardMeta>
            {workDateLabel(issue.workDate)}，
            {severityStatus(issue.severity).text}隐患
          </CardMeta>
          <View className="team-safety__text">{issue.description}</View>
          <CardMeta>整改结果：{issue.resolution ?? "没有填写"}</CardMeta>
          <Stamp
            text="已整改"
            sub={
              issue.resolvedAt
                ? workTimestamp(issue.resolvedAt).slice(0, 5)
                : undefined
            }
          />
        </Card>
      ))}
      {error !== null && !errorAtCard ? (
        <Notice tone="error">{error}</Notice>
      ) : null}
      {hasMore ? (
        <Button
          variant="outline"
          wide
          loading={loadingMore}
          disabled={busy}
          onClick={onMore}
        >
          {loadingMore ? "加载中…" : "加载更多"}
        </Button>
      ) : null}
      <Links>
        <Button variant="text" disabled={busy} onClick={onRecord}>
          记录一条新隐患
        </Button>
      </Links>
    </>
  );
};
