import {
  BottomBar,
  Button,
  Notice,
  Row,
  Say,
  SectionTitle,
  Sheet,
  Stamp,
  type StatusKind,
} from "../../../components/ui";
import type { AttendanceTodayPoint } from "../../../services/me.types";
import { distanceText } from "../punch-stage";

type PointRow = AttendanceTodayPoint & {
  readonly status: { readonly kind: StatusKind; readonly text: string };
};

/** 打卡结果：正常就是一个红章；记成异常时不盖章，说明去哪里看原因。 */
export const ResultView = ({
  card,
  time,
  abnormal,
  alreadyRecorded,
  place,
  distanceM,
  demo,
  nextCard,
  onHome,
  onRecords,
  onContinue,
}: {
  readonly card: string;
  readonly time: string;
  readonly abnormal: boolean;
  /** 保存时发现这张卡之前已经有记录了。 */
  readonly alreadyRecorded: boolean;
  /** 项目和班组。 */
  readonly place: string;
  readonly distanceM: number | null;
  readonly demo: boolean;
  /** 今天还没打的下一张卡，例如“下班 17:30”；都打完了为 null。 */
  readonly nextCard: string | null;
  readonly onHome: () => void;
  readonly onRecords: () => void;
  readonly onContinue: () => void;
}): JSX.Element => {
  const rest = (
    <Sheet gap>
      {distanceM !== null ? (
        <Row
          title="位置"
          value={`范围内，距中心 ${distanceText(distanceM)}`}
          mute
        />
      ) : null}
      {alreadyRecorded ? null : demo ? (
        <Row title="人脸核验" value="演示，没有比对" mute />
      ) : (
        <Row title="人脸核验" status={{ kind: "ok", text: "通过" }} />
      )}
      {nextCard !== null ? (
        <Row title="下一张卡" value={nextCard} chevron onClick={onContinue} />
      ) : (
        <Row title="下一张卡" value="今天的卡都打了" mute />
      )}
    </Sheet>
  );
  if (abnormal)
    return (
      <>
        <Say
          title="卡打了，但记成了异常"
          sub={`${card} ${time}。到今天的记录里看原因，情况属实可以申请补卡。`}
        />
        {rest}
        <BottomBar primary="看今天的记录" onPrimary={onRecords}>
          <Button variant="outline" onClick={onHome}>
            回首页
          </Button>
        </BottomBar>
      </>
    );
  return (
    <>
      <Stamp size="lg" play text="已打卡" sub={time} />
      <Say
        center
        title={alreadyRecorded ? `${card}之前已经打过了` : `${card}打好了`}
        sub={place}
      />
      {rest}
      <BottomBar primary="回首页" onPrimary={onHome}>
        <Button variant="outline" onClick={onRecords}>
          今天的记录
        </Button>
      </BottomBar>
    </>
  );
};

const grace = (point: AttendanceTodayPoint): string =>
  point.kind === "START"
    ? `迟到宽限 ${point.graceMins} 分钟`
    : point.kind === "END"
      ? `早退宽限 ${point.graceMins} 分钟`
      : `宽限 ${point.graceMins} 分钟`;

/** 今天的卡：换一张卡打，或者去加班打卡。平时用不到，所以收在这一页。 */
export const PointsView = ({
  shiftName,
  points,
  selectedCode,
  canSelect,
  overtime,
  onSelect,
  onOvertime,
  onOvertimeMakeup,
}: {
  readonly shiftName: string | null;
  readonly points: ReadonlyArray<PointRow>;
  readonly selectedCode: string | null;
  readonly canSelect: (pointCode: string) => boolean;
  /** 能不能在常规和加班之间切换；按任务打卡时为 null。 */
  readonly overtime: { readonly active: boolean } | null;
  readonly onSelect: (pointCode: string) => void;
  readonly onOvertime: () => void;
  readonly onOvertimeMakeup: () => void;
}): JSX.Element => (
  <>
    <SectionTitle>{shiftName ?? "今天的安排"}</SectionTitle>
    <Sheet>
      {points.map((point) => {
        const open = point.record === null && canSelect(point.pointCode);
        const current = point.pointCode === selectedCode;
        return (
          <Row
            key={point.pointCode}
            title={point.label}
            titleNum={point.scheduledTime}
            sub={grace(point)}
            status={open && !current ? undefined : point.status}
            value={open && !current ? "换成这张" : undefined}
            mute
            chevron={open && !current}
            onClick={open ? () => onSelect(point.pointCode) : undefined}
          />
        );
      })}
    </Sheet>
    {overtime !== null ? (
      <>
        <SectionTitle>加班</SectionTitle>
        <Sheet>
          <Row
            title={overtime.active ? "回到常规打卡" : "加班打卡"}
            chevron
            onClick={onOvertime}
          />
          {overtime.active ? (
            <Row title="加班补卡" chevron onClick={onOvertimeMakeup} />
          ) : null}
        </Sheet>
      </>
    ) : null}
    <Notice>打卡要求由班组长或项目管理员设置。</Notice>
  </>
);

/** 现在打不了卡，或者没读到：一句结论，说明原因，给一个去处。 */
export const MessageView = ({
  title,
  sub,
  problem,
  points,
  primary,
  secondary,
}: {
  readonly title: string;
  readonly sub?: string;
  /** 读取失败的原因。 */
  readonly problem?: string | null;
  readonly points?: ReadonlyArray<PointRow>;
  readonly primary?: { readonly label: string; readonly onClick: () => void };
  readonly secondary?: { readonly label: string; readonly onClick: () => void };
}): JSX.Element => (
  <>
    <Say title={title} sub={sub} />
    {problem ? <Notice tone="error">{problem}</Notice> : null}
    {points && points.length > 0 ? (
      <Sheet gap>
        {points.map((point) => (
          <Row
            key={point.pointCode}
            title={point.label}
            titleNum={point.scheduledTime}
            status={point.status}
          />
        ))}
      </Sheet>
    ) : null}
    {primary ? (
      <BottomBar primary={primary.label} onPrimary={primary.onClick}>
        {secondary ? (
          <Button variant="outline" onClick={secondary.onClick}>
            {secondary.label}
          </Button>
        ) : null}
      </BottomBar>
    ) : null}
  </>
);
