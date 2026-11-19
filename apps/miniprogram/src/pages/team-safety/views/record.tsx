import { Picker, View } from "@tarojs/components";
import type { SafetyIssue } from "@construction/domain";

import {
  BottomBar,
  Chips,
  FormArea,
  FormRow,
  Notice,
  SearchField,
  Sheet,
} from "../../../components/ui";
import { WorkDate } from "../../../components/team-work-fields";

type Severity = SafetyIssue["severity"];
const SEVERITIES: ReadonlyArray<{
  readonly value: Severity;
  readonly label: string;
}> = [
  { value: "GENERAL", label: "一般" },
  { value: "SERIOUS", label: "严重" },
];

/** 记录隐患：关联到人或者只记在班组现场，写清问题和要求。 */
export const RecordView = ({
  search,
  people,
  personIndex,
  personName,
  severity,
  date,
  description,
  error,
  busy,
  saving,
  onSearch,
  onPerson,
  onSeverity,
  onDate,
  onDescription,
  onSave,
}: {
  /** 人多时先搜再选；不需要搜索时为 null。 */
  readonly search: string | null;
  /** 选择器里的选项，第一项是“班组现场”。 */
  readonly people: readonly string[];
  readonly personIndex: number;
  readonly personName: string;
  readonly severity: Severity;
  readonly date: string;
  readonly description: string;
  readonly error: string | null;
  readonly busy: boolean;
  readonly saving: boolean;
  readonly onSearch: (value: string) => void;
  readonly onPerson: (index: number) => void;
  readonly onSeverity: (value: Severity) => void;
  readonly onDate: (value: string) => void;
  readonly onDescription: (value: string) => void;
  readonly onSave: () => void;
}): JSX.Element => (
  <>
    {search !== null ? (
      <SearchField
        value={search}
        placeholder="先搜姓名或手机号，再选人"
        onInput={onSearch}
      />
    ) : null}
    <Sheet gap>
      <View className="team-safety__pick">
        <Picker
          mode="selector"
          range={[...people]}
          value={personIndex}
          onChange={(event) => onPerson(Number(event.detail.value))}
        >
          <FormRow label="关联人员" value={personName} chevron />
        </Picker>
      </View>
      <FormRow label="严重程度">
        <Chips
          onSheet
          options={SEVERITIES}
          selected={[severity]}
          onToggle={onSeverity}
        />
      </FormRow>
      <View className="team-safety__pick">
        <WorkDate label="发现日期" value={date} onChange={onDate} />
      </View>
      <FormArea
        label="发现的问题和要求"
        required
        value={description}
        placeholder="写清在哪里、什么问题、要怎么改"
        maxLength={2000}
        onInput={onDescription}
      />
    </Sheet>
    {error ? <Notice tone="error">{error}</Notice> : null}
    <BottomBar
      primary={saving ? "保存中…" : "保存隐患"}
      busy={busy}
      disabled={!description.trim()}
      onPrimary={onSave}
    />
  </>
);
