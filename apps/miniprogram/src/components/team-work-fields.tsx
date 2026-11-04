import { Picker, Textarea, View } from "@tarojs/components";
import type { TeamTask } from "@construction/domain";
import { ListItem, Subtitle } from "./ui/index";
import "./team-work-fields.scss";

export const WorkDate = ({
  value,
  onChange,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
}): JSX.Element => (
  <Picker
    mode="date"
    value={value}
    onChange={(event) => onChange(String(event.detail.value))}
  >
    <ListItem primary={value} chip="选择日期" />
  </Picker>
);
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
    <ListItem primary={label} chip={value} />
  </Picker>
);
export const WorkNotes = ({
  label,
  value,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}): JSX.Element => (
  <View className="work-notes">
    <View className="ui-field-label">{label}</View>
    <Textarea
      className="work-notes__input"
      value={value}
      maxlength={2000}
      placeholder="请填写具体内容"
      onInput={(event) => onChange(event.detail.value)}
    />
  </View>
);
export const workTimestamp = (value: string): string => {
  const china: Date = new Date(new Date(value).getTime() + 8 * 3600000);
  return china.toISOString().slice(5, 16).replace("T", " ");
};
export const taskStatusLabel = (status: TeamTask["status"]): string =>
  ({ OPEN: "待完成", COMPLETED: "已完成", CANCELLED: "已取消" })[status];
export const TaskDetails = ({
  task,
}: {
  readonly task: TeamTask;
}): JSX.Element => (
  <>
    <ListItem
      primary={task.title}
      secondary={`${task.projectName} · ${task.teamName}`}
      chip={taskStatusLabel(task.status)}
    />
    <Subtitle>
      {task.workType ? `${task.workType} · ` : ""}负责人 {task.supervisorName}
    </Subtitle>
    <Subtitle>
      {workTimestamp(task.startsAt)} 至 {workTimestamp(task.endsAt)} · 预计{" "}
      {(
        (Date.parse(task.endsAt) - Date.parse(task.startsAt)) /
        3600000
      ).toFixed(1)}{" "}
      小时
    </Subtitle>
    {task.description && (
      <View className="work-content">{task.description}</View>
    )}
  </>
);
