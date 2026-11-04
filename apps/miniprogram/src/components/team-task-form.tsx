import { Picker, View } from "@tarojs/components";
import { useState, type ReactNode } from "react";
import type { TeamTaskDetails } from "@construction/domain";
import { Button, Field, ListItem, Notice, Subtitle } from "./ui/index";
import { WorkDate, WorkNotes, WorkTime } from "./team-work-fields";
import { taskChinaParts } from "../services/team-task-draft";

export const TeamTaskForm = ({
  initialValue,
  children,
  busy,
  onSave,
  submitLabel,
  timeNotice,
  workTypes,
}: {
  readonly initialValue: TeamTaskDetails;
  readonly children?: ReactNode;
  readonly busy: boolean;
  readonly onSave: (details: TeamTaskDetails) => Promise<void>;
  readonly submitLabel: string;
  readonly timeNotice: string | null;
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
    const duration: number = Date.parse(endsAt) - Date.parse(startsAt);
    if (!title.trim()) {
      setError("请填写工作内容。");
      return;
    }
    if (!Number.isFinite(duration) || duration <= 0 || duration > 86400000) {
      setShowTime(true);
      setError(
        "结束须晚于开始，最长 24 小时；夜班选次日。",
      );
      return;
    }
    if (Date.parse(endsAt) <= Date.now()) {
      setShowTime(true);
      setError("结束时间已过去，请重新选择。");
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
  return (
    <>
      <Field
        label="工作内容"
        value={title}
        onInput={setTitle}
        placeholder="如：3 号楼照明维修"
        maxLength={80}
        disabled={busy}
      />
      {children}
      <ListItem
        primary="时间安排"
        secondary={`${startDate} ${startTime} — ${startDate === endDate ? "" : `${endDate}（次日） `}${endTime}`}
        chip={showTime ? "收起" : "修改"}
        onClick={() => setShowTime(!showTime)}
      />
      {unchangedTime && timeNotice && <Notice>{timeNotice}</Notice>}
      {showTime && (
        <View>
          <Subtitle>开始日期</Subtitle>
          <WorkDate
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
          <WorkTime
            label="开始时间"
            value={startTime}
            onChange={setStartTime}
          />
          <Subtitle>结束日期</Subtitle>
          <WorkDate value={endDate} onChange={setEndDate} />
          <WorkTime label="结束时间" value={endTime} onChange={setEndTime} />
        </View>
      )}
      <ListItem
        primary="补充信息"
        secondary={
          [workType, description].filter(Boolean).join(" · ") || "选填"
        }
        chip={showNotes ? "收起" : "修改"}
        onClick={() => setShowNotes(!showNotes)}
      />
      {showNotes && (
        <>
          <Picker
            mode="selector"
            range={["不指定工种", ...trades, "自定义工种"]}
            onChange={(event) => {
              const index: number = Number(event.detail.value);
              setCustomTrade(index === trades.length + 1);
              if (index <= trades.length)
                setWorkType(index === 0 ? "" : trades[index - 1]);
            }}
          >
            <ListItem primary="工种" chip={workType || "选择"} />
          </Picker>
          {customTrade && (
            <Field
              label="工种（选填）"
              value={workType}
              onInput={setWorkType}
              placeholder="例如：电工"
              maxLength={50}
            />
          )}
          <WorkNotes
            label="备注（选填）"
            value={description}
            onChange={setDescription}
          />
        </>
      )}
      {error && <Notice>{error}</Notice>}
      <Button
        loading={busy}
        disabled={busy}
        onClick={() => {
          void save();
        }}
      >
        {submitLabel}
      </Button>
    </>
  );
};
