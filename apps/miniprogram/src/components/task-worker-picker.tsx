import { useState } from "react";
import {
  Checkbox,
  CheckboxGroup,
  Label,
  Picker,
  View,
} from "@tarojs/components";
import type { TeamTaskWorker } from "@construction/domain";
import {
  Button,
  Field,
  ListItem,
  Section,
  StateView,
  Subtitle,
} from "./ui/index";
import "./task-worker-picker.scss";

export const TaskWorkerPicker = ({
  workers,
  selectedIds,
  assignedIds,
  disabled,
  onChange,
}: {
  readonly workers: readonly TeamTaskWorker[] | null;
  readonly selectedIds: readonly string[];
  readonly assignedIds: readonly string[];
  readonly disabled: boolean;
  readonly onChange: (ids: readonly string[]) => void;
}): JSX.Element => {
  const [search, setSearch] = useState<string>("");
  const [trade, setTrade] = useState<string>("");
  const trades: readonly string[] = [
    ...new Set(workers?.map((worker) => worker.workType) ?? []),
  ];
  const keyword: string = search.trim().toLowerCase();
  const visible: readonly TeamTaskWorker[] =
    workers?.filter(
      (worker) =>
        (trade === "" || worker.workType === trade) &&
        `${worker.name} ${worker.workType} ${worker.phoneMasked}`
          .toLowerCase()
          .includes(keyword),
    ) ?? [];
  return (
    <Section title={`班组人员 · 已选 ${selectedIds.length} 人`}>
      {workers === null ? (
        <StateView title="正在读取人员…" />
      ) : (
        <>
          {workers[0] && (
            <Subtitle>
              {workers[0].projectName} · {workers[0].teamName}
            </Subtitle>
          )}
          <Field
            value={search}
            onInput={setSearch}
            placeholder="搜索姓名、工种或手机尾号"
            disabled={disabled}
          />
          <Picker
            mode="selector"
            range={["全部工种", ...trades]}
            onChange={(event) =>
              setTrade(
                Number(event.detail.value) === 0
                  ? ""
                  : trades[Number(event.detail.value) - 1],
              )
            }
          >
            <ListItem primary="工种筛选" chip={trade || "全部工种"} />
          </Picker>
          {visible.some((worker) => !assignedIds.includes(worker.memberId)) && (
            <Button
              variant="outline"
              disabled={disabled}
              onClick={() => {
                const ids: readonly string[] = visible
                  .filter((worker) => !assignedIds.includes(worker.memberId))
                  .map((worker) => worker.memberId);
                onChange(
                  ids.every((id) => selectedIds.includes(id))
                    ? selectedIds.filter((id) => !ids.includes(id))
                    : [...new Set([...selectedIds, ...ids])],
                );
              }}
            >
              {visible
                .filter((worker) => !assignedIds.includes(worker.memberId))
                .every((worker) => selectedIds.includes(worker.memberId))
                ? "取消全选"
                : "全选"}
            </Button>
          )}
          {visible.length === 0 ? (
            <StateView
              title={keyword || trade ? "无匹配人员" : "暂无班组人员"}
              sub={
                keyword || trade
                  ? undefined
                  : "可邀请临时工，或联系管理员添加人员。"
              }
            />
          ) : (
            <CheckboxGroup
              onChange={(event) => {
                if (disabled) return;
                const visibleIds: readonly string[] = visible.map(
                  (worker) => worker.memberId,
                );
                onChange([
                  ...selectedIds.filter((id) => !visibleIds.includes(id)),
                  ...event.detail.value.filter(
                    (id) => !assignedIds.includes(id),
                  ),
                ]);
              }}
            >
              {visible.map((worker) => {
                const assigned: boolean = assignedIds.includes(worker.memberId);
                const selected: boolean = selectedIds.includes(worker.memberId);
                return (
                  <Label
                    key={worker.memberId}
                    className={`task-worker-option${selected ? " task-worker-option--selected" : ""}`}
                  >
                    <Checkbox
                      value={worker.memberId}
                      checked={selected || assigned}
                      disabled={disabled || assigned}
                      color="#111820"
                    />
                    <View className="task-worker-option__person">
                      <View>{worker.name}</View>
                      <View className="task-worker-option__detail">
                        {worker.workType} · {worker.phoneMasked}
                      </View>
                    </View>
                    <View className="task-worker-option__status">
                      {assigned ? "已在任务中" : selected ? "已选择" : ""}
                    </View>
                  </Label>
                );
              })}
            </CheckboxGroup>
          )}
        </>
      )}
    </Section>
  );
};
