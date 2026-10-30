import { Picker, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useState } from "react";
import { useSessionGuard } from "../../hooks/use-session-guard";

import {
  Button,
  Field,
  Notice,
  Section,
  ListItem,
  PageHeader,
  Screen,
  Segmented,
  StateView,
} from "../../components/ui/index";
import { ProjectGeofence } from "../../components/project-geofence";
import { ProjectManagerPicker } from "../../components/project-manager-picker";
import {
  validateProjectLocation,
  type ProjectLocation,
} from "../../services/project-location";
import { useManagedCompanyId } from "../../hooks/use-management-scope";
import { createCompanyProject } from "../../services/management";
import type {
  ProjectManagerCandidate,
  ProjectStatus,
} from "../../services/management.types";
import { chinaToday } from "../../services/time";
import { useSession } from "../../store/session";

const STATUS_OPTIONS: ReadonlyArray<{ label: string; value: ProjectStatus }> = [
  { label: "筹备中", value: "PREPARING" },
  { label: "进行中", value: "ACTIVE" },
];

export default function CreateProject(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  const companyId = useManagedCompanyId(state.me);
  const [name, setName] = useState("");
  const [location, setLocation] = useState<ProjectLocation | null>(null);
  const [status, setStatus] = useState<ProjectStatus>("PREPARING");
  const [startsOn, setStartsOn] = useState<string>(chinaToday());
  const [endsOn, setEndsOn] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [managers, setManagers] = useState<readonly ProjectManagerCandidate[]>(
    [],
  );

  if (companyId === null) {
    return (
      <Screen>
        <PageHeader title="新建项目" />
        <StateView title="无公司" sub="当前账号没有公司管理员身份。" />
      </Screen>
    );
  }

  const submit = async (): Promise<void> => {
    if (busy) return;
    if (managers.length === 0) {
      setError("请至少选择一名项目管理员。");
      return;
    }
    const trimmedName = name.trim();
    if (trimmedName.length === 0 || location === null) {
      setError("请填写项目名称，并在地图上选择工地范围。");
      return;
    }
    try {
      validateProjectLocation(location);
    } catch (cause: unknown) {
      setError(
        cause instanceof Error ? cause.message : "工地位置无效，请重新选择。",
      );
      return;
    }
    if (endsOn !== null && endsOn < startsOn) {
      setError("截止日期不能早于开工日期。");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createCompanyProject(companyId, {
        managerProfileIds: managers.map((person) => person.profileId),
        name: trimmedName,
        ...location,
        address: location.address.trim(),
        status,
        plannedStartDate: startsOn,
        plannedEndDate: endsOn,
      });
      await Taro.showToast({ icon: "success", title: "已创建" });
      await Taro.redirectTo({
        url: `/pages/company-projects/index?companyId=${companyId}`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "REQUEST_FAILED";
      setError(msg);
      await Taro.showToast({ icon: "none", title: "创建失败" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <PageHeader title="新建项目" />
      <Notice>
        设置工地范围并选择项目管理员，创建后由管理员配置班组和排班。
      </Notice>
      <Section title="基本信息">
        <Field
          value={name}
          label="项目名称 *"
          placeholder="请输入项目名称"
          onInput={setName}
        />
      </Section>
      <ProjectManagerPicker
        companyId={companyId}
        value={managers}
        onChange={setManagers}
        disabled={busy}
      />
      <Section title="工地位置与考勤范围">
        <ProjectGeofence
          value={location}
          onChange={setLocation}
          disabled={busy}
        />
        {location !== null ? (
          <Field
            value={location.address}
            label="详细地址 *"
            placeholder="可补充门牌、入口等信息"
            onInput={(address) => setLocation({ ...location, address })}
          />
        ) : null}
      </Section>
      <Section title="项目状态与工期">
        <Segmented
          options={STATUS_OPTIONS}
          value={status}
          onChange={(v) => {
            setStatus(v);
          }}
        />
        <Picker
          mode="date"
          value={startsOn}
          onChange={(e) =>
            setStartsOn(String((e.detail as { value: string }).value))
          }
        >
          <ListItem primary={`计划起始 · ${startsOn}`} secondary="点选日期" />
        </Picker>
        {endsOn === null ? (
          <Button
            variant="outline"
            onClick={() => {
              setEndsOn(chinaToday());
            }}
          >
            添加截止日
          </Button>
        ) : (
          <View>
            <Picker
              mode="date"
              value={endsOn}
              onChange={(e) =>
                setEndsOn(String((e.detail as { value: string }).value))
              }
            >
              <ListItem primary={`计划截止 · ${endsOn}`} secondary="点选日期" />
            </Picker>
            <Button
              variant="outline"
              onClick={() => {
                setEndsOn(null);
              }}
            >
              移除截止日
            </Button>
          </View>
        )}
      </Section>
      <Button
        loading={busy}
        disabled={
          name.trim().length === 0 ||
          managers.length === 0 ||
          location === null ||
          location.address.trim().length === 0
        }
        onClick={() => {
          void submit();
        }}
      >
        {busy ? "提交中…" : "创建项目"}
      </Button>
      {error !== null ? <StateView title="错误" sub={error} /> : null}
    </Screen>
  );
}
