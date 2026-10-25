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
import { useManagedCompanyId } from "../../hooks/use-management-scope";
import { createCompanyProject } from "../../services/management";
import type { ProjectStatus } from "../../services/management.types";
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
  const [address, setAddress] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [radius, setRadius] = useState("300");
  const [status, setStatus] = useState<ProjectStatus>("PREPARING");
  const [startsOn, setStartsOn] = useState<string>(chinaToday());
  const [endsOn, setEndsOn] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    const trimmedName = name.trim();
    const trimmedAddress = address.trim();
    if (trimmedName.length === 0 || trimmedAddress.length === 0) {
      await Taro.showToast({ icon: "none", title: "请填写名称与地址" });
      return;
    }
    const radiusN = Number(radius);
    if (!Number.isInteger(radiusN) || radiusN <= 0) {
      await Taro.showToast({ icon: "none", title: "围栏半径须为正整数" });
      return;
    }
    if (
      latitude.trim() === "" ||
      longitude.trim() === "" ||
      !Number.isFinite(Number(latitude)) ||
      !Number.isFinite(Number(longitude)) ||
      Math.abs(Number(latitude)) > 90 ||
      Math.abs(Number(longitude)) > 180
    ) {
      setError("请填写有效的工地中心经纬度。");
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
        name: trimmedName,
        address: trimmedAddress,
        centerLatitude: latitude,
        centerLongitude: longitude,
        geofenceRadiusM: radiusN,
        status,
        plannedStartDate: startsOn,
        plannedEndDate: endsOn,
      });
      await Taro.showToast({ icon: "success", title: "已创建" });
      await Taro.redirectTo({ url: `/pages/company-projects/index?companyId=${companyId}` });
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
        填写项目资料并设置考勤范围，后续可由项目管理员配置班组和排班。
      </Notice>
      <Section title="基本信息">
        <Field
          value={name}
          label="项目名称 *"
          placeholder="请输入项目名称"
          onInput={setName}
        />
        <Field
          value={address}
          label="项目地址 *"
          placeholder="请输入详细地址"
          onInput={setAddress}
        />
      </Section>
      <Section title="考勤位置">
        <Field
          value={latitude}
          label="中心纬度 *"
          placeholder="例如：31.2304"
          type="digit"
          onInput={setLatitude}
        />
        <Field
          value={longitude}
          label="中心经度 *"
          placeholder="例如：121.4737"
          type="digit"
          onInput={setLongitude}
        />
        <Field
          value={radius}
          label="考勤范围 / 米 *"
          placeholder="请输入正整数"
          type="number"
          onInput={setRadius}
        />
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
          address.trim().length === 0 ||
          latitude.trim().length === 0 ||
          longitude.trim().length === 0
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
