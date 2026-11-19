import { useEffect, useRef, useState } from "react";
import type {
  TeamTaskTemplate,
  TeamTaskTemplatePage,
} from "@construction/domain";

import { errorMessage } from "../services/error-messages";
import { fetchTeamTaskTemplates } from "../services/team-work";
import { workTimestamp } from "./team-work-fields";
import {
  Button,
  Notice,
  Row,
  SearchField,
  Sheet,
  SkeletonRows,
  StateView,
} from "./ui/index";

/** 套用历史：以前排过的工作，点一条就按它新建。返回由页头的返回键负责。 */
export const TeamTaskTemplates = ({
  teamId,
  disabled,
  onSelect,
}: {
  readonly teamId: string;
  readonly disabled: boolean;
  readonly onSelect: (template: TeamTaskTemplate) => void;
}): JSX.Element => {
  const [search, setSearch] = useState<string>("");
  const [page, setPage] = useState<TeamTaskTemplatePage | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState<number>(0);
  // 搜索词一变就是一次新的查询：上一次查询里还没回来的“更早的”不能再接到新结果后面。
  const query = useRef<number>(0);
  useEffect(() => {
    let active: boolean = true;
    query.current += 1;
    setPage(null);
    setError(null);
    const timer: ReturnType<typeof setTimeout> = setTimeout(() => {
      void fetchTeamTaskTemplates(teamId, null, search.trim()).then(
        (result) => {
          if (active) setPage(result);
        },
        (cause: unknown) => {
          if (active) setError(errorMessage(cause, "历史安排读取失败"));
        },
      );
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [teamId, search, revision]);
  const more = async (): Promise<void> => {
    if (!page?.nextCursor || busy) return;
    const current = query.current;
    setBusy(true);
    setError(null);
    try {
      const result = await fetchTeamTaskTemplates(
        teamId,
        page.nextCursor,
        search.trim(),
      );
      if (current === query.current)
        setPage({
          items: [...page.items, ...result.items],
          nextCursor: result.nextCursor,
        });
    } catch (cause: unknown) {
      if (current === query.current)
        setError(errorMessage(cause, "历史安排读取失败"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <SearchField
        value={search}
        placeholder="搜索工作内容、工种"
        onInput={(value) => setSearch(value.slice(0, 80))}
      />
      {page === null ? (
        error !== null ? (
          <StateView
            kind="error"
            title="历史安排没读到"
            sub={error}
            onRetry={() => setRevision((value) => value + 1)}
          />
        ) : (
          <SkeletonRows rows={4} gap />
        )
      ) : page.items.length === 0 ? (
        <StateView
          kind="empty"
          title={search.trim() ? "没有找到这样的安排" : "还没有排过工作"}
          sub={search.trim() ? "换个关键字试试。" : "发布过的安排会留在这里。"}
        />
      ) : (
        <Sheet gap>
          {page.items.map((item) => (
            <Row
              key={item.id}
              title={item.title}
              sub={`${workTimestamp(item.startsAt)}，${item.workType || "没指定工种"}，${item.previousMemberCount} 人`}
              chevron
              onClick={() => {
                if (!disabled && !busy) onSelect(item);
              }}
            />
          ))}
        </Sheet>
      )}
      {page !== null && error !== null ? (
        <Notice tone="error">{error}</Notice>
      ) : null}
      {page?.nextCursor ? (
        <Button
          variant="outline"
          wide
          loading={busy}
          onClick={() => {
            void more();
          }}
        >
          {busy ? "读取中…" : "再看更早的"}
        </Button>
      ) : null}
      {page !== null && page.items.length > 0 ? (
        <Notice>
          套用后日期是你正在看的那天。已经离场的人和临时工不会带过来。
        </Notice>
      ) : null}
    </>
  );
};
