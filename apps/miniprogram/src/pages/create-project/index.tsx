import { Picker, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useState } from "react";

import { Button, Field, ListItem, PageHeader, Screen, Segmented, StateView } from "../../components/ui/index";
import { resolveCompanyAdminCompanyId } from "../../routing/companyAdmin";
import { createCompanyProject } from "../../services/management";
import type { ProjectStatus } from "../../services/management.types";
import { useSession } from "../../store/session";

const pad = (n: number): string => String(n).padStart(2, "0");
const todayDate = (): string => {
  const d = new Date();
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

const STATUS_OPTIONS: ReadonlyArray<{ label: string; value: ProjectStatus }> = [
  { label: "筹备中", value: "PREPARING" },
  { label: "进行中", value: "ACTIVE" }
];

export default function CreateProject(): JSX.Element {
  const { state } = useSession();
  const companyId = resolveCompanyAdminCompanyId(state.me);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [latitude, setLatitude] = useState("31.2304000");
  const [longitude, setLongitude] = useState("121.4737000");
  const [radius, setRadius] = useState("300");
  const [status, setStatus] = useState<ProjectStatus>("PREPARING");
  const [startsOn, setStartsOn] = useState<string>(todayDate());
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
    const radiusN = Number.parseInt(radius, 10);
    if (!Number.isInteger(radiusN) || radiusN <= 0) {
      await Taro.showToast({ icon: "none", title: "围栏半径须为正整数" });
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
        plannedEndDate: endsOn
      });
      await Taro.showToast({ icon: "success", title: "已创建" });
      await Taro.redirectTo({ url: "/pages/company-projects/index" });
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
      <Field value={name} placeholder="项目名称(必填)" onInput={setName} />
      <Field value={address} placeholder="项目地址(必填)" onInput={setAddress} />
      <Field value={latitude} placeholder="中心纬度,如 31.2304" onInput={setLatitude} />
      <Field value={longitude} placeholder="中心经度,如 121.4737" onInput={setLongitude} />
      <Field value={radius} placeholder="地理围栏半径(米)" onInput={setRadius} />
      <Segmented options={STATUS_OPTIONS} value={status} onChange={(v) => { setStatus(v); }} />
      <Picker mode="date" value={startsOn} onChange={(e) => setStartsOn(String((e.detail as { value: string }).value))}>
        <ListItem primary={`计划起始 · ${startsOn}`} secondary="点选日期" />
      </Picker>
      {endsOn === null ? (
        <Button variant="outline" onClick={() => { setEndsOn(todayDate()); }}>添加截止日</Button>
      ) : (
        <View>
          <Picker mode="date" value={endsOn} onChange={(e) => setEndsOn(String((e.detail as { value: string }).value))}>
            <ListItem primary={`计划截止 · ${endsOn}`} secondary="点选日期" />
          </Picker>
          <Button variant="outline" onClick={() => { setEndsOn(null); }}>移除截止日</Button>
        </View>
      )}
      <Button onClick={() => { void submit(); }}>{busy ? "提交中…" : "创建项目"}</Button>
      {error !== null ? <StateView title="错误" sub={error} /> : null}
    </Screen>
  );
}
