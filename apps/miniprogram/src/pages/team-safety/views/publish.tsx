import {
  BottomBar,
  Button,
  FormArea,
  FormInput,
  Links,
  Notice,
  Sheet,
  SignLine,
} from "../../../components/ui";
import { workDateLabel } from "../../../components/team-work-fields";

/** 发布交底：发出去就不能改，所以先说清发给谁、哪一天。 */
export const PublishView = ({
  teamName,
  date,
  title,
  content,
  error,
  busy,
  publishing,
  reusing,
  onTitle,
  onContent,
  onReuse,
  onPublish,
}: {
  readonly teamName: string | null;
  readonly date: string;
  readonly title: string;
  readonly content: string;
  readonly error: string | null;
  readonly busy: boolean;
  readonly publishing: boolean;
  readonly reusing: boolean;
  readonly onTitle: (value: string) => void;
  readonly onContent: (value: string) => void;
  readonly onReuse: () => void;
  readonly onPublish: () => void;
}): JSX.Element => (
  <>
    <SignLine
      title={`发给${teamName ?? "本班工人"}`}
      sub={`${workDateLabel(date)}。发布后不能修改，要补充只能另发一条`}
    />
    <Sheet gap>
      <FormInput
        label="标题"
        required
        value={title}
        placeholder="例如：今日高处作业注意事项"
        maxLength={80}
        onInput={onTitle}
      />
      <FormArea
        label="内容"
        required
        value={content}
        placeholder="写清今天的作业风险和要求"
        maxLength={2000}
        onInput={onContent}
      />
    </Sheet>
    <Links>
      <Button variant="text" disabled={busy} onClick={onReuse}>
        {reusing ? "读取中…" : "套用前一天的交底"}
      </Button>
    </Links>
    {error ? <Notice tone="error">{error}</Notice> : null}
    <BottomBar
      primary={publishing ? "发布中…" : "发布给本班工人"}
      busy={busy}
      disabled={!title.trim() || !content.trim()}
      onPrimary={onPublish}
    />
  </>
);
