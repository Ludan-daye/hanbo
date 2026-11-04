import { useEffect, useState } from "react";
import type {
  TeamTaskTemplate,
  TeamTaskTemplatePage,
} from "@construction/domain";
import {
  Button,
  Field,
  ListItem,
  Notice,
  Section,
  StateView,
} from "./ui/index";
import { fetchTeamTaskTemplates } from "../services/team-work";
import { workTimestamp } from "./team-work-fields";

export const TeamTaskTemplates = ({
  teamId,
  disabled,
  onSelect,
  onClose,
}: {
  readonly teamId: string;
  readonly disabled: boolean;
  readonly onSelect: (template: TeamTaskTemplate) => void;
  readonly onClose: () => void;
}): JSX.Element => {
  const [search, setSearch] = useState<string>("");
  const [page, setPage] = useState<TeamTaskTemplatePage | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState<number>(0);
  useEffect(() => {
    let active: boolean = true;
    setPage(null);
    setError(null);
    const timer: ReturnType<typeof setTimeout> = setTimeout(() => {
      void fetchTeamTaskTemplates(teamId, null, search.trim()).then(
        (result) => {
          if (active) setPage(result);
        },
        (cause: unknown) => {
          if (active)
            setError(
              cause instanceof Error ? cause.message : "历史安排读取失败",
            );
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
    setBusy(true);
    setError(null);
    try {
      const result = await fetchTeamTaskTemplates(
        teamId,
        page.nextCursor,
        search.trim(),
      );
      setPage({
        items: [...page.items, ...result.items],
        nextCursor: result.nextCursor,
      });
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "历史安排读取失败");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section title="历史安排">
      <Field
        value={search}
        onInput={setSearch}
        placeholder="搜索工作内容、工种"
        maxLength={80}
        disabled={busy}
      />
      {error && <Notice>{error}</Notice>}
      {page === null ? (
        <StateView
          title={error ? "读取失败" : "正在读取…"}
          onRetry={() => setRevision((value) => value + 1)}
        />
      ) : page.items.length === 0 ? (
        <StateView title={search ? "无匹配安排" : "暂无历史安排"} />
      ) : (
        page.items.map((item) => (
          <ListItem
            key={item.id}
            primary={item.title}
            secondary={`${workTimestamp(item.startsAt)} · ${item.workType || "未指定工种"} · ${item.previousMemberCount} 人`}
            chip="套用"
            onClick={() => {
              if (!disabled && !busy) onSelect(item);
            }}
          />
        ))
      )}
      {page?.nextCursor && (
        <Button
          variant="outline"
          loading={busy}
          disabled={busy}
          onClick={() => {
            void more();
          }}
        >
          更多历史安排
        </Button>
      )}
      <Button variant="outline" onClick={onClose}>
        返回
      </Button>
    </Section>
  );
};
