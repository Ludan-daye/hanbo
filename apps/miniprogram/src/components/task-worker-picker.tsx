import { useState } from "react";
import type { TeamTaskWorker } from "@construction/domain";

import {
  filterWorkers,
  toggleAllWorkers,
  toggleWorker,
  workerTrades,
} from "../pages/team-work/task-view";
import {
  Check,
  Chips,
  Row,
  SearchField,
  SectionTitle,
  Sheet,
  SkeletonRows,
  StateView,
} from "./ui/index";

const ALL_TRADES = "__all__";

/**
 * 选人：搜索、按工种筛、勾选。勾选是即时生效的；
 * “确定”按钮由用它的视图放在底部操作条里，上面写着已经选了几个人。
 */
export const TaskWorkerPicker = ({
  workers,
  selectedIds,
  assignedIds,
  disabled,
  onChange,
}: {
  readonly workers: readonly TeamTaskWorker[] | null;
  readonly selectedIds: readonly string[];
  /** 已经在这项安排里的人：照样列出来，但不能再选。 */
  readonly assignedIds: readonly string[];
  readonly disabled: boolean;
  readonly onChange: (ids: readonly string[]) => void;
}): JSX.Element => {
  const [search, setSearch] = useState<string>("");
  const [trade, setTrade] = useState<string>("");
  if (workers === null) return <SkeletonRows rows={4} gap />;
  const trades = workerTrades(workers);
  const visible = filterWorkers(workers, search, trade);
  const all = toggleAllWorkers(selectedIds, visible, assignedIds);
  const filtering = search.trim() !== "" || trade !== "";
  return (
    <>
      <SearchField
        value={search}
        placeholder="搜索姓名、工种或手机尾号"
        onInput={setSearch}
      />
      {trades.length > 1 ? (
        <Chips
          options={[
            { value: ALL_TRADES, label: "全部工种" },
            ...trades.map((name) => ({ value: name, label: name })),
          ]}
          selected={[trade === "" ? ALL_TRADES : trade]}
          onToggle={(value) => setTrade(value === ALL_TRADES ? "" : value)}
        />
      ) : null}
      <SectionTitle
        action={
          all === null || disabled
            ? undefined
            : all.allSelected
              ? "取消全选"
              : "全选"
        }
        onAction={() => {
          if (all !== null && !disabled) onChange(all.next);
        }}
      >
        {workers[0]
          ? `${workers[0].teamName}，在场 ${workers.length} 人`
          : "本班人员"}
      </SectionTitle>
      {visible.length === 0 ? (
        <StateView
          kind="empty"
          title={filtering ? "没有找到这样的人" : "班组里还没有人"}
          sub={
            filtering
              ? "换个关键字，或者看全部工种。"
              : "可以邀请临时工，或者请管理员把人加进班组。"
          }
        />
      ) : (
        <Sheet>
          {visible.map((worker) => {
            const assigned = assignedIds.includes(worker.memberId);
            return (
              <Row
                key={worker.memberId}
                title={worker.name}
                sub={[worker.workType, worker.phoneMasked]
                  .filter(Boolean)
                  .join(" ")}
                avatar={worker.name.slice(0, 1)}
                value={assigned ? "已在安排里" : undefined}
                mute
                onClick={
                  assigned || disabled
                    ? undefined
                    : () => onChange(toggleWorker(selectedIds, worker.memberId))
                }
              >
                {assigned ? null : (
                  <Check checked={selectedIds.includes(worker.memberId)} />
                )}
              </Row>
            );
          })}
        </Sheet>
      )}
    </>
  );
};
