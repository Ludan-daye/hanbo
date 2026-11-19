import { Picker, View } from "@tarojs/components";
import type { TeamTask } from "@construction/domain";
import {
  CardMeta,
  CardTitle,
  DateSwitch,
  FormArea,
  FormRow,
  Sheet,
} from "./ui/index";
import "./team-work-fields.scss";

const WEEKDAY = "日一二三四五六";
const shiftDay = (value: string, days: number): string => {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
/** “11月18日 周三”。 */
export const workDateLabel = (value: string): string => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? value
    : `${date.getUTCMonth() + 1}月${date.getUTCDate()}日 周${WEEKDAY[date.getUTCDay()]}`;
};

/**
 * 选日期。不传 label 时是页面顶上的日期切换（前一天、后一天，点中间选日期）；
 * 传了 label 就是表单里的一行，放在 Sheet 里。
 */
export const WorkDate = ({
  value,
  onChange,
  label,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly label?: string;
}): JSX.Element =>
  label === undefined ? (
    <DateSwitch
      label={
        <Picker
          mode="date"
          value={value}
          onChange={(event) => onChange(String(event.detail.value))}
        >
          <View className="work-date__label">{workDateLabel(value)}</View>
        </Picker>
      }
      onPrev={() => onChange(shiftDay(value, -1))}
      onNext={() => onChange(shiftDay(value, 1))}
    />
  ) : (
    <Picker
      mode="date"
      value={value}
      onChange={(event) => onChange(String(event.detail.value))}
    >
      <FormRow label={label} value={workDateLabel(value)} chevron />
    </Picker>
  );
/** 选时间：表单里的一行，放在 Sheet 里。 */
export const WorkTime = ({
  label,
  value,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}): JSX.Element => (
  <Picker
    mode="time"
    value={value}
    onChange={(event) => onChange(String(event.detail.value))}
  >
    <FormRow label={label} value={value} placeholder="请选择" chevron />
  </Picker>
);
/** 多行说明：自带白条，直接放在页面上。要放进已有的 Sheet 时改用 FormArea。 */
export const WorkNotes = ({
  label,
  value,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}): JSX.Element => (
  <Sheet gap>
    <FormArea
      label={label}
      value={value}
      maxLength={2000}
      placeholder="请填写具体内容"
      onInput={onChange}
    />
  </Sheet>
);
export const workTimestamp = (value: string): string => {
  const china: Date = new Date(new Date(value).getTime() + 8 * 3600000);
  return china.toISOString().slice(5, 16).replace("T", " ");
};
export const taskStatusLabel = (status: TeamTask["status"]): string =>
  ({ OPEN: "待完成", COMPLETED: "已完成", CANCELLED: "已取消" })[status];
/** 一项任务的基本情况：放在 Card 里。 */
export const TaskDetails = ({
  task,
}: {
  readonly task: TeamTask;
}): JSX.Element => (
  <>
    <CardTitle status={{ text: taskStatusLabel(task.status) }}>
      {task.title}
    </CardTitle>
    <CardMeta>
      {task.projectName}，{task.teamName}
    </CardMeta>
    <CardMeta>
      {task.workType ? `${task.workType}，` : ""}负责人 {task.supervisorName}
    </CardMeta>
    <CardMeta>
      {workTimestamp(task.startsAt)} 到 {workTimestamp(task.endsAt)}，约{" "}
      {(
        (Date.parse(task.endsAt) - Date.parse(task.startsAt)) /
        3600000
      ).toFixed(1)}{" "}
      小时
    </CardMeta>
    {task.description && (
      <View className="work-content">{task.description}</View>
    )}
  </>
);
