import { Picker, View } from "@tarojs/components";
import { useState, type ReactNode } from "react";
import type { TeamTaskDetails } from "@construction/domain";

import { dayTimeRange } from "../pages/team-work/task-view";
import { taskChinaParts } from "../services/team-task-draft";
import { chinaToday } from "../services/time";
import { WorkDate, WorkTime } from "./team-work-fields";
import {
  BottomBar,
  FormArea,
  FormInput,
  FormRow,
  Notice,
  Sheet,
} from "./ui/index";

/**
 * 一项工作安排的表单：新建和修改共用。
 * 填的内容存在组件自己这里；去“选择人员”时把 hidden 设为真，
 * 组件不卸载、只是不显示，回来时填过的东西都还在。
 * 样式类（team-work-*）在 pages/team-work/index.scss。
 */
export const TeamTaskForm = ({
  initialValue,
  people,
  children,
  busy,
  hidden,
  onSave,
  submitLabel,
  timeNotice,
  problem,
  workTypes,
}: {
  readonly initialValue: TeamTaskDetails;
  /** “安排人员”那一行，放在工作内容下面。修改时没有。 */
  readonly people?: ReactNode;
  /** 表单下面另起的内容，例如“发布后邀请临时工”。 */
  readonly children?: ReactNode;
  readonly busy: boolean;
  readonly hidden?: boolean;
  readonly onSave: (details: TeamTaskDetails) => Promise<void>;
  /** 提交中由调用方换成“…中”。 */
  readonly submitLabel: string;
  readonly timeNotice: string | null;
  /** 提交没成功的原因，显示在按钮上方。 */
  readonly problem?: string | null;
  readonly workTypes: readonly string[];
}): JSX.Element => {
  const [title, setTitle] = useState<string>(initialValue.title);
  const [workType, setWorkType] = useState<string>(initialValue.workType);
  const [description, setDescription] = useState<string>(
    initialValue.description,
  );
  const [startDate, setStartDate] = useState<string>(
    taskChinaParts(initialValue.startsAt)[0],
  );
  const [endDate, setEndDate] = useState<string>(
    taskChinaParts(initialValue.endsAt)[0],
  );
  const [startTime, setStartTime] = useState<string>(
    taskChinaParts(initialValue.startsAt)[1],
  );
  const [endTime, setEndTime] = useState<string>(
    taskChinaParts(initialValue.endsAt)[1],
  );
  const [showTime, setShowTime] = useState<boolean>(
    Date.parse(initialValue.endsAt) <= Date.now(),
  );
  const [showNotes, setShowNotes] = useState<boolean>(false);
  const [customTrade, setCustomTrade] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [bad, setBad] = useState<"title" | "time" | null>(null);
  const trades: readonly string[] = [
    ...new Set([initialValue.workType, ...workTypes].filter(Boolean)),
  ];
  const startsAt: string = `${startDate}T${startTime}:00+08:00`;
  const endsAt: string = `${endDate}T${endTime}:00+08:00`;
  const unchangedTime: boolean =
    Date.parse(startsAt) === Date.parse(initialValue.startsAt) &&
    Date.parse(endsAt) === Date.parse(initialValue.endsAt);
  const save = async (): Promise<void> => {
    if (busy) return;
    setError(null);
    setBad(null);
    const duration: number = Date.parse(endsAt) - Date.parse(startsAt);
    if (!title.trim()) {
      setBad("title");
      setError("请填写工作内容。");
      return;
    }
    if (!Number.isFinite(duration) || duration <= 0 || duration > 86400000) {
      setShowTime(true);
      setBad("time");
      setError("结束要晚于开始，最长 24 小时。夜班的结束日期选次日。");
      return;
    }
    if (Date.parse(endsAt) <= Date.now()) {
      setShowTime(true);
      setBad("time");
      setError("结束时间已经过了，请重新选。");
      return;
    }
    await onSave({
      title: title.trim(),
      workType: workType.trim(),
      description: description.trim(),
      startsAt,
      endsAt,
    });
  };
  if (hidden) return <></>;
  return (
    <>
      <Sheet gap>
        <FormInput
          label="工作内容"
          required
          value={title}
          onInput={setTitle}
          placeholder="如：3 号楼照明维修"
          maxLength={80}
          disabled={busy}
          error={bad === "title" && !title.trim()}
        />
        {people}
        <FormRow
          label="时间"
          chevron
          error={bad === "time"}
          onClick={() => setShowTime(!showTime)}
        >
          <View className="team-work-value">
            {dayTimeRange(startDate, startTime, endDate, endTime, chinaToday())}
          </View>
        </FormRow>
        <View className="team-work-pick">
          <Picker
            mode="selector"
            range={["不指定工种", ...trades, "自定义工种"]}
            value={
              customTrade
                ? trades.length + 1
                : workType
                  ? trades.indexOf(workType) + 1
                  : 0
            }
            onChange={(event) => {
              const index: number = Number(event.detail.value);
              setCustomTrade(index === trades.length + 1);
              if (index <= trades.length)
                setWorkType(index === 0 ? "" : trades[index - 1]);
            }}
          >
            <FormRow
              label="工种"
              value={workType}
              placeholder={customTrade ? "自定义" : "选填"}
              chevron
            />
          </Picker>
        </View>
        {customTrade ? (
          <FormInput
            label="自定义工种"
            value={workType}
            onInput={setWorkType}
            placeholder="例如：电工"
            maxLength={50}
          />
        ) : null}
        {showNotes ? (
          <FormArea
            label="备注"
            value={description}
            placeholder="选填"
            maxLength={2000}
            onInput={setDescription}
          />
        ) : (
          <FormRow
            label="备注"
            placeholder="选填"
            chevron
            onClick={() => setShowNotes(true)}
          >
            {description ? (
              <View className="team-work-value">{description}</View>
            ) : undefined}
          </FormRow>
        )}
      </Sheet>
      {showTime ? (
        <View className="m-fade">
          <Sheet gap>
            <View className="team-work-pick">
              <WorkDate
                label="开始日期"
                value={startDate}
                onChange={(value) => {
                  const dayOffset: number =
                    Date.parse(`${value}T00:00:00Z`) -
                    Date.parse(`${startDate}T00:00:00Z`);
                  setStartDate(value);
                  setEndDate(
                    new Date(Date.parse(`${endDate}T00:00:00Z`) + dayOffset)
                      .toISOString()
                      .slice(0, 10),
                  );
                }}
              />
            </View>
            <View className="team-work-pick">
              <WorkTime
                label="开始时间"
                value={startTime}
                onChange={setStartTime}
              />
            </View>
            <View className="team-work-pick">
              <WorkDate
                label="结束日期"
                value={endDate}
                onChange={setEndDate}
              />
            </View>
            <View className="team-work-pick">
              <WorkTime
                label="结束时间"
                value={endTime}
                onChange={setEndTime}
              />
            </View>
          </Sheet>
        </View>
      ) : null}
      {children}
      <Notice>最长 24 小时，夜班结束时间选次日。</Notice>
      {unchangedTime && timeNotice ? (
        <Notice tone="warning">{timeNotice}</Notice>
      ) : null}
      {error ? (
        <Notice tone="error">{error}</Notice>
      ) : problem ? (
        <Notice tone="error">{problem}</Notice>
      ) : null}
      <BottomBar
        primary={submitLabel}
        busy={busy}
        onPrimary={() => {
          void save();
        }}
      />
    </>
  );
};
