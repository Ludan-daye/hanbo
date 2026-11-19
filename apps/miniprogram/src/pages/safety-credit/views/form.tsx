import { Picker, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import type { SafetySeverity } from "@construction/domain";

import {
  BottomBar,
  Chips,
  FormArea,
  FormInput,
  FormRow,
  Notice,
  Photo,
  PRESS,
  SearchField,
  SectionTitle,
  Sheet,
} from "../../../components/ui";
import { WorkDate, WorkTime } from "../../../components/team-work-fields";

const SEVERITIES: ReadonlyArray<{
  readonly value: SafetySeverity;
  readonly label: string;
}> = [
  { value: "GENERAL", label: "一般" },
  { value: "SERIOUS", label: "严重" },
  { value: "MAJOR", label: "重大" },
];
export const MAX_EVIDENCE = 5;

/** 登记违规：选人、写清情况、附上凭证照片，交给项目管理员审核。 */
export const ViolationForm = ({
  search,
  people,
  personIndex,
  personName,
  category,
  severity,
  date,
  time,
  description,
  photos,
  error,
  busy,
  uploading,
  submitting,
  complete,
  onSearch,
  onPerson,
  onCategory,
  onSeverity,
  onDate,
  onTime,
  onDescription,
  onAddPhoto,
  onRemovePhoto,
  onSubmit,
}: {
  /** 人多时先搜再选；不需要搜索时为 null。 */
  readonly search: string | null;
  readonly people: readonly string[];
  readonly personIndex: number;
  /** 已经选的人；还没选时为 null。 */
  readonly personName: string | null;
  readonly category: string;
  readonly severity: SafetySeverity;
  readonly date: string;
  readonly time: string;
  readonly description: string;
  readonly photos: ReadonlyArray<{
    readonly objectKey: string;
    readonly preview: string;
  }>;
  readonly error: string | null;
  readonly busy: boolean;
  readonly uploading: boolean;
  readonly submitting: boolean;
  /** 必填的都有了，可以提交。 */
  readonly complete: boolean;
  readonly onSearch: (value: string) => void;
  readonly onPerson: (index: number) => void;
  readonly onCategory: (value: string) => void;
  readonly onSeverity: (value: SafetySeverity) => void;
  readonly onDate: (value: string) => void;
  readonly onTime: (value: string) => void;
  readonly onDescription: (value: string) => void;
  readonly onAddPhoto: () => void;
  readonly onRemovePhoto: (objectKey: string) => void;
  readonly onSubmit: () => void;
}): JSX.Element => (
  <>
    {search !== null ? (
      <SearchField
        value={search}
        placeholder="先搜姓名，再选人"
        onInput={onSearch}
      />
    ) : null}
    <Sheet gap>
      <View className="safety-credit__pick">
        <Picker
          mode="selector"
          range={[...people]}
          value={personIndex}
          onChange={(event) => onPerson(Number(event.detail.value))}
        >
          <FormRow
            label="人员"
            required
            value={personName ?? undefined}
            placeholder="请选择"
            chevron
          />
        </Picker>
      </View>
      <FormInput
        label="违规类别"
        required
        value={category}
        placeholder="例如：未佩戴安全帽"
        maxLength={40}
        onInput={onCategory}
      />
      <FormRow label="严重程度">
        <Chips
          onSheet
          options={SEVERITIES}
          selected={[severity]}
          onToggle={onSeverity}
        />
      </FormRow>
      <View className="safety-credit__pick">
        <WorkDate label="发生日期" value={date} onChange={onDate} />
      </View>
      <View className="safety-credit__pick">
        <WorkTime label="发生时间" value={time} onChange={onTime} />
      </View>
      <FormArea
        label="情况说明"
        required
        value={description}
        placeholder="写清在哪里、做了什么、怎么处理的"
        maxLength={2000}
        onInput={onDescription}
      />
    </Sheet>
    <SectionTitle>{`凭证照片 ${photos.length} / ${MAX_EVIDENCE}`}</SectionTitle>
    <View className="safety-credit__photos">
      {photos.map((photo) => (
        <View key={photo.objectKey} className="safety-credit__photo">
          <Photo
            small
            src={photo.preview}
            onClick={() => {
              void Taro.previewImage({
                current: photo.preview,
                urls: photos.map((row) => row.preview),
              });
            }}
          />
          <View
            className="safety-credit__remove ui-press"
            {...PRESS}
            onClick={busy ? undefined : () => onRemovePhoto(photo.objectKey)}
          >
            移除
          </View>
        </View>
      ))}
      {photos.length < MAX_EVIDENCE ? (
        <View className="safety-credit__photo">
          <Photo
            small
            add
            label={uploading ? "上传中…" : "添加"}
            onClick={busy ? undefined : onAddPhoto}
          />
        </View>
      ) : null}
    </View>
    <Notice>凭证照片至少一张。提交后要项目管理员确认才扣分。</Notice>
    {error ? <Notice tone="error">{error}</Notice> : null}
    <BottomBar
      primary={submitting ? "提交中…" : "提交审核"}
      busy={busy}
      disabled={!complete}
      onPrimary={onSubmit}
    />
  </>
);
