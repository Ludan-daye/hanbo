import {
  BottomBar,
  FormArea,
  FormInput,
  Notice,
  Sheet,
} from "../../../components/ui";
import type { SystemSettings } from "../../../services/workflows";

/** “设置”标签：联系电话和首页公告。 */
export const SettingsTab = ({
  settings,
  busy,
  problem,
  onChange,
  onSave,
}: {
  readonly settings: SystemSettings;
  readonly busy: boolean;
  /** 没保存成功的原因。 */
  readonly problem: string | null;
  readonly onChange: (settings: SystemSettings) => void;
  readonly onSave: () => void;
}): JSX.Element => (
  <>
    <Sheet gap>
      <FormInput
        label="联系电话"
        required
        value={settings.supportPhone}
        placeholder="管理员的联系电话"
        disabled={busy}
        onInput={(supportPhone) => onChange({ ...settings, supportPhone })}
      />
      <FormArea
        label="首页公告"
        value={settings.announcement}
        placeholder="例如：进入施工现场请佩戴安全帽"
        maxLength={160}
        disabled={busy}
        onInput={(announcement) => onChange({ ...settings, announcement })}
      />
    </Sheet>
    <Notice>公告显示在首页，最多 160 字。</Notice>
    {problem !== null ? <Notice tone="error">{problem}</Notice> : null}
    <BottomBar
      primary={busy ? "保存中…" : "保存"}
      busy={busy}
      disabled={!settings.supportPhone.trim()}
      onPrimary={onSave}
    />
  </>
);
