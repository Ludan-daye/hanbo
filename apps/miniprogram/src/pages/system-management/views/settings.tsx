import {
  BottomBar,
  FormArea,
  FormInput,
  Notice,
  Sheet,
} from "../../../components/ui";
import type { SystemSettings } from "../../../services/workflows";

/**
 * “设置”标签（五级第五期，Q12）：全平台一条首页公告，一个平台联系电话。
 * 两项都可以空着；公告空着就谁的首页都不显示。
 */
export const SettingsTab = ({
  settings,
  busy,
  problem,
  onChange,
  onSave,
}: {
  readonly settings: SystemSettings;
  readonly busy: boolean;
  /** 没保存成功、或保存前检查出的原因，放在按钮上方。 */
  readonly problem: string | null;
  readonly onChange: (settings: SystemSettings) => void;
  readonly onSave: () => void;
}): JSX.Element => (
  <>
    <Sheet gap>
      <FormArea
        label="首页公告"
        value={settings.announcement}
        placeholder="例如：进入施工现场请佩戴安全帽"
        maxLength={160}
        disabled={busy}
        onInput={(announcement) => onChange({ ...settings, announcement })}
      />
      <FormInput
        label="平台联系电话"
        value={settings.supportPhone}
        placeholder="例如 400-800-1234"
        maxLength={20}
        disabled={busy}
        onInput={(supportPhone) => onChange({ ...settings, supportPhone })}
      />
    </Sheet>
    <Notice>
      公告显示在所有人的首页，最多 160 字。联系电话写在“账号已停用”“公司已暂停”的提示里，可以空着。
    </Notice>
    {problem !== null ? <Notice tone="error">{problem}</Notice> : null}
    <BottomBar
      primary={busy ? "保存中…" : "保存"}
      busy={busy}
      onPrimary={onSave}
    />
  </>
);
